// „Verbindung reparieren“ (Admin v2 A5, Ole 18.11.2026): ein Knopf prüft der Reihe nach Nummer bzw. Webhook, holt notfalls
// einen neuen Key und gleicht die Vorlagen ab. 360dialog und Meta sind simuliert (keine externen Aufrufe).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkText, repairConnection } from "@/lib/whatsapp/dialog360-match";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const admin = { id: undefined, role: "ADMIN" };
const vorlagenOk = vi.fn(async () => ({ ok: true, submitted: ["pg_followup_v5"], rejected: [] as string[] }));

describe("Verbindung reparieren", () => {
  const kunden: string[] = [];
  const kunde = async (konto?: Record<string, unknown>) => {
    const c = await makeCustomer({ name: `Reparatur ${Date.now()} ${Math.random()}` });
    kunden.push(c.id);
    if (konto) await prisma.whatsAppAccount.create({ data: { customerId: c.id, provider: "360dialog", ...konto } });
    return c.id;
  };
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of kunden) await cleanupCustomer(id);
  });

  it("mit Key: Webhook neu gesetzt, danach Vorlagen abgeglichen", async () => {
    const id = await kunde({ status: "connected", apiKeyEnc: "x" });
    const webhook = vi.fn(async () => true);
    const r = await repairConnection(id, admin, { webhook, vorlagen: vorlagenOk, partner: () => true });
    expect(webhook).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.schritte.map((s) => s.text)).toEqual(["Webhook neu gesetzt: Eingehende Nachrichten kommen wieder an.", "Vorlagen abgeglichen: 1 neu eingereicht."]);
    expect(await prisma.auditLog.count({ where: { customerId: id, action: "whatsapp.repair" } })).toBe(1);
  });

  it("Webhook geht nicht, Nummer bekannt: neuer Key über die Partner-API", async () => {
    const id = await kunde({ status: "pending", apiKeyEnc: "x", dialog360ChannelId: "ch1", dialog360ClientId: "cl1" });
    const neuerKey = vi.fn(async (customerId: string) => {
      await prisma.whatsAppAccount.update({ where: { customerId }, data: { status: "connected" } });
      return { status: "connected" as const, phone: "4915100000" };
    });
    const r = await repairConnection(id, admin, { webhook: async () => false, neuerKey, vorlagen: vorlagenOk, partner: () => true });
    expect(neuerKey).toHaveBeenCalledWith(id, "ch1", "cl1");
    expect(r.ok).toBe(true);
    expect(r.schritte[0].text).toContain("neuen Key");
  });

  it("Webhook geht nicht, ohne Partner-Zugang: Hinweis, keine Vorlagen, nicht ok", async () => {
    const id = await kunde({ status: "pending", apiKeyEnc: "x" });
    const vorlagen = vi.fn(vorlagenOk);
    const r = await repairConnection(id, admin, { webhook: async () => false, vorlagen, partner: () => false });
    expect(r.ok).toBe(false);
    expect(vorlagen).not.toHaveBeenCalled();
    expect(r.schritte).toEqual([{ ok: false, text: "Webhook ließ sich nicht setzen. Key prüfen und von Hand neu eintragen." }]);
  });

  it("ohne Key: Nummer suchen (wie „Verbindung prüfen“), Fehler werden zu einem Satz", async () => {
    const id = await kunde();
    const r = await repairConnection(id, admin, { check: async () => ({ status: "not_found" }), partner: () => true });
    expect(r).toEqual({ ok: false, schritte: [checkText({ status: "not_found" })] });
    const boom = await repairConnection(id, admin, {
      check: async () => {
        throw new Error("360dialog 500");
      },
      partner: () => true,
    });
    expect(boom.schritte[0]).toEqual({ ok: false, text: "Prüfen fehlgeschlagen: 360dialog 500" });
  });
});

describe("Datenmigration: Bewertungsanfrage nach 14 statt 7 Tagen", () => {
  const kunden: string[] = [];
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of kunden) await cleanupCustomer(id);
  });

  it("hebt nur den alten Standard 7 auf 14, andere Werte bleiben", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sql = fs.readFileSync(path.join(__dirname, "..", "..", "prisma", "migrations", "20261118900000_bewertung_nach_14_tagen", "migration.sql"), "utf8");
    const ids: string[] = [];
    for (const d of [7, 10, 14]) {
      const c = await makeCustomer({ name: `Bewertung ${d} ${Date.now()}` });
      kunden.push(c.id);
      ids.push(c.id);
      await prisma.reviewSettings.create({ data: { customerId: c.id, reviewDelayDays: d } });
    }
    for (const stmt of sql.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(stmt);
    const rows = await prisma.reviewSettings.findMany({ where: { customerId: { in: ids } }, select: { customerId: true, reviewDelayDays: true } });
    expect(ids.map((id) => rows.find((r) => r.customerId === id)?.reviewDelayDays)).toEqual([14, 10, 14]);
  });
});
