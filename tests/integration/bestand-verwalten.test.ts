// Bestandskunden-Modul, Lücken aus dem Modultest (Ole, 18.11.2026):
// 1. Einzelne Bestandskunden löschen (DSGVO, Sperrliste gegen erneuten Import) und sperren (wieder entsperrbar)
// 2. Kampagne beenden und Empfängerliste mit Status
// 3. Ansprache Du/Sie für Bestandskunden (Einstellung des Vermittlers) in allen Texten an sie, ohne Gedankenstriche
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  mails: [] as Array<{ userId: string; to: string; subject: string; text: string; html?: string }>,
  notices: [] as Array<{ to: string; text: string }>,
  wa: [] as Array<{ to: string; body: string }>,
}));

vi.mock("@/lib/mail/postfach", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/postfach")>();
  return {
    ...real,
    sendViaPostfach: async (userId: string, m: { to: string; subject: string; text: string; html?: string }) => {
      st.mails.push({ userId, ...m });
      return { ok: true as const, from: "berater@agentur.test" };
    },
  };
});
vi.mock("@/lib/email", async (orig) => {
  const real = await orig<typeof import("@/lib/email")>();
  return { ...real, sendPlainMail: async () => ({ ok: true as const }) };
});
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return {
    ...real,
    sendWhatsAppNotice: async (o: { to: string; text: string }) => {
      st.notices.push(o);
      return { mode: "template" as const, conversationId: null, messageId: `wamid.${st.notices.length}.${Math.random().toString(36).slice(2, 8)}` };
    },
  };
});
vi.mock("@/lib/whatsapp/gateway", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/gateway")>();
  return { ...real, sendWhatsAppMessage: async (o: { to: string; body: string }) => (st.wa.push(o), { ok: true }) };
});
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 0, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});

import { prisma } from "@/lib/prisma";
import { campaignMailFor, campaignRecipientList, campaignText, createCampaign, endCampaign, ENDED_REASON, handleCampaignReply, planAudience, recipientStatusLabel, runCampaigns } from "@/lib/bestand/campaigns";
import { deleteExistingCustomer, setExistingCustomerBlocked } from "@/lib/bestand/kunde-verwalten";
import { detectMapping, importRows, parseFile } from "@/lib/bestand/import";
import { loadConsentPage, requestConsent, submitConsentForm, confirmDoi } from "@/lib/bestand/einwilligung-server";
import { resolveUnsubscribe } from "@/lib/bestand/abmelden";
import { signLink } from "@/lib/bestand/links";
import { BLOCKED_REASON } from "@/lib/bestand/einwilligung";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
// Montag, 16.11.2026, 10:00 Uhr Berlin
const NOW = new Date("2026-11-16T09:00:00Z");
const noSleep = async () => {};
const DASH = /[–—]/;

async function setup(opts: { wa?: boolean; du?: boolean } = {}) {
  const c = await makeCustomer({
    name: `Agentur Meier ${uid()}`,
    existingCustomersEnabled: true,
    bestandUwgConfirmedAt: NOW,
    bestandMailImprint: "Agentur Meier\nHauptstr. 1, 12345 Ort",
    ...(opts.du ? { bestandAddress: "du" } : {}),
  });
  const owner = await makeBuyer(c.id, "owner");
  if (opts.wa) {
    await prisma.whatsAppAccount.create({ data: { customerId: c.id, status: "connected" } });
    for (const purpose of ["campaign_review", "campaign_renewal", "campaign_cross_sell", "campaign_birthday"]) {
      await prisma.messageTemplate.create({ data: { customerId: c.id, name: `pg_${purpose}_${uid()}`, purpose, category: "marketing", status: "approved", body: "x" } });
    }
  }
  await prisma.mailConnection.create({ data: { userId: owner.id, customerId: c.id, provider: "google", email: `berater-${uid()}@agentur.test`, status: "ok" } });
  return { c, owner };
}

const ec = (customerId: string, o: Record<string, unknown> = {}) =>
  prisma.existingCustomer.create({ data: { customerId, firstName: "Erika", lastName: `Muster${uid()}`, salutation: "Frau", lines: ["KFZ"], nextRenewal: new Date("2026-12-01"), ...o } });

describe("Bestandskunden verwalten, Kampagnen beenden, Ansprache", () => {
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
    st.notices = [];
    st.wa = [];
  });

  it("Löschen: Datensatz, Verträge und Kampagnen-Verlauf weg, Adressen auf der Sperrliste, kein Versand nach erneutem Import, Protokoll", async () => {
    const { c, owner } = await setup();
    customers.push(c.id);
    const csv = ["Kundennummer;Vorname;Nachname;Mobil;E-Mail;Sparte;Hauptfälligkeit", "7001;Erika;Loesch;0151 7777777;erika.loesch@kunde.test;KFZ;01.12.2026"].join("\n");
    const { headers, rows } = await parseFile(Buffer.from(csv), "a.csv");
    await importRows(c.id, rows, detectMapping(headers), NOW, { consent: { email: true, whatsapp: true } });
    const erika = await prisma.existingCustomer.findFirstOrThrow({ where: { customerId: c.id, externalNo: "7001" } });
    const campaign = await createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, channelMode: "email", now: NOW });
    expect(await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } })).toBe(1);

    // Fremder Vermittler kann nicht löschen
    const other = await setup();
    customers.push(other.c.id);
    expect(await deleteExistingCustomer(other.c.id, erika.id)).toMatchObject({ ok: false });

    expect(await deleteExistingCustomer(c.id, erika.id, { id: owner.id, role: "kunde" })).toEqual({ ok: true });
    expect(await prisma.existingCustomer.findUnique({ where: { id: erika.id } })).toBeNull();
    expect(await prisma.existingContract.count({ where: { existingCustomerId: erika.id } })).toBe(0);
    expect(await prisma.campaignRecipient.count({ where: { existingCustomerId: erika.id } })).toBe(0);
    expect(await prisma.bestandOptOut.count({ where: { customerId: c.id, scope: "all" } })).toBe(2);
    // Sperrliste nur mit Hashwerten, keine Adressen im Klartext
    const hashes = await prisma.bestandOptOut.findMany({ where: { customerId: c.id } });
    expect(JSON.stringify(hashes)).not.toMatch(/erika\.loesch|7777777/);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "bestand.kunde_geloescht", entityId: erika.id } });
    expect(JSON.stringify(log.details)).not.toMatch(/erika|Loesch|7777777/i);

    // Erneuter Import legt den Kunden neu an, aber gesperrt: keine Kampagne erreicht ihn
    const res = await importRows(c.id, rows, detectMapping(headers), NOW, { consent: { email: true, whatsapp: true } });
    expect(res.suppressed).toBe(1);
    const again = await prisma.existingCustomer.findFirstOrThrow({ where: { customerId: c.id, externalNo: "7001" } });
    expect(again.optOutAt).not.toBeNull();
    const later = new Date(NOW.getTime() + 40 * 86_400_000);
    const plan = await planAudience(c.id, "review", {}, { now: later, waAvailable: false, mode: "email" });
    expect(plan.recipients).toHaveLength(0);
    await expect(createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, channelMode: "email", now: later })).rejects.toThrow(/niemand erreichbar/);
  });

  it("Sperren: keine Kampagnen und Glückwünsche, wartende Nachricht übersprungen; Entsperren erlaubt wieder; Protokoll", async () => {
    const { c, owner } = await setup({ wa: true });
    customers.push(c.id);
    const e = await ec(c.id, { phone: "4915100000101", whatsappConsent: "ja", email: `s${uid()}@kunde.test`, emailConsent: "ja", birthday: new Date("1980-11-16T00:00:00Z") });
    const campaign = await createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, now: NOW });
    expect(await setExistingCustomerBlocked(c.id, e.id, true, owner.id, { now: NOW })).toEqual({ ok: true });
    expect(await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } })).toMatchObject({ status: "skipped", reason: BLOCKED_REASON });
    await runCampaigns(NOW, { sleep: noSleep });
    expect(st.notices).toHaveLength(0);
    expect(st.mails).toHaveLength(0);
    // Gesperrt bleibt gespeichert, fällt aber aus allen Anlässen (auch Geburtstag) mit Grund „gesperrt“
    const stored = await prisma.existingCustomer.findUniqueOrThrow({ where: { id: e.id } });
    expect(stored).toMatchObject({ blockedById: owner.id, email: e.email });
    for (const [occ, seg] of [["review", {}], ["birthday", { birthdayDays: 30 }]] as const) {
      const p = await planAudience(c.id, occ, seg, { now: NOW });
      expect(p.recipients).toHaveLength(0);
      expect(p.counts.excluded[BLOCKED_REASON]).toBe(1);
    }
    // Einwilligung per E-Mail anfragen geht bei Gesperrten nicht
    expect(await requestConsent(e.id, c.id, { byMail: true, actorUserId: owner.id })).toMatchObject({ ok: false });

    // Sperre während eines Laufs: der Versand prüft unmittelbar vorher
    expect(await setExistingCustomerBlocked(c.id, e.id, false, owner.id)).toEqual({ ok: true });
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: e.id } })).blockedAt).toBeNull();
    const birthday = await createCampaign({ customerId: c.id, occasion: "birthday", segment: { birthdayDays: 30 }, topic: null, dailyLimit: 50, createdById: owner.id, now: NOW });
    expect(await prisma.campaignRecipient.count({ where: { campaignId: birthday.id, status: "queued" } })).toBe(1);
    await runCampaigns(NOW, { sleep: noSleep });
    expect(st.notices).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entityId: e.id, action: { in: ["bestand.kunde_gesperrt", "bestand.kunde_entsperrt"] } } })).toBe(2);
  });

  it("Beenden: Status fertig, wartende übersprungen, kein Versand mehr; Empfängerliste zeigt Status mit Datum bzw. Grund", async () => {
    const { c, owner } = await setup();
    customers.push(c.id);
    const a = await ec(c.id, { firstName: "Anna", lastName: "Alt", email: `a${uid()}@kunde.test`, emailConsent: "ja", premiumTotal: 900 });
    const b = await ec(c.id, { firstName: "Bernd", lastName: "Berg", email: `b${uid()}@kunde.test`, emailConsent: "ja", premiumTotal: 500 });
    const d = await ec(c.id, { firstName: "Dora", lastName: "Dorn", email: `d${uid()}@kunde.test`, emailConsent: "ja", premiumTotal: 100 });
    const campaign = await createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, now: NOW });
    // Anna ist schon angeschrieben (Versand selbst ist in bestand-email.test.ts geprüft)
    await prisma.campaignRecipient.updateMany({ where: { campaignId: campaign.id, existingCustomerId: a.id }, data: { status: "sent", sentAt: NOW } });
    // Dora meldet sich ab, bevor sie dran ist
    await prisma.campaignRecipient.updateMany({ where: { campaignId: campaign.id, existingCustomerId: d.id }, data: { status: "skipped", reason: "abgemeldet" } });

    const list = await campaignRecipientList(c.id, campaign.id);
    expect(list?.total).toBe(3);
    const byId = new Map(list!.rows.map((r) => [r.existingCustomerId, r]));
    expect(byId.get(a.id)).toMatchObject({ name: "Anna Alt", status: "sent", label: "gesendet am 16.11.2026", tone: "success", channel: "email" });
    expect(byId.get(b.id)).toMatchObject({ status: "queued", label: "wartet" });
    expect(byId.get(d.id)).toMatchObject({ status: "skipped", label: "übersprungen: abgemeldet", tone: "warning" });
    expect(list!.rows[0].existingCustomerId).toBe(a.id); // zuletzt gesendete zuerst
    expect(await campaignRecipientList("fremd", campaign.id)).toBeNull();

    const r = await endCampaign(c.id, campaign.id, NOW);
    expect(r).toEqual({ ok: true, skipped: 1 });
    const done = await prisma.customerCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(done.status).toBe("done");
    expect(done.finishedAt?.toISOString()).toBe(NOW.toISOString());
    expect(await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id, existingCustomerId: b.id } })).toMatchObject({ status: "skipped", reason: ENDED_REASON });
    expect(await endCampaign(c.id, campaign.id)).toMatchObject({ ok: false });
    // Nächster Tag: nichts geht mehr raus
    await runCampaigns(new Date(NOW.getTime() + 86_400_000), { sleep: noSleep });
    expect(st.mails).toHaveLength(0);
    const after = await campaignRecipientList(c.id, campaign.id);
    expect(after!.rows.find((x) => x.existingCustomerId === b.id)?.label).toBe("übersprungen: Kampagne beendet");

    // Weitere Status in Worten
    expect(recipientStatusLabel({ status: "replied", reason: "Kein Bedarf", sentAt: NOW, repliedAt: NOW })).toMatchObject({ label: "geantwortet am 16.11.2026: Kein Bedarf" });
    expect(recipientStatusLabel({ status: "failed", reason: "unzustellbar", sentAt: null, repliedAt: null })).toMatchObject({ label: "nicht zugestellt: unzustellbar", tone: "danger" });
    expect(recipientStatusLabel({ status: "failed", reason: "nicht zugestellt: kein WhatsApp", sentAt: null, repliedAt: null }).label).toBe("nicht zugestellt: kein WhatsApp");
  });

  it("Ansprache Sie (Standard): Kampagnen-Mail, Einwilligung und Abmeldung gesiezt; Lead-Ansprache unberührt", async () => {
    const { c, owner } = await setup();
    customers.push(c.id);
    const fresh = await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { bestandAddress: true, leadAddress: true } });
    expect(fresh).toEqual({ bestandAddress: "sie", leadAddress: "sie" });
    const e = await ec(c.id, { email: `sie${uid()}@kunde.test`, emailConsent: "ja" });
    await createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, now: NOW });
    await runCampaigns(NOW, { sleep: noSleep });
    expect(st.mails[0].text).toMatch(/^Guten Tag Frau Muster/);
    expect(st.mails[0].text).toContain("Ihr");
    expect(st.mails[0].text).toContain("Sie erhalten diese E-Mail");
    const page = await loadConsentPage(e.id);
    expect(page?.ansprache).toBe("sie");
    const t = await resolveUnsubscribe(signLink("e", e.id));
    expect(t?.du).toBe(false);
  });

  it("Ansprache Du: alle Texte an Bestandskunden duzen (Kampagnen, Geburtstag, Antworten, Einwilligung, Bestätigung, Abmeldung), ohne Gedankenstriche", async () => {
    const { c, owner } = await setup({ du: true });
    customers.push(c.id);
    // Lead-Ansprache bleibt Sie: getrenntes Feld
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { leadAddress: true } })).toEqual({ leadAddress: "sie" });
    const e = await ec(c.id, { email: `du${uid()}@kunde.test`, emailConsent: "ja" });

    // Kampagnen-Mail (Standardtext) mit Fußzeile
    await createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, now: NOW });
    await runCampaigns(NOW, { sleep: noSleep });
    const mail = st.mails[0];
    expect(mail.text).toMatch(/^Hallo Erika,/);
    expect(mail.subject).toBe("Dein Jahrescheck: 15 Minuten"); // neue Kampagnentexte mit Terminlink (Bestand Paket 2)
    expect(mail.text).toContain("deiner Situation");
    expect(mail.text).toContain("Du bekommst diese E-Mail");
    expect(mail.text).not.toMatch(/\b(Sie|Ihr|Ihre|Ihnen)\b/);
    expect(mail.text).not.toMatch(DASH);

    // Alle Anlässe: E-Mail und WhatsApp-Text im offenen Fenster
    const kontakt = { firstName: "Erika", lastName: "Muster", salutation: "Frau" };
    for (const occ of ["cross_sell", "review", "birthday", "renewal", "empfehlung"] as const) {
      const m = await campaignMailFor(
        { customerId: c.id, occasion: occ, topic: "Hausrat", mailSubject: null, mailBody: null },
        { id: "x", ...kontakt },
        { recipientId: "r0", customerName: c.name, imprint: null, meinname: "Max Meier", empfehlungslink: "https://app.test/e/x" },
      );
      const wa = campaignText(occ, kontakt, "Hausrat", "du");
      for (const text of [m.subject, m.text, wa]) {
        expect(text, `${occ}: ${text}`).not.toMatch(/\b(Sie|Ihr|Ihre|Ihrem|Ihren|Ihnen)\b/);
        expect(text).not.toMatch(DASH);
      }
      expect(wa.startsWith("Hallo Erika")).toBe(true);
      // Sie-Fassung bleibt gesiezt
      expect(campaignText(occ, kontakt, "Hausrat", "sie").startsWith("Guten Tag Frau Muster")).toBe(true);
    }

    // Einwilligung: Seite, Link-Text, Bestätigungsmail und Bestätigungsseite
    const page = await loadConsentPage(e.id);
    expect(page).toMatchObject({ ansprache: "du", anrede: "Hallo Erika," });
    const link = await requestConsent(e.id, c.id, { byMail: false, actorUserId: owner.id });
    expect(link.ok && link.text).toMatch(/^Hallo Erika, darf ich mich per E-Mail oder WhatsApp melden/);
    st.mails = [];
    const sub = await submitConsentForm(e.id, { email: true, whatsapp: false, emailAddress: null, phone: null, ip: null, userAgent: null }, NOW);
    expect(sub).toMatchObject({ ok: true, doiSent: true });
    const doi = st.mails.find((m) => m.to === e.email)!;
    expect(doi.text).toContain("bitte bestätige mit einem Klick");
    expect(doi.text).not.toMatch(/\b(Sie|Ihr|Ihre|Ihren|Ihnen)\b/);
    expect(doi.text).not.toMatch(DASH);
    const token = /\/einwilligung\/bestaetigen\/([A-Za-z0-9_-]+)/.exec(doi.text)![1];
    expect(await confirmDoi(token, { ip: null, userAgent: null }, NOW)).toMatchObject({ ok: true, ansprache: "du" });
    // Abmeldeseite
    expect((await resolveUnsubscribe(signLink("e", e.id)))?.du).toBe(true);

    // Automatische Antworten auf WhatsApp (Kein Bedarf, Stopp)
    const w = await setup({ wa: true, du: true });
    customers.push(w.c.id);
    const p = await ec(w.c.id, { phone: "4915100000202", whatsappConsent: "ja" });
    const wc = await createCampaign({ customerId: w.c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: w.owner.id, now: NOW });
    await runCampaigns(NOW, { sleep: noSleep });
    expect(st.notices.at(-1)?.text).toMatch(/^Hallo Erika, einmal im Jahr lohnt/);
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId: w.c.id } });
    const conv = await prisma.conversation.create({ data: { customerId: w.c.id, whatsAppAccountId: acc.id, contactPhone: p.phone!, status: "open", lastMessageAt: NOW } });
    await prisma.campaignRecipient.updateMany({ where: { campaignId: wc.id }, data: { conversationId: conv.id } });
    const later = new Date(NOW.getTime() + 3_600_000);
    await handleCampaignReply(conv.id, p.phone!, "Kein Bedarf", later);
    expect(st.wa.at(-1)?.body).toBe("Alles klar, vielen Dank für deine Rückmeldung! Wenn sich etwas ändert, schreib mir einfach hier.");
    await handleCampaignReply(conv.id, p.phone!, "Stopp", later);
    expect(st.wa.at(-1)?.body).toBe("Alles klar, wir schreiben dir hier keine weiteren Nachrichten.");
    for (const m of st.wa) expect(m.body).not.toMatch(DASH);
  });
});
