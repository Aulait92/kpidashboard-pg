// Jahresvorauszahlung mit 3 Monaten geschenkt (Ole, 19.11.2026). Geprüft gegen die echte Datenbank: Die Migration
// 20261119000300_jahr_3_monate setzt nur offene Angebote (Entwurf, verschickt) mit 12 Monaten und gespeicherten 2 auf 3,
// friert die Freimonate laufender Vorauszahler am Kunden ein (Customer.prepayFreeMonths) und ist wiederholbar.
// Umstellen der Zahlweise (ohne Stripe): zurück auf die Jahreszahlung des Angebots = Wert des Angebots, sonst Standard.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { changeBillingInterval } from "@/lib/billing";
import { mrrFromFields } from "@/lib/ruhend";
import { makeCustomer, requireTestDb } from "./db";

const MIGRATION = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20261119000300_jahr_3_monate/migration.sql"), "utf8");
const uid = () => Math.random().toString(36).slice(2, 8);
const contacts: string[] = [];
const offerIds: string[] = [];
const customers: string[] = [];

async function angebot(data: { status: string; term?: string; annualFreeMonths: number | null; annualPrepay?: boolean; acceptedAt?: Date | null }) {
  const contact = await prisma.salesContact.create({ data: { name: `Jahr3 ${uid()}`, email: `j3-${uid()}@example.test` } });
  contacts.push(contact.id);
  const o = await prisma.offer.create({
    data: {
      salesContactId: contact.id,
      number: `PG-J3-${uid()}`,
      token: `tok_${uid()}_${uid()}_${uid()}_${uid()}`,
      contactName: "Jana Jahr",
      term: data.term ?? "12m",
      products: [{ name: "TKV-Katze", dailyBudget: 30 }],
      setupFee: 990,
      monthlyFee: 990,
      softwareFee: 349,
      status: data.status,
      acceptedAt: data.acceptedAt ?? null,
      annualPrepay: data.annualPrepay ?? false,
      annualChoice: !data.annualPrepay,
      annualFreeMonths: data.annualFreeMonths,
      validUntil: new Date(Date.now() + 86400000),
    },
  });
  offerIds.push(o.id);
  return o;
}
const frei = async (id: string) => (await prisma.offer.findUniqueOrThrow({ where: { id }, select: { annualFreeMonths: true } })).annualFreeMonths;

async function kunde(billingInterval: string, offer?: { id: string } | null, extra: Record<string, unknown> = {}) {
  const c = await makeCustomer({ billingInterval, retainerMonthly: 990, ...extra });
  customers.push(c.id);
  if (offer) await prisma.onboarding.create({ data: { customerId: c.id, offerId: offer.id } });
  return c;
}
const kundeFrei = async (id: string) => (await prisma.customer.findUniqueOrThrow({ where: { id }, select: { prepayFreeMonths: true } })).prepayFreeMonths;

describe("Jahreszahlung 3 Monate geschenkt: Migration und laufende Verträge", () => {
  beforeAll(() => {
    requireTestDb();
    delete process.env.STRIPE_SECRET_KEY;
  });
  afterAll(async () => {
    await prisma.onboarding.deleteMany({ where: { customerId: { in: customers } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...offerIds, ...customers] } }, { customerId: { in: customers } }] } });
    await prisma.customer.deleteMany({ where: { id: { in: customers } } }).catch(() => {});
    await prisma.offer.deleteMany({ where: { id: { in: offerIds } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });

  it("Migration: nur offene 12-Monats-Angebote mit 2 → 3; angenommen, abgelehnt, ersetzt, 6 Monate, null und Sonderwerte bleiben; zweimal ausgeführt ändert nichts", async () => {
    const verschickt = await angebot({ status: "sent", annualFreeMonths: 2 });
    const entwurf = await angebot({ status: "draft", annualFreeMonths: 2 });
    const angenommen = await angebot({ status: "accepted", annualFreeMonths: 2, annualPrepay: true, acceptedAt: new Date() });
    const abgelehnt = await angebot({ status: "declined", annualFreeMonths: 2 });
    const ersetzt = await angebot({ status: "superseded", annualFreeMonths: 2 });
    const sechs = await angebot({ status: "sent", term: "6m", annualFreeMonths: 1 });
    const ohne = await angebot({ status: "sent", annualFreeMonths: null });
    const sonder = await angebot({ status: "sent", annualFreeMonths: 4 });

    await prisma.$executeRawUnsafe(MIGRATION);
    expect(await frei(verschickt.id)).toBe(3);
    expect(await frei(entwurf.id)).toBe(3);
    expect(await frei(angenommen.id)).toBe(2);
    expect(await frei(abgelehnt.id)).toBe(2);
    expect(await frei(ersetzt.id)).toBe(2);
    expect(await frei(sechs.id)).toBe(1);
    expect(await frei(ohne.id)).toBeNull();
    expect(await frei(sonder.id)).toBe(4);

    const log = await prisma.auditLog.findMany({ where: { action: "offer.jahr_3_monate", entityId: { in: offerIds } }, select: { entityId: true, details: true } });
    expect(log.map((l) => l.entityId).sort()).toEqual([verschickt.id, entwurf.id].sort());
    expect(log.find((l) => l.entityId === verschickt.id)!.details).toEqual({ number: verschickt.number, alt: 2, neu: 3 });

    await prisma.$executeRawUnsafe(MIGRATION);
    expect(await frei(verschickt.id)).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: "offer.jahr_3_monate", entityId: { in: offerIds } } })).toBe(2);
  });

  it("Migration: laufende Vorauszahler behalten ihre Freimonate (Angebot bzw. bisheriger Standard), monatliche bleiben leer", async () => {
    const jahrAngebot = await angebot({ status: "accepted", annualFreeMonths: 2, annualPrepay: true, acceptedAt: new Date() });
    const halbAngebot = await angebot({ status: "accepted", term: "6m", annualFreeMonths: 1, annualPrepay: true, acceptedAt: new Date() });
    const monatAngebot = await angebot({ status: "accepted", annualFreeMonths: null, annualPrepay: false, acceptedAt: new Date() });
    const jahr = await kunde("year", jahrAngebot);
    const halb = await kunde("halfyear", halbAngebot);
    const vonHand = await kunde("year", monatAngebot); // monatlich angenommen, später von Hand auf jährlich umgestellt
    const ohneAngebot = await kunde("year");
    const monat = await kunde("month", await angebot({ status: "accepted", annualFreeMonths: null, annualPrepay: false, acceptedAt: new Date() }));
    const schon = await kunde("year", null, { prepayFreeMonths: 3 });

    await prisma.$executeRawUnsafe(MIGRATION);
    expect(await kundeFrei(jahr.id)).toBe(2);
    expect(await kundeFrei(halb.id)).toBe(1);
    expect(await kundeFrei(vonHand.id)).toBe(2);
    expect(await kundeFrei(ohneAngebot.id)).toBe(2);
    expect(await kundeFrei(monat.id)).toBeNull();
    expect(await kundeFrei(schon.id)).toBe(3);

    // MRR rechnet mit den eingefrorenen Freimonaten: Altvertrag 10/12, neuer Vertrag 9/12
    const alt = await prisma.customer.findUniqueOrThrow({ where: { id: jahr.id } });
    expect(mrrFromFields({ ...alt, seatsBilled: 0, empfehlungMonthly: null })).toBeCloseTo((990 * 10) / 12, 2);
    const neu = await prisma.customer.findUniqueOrThrow({ where: { id: schon.id } });
    expect(mrrFromFields({ ...neu, seatsBilled: 0, empfehlungMonthly: null })).toBeCloseTo((990 * 9) / 12, 2);
  });

  it("Zahlweise umstellen: zurück auf die Jahreszahlung des Angebots = dessen Freimonate, sonst heutiger Standard (3), monatlich = leer", async () => {
    const jahrAngebot = await angebot({ status: "accepted", annualFreeMonths: 2, annualPrepay: true, acceptedAt: new Date() });
    const zurueck = await kunde("month", jahrAngebot);
    expect(await changeBillingInterval(zurueck.id, "year")).toMatchObject({ ok: true, changed: true });
    expect(await kundeFrei(zurueck.id)).toBe(2);

    const neu = await kunde("month");
    expect(await changeBillingInterval(neu.id, "year")).toMatchObject({ ok: true, changed: true });
    expect(await kundeFrei(neu.id)).toBe(3);
    expect(await changeBillingInterval(neu.id, "month")).toMatchObject({ ok: true, changed: true });
    expect(await kundeFrei(neu.id)).toBeNull();
    const log = await prisma.auditLog.findFirst({ where: { customerId: neu.id, action: "billing.interval" }, orderBy: { at: "asc" } });
    expect(log?.details).toMatchObject({ from: "month", to: "year", freeMonths: 3 });
  });
});
