import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { adminRecordStorno, requestStorno, undoStorno } from "@/lib/ppl/storno";
import { searchDeliveredLeads } from "@/lib/ppl/admin-leads";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const admin = { id: null, email: "admin@test.local", role: "ADMIN" };
const tag = Math.random().toString(36).slice(2, 8);
const phoneTag = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
const DAY = 86_400_000;

describe("Pay-per-Lead: Storno eintragen (Admin) und zurücknehmen", () => {
  let customerId = "";
  let subId = "";
  let otherSubId = "";
  const leadIds: string[] = [];
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    // wie Heinrich von Kleist: Lieferung per E-Mail, Monatsziel, Storno-Fenster 7 Tage
    const sub = await prisma.leadSubscription.create({
      data: { customerId, productKey: `PKV-HvK-${tag}`, price: 40, period: "month", goal: 50, delivery: "email", deliveryEmail: "hvk@test.local", stornoDays: 7, stornoReasons: ["Falsche Nummer"] },
    });
    subId = sub.id;
    otherSubId = (await prisma.leadSubscription.create({ data: { customerId, productKey: `PKV-Andere-${tag}`, price: 30, period: "month" } })).id;
    for (let i = 0; i < 4; i++) {
      const l = await prisma.lead.create({
        data: {
          customerId,
          source: sub.productKey,
          name: `Hans Storno${i} ${tag}`,
          phone: `49151${phoneTag}${i}`,
          email: `storno${i}-${tag}@test.local`,
          status: i === 3 ? "In Beratung" : "Neuer Lead",
          subscriptionId: sub.id,
          // Lead 0 außerhalb des Fensters (10 Tage alt)
          deliveredAt: new Date(Date.now() - (i === 0 ? 10 : 1) * DAY),
        },
      });
      await prisma.revenue.create({ data: { customerId, leadId: l.id, amount: 40 } });
      leadIds.push(l.id);
    }
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("trägt einen Storno direkt als anerkannt ein, auch außerhalb des Fensters (mit Hinweis)", async () => {
    const r = await adminRecordStorno(leadIds[0], "Falsche Nummer", "Abrechnungsmail 14.11.", admin);
    expect(r).toEqual({ ok: true, already: false, outsideWindow: true });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[0] } });
    expect(l.status).toBe("Storno");
    expect(l.stornoState).toBe("approved");
    expect(l.stornoReason).toBe("Falsche Nummer");
    expect(l.stornoNote).toBe("Abrechnungsmail 14.11.");
    expect(Number(l.creditAmount)).toBe(40);
    expect((await prisma.revenue.findFirstOrThrow({ where: { leadId: leadIds[0] } })).cancelled).toBe(true);
    const logs = await prisma.auditLog.findMany({ where: { entityId: leadIds[0], action: "storno.admin" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorEmail).toBe("admin@test.local");
  });

  it("ist idempotent", async () => {
    const r = await adminRecordStorno(leadIds[0], "Falsche Nummer", "", admin);
    expect(r).toEqual({ ok: true, already: true, outsideWindow: true });
    expect(await prisma.auditLog.count({ where: { entityId: leadIds[0], action: "storno.admin" } })).toBe(1);
  });

  it("nimmt freien Grund an und erkennt einen Grenzfall (50:50) nachträglich voll an", async () => {
    expect((await requestStorno(leadIds[1], "Sonstiges", "Kennt die Anfrage nicht", { role: "BUYER" })).ok).toBe(true);
    // „Sonstiges“ → Grenzfall, halbe Gutschrift
    const vorher = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[1] } });
    expect(vorher.stornoState).toBe("approved");
    const halb = Number(vorher.creditAmount);
    const r = await adminRecordStorno(leadIds[1], "Hat nie angefragt", "", admin);
    expect(r).toEqual({ ok: true, already: false, outsideWindow: false });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[1] } });
    expect(l.stornoState).toBe("approved");
    expect(l.stornoReason).toBe("Hat nie angefragt");
    expect(Number(l.creditAmount)).toBe(halb * 2);
    expect((await prisma.revenue.findFirstOrThrow({ where: { leadId: leadIds[1] } })).cancelled).toBe(true);
    expect((await adminRecordStorno(leadIds[1], "Hat nie angefragt", "", admin)).ok && (await adminRecordStorno(leadIds[1], "x", "", admin))).toMatchObject({ already: true });
  });

  it("lehnt fehlenden Grund und Leads ohne Bezug ab", async () => {
    expect(await adminRecordStorno(leadIds[2], "  ", "", admin)).toEqual({ ok: false, error: "Bitte einen Stornogrund angeben." });
    const plain = await prisma.lead.create({ data: { customerId, status: "Neuer Lead" } });
    expect((await adminRecordStorno(plain.id, "Falsche Nummer", "", admin)).ok).toBe(false);
    expect((await undoStorno(plain.id, admin)).ok).toBe(false);
  });

  it("nimmt einen Storno zurück und stellt den vorherigen Status wieder her", async () => {
    expect((await adminRecordStorno(leadIds[3], "Falsche Nummer", "", admin)).ok).toBe(true);
    const r = await undoStorno(leadIds[3], admin);
    expect(r).toEqual({ ok: true, already: false });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[3] } });
    expect(l.status).toBe("In Beratung");
    expect(l.stornoState).toBeNull();
    expect(l.stornoReason).toBeNull();
    expect(l.creditAmount).toBeNull();
    expect((await prisma.revenue.findFirstOrThrow({ where: { leadId: leadIds[3] } })).cancelled).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityId: leadIds[3], action: "storno.undo" } })).toBe(1);
    expect(await undoStorno(leadIds[3], admin)).toEqual({ ok: true, already: true });
  });

  it("nimmt nicht zurück, wenn die Gutschrift schon verrechnet ist", async () => {
    await prisma.lead.update({ where: { id: leadIds[0] }, data: { creditedAt: new Date() } });
    const r = await undoStorno(leadIds[0], admin);
    expect(r.ok).toBe(false);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[0] } })).stornoState).toBe("approved");
  });

  it("findet gelieferte Leads nach Name, Telefon (mit 0), E-Mail, ID und Bezug", async () => {
    const lead2 = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[2] } });
    const ids = async (q: string, subscriptionId?: string) => (await searchDeliveredLeads({ q, subscriptionId })).map((l) => l.id);
    expect(await ids(`Storno2 ${tag}`)).toEqual([leadIds[2]]);
    expect(await ids(`0${lead2.phone!.slice(2)}`)).toEqual([leadIds[2]]);
    expect(await ids(`+${lead2.phone!.slice(0, 2)} ${lead2.phone!.slice(2)}`)).toEqual([leadIds[2]]);
    expect(await ids(`STORNO2-${tag}@test.local`)).toEqual([leadIds[2]]);
    expect(await ids(leadIds[2])).toEqual([leadIds[2]]);
    expect((await ids(tag, subId)).sort()).toEqual([...leadIds].sort());
    expect(await ids(tag, otherSubId)).toEqual([]);
    const row = (await searchDeliveredLeads({ q: leadIds[0] }))[0];
    expect(row.outsideWindow).toBe(true);
  });
});
