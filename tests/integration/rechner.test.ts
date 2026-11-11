import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CONFIG, resolveCpl } from "@/lib/rechner";
import { canEditRechner, cplFromData, loadRechnerConfig, MIN_LEADS_FOR_DATA, saveRechnerConfig } from "@/lib/rechner-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const MATCH = "zz-rechner-test";

describe("Break-even-Rechner: Daten und Einstellungen", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    await prisma.rechnerConfig.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { action: "rechner.config" } });
  });
  afterAll(async () => {
    await prisma.cost.deleteMany({ where: { product: MATCH } });
    await prisma.rechnerConfig.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { action: "rechner.config" } });
    await cleanupCustomer(customerId);
  });

  it("zu wenig Leads → keine echten Daten (Rückfall auf den Erfahrungswert)", async () => {
    await prisma.lead.createMany({ data: Array.from({ length: 50 }, () => ({ customerId, source: `TKV ${MATCH}` })) });
    await prisma.cost.create({ data: { kind: "LEAD", product: MATCH, amount: 400 } });
    expect(await cplFromData({ match: MATCH })).toBeNull();
    const tkv = { ...DEFAULT_CONFIG.products[0], match: MATCH };
    expect(resolveCpl(tkv, null)).toMatchObject({ cpl: 6, source: "erfahrungswert" });
  });

  it("ab 200 Leads: Kosten ÷ Leads der letzten 180 Tage; ersetzt den Puffer nur, wenn höher", async () => {
    await prisma.lead.createMany({ data: Array.from({ length: MIN_LEADS_FOR_DATA }, () => ({ customerId, source: `TKV ${MATCH}` })) });
    await prisma.cost.create({ data: { kind: "LEAD", product: MATCH, amount: 600 } });
    // alte Kosten außerhalb des Fensters zählen nicht
    await prisma.cost.create({ data: { kind: "LEAD", product: MATCH, amount: 99999, occurredAt: new Date(Date.now() - 400 * 86_400_000) } });
    const data = await cplFromData({ match: MATCH });
    expect(data).toEqual({ cpl: 4, leads: 250 }); // 1.000 € ÷ 250 Leads
    const tkv = { ...DEFAULT_CONFIG.products[0], match: MATCH };
    expect(resolveCpl(tkv, data)).toMatchObject({ cpl: 6, source: "erfahrungswert" }); // 4 € < 6 € Puffer
    expect(resolveCpl({ ...tkv, cpl: 3 }, data)).toMatchObject({ cpl: 4, source: "daten" });
  });

  it("Einstellungen: ungültig wird nicht gespeichert, gültig landet geprüft in der DB mit Protokoll", async () => {
    const bad = await saveRechnerConfig({ ...DEFAULT_CONFIG, contactUrl: "javascript:alert(1)" });
    expect(bad.ok).toBe(false);
    expect(await prisma.rechnerConfig.count()).toBe(0);
    expect((await loadRechnerConfig()).headline).toBe(DEFAULT_CONFIG.headline);

    expect((await loadRechnerConfig()).guarantees.breakEven.enabled).toBe(true); // Standard an

    const next = { ...DEFAULT_CONFIG, headline: "Lohnt sich das?", guarantees: { ...DEFAULT_CONFIG.guarantees, breakEven: { ...DEFAULT_CONFIG.guarantees.breakEven, enabled: false } } };
    const ok = await saveRechnerConfig(next, { role: "ADMIN", email: "admin@test.local" });
    expect(ok.ok).toBe(true);
    const loaded = await loadRechnerConfig();
    expect(loaded.headline).toBe("Lohnt sich das?");
    expect(loaded.guarantees.breakEven.enabled).toBe(false);
    expect(loaded.guarantees.leads.enabled).toBe(true);
    expect(loaded.termsUrl).toBe("/rechtliches/agb");
    expect(loaded.products.filter((p) => p.active).map((p) => p.key)).toEqual(["tkv"]);
    expect(await prisma.auditLog.count({ where: { action: "rechner.config" } })).toBe(1);
  });

  it("nur Admins dürfen die Einstellungen ändern", () => {
    expect(canEditRechner({ role: "ADMIN" })).toBe(true);
    expect(canEditRechner({ role: "BUYER" })).toBe(false);
    expect(canEditRechner(null)).toBe(false);
  });
});
