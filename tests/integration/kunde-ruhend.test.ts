// Ruhendes Konto nach Vertragsende (Ole, 15.11.2026): Kündigung mit Aufbewahrung → Konto ruht (Cron) → kein Zugang
// außer Export/Reaktivierung, keine Erinnerungen an Leads → Erinnerungen 30/7 Tage vor der Löschung (einmalig) →
// Reaktivierung (Aufgabe, Push, Lebenszyklus) → erneute Kündigung „sofort“ → endgültige Löschung im selben Cron-Lauf,
// Abrechnungsdaten bleiben. Dazu: Aufbewahrung ändern (auch zurück auf 24 Monate, sofort löschen nur mit Bestätigung).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({
  mails: [] as { to: string | string[]; subject: string; paragraphs: string[]; html?: string; textBlocks?: string[] }[],
  pushes: [] as { title: string }[],
}));
const sess = vi.hoisted(() => ({ current: null as null | { userId: string; email: string; role: "BUYER"; customerId: string; sv: number } }));

vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async (p: { title: string }) => {
    sent.pushes.push(p);
    return { sent: 0, removed: 0, errors: [] };
  }),
}));
vi.mock("@/lib/email", async (orig) => {
  const real = await orig<typeof import("@/lib/email")>();
  return {
    ...real,
    sendCustomerMail: vi.fn(async (o: (typeof sent.mails)[number]) => {
      sent.mails.push(o);
      return { ok: true };
    }),
  };
});
vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  return { ...real, getCurrentSession: vi.fn(async () => sess.current) };
});

import { prisma } from "@/lib/prisma";
import { cancelContract } from "@/lib/vertrag-kuendigung";
import { recordChurnIntent } from "@/lib/anti-churn-server";
import { reactivateCustomer, runRetentionCron, setRetentionChoice } from "@/lib/ruhend";
import { deleteAfterFor } from "@/lib/ruhend-shared";
import { getBuyerContext, getDormantContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { runReminders } from "@/lib/whatsapp/reminders";
import { ERASED_NAME } from "@/lib/erasure";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const customers: string[] = [];
const contacts: string[] = [];
const offers: string[] = [];
const DAY = 86_400_000;

async function setup() {
  const contact = await prisma.salesContact.create({ data: { name: "Ruhend Test", email: `r-${uid()}@example.test` } });
  contacts.push(contact.id);
  const c = await makeCustomer({ retainerStart: new Date("2026-10-20T12:00:00Z"), retainerMonthly: 1000, isTest: false });
  customers.push(c.id);
  await prisma.salesContact.update({ where: { id: contact.id }, data: { customerId: c.id } });
  const owner = await makeBuyer(c.id, "owner");
  const advisor = await makeBuyer(c.id, "advisor");
  const offer = await prisma.offer.create({
    data: {
      salesContactId: contact.id,
      number: `PG-R-${uid()}`,
      token: `tok_${uid()}_${uid()}_${uid()}_${uid()}`,
      contactName: "Rita Ruhend",
      term: "none",
      products: [{ name: "Katzenversicherung", dailyBudget: 40 }],
      setupFee: 990,
      monthlyFee: 1000,
      softwareFee: 349,
      status: "accepted",
      startDate: new Date("2026-10-20T12:00:00Z"),
      validUntil: new Date(Date.now() + DAY),
    },
  });
  offers.push(offer.id);
  await prisma.onboarding.create({ data: { customerId: c.id, offerId: offer.id, salesContactId: contact.id } });
  // Daten des Kunden: Lead mit Chat, Termin, Umsatz; Assistent und Vorlage
  const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Lea Lead", phone: `49151${uid()}`, email: "lea@test.local", status: "Neu" } });
  await prisma.revenue.create({ data: { customerId: c.id, leadId: lead.id, amount: 80 } });
  const conv = await prisma.conversation.create({ data: { customerId: c.id, leadId: lead.id, contactPhone: lead.phone!, contactName: "Lea" } });
  await prisma.agentConfig.create({ data: { customerId: c.id } });
  await prisma.messageTemplate.create({ data: { customerId: c.id, name: "Hallo", body: "Hallo", category: "UTILITY" } });
  return { customerId: c.id, name: c.name, owner, advisor, contactId: contact.id, leadId: lead.id, conversationId: conv.id };
}

const asUser = (u: { id: string; email: string; customerId: string | null }) => {
  sess.current = { userId: u.id, email: u.email, role: "BUYER", customerId: u.customerId!, sv: 0 };
};
const kinds = async (customerId: string) => (await prisma.customerLifecycleEvent.findMany({ where: { customerId }, orderBy: [{ at: "asc" }, { createdAt: "asc" }] })).map((e) => e.kind);

describe("Konto ruht nach Vertragsende", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    delete process.env.STRIPE_SECRET_KEY;
  });
  beforeEach(() => {
    sent.mails = [];
    sent.pushes = [];
    sess.current = null;
  });
  afterAll(async () => {
    await prisma.salesTask.deleteMany({ where: { contactId: { in: contacts } } });
    await prisma.auditLog.deleteMany({ where: { customerId: { in: customers } } });
    await prisma.onboarding.deleteMany({ where: { customerId: { in: customers } } });
    for (const id of customers) await cleanupCustomer(id);
    await prisma.offer.deleteMany({ where: { id: { in: offers } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });

  it("Kündigung → ruht → Erinnerungen → Reaktivierung → Kündigung „sofort“ → endgültig gelöscht", async () => {
    const x = await setup();
    const actor = { id: x.owner.id, email: x.owner.email, role: "BUYER" };

    // 1) Kündigung mit Grund aus dem Anti-Churn-Schritt, Standard 24 Monate
    await recordChurnIntent(x.customerId, { reason: "zu_teuer", actor }, new Date("2026-11-15T09:00:00Z"));
    const res = await cancelContract(x.customerId, { actor, now: new Date("2026-11-15T10:00:00Z") });
    expect(res).toMatchObject({ ok: true, effectiveIso: "2026-11-19" });
    let c = await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } });
    expect(c.retentionChoice).toBe("24m");
    expect(c.deleteAfter?.toISOString()).toBe(deleteAfterFor("2026-11-19", "24m").toISOString());
    const cancelled = await prisma.customerLifecycleEvent.findFirstOrThrow({ where: { customerId: x.customerId, kind: "cancelled" } });
    expect(Number(cancelled.mrr)).toBe(1000);
    expect(cancelled.churnReason).toBe("zu_teuer");
    const mail = sent.mails.find((m) => m.subject.startsWith("Bestätigung Ihrer Kündigung"))!;
    expect(mail.paragraphs.join(" ")).toContain("Ihre Daten bewahren wir 24 Monate auf");
    expect(mail.paragraphs.join(" ")).toContain("bis einschließlich 19.11.2028");
    expect(mail.paragraphs.join(" ")).not.toMatch(/[–—]/);

    // 2) Vor Vertragsende ändert der Cron nichts
    expect((await runRetentionCron(new Date("2026-11-19T12:00:00Z"), { only: customers })).dormant).toBe(0);

    // 3) Tag nach Vertragsende: Konto ruht (idempotent)
    const dormantAt = new Date("2026-11-20T03:00:00Z");
    sent.mails = [];
    const r1 = await runRetentionCron(dormantAt, { only: customers });
    expect(r1.dormant).toBeGreaterThanOrEqual(1);
    c = await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } });
    expect(c.dormantSince?.toISOString()).toBe(dormantAt.toISOString());
    expect(c.archived).toBe(true);
    expect(c.retainerEnd?.toISOString().slice(0, 10)).toBe("2026-11-19");
    expect(sent.pushes.map((p) => p.title)).toContain(`Konto ruht: ${x.name}`);
    expect(await prisma.salesTask.count({ where: { contactId: x.contactId, title: { contains: "Kampagnen stoppen" } } })).toBe(1);
    const ruhtMail = sent.mails.find((m) => m.subject === "Ihr Vertrag ist beendet, Ihr Konto ruht" && [m.to].flat().includes(x.owner.email))!;
    expect(ruhtMail.textBlocks?.join(" ")).toContain("/buyer/ruhend#reaktivieren");
    expect(ruhtMail.textBlocks?.join(" ")).toContain("/buyer/konto/export");
    await runRetentionCron(new Date("2026-11-21T03:00:00Z"), { only: customers });
    expect(await prisma.customerLifecycleEvent.count({ where: { customerId: x.customerId, kind: "dormant" } })).toBe(1);

    // Kein Zugang außer Export/Reaktivierung; keine Bearbeitung von Leads
    asUser(x.owner);
    expect(await getBuyerContext()).toBeNull();
    expect(await getDormantContext()).toMatchObject({ customerId: x.customerId, teamRole: "owner" });
    expect(await writableCustomerId(x.leadId)).toBeNull();
    asUser(x.advisor);
    expect(await getDormantContext()).toMatchObject({ teamRole: "advisor" });

    // Keine Termin-Erinnerung an Leads eines ruhenden Kontos
    const appt = await prisma.appointment.create({ data: { customerId: x.customerId, leadId: x.leadId, conversationId: x.conversationId, mode: "phone", startsAt: new Date(Date.now() + 2 * 3600_000) } });
    await runReminders();
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).reminderSentAt).toBeNull();

    // 4) Erinnerungen 30 und 7 Tage vor der Löschung, je einmal
    const del = c.deleteAfter!;
    sent.mails = [];
    await runRetentionCron(new Date(del.getTime() - 30 * DAY), { only: customers });
    await runRetentionCron(new Date(del.getTime() - 29 * DAY), { only: customers });
    const r30 = sent.mails.filter((m) => [m.to].flat().includes(x.owner.email) && m.subject === "In 30 Tagen löschen wir Ihre Daten");
    expect(r30).toHaveLength(1);
    expect(r30[0].paragraphs[0]).toContain("am 20.11.2028");
    expect(r30[0].textBlocks?.join(" ")).toContain("Konto reaktivieren");
    await runRetentionCron(new Date(del.getTime() - 7 * DAY), { only: customers });
    await runRetentionCron(new Date(del.getTime() - 6 * DAY), { only: customers });
    expect(sent.mails.filter((m) => [m.to].flat().includes(x.owner.email) && m.subject === "In 7 Tagen löschen wir Ihre Daten")).toHaveLength(1);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } })).dataDeletedAt).toBeNull();

    // 5) Reaktivierung: sofort aktiv, alles da, Aufgabe + Push, Lebenszyklus mit Betrag und Grund
    sent.pushes = [];
    const reAt = new Date(del.getTime() - 5 * DAY);
    expect(await reactivateCustomer(x.customerId, { actor, now: reAt })).toEqual({ ok: true, already: false });
    expect(await reactivateCustomer(x.customerId, { actor, now: reAt })).toEqual({ ok: true, already: true });
    c = await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } });
    expect(c).toMatchObject({ dormantSince: null, archived: false, cancelEffectiveAt: null, cancelRequestedAt: null, retentionChoice: null, deleteAfter: null, retentionReminder30At: null });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: x.leadId } })).name).toBe("Lea Lead");
    const re = await prisma.customerLifecycleEvent.findFirstOrThrow({ where: { customerId: x.customerId, kind: "reactivated" } });
    expect(Number(re.mrr)).toBe(1000);
    expect(re.churnReason).toBe("zu_teuer");
    expect((re.details as { dormantDays: number }).dormantDays).toBeGreaterThan(700);
    expect(sent.pushes.map((p) => p.title)).toContain(`Reaktivierung: ${x.name}`);
    expect(await prisma.salesTask.count({ where: { contactId: x.contactId, title: { startsWith: `Reaktivierung: ${x.name}` } } })).toBe(1);
    expect(sent.mails.some((m) => m.subject.startsWith("Willkommen zurück"))).toBe(true);
    asUser(x.owner);
    expect(await getBuyerContext()).toMatchObject({ customerId: x.customerId });
    expect(await getDormantContext()).toBeNull();

    // 6) Ole startet neu (Betreuungsgebühr ohne Ende), Kunde kündigt erneut mit „sofort“
    await prisma.customer.update({ where: { id: x.customerId }, data: { retainerEnd: null } });
    const now2 = new Date(reAt.getTime() + DAY);
    const res2 = await cancelContract(x.customerId, { actor, retention: "sofort", now: now2 });
    expect(res2.ok).toBe(true);
    const end2 = res2.ok ? res2.effectiveIso : "";
    sent.mails = [];
    const after = new Date(deleteAfterFor(end2, "sofort").getTime() + 3 * 3600_000);
    const r2 = await runRetentionCron(after, { only: customers });
    expect(r2.deleted).toBeGreaterThanOrEqual(1);

    // Endgültig gelöscht; Abrechnung und Kennzahlen bleiben
    c = await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } });
    expect(c.dataDeletedAt?.toISOString()).toBe(after.toISOString());
    expect(await prisma.user.count({ where: { customerId: x.customerId } })).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: x.leadId } })).name).toBe(ERASED_NAME);
    expect(await prisma.conversation.count({ where: { customerId: x.customerId } })).toBe(0);
    expect(await prisma.agentConfig.count({ where: { customerId: x.customerId } })).toBe(0);
    expect(await prisma.messageTemplate.count({ where: { customerId: x.customerId } })).toBe(0);
    expect(await prisma.revenue.count({ where: { customerId: x.customerId } })).toBe(1);
    expect(await prisma.offer.count({ where: { id: { in: offers } } })).toBeGreaterThanOrEqual(1);
    expect(await kinds(x.customerId)).toEqual(["cancelled", "dormant", "reactivated", "cancelled", "dormant", "deleted"]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { customerId: x.customerId, action: "customer.final_erase" } });
    expect(log.details).toMatchObject({ leads: 1, logins: 2 });
    // „sofort“: keine Mail über die Ruhephase, aber die Bestätigung der Löschung an den Inhaber
    expect(sent.mails.some((m) => m.subject === "Ihr Vertrag ist beendet, Ihr Konto ruht" && [m.to].flat().includes(x.owner.email))).toBe(false);
    expect(sent.mails.some((m) => m.subject === "Ihre Daten sind gelöscht" && [m.to].flat().includes(x.owner.email))).toBe(true);
    // Ein weiterer Lauf ändert nichts
    await runRetentionCron(new Date(after.getTime() + DAY), { only: customers });
    expect(await prisma.customerLifecycleEvent.count({ where: { customerId: x.customerId, kind: "deleted" } })).toBe(1);
  });

  it("Aufbewahrung ändern: zurück auf 24 Monate setzt die Erinnerungen zurück; abgelaufene Frist löscht nur mit Bestätigung", async () => {
    const x = await setup();
    const actor = { id: x.owner.id, email: x.owner.email, role: "BUYER" };
    expect((await cancelContract(x.customerId, { actor, retention: "3m", now: new Date("2026-11-15T10:00:00Z") })).ok).toBe(true);
    let c = await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } });
    expect(c.deleteAfter?.toISOString()).toBe(deleteAfterFor("2026-11-19", "3m").toISOString());

    // Ohne Kündigung keine Wahl
    const other = await makeCustomer();
    customers.push(other.id);
    expect(await setRetentionChoice(other.id, "3m", { actor })).toEqual({ ok: false, error: "Die Aufbewahrung wählen Sie bei der Kündigung." });

    await runRetentionCron(new Date("2026-11-20T03:00:00Z"), { only: customers });
    // 30-Tage-Erinnerung bei 3 Monaten
    await runRetentionCron(new Date(c.deleteAfter!.getTime() - 20 * DAY), { only: customers });
    c = await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } });
    expect(c.retentionReminder30At).not.toBeNull();

    // Zurück auf 24 Monate: neuer Termin, Erinnerungen zurückgesetzt, Protokoll
    const back = await setRetentionChoice(x.customerId, "24m", { actor, now: new Date(c.deleteAfter!.getTime() - 19 * DAY) });
    expect(back).toMatchObject({ ok: true, choice: "24m", lastDayIso: "2028-11-19", deleteNow: false });
    c = await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } });
    expect(c.retentionReminder30At).toBeNull();
    expect(await prisma.auditLog.count({ where: { customerId: x.customerId, action: "customer.retention" } })).toBe(2);

    // Ein Jahr später „3 Monate“: Frist vorbei → ohne Bestätigung nichts, mit Bestätigung sofort gelöscht
    const later = new Date("2027-11-20T10:00:00Z");
    const ask = await setRetentionChoice(x.customerId, "3m", { actor, now: later });
    expect(ask.ok).toBe(false);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } })).dataDeletedAt).toBeNull();
    const done = await setRetentionChoice(x.customerId, "3m", { actor, now: later, confirmNow: true });
    expect(done).toMatchObject({ ok: true, deleteNow: true });
    c = await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } });
    expect(c.dataDeletedAt?.toISOString()).toBe(later.toISOString());
    expect(await setRetentionChoice(x.customerId, "24m", { actor })).toEqual({ ok: false, error: "Ihre Daten sind bereits gelöscht." });
    expect(await reactivateCustomer(x.customerId, { actor })).toMatchObject({ ok: false });
  });
});
