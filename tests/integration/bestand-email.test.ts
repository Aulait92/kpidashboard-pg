// Bestandskampagnen per E-Mail und Einwilligung je Kanal (Ole, 14.11.2026): Versand über das Postfach
// (gemockt), Drosselung, WhatsApp strikt, Abmeldung inklusive Re-Import, Double-Opt-in, Antwortzuordnung,
// Zustellstatus, Statistik und 60-Tage-Zuordnung in den Zahlen, Vorlagen beim Freischalten.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  mails: [] as Array<{ userId: string; to: string; subject: string; text: string; html?: string; headers?: Record<string, string>; messageId?: string }>,
  plain: [] as Array<{ to: string | string[]; subject: string; text: string }>,
  notices: [] as Array<{ to: string }>,
  pushes: [] as string[],
  failMail: null as null | string,
}));

vi.mock("@/lib/mail/postfach", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/postfach")>();
  return {
    ...real,
    sendViaPostfach: async (userId: string, m: { to: string; subject: string; text: string; html?: string; headers?: Record<string, string>; messageId?: string }) => {
      if (st.failMail) return { ok: false as const, error: "Senden hat nicht geklappt", raw: st.failMail };
      st.mails.push({ userId, ...m });
      return { ok: true as const, from: "berater@agentur.test" };
    },
  };
});
vi.mock("@/lib/email", async (orig) => {
  const real = await orig<typeof import("@/lib/email")>();
  return { ...real, sendPlainMail: async (m: { to: string; subject: string; text: string }) => (st.plain.push(m), { ok: true as const }) };
});
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return {
    ...real,
    sendWhatsAppNotice: async (o: { to: string }) => {
      st.notices.push(o);
      return { mode: "template" as const, conversationId: null, messageId: `wamid.${st.notices.length}.${Math.random().toString(36).slice(2, 8)}` };
    },
  };
});
vi.mock("@/lib/push", () => {
  const rec = async (...args: unknown[]) => {
    st.pushes.push((args[args.length - 1] as { title?: string })?.title ?? "");
    return { sent: 0, removed: 0, errors: [] };
  };
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});

import { prisma } from "@/lib/prisma";
import { applyCampaignStatus, createCampaign, planAudience, recordEmailReply, runCampaigns, segmentIds } from "@/lib/bestand/campaigns";
import { importRows, parseFile, detectMapping } from "@/lib/bestand/import";
import { unsubscribe } from "@/lib/bestand/abmelden";
import { signLink } from "@/lib/bestand/links";
import { confirmDoi, requestConsent, submitConsentForm } from "@/lib/bestand/einwilligung-server";
import { loadCampaignStats, loadPeriodTiles } from "@/lib/bestand/statistik";
import { loadCustomerContracts } from "@/lib/vertraege";
import { summarizeProvision } from "@/lib/ertrag";
import { bestandMailQuota, bestandQuota } from "@/lib/bestand/quota";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
// Montag, 16.11.2026, 10:00 Uhr Berlin
const NOW = new Date("2026-11-16T09:00:00Z");
const noSleep = async () => {};

async function setup(opts: { wa?: boolean; uwg?: boolean; mailbox?: boolean; provider?: string } = {}) {
  const c = await makeCustomer({ name: `Agentur Meier ${uid()}`, existingCustomersEnabled: true, ...(opts.uwg ? { bestandUwgConfirmedAt: NOW } : {}), bestandMailImprint: "Agentur Meier\nHauptstr. 1, 12345 Ort" });
  const owner = await makeBuyer(c.id, "owner");
  if (opts.wa) {
    await prisma.whatsAppAccount.create({ data: { customerId: c.id, status: "connected" } });
    for (const purpose of ["campaign_review", "campaign_renewal", "campaign_cross_sell"]) {
      await prisma.messageTemplate.create({ data: { customerId: c.id, name: `pg_${purpose}_${uid()}`, purpose, category: "marketing", status: "approved", body: "x" } });
    }
  }
  if (opts.mailbox !== false) {
    await prisma.mailConnection.create({ data: { userId: owner.id, customerId: c.id, provider: opts.provider ?? "google", email: `berater-${uid()}@agentur.test`, status: "ok" } });
  }
  return { c, owner };
}

const ec = (customerId: string, o: Record<string, unknown> = {}) =>
  prisma.existingCustomer.create({ data: { customerId, firstName: "Erika", lastName: `Muster${uid()}`, salutation: "Frau", lines: ["KFZ"], nextRenewal: new Date("2026-12-01"), ...o } });

describe("Bestandskampagnen per E-Mail und Einwilligung", () => {
  const customers: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.APP_URL = "https://app.test";
  });
  afterAll(async () => {
    for (const id of customers) await cleanupCustomer(id);
  });
  beforeEach(() => {
    st.mails = [];
    st.plain = [];
    st.notices = [];
    st.pushes = [];
    st.failMail = null;
  });

  it("Kanalwahl: ohne Nummer alle per E-Mail; Vorschau zählt je Kanal und Grund", async () => {
    const { c } = await setup({ uwg: true });
    customers.push(c.id);
    await ec(c.id, { email: `a${uid()}@kunde.test`, emailConsent: "ja" });
    await ec(c.id, { email: `b${uid()}@kunde.test` }); // § 7 Abs. 3
    await ec(c.id, { phone: "4915100000001", whatsappConsent: "ja" }); // WhatsApp, aber nicht verbunden
    await ec(c.id, { email: `c${uid()}@kunde.test`, emailOptOutAt: NOW });
    const renewal = await planAudience(c.id, "renewal", { renewalDays: 60 }, { now: NOW, waAvailable: false });
    expect(renewal.counts).toMatchObject({ whatsapp: 0, email: 2, emailUwg: 1, excludedTotal: 2 });
    expect(renewal.counts.excluded["E-Mail abgemeldet"]).toBe(1);
    // Cross-Selling ohne Einwilligung nicht per E-Mail
    const cross = await planAudience(c.id, "cross_sell", { has: ["KFZ"], lacks: ["Hausrat"] }, { now: NOW, waAvailable: false });
    expect(cross.counts).toMatchObject({ email: 1, emailUwg: 0 });
    expect(cross.counts.excluded["Cross-Selling in eine andere Sparte nur mit Einwilligung"]).toBe(1);
  });

  it("WhatsApp strikt: ohne Opt-in nicht geplant, Widerruf vor dem Versand → übersprungen", async () => {
    const { c, owner } = await setup({ wa: true, uwg: true });
    customers.push(c.id);
    const yes = await ec(c.id, { phone: "4915100000011", whatsappConsent: "ja" });
    await ec(c.id, { phone: "4915100000012" }); // ohne Opt-in, ohne E-Mail
    const campaign = await createCampaign({ customerId: c.id, occasion: "renewal", segment: { renewalDays: 60 }, topic: "Kfz", dailyLimit: 50, createdById: owner.id, channelMode: "whatsapp", now: NOW });
    const rs = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } });
    expect(rs.map((r) => [r.existingCustomerId, r.channel, r.basis])).toEqual([[yes.id, "whatsapp", "einwilligung"]]);
    // Widerruf nach dem Planen: wird vor dem Versand erkannt
    await prisma.existingCustomer.update({ where: { id: yes.id }, data: { whatsappConsent: "nein" } });
    await runCampaigns(NOW, { sleep: noSleep });
    expect(st.notices).toHaveLength(0);
    expect(await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } })).toMatchObject({ status: "skipped", reason: "WhatsApp-Einwilligung: nein" });
  });

  it("Versand per E-Mail: Einzelmail über das Postfach, Abmeldelink, Pflichtangaben, höchstens 3 je Lauf, Zufallsabstand, Kontingent getrennt", async () => {
    const { c, owner } = await setup({ uwg: true });
    customers.push(c.id);
    for (let i = 0; i < 5; i++) await ec(c.id, { email: `m${i}${uid()}@kunde.test`, emailConsent: "ja" });
    const campaign = await createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, now: NOW });
    expect((await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } })).every((r) => r.channel === "email")).toBe(true);
    // Samstag: kein E-Mail-Versand
    await runCampaigns(new Date("2026-11-21T10:00:00Z"), { sleep: noSleep });
    expect(st.mails).toHaveLength(0);
    await runCampaigns(NOW, { sleep: noSleep, rand: () => 0.5 });
    expect(st.mails).toHaveLength(3);
    const m = st.mails[0];
    expect(m.userId).toBe(owner.id);
    expect(m.text.startsWith("Guten Tag Frau Muster")).toBe(true);
    expect(m.text).toMatch(/https:\/\/app\.test\/abmelden\/r\S+/);
    expect(m.text).toContain("Hauptstr. 1, 12345 Ort");
    expect(m.text).not.toMatch(/[–—]/);
    expect(m.html).not.toMatch(/<img/i);
    expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(m.messageId).toMatch(/^bk-/);
    // Zufallsabstand: im selben Moment kein weiterer Versand, 7 Minuten später wieder
    await runCampaigns(NOW, { sleep: noSleep });
    expect(st.mails).toHaveLength(3);
    await runCampaigns(new Date(NOW.getTime() + 7 * 60_000), { sleep: noSleep });
    expect(st.mails).toHaveLength(5);
    expect((await bestandMailQuota(c.id, NOW)).used).toBe(5);
    expect((await bestandQuota(c.id, NOW)).used).toBe(0); // WhatsApp-Kontingent unberührt
    const sent = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id, status: "sent" } });
    expect(sent).toHaveLength(5);
    expect(sent.every((r) => r.mailMessageId?.startsWith(`bk-${r.id}`))).toBe(true);
  });

  it("Drosselung: Bounce → unzustellbar und Stufe hoch; drei Fehler → Pause und Warnung; ohne Postfach kein Versand", async () => {
    const { c, owner } = await setup({ uwg: true });
    customers.push(c.id);
    for (let i = 0; i < 4; i++) await ec(c.id, { email: `d${i}${uid()}@kunde.test`, emailConsent: "ja" });
    const campaign = await createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, now: NOW });
    st.failMail = "550 5.1.1 Recipient address rejected: User unknown";
    await runCampaigns(NOW, { sleep: noSleep });
    const bounced = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id, status: "failed" } });
    expect(bounced.length).toBeGreaterThanOrEqual(1);
    expect(bounced[0]).toMatchObject({ reason: "unzustellbar" });
    expect(bounced[0].bouncedAt).not.toBeNull();
    let mb = await prisma.mailConnection.findUniqueOrThrow({ where: { userId: owner.id } });
    expect(mb.campaignBackoff).toBe(1);
    st.failMail = "Gmail: 401 invalid_grant";
    let t = new Date(NOW.getTime() + 31 * 60_000);
    for (let i = 0; i < 3; i++) {
      await runCampaigns(t, { sleep: noSleep });
      t = new Date(t.getTime() + 16 * 60_000);
    }
    mb = await prisma.mailConnection.findUniqueOrThrow({ where: { userId: owner.id } });
    expect(mb.campaignPausedUntil!.getTime()).toBeGreaterThan(t.getTime() - 16 * 60_000);
    expect(st.pushes).toContain("E-Mail-Kampagne gedrosselt");
    // Postfach-Fehler: Empfänger bleiben in der Warteschlange
    expect(await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: "queued" } })).toBeGreaterThan(0);

    const none = await setup({ uwg: true, mailbox: false });
    customers.push(none.c.id);
    await ec(none.c.id, { email: `x${uid()}@kunde.test`, emailConsent: "ja" });
    await expect(createCampaign({ customerId: none.c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: none.owner.id, now: NOW })).rejects.toThrow(/Postfach/);
  });

  it("Abmeldung per Link (ein Klick): sofort, protokolliert, der Kampagne zugeordnet, auch nach Re-Import gesperrt; optional auch WhatsApp", async () => {
    const { c, owner } = await setup({ uwg: true });
    customers.push(c.id);
    const csv = ["Kundennummer;Vorname;Nachname;Mobil;E-Mail;Sparte;Hauptfälligkeit", "5001;Erika;Muster;0151 3333333;erika.abm@kunde.test;KFZ;01.12.2026"].join("\n");
    const { headers, rows } = await parseFile(Buffer.from(csv), "b.csv");
    await importRows(c.id, rows, detectMapping(headers), NOW, { consent: { email: true, whatsapp: true } });
    const erika = await prisma.existingCustomer.findFirstOrThrow({ where: { customerId: c.id, externalNo: "5001" } });
    expect(erika).toMatchObject({ emailConsent: "ja", emailConsentSource: "versicherer_pauschal", whatsappConsent: "ja" });
    const campaign = await createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, channelMode: "email", now: NOW });
    const r = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } });
    expect(await unsubscribe("rfalsch.xxxxxxxxxxxxxxxxxxxxxx", "email", { ip: null, userAgent: null })).toBeNull();
    const t = await unsubscribe(signLink("r", r.id), "email", { ip: "1.2.3.4", userAgent: "test" }, NOW);
    expect(t).toMatchObject({ existingCustomerId: erika.id, whatsappBlocked: false });
    const after = await prisma.existingCustomer.findUniqueOrThrow({ where: { id: erika.id } });
    expect(after.emailOptOutAt).not.toBeNull();
    expect(after.optOutAt).toBeNull();
    expect(await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "skipped", reason: "abgemeldet" });
    expect((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: r.id } })).optOutAt).not.toBeNull();
    expect(await prisma.bestandConsentLog.count({ where: { existingCustomerId: erika.id, action: "abgemeldet", channel: "email", ip: "1.2.3.4" } })).toBe(1);
    // Erneuter Aufruf: nichts doppelt
    await unsubscribe(signLink("r", r.id), "email", { ip: "1.2.3.4", userAgent: "test" }, NOW);
    expect(await prisma.bestandConsentLog.count({ where: { existingCustomerId: erika.id, action: "abgemeldet" } })).toBe(1);

    // Re-Import mit anderer Kundennummer legt einen neuen Datensatz an: Sperrliste greift trotzdem
    const csv2 = ["Kundennummer;Vorname;Nachname;Mobil;E-Mail;Sparte", "9001;Erika;Muster;0151 4444444;Erika.Abm@kunde.test;KFZ"].join("\n");
    const p2 = await parseFile(Buffer.from(csv2), "b2.csv");
    const res = await importRows(c.id, p2.rows, detectMapping(p2.headers), NOW, { consent: { email: true } });
    expect(res.suppressed).toBe(1);
    const twin = await prisma.existingCustomer.findFirstOrThrow({ where: { customerId: c.id, externalNo: "9001" } });
    expect(twin.emailOptOutAt).not.toBeNull();
    // Re-Import desselben Kunden hebt die Abmeldung nicht auf
    await importRows(c.id, rows, detectMapping(headers), NOW, { consent: { email: true } });
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: erika.id } })).emailOptOutAt).not.toBeNull();
    expect(await segmentIds(c.id, "review", {}, new Date(NOW.getTime() + 40 * 86_400_000), "email")).not.toContain(erika.id);

    // Auch WhatsApp abmelden: alle Kanäle, Telefon auf die Sperrliste
    const all = await unsubscribe(signLink("e", erika.id), "all", { ip: null, userAgent: null }, NOW);
    expect(all?.whatsappBlocked).toBe(true);
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: erika.id } })).optOutAt).not.toBeNull();
    expect(await prisma.bestandOptOut.count({ where: { customerId: c.id, kind: "phone", scope: "all" } })).toBe(1);
  });

  it("Einwilligungs-Abfrage: WhatsApp sofort mit Protokoll, E-Mail erst nach Bestätigungslink (Double-Opt-in); per E-Mail nur, wenn erlaubt", async () => {
    const { c, owner } = await setup({ uwg: false });
    customers.push(c.id);
    const e = await ec(c.id, { email: `doi${uid()}@kunde.test` });
    // Ohne Einwilligung und ohne § 7 Abs. 3: keine Bitte per E-Mail, nur Link
    expect(await requestConsent(e.id, c.id, { byMail: true, actorUserId: owner.id })).toMatchObject({ ok: false });
    const link = await requestConsent(e.id, c.id, { byMail: false, actorUserId: owner.id });
    expect(link).toMatchObject({ ok: true, mailed: false });
    if (link.ok) {
      expect(link.text.startsWith("Guten Tag Frau Muster")).toBe(true);
      expect(link.url).toMatch(/\/einwilligung\/e/);
    }
    const r = await submitConsentForm(e.id, { email: true, whatsapp: true, emailAddress: null, phone: "4915100000099", ip: "5.6.7.8", userAgent: "ua" }, NOW);
    expect(r).toEqual({ ok: true, doiSent: true, whatsapp: true });
    let now = await prisma.existingCustomer.findUniqueOrThrow({ where: { id: e.id } });
    expect(now).toMatchObject({ whatsappConsent: "ja", whatsappConsentSource: "formular", emailConsent: null, phone: "4915100000099" });
    // Bestätigungsmail über das Postfach des Inhabers
    const mail = st.mails.find((m) => m.to === e.email);
    expect(mail?.subject).toMatch(/Bitte bestätigen/);
    const token = /\/einwilligung\/bestaetigen\/([A-Za-z0-9_-]+)/.exec(mail!.text)![1];
    expect((await confirmDoi("ungueltigertokenxxxxxxxxxxxx", { ip: null, userAgent: null })).ok).toBe(false);
    expect(await confirmDoi(token, { ip: "5.6.7.8", userAgent: "ua" }, NOW)).toMatchObject({ ok: true });
    now = await prisma.existingCustomer.findUniqueOrThrow({ where: { id: e.id } });
    expect(now).toMatchObject({ emailConsent: "ja", emailConsentSource: "formular" });
    const logs = await prisma.bestandConsentLog.findMany({ where: { existingCustomerId: e.id }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => `${l.channel}:${l.action}`)).toEqual(expect.arrayContaining(["whatsapp:erteilt", "email:erteilt", "email:bestaetigt"]));
    expect(logs.find((l) => l.action === "erteilt" && l.channel === "email")).toMatchObject({ ip: "5.6.7.8", confirmedAt: expect.any(Date) });
    expect(logs.find((l) => l.channel === "whatsapp")?.text).toMatch(/per WhatsApp informiert/);
  });

  it("Antwortzuordnung: Interesse → Lead im Trichter, Abmeldung, Bounce, Abwesenheit; Zustellstatus WhatsApp", async () => {
    const { c, owner } = await setup({ uwg: true });
    customers.push(c.id);
    const a = await ec(c.id, { email: `ra${uid()}@kunde.test`, emailConsent: "ja" });
    const b = await ec(c.id, { email: `rb${uid()}@kunde.test`, emailConsent: "ja" });
    const campaign = await createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, now: NOW });
    await prisma.campaignRecipient.updateMany({ where: { campaignId: campaign.id }, data: { status: "sent", sentAt: NOW } });
    const later = new Date(NOW.getTime() + 86_400_000);
    expect(await recordEmailReply(c.id, { fromEmail: "fremd@kunde.test", text: "Hallo" }, later)).toMatchObject({ ok: false });
    expect(await recordEmailReply(c.id, { fromEmail: a.email!.toUpperCase(), subject: "Automatische Antwort", text: "Ich bin nicht im Büro." }, later)).toMatchObject({ ok: true, kind: "auto", leadId: null });
    const yes = await recordEmailReply(c.id, { fromEmail: a.email, subject: "Re: Ihr Vertragscheck", text: "Gerne, rufen Sie mich an." }, later);
    expect(yes).toMatchObject({ ok: true, kind: "interesse" });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: yes.ok ? yes.leadId! : "" } });
    expect(lead).toMatchObject({ source: "Bestandskunde", email: a.email, status: "Im Gespräch" });
    expect(JSON.stringify(lead.formData)).toContain("Gerne, rufen Sie mich an.");
    const ra = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id, existingCustomerId: a.id } });
    expect(ra).toMatchObject({ status: "replied", leadId: lead.id });
    // gleiche Antwort nochmal: kein zweiter Lead
    await recordEmailReply(c.id, { fromEmail: a.email, text: "Und noch eine Frage" }, later);
    expect(await prisma.lead.count({ where: { customerId: c.id } })).toBe(1);
    expect(await recordEmailReply(c.id, { fromEmail: b.email, text: "Bitte keine E-Mails mehr." }, later)).toMatchObject({ kind: "stop" });
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: b.id } })).emailOptOutAt).not.toBeNull();
    // Bounce aus dem Postfach eingefügt: unzustellbar vermerkt, Postfach wird gedrosselt
    expect(await recordEmailReply(c.id, { fromEmail: b.email, subject: "Undeliverable: Ihr Vertragscheck", text: "550 user unknown" }, later)).toMatchObject({ kind: "bounce" });
    expect((await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id, existingCustomerId: b.id } })).bouncedAt).not.toBeNull();
    expect((await prisma.mailConnection.findUniqueOrThrow({ where: { userId: owner.id } })).campaignBackoff).toBe(1);

    // WhatsApp-Zustellstatus am Empfänger
    const w = await setup({ wa: true });
    customers.push(w.c.id);
    await ec(w.c.id, { phone: "4915100000021", whatsappConsent: "ja" });
    const wc = await createCampaign({ customerId: w.c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: w.owner.id, now: NOW });
    await runCampaigns(NOW, { sleep: noSleep });
    const wr = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: wc.id } });
    expect(wr.waMessageId).toMatch(/^wamid\./);
    await applyCampaignStatus(wr.waMessageId!, "delivered", NOW);
    await applyCampaignStatus(wr.waMessageId!, "read", later);
    const wr2 = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: wr.id } });
    expect(wr2.deliveredAt?.toISOString()).toBe(NOW.toISOString());
    expect(wr2.readAt?.toISOString()).toBe(later.toISOString());
    const [s] = await loadCampaignStats(w.c.id, { ids: [wc.id] });
    expect(s.funnel.whatsapp).toMatchObject({ angeschrieben: 1, zugestellt: 1, gelesen: 1 });
  });

  it("60-Tage-Zuordnung: letzte Kampagne zählt, Provision je Sparte, Empfehlungen nicht doppelt, Zahlen und Statistik je Kanal", async () => {
    const { c, owner } = await setup({ wa: true, uwg: true });
    customers.push(c.id);
    const e = await ec(c.id, { phone: "4915100000031", whatsappConsent: "ja", email: `z${uid()}@kunde.test`, emailConsent: "ja" });
    // Kampagne A (WhatsApp, 1.9.) und B (E-Mail, 1.10.), danach Antwort und Abschlüsse
    const mk = async (name: string, channel: string, sentAt: Date) =>
      prisma.customerCampaign.create({
        data: { customerId: c.id, name, occasion: "cross_sell", topic: name, segment: {}, status: "done", senderUserId: owner.id, recipients: { create: { existingCustomerId: e.id, channel, status: "sent", sentAt } } },
      });
    const A = await mk("Hausrat", "whatsapp", new Date("2026-09-01T10:00:00Z"));
    const B = await mk("Rechtsschutz", "email", new Date("2026-10-01T10:00:00Z"));
    const lead = await prisma.lead.create({ data: { customerId: c.id, source: "Bestandskunde", name: "Erika Muster", status: "Abschluss", closedAt: new Date("2026-10-10T10:00:00Z") } });
    await prisma.campaignRecipient.updateMany({ where: { campaignId: B.id }, data: { leadId: lead.id, repliedAt: new Date("2026-10-02T10:00:00Z"), status: "replied" } });
    await prisma.appointment.create({ data: { customerId: c.id, leadId: lead.id, mode: "phone", startsAt: new Date("2026-10-05T10:00:00Z") } });
    // Abschluss 10.10. (→ B), weiterer Vertrag 15.12. (75 Tage nach B → keine Kampagne)
    await prisma.leadContract.create({ data: { leadId: lead.id, customerId: c.id, primaryLeadId: lead.id, sparte: "rechtsschutz", premium: 300, signedAt: new Date("2026-10-10T10:00:00Z") } });
    await prisma.leadContract.create({ data: { leadId: lead.id, customerId: c.id, sparte: "hausrat", premium: 150, signedAt: new Date("2026-12-15T10:00:00Z") } });
    // Empfehlung desselben Kunden zählt nicht für die Kampagne
    const ref = await prisma.lead.create({ data: { customerId: c.id, source: "Empfehlung", name: "Erika Muster", status: "Abschluss", closedAt: new Date("2026-10-12T10:00:00Z") } });
    await prisma.leadContract.create({ data: { leadId: ref.id, customerId: c.id, primaryLeadId: ref.id, sparte: "hausrat", premium: 150, signedAt: new Date("2026-10-12T10:00:00Z") } });
    await prisma.campaignRecipient.updateMany({ where: { campaignId: A.id }, data: { leadId: ref.id } });

    const contracts = await loadCustomerContracts(c.id);
    const byLead = contracts.filter((x) => x.leadId === lead.id).sort((a, b) => +a.signedAt - +b.signedAt);
    expect(byLead.map((x) => [x.sparte, x.campaignId, x.campaignChannel ?? null, x.origin])).toEqual([
      ["rechtsschutz", B.id, "email", "bestand"],
      ["hausrat", null, null, "bestand"],
    ]);
    expect(contracts.find((x) => x.leadId === ref.id)).toMatchObject({ origin: "empfehlung", campaignId: null });

    const stats = await loadCampaignStats(c.id);
    const sb = stats.find((s) => s.id === B.id)!;
    expect(sb.funnel.email).toMatchObject({ angeschrieben: 1, geantwortet: 1, lead: 1, termin: 1, abschluss: 1 });
    expect(sb.funnel.email.sparten).toEqual({ Rechtsschutz: 1 });
    expect(sb.ertrag.provision).toBeGreaterThan(0);
    expect(stats.find((s) => s.id === A.id)!.funnel.whatsapp.abschluss).toBe(0);
    const tiles = await loadPeriodTiles(c.id, { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-10-31T00:00:00Z") });
    expect(tiles.funnel.gesamt).toMatchObject({ angeschrieben: 2, abschluss: 1 });
    expect(tiles.funnel.whatsapp.angeschrieben).toBe(1);
    expect(tiles.funnel.email.angeschrieben).toBe(1);

    // Zahlen (/buyer/zahlen): Bestandskampagnen getrennt, Empfehlung nicht doppelt
    const p = summarizeProvision(contracts, undefined, { from: new Date("2026-01-01"), to: new Date("2026-12-31") });
    expect(p.byOrigin.bestand.contracts).toBe(2);
    expect(p.byOrigin.empfehlung.contracts).toBe(1);
    expect(sb.funnel.gesamt.provision).toBeLessThan(p.byOrigin.bestand.amount + 0.01);
  });
});
