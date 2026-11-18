// E-Mail-Vorlagen, Pakete M4 und M6 (Ole, 18.11.2026, docs/plan-mail-vorlagen.md): automatische Mails in den Abfolgen
// (nicht_erreicht nach dem 2. Anrufversuch, nicht_erschienen in der No-Show-Abfolge, Erinnerung „Unterlagen fehlen“) und
// die Mails mit einem Tipp bzw. von Hand nach dem Abschluss (Danke-Mail, Tür offen, Kündigung als Aufgabe).
// Sperren je Auslöser: Antwort, Abschluss, Absage, Abmeldung (auch STOPP), Tageslimit, 2-Std.-Versatz zur WhatsApp.
// Versand (Resend) und WhatsApp simuliert, Datenbank echt.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ResendMail = { from: string; to: string; replyTo?: string; subject: string; text: string; html?: string };
const st = vi.hoisted(() => ({ resend: [] as (ResendMail & { id: string })[], customerId: "", userId: "", email: "" }));

vi.mock("@/lib/mail-guard", () => ({
  mailClient: () => ({
    emails: {
      send: async (args: ResendMail) => {
        const id = `re_${Math.random().toString(36).slice(2, 10)}`;
        st.resend.push({ ...args, id });
        return { data: { id }, error: null };
      },
    },
  }),
  wasBlocked: () => false,
  mailAllowed: () => true,
  MAIL_BLOCKED_TEXT: "gesperrt",
}));
const wa = vi.fn(async () => ({ mode: "text" }));
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => (wa as (...x: unknown[]) => Promise<unknown>)(...a) };
});
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 0, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/buyer-context", () => ({
  getBuyerContext: async () => ({ customerId: st.customerId, email: st.email, preview: false, userId: st.userId, teamRole: "owner" }),
}));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getCurrentSession: async () => ({ userId: st.userId, email: st.email, role: "BUYER", customerId: st.customerId }),
}));

import { prisma } from "@/lib/prisma";
import { registerCallAttempt } from "@/lib/call-attempts";
import { runSequences, startSequence, onLeadStatus } from "@/lib/lead-sequences";
import { starteUnterlagenErinnerung } from "@/lib/mail/abfolgen-mail";
import { sendeVorlagenMail } from "@/lib/mail/vorlagen-mail";
import { einTippMailStand, sendeEinTippMail } from "@/lib/mail/ein-tipp";
import { ladeAbschlussStand } from "@/lib/abschluss-server";
import { aktiviereAufgaben } from "@/lib/lead-aufgaben";
import { syncFollowUpWithStatus } from "@/lib/lead-followup";
import { versichererAusKuendigung } from "@/lib/vertraege-shared";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { sendLeadMailAction } from "@/app/buyer/postfach/actions";
import { leadStepInfoAction, markLeadLostResult } from "@/app/buyer/next-step-actions";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const H = 60 * 60 * 1000;
const DAY = 24 * H;
const FROM = "termine@dein-beratungstermin.de";
// Dienstag, 17.11.2026, 10:00 Uhr Berlin
const T0 = new Date("2026-11-17T09:00:00Z");

describe("E-Mail-Vorlagen M4 und M6", () => {
  const customers: string[] = [];
  const ENV = { ...process.env };
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of customers) await cleanupCustomer(id);
    process.env = { ...ENV };
  });
  beforeEach(() => {
    st.resend = [];
    wa.mockClear();
    process.env.APP_URL = "https://app.test";
    delete process.env.PUBLIC_BOOKING_URL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.BOOKING_EMAIL_FROM = FROM;
    delete process.env.LEAD_EMAIL_FROM;
  });

  async function setup(o: { customer?: Record<string, unknown>; lead?: Record<string, unknown>; nachfassen?: boolean } = {}) {
    const c = await makeCustomer({ name: `Kannapinn Versicherungen ${uid()}`, leadAddress: "sie", ...o.customer });
    customers.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    await prisma.user.update({ where: { id: owner.id }, data: { email: `ole${uid()}@kannapinn.test` } });
    await prisma.agentConfig.create({ data: { customerId: c.id, advisorEmail: "ole@kannapinn.test", active: true, followUpSequencesEnabled: o.nachfassen ?? false } });
    await prisma.whatsAppAccount.create({ data: { customerId: c.id, status: "connected", apiKeyEnc: "x" } });
    await prisma.erstinformation.create({
      data: { customerId: c.id, token: `tok${uid()}${uid()}`, name: "Ole Kannapinn", anrede: "Herr", firma: "Kannapinn Versicherungen GmbH", anschrift: "Hauptstraße 1\n80331 München", telefon: "089 123456" },
    });
    const phone = `49151${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const lead = await prisma.lead.create({
      data: { customerId: c.id, name: "Julia Schneider", email: `julia${uid()}@example.org`, phone, status: "Neuer Lead", formData: [{ label: "Anrede", value: "Frau" }], source: "Zahnzusatzversicherung", ...o.lead },
    });
    st.customerId = c.id;
    st.userId = owner.id;
    st.email = (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email;
    return { c, owner, lead, phone };
  }
  const mailsAn = (to: string | null) => st.resend.filter((m) => m.to === to);
  const chat = async (customerId: string, leadId: string, phone: string) =>
    prisma.conversation.upsert({ where: { customerId_contactPhone: { customerId, contactPhone: phone } }, create: { customerId, contactPhone: phone, leadId }, update: {} });

  // ─── M4: Nicht erreicht ───────────────────────────────────────────────────

  it("nicht_erreicht: erst nach dem 2. gezählten Versuch, 2 Std. nach der WhatsApp, Rückrufzeiten aus dem Anrufplan, einmal", async () => {
    const { c, lead, phone } = await setup();
    const r1 = await registerCallAttempt(lead.id, { customerId: c.id, now: T0 });
    expect(r1?.mail).toEqual({ status: "nach_versuch_2" });
    expect(await prisma.leadSequence.count({ where: { leadId: lead.id, kind: "nicht_erreicht_mail" } })).toBe(0);

    // WhatsApp 1 Std. vor dem 2. Versuch: Mail 2 Std. nach der WhatsApp
    const conv = await chat(c.id, lead.id, phone);
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", body: "Ich habe gerade versucht, Sie anzurufen.", sentBy: "bot", createdAt: new Date(T0.getTime() + H) } });
    const T2 = new Date(T0.getTime() + 2 * H);
    const r2 = await registerCallAttempt(lead.id, { customerId: c.id, now: T2 });
    expect(r2?.counted).toBe(true);
    expect(r2?.mail).toMatchObject({ status: "geplant", at: new Date(T0.getTime() + 3 * H).toISOString(), sofort: false });

    // Vor dem Zeitpunkt nichts, danach genau eine Mail mit den nächsten zwei Versuchen (heute 18:30, morgen 10 Uhr)
    await runSequences(new Date(T0.getTime() + 2.5 * H));
    expect(mailsAn(lead.email)).toHaveLength(0);
    await runSequences(new Date(T0.getTime() + 3 * H));
    const m = mailsAn(lead.email);
    expect(m).toHaveLength(1);
    expect(m[0].subject).toBe("Frau Schneider, kurz zu Ihrer Zahnzusatzversicherung");
    expect(m[0].text).toContain("Ich versuche es gern noch einmal heute um 18:30 Uhr oder morgen um 10 Uhr.");
    expect(hatGedankenstrich(m[0].text)).toBe(false);
    expect(await prisma.contactMail.findFirstOrThrow({ where: { leadId: lead.id } })).toMatchObject({ kind: "nicht_erreicht", automatic: true });

    // 3. Versuch: keine zweite Mail, das Fenster zeigt „schon raus“
    const r3 = await registerCallAttempt(lead.id, { customerId: c.id, now: new Date(T0.getTime() + 9 * H) });
    expect(r3?.mail?.status).toBe("gesendet");
    await runSequences(new Date(T0.getTime() + 10 * H));
    expect(mailsAn(lead.email)).toHaveLength(1);
  });

  it("nicht_erreicht ohne WhatsApp sofort; entfällt bei Antwort, Abschluss, Absage, STOPP; Tageslimit", async () => {
    const T2 = new Date(T0.getTime() + 2 * H);
    const zweiVersuche = async (s: Awaited<ReturnType<typeof setup>>) => {
      await registerCallAttempt(s.lead.id, { customerId: s.c.id, now: T0 });
      return registerCallAttempt(s.lead.id, { customerId: s.c.id, now: T2 });
    };
    // ohne WhatsApp: gleich
    const sofort = await setup();
    expect((await zweiVersuche(sofort))?.mail).toMatchObject({ status: "geplant", sofort: true });
    await runSequences(T2);
    expect(mailsAn(sofort.lead.email)).toHaveLength(1);

    // Antwort des Leads vor dem Versand
    const antw = await setup();
    const conv = await chat(antw.c.id, antw.lead.id, antw.phone);
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", body: "Hallo", sentBy: "bot", createdAt: new Date(T0.getTime() + H) } });
    await zweiVersuche(antw);
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Rufen Sie morgen an", createdAt: new Date(T0.getTime() + 2.5 * H) } });
    await runSequences(new Date(T0.getTime() + 3 * H));
    expect(mailsAn(antw.lead.email)).toHaveLength(0);
    expect((await prisma.leadSequence.findFirstOrThrow({ where: { leadId: antw.lead.id, kind: "nicht_erreicht_mail" } })).stopReason).toBe("Lead hat geantwortet");

    // Abschluss bzw. Absage nach dem 2. Versuch
    for (const status of ["Abschluss", "Kein Interesse"]) {
      const s = await setup();
      const c2 = await chat(s.c.id, s.lead.id, s.phone);
      await prisma.message.create({ data: { conversationId: c2.id, direction: "outbound", body: "Hallo", sentBy: "bot", createdAt: new Date(T0.getTime() + H) } });
      await zweiVersuche(s);
      await prisma.lead.update({ where: { id: s.lead.id }, data: { status } });
      await runSequences(new Date(T0.getTime() + 3 * H));
      expect(mailsAn(s.lead.email)).toHaveLength(0);
    }

    // STOPP per WhatsApp vor dem 2. Versuch: gar nicht geplant, das Fenster bietet keine Automatik an
    const stopp = await setup();
    await prisma.conversation.create({ data: { customerId: stopp.c.id, contactPhone: stopp.phone, leadId: stopp.lead.id, optedOutAt: T0 } });
    expect((await zweiVersuche(stopp))?.mail).toBeNull();
    expect(await prisma.leadSequence.count({ where: { leadId: stopp.lead.id, kind: "nicht_erreicht_mail" } })).toBe(0);

    // Abmeldung nach dem Planen (Abmeldelink): geht nicht raus
    const ab = await setup();
    const c3 = await chat(ab.c.id, ab.lead.id, ab.phone);
    await prisma.message.create({ data: { conversationId: c3.id, direction: "outbound", body: "Hallo", sentBy: "bot", createdAt: new Date(T0.getTime() + H) } });
    await zweiVersuche(ab);
    await prisma.conversation.update({ where: { id: c3.id }, data: { optedOutAt: new Date(T0.getTime() + 2.2 * H) } });
    await runSequences(new Date(T0.getTime() + 3 * H));
    expect(mailsAn(ab.lead.email)).toHaveLength(0);

    // Tageslimit: heute schon eine automatische Mail → übersprungen (WhatsApp bleibt der Kanal)
    const limit = await setup();
    expect((await sendeVorlagenMail(limit.lead.id, "nicht_erschienen", { anlass: "vorher", now: T0 })).sent).toBe(true);
    await zweiVersuche(limit);
    await runSequences(T2);
    expect(mailsAn(limit.lead.email)).toHaveLength(1);
    const log = (await prisma.leadSequence.findFirstOrThrow({ where: { leadId: limit.lead.id, kind: "nicht_erreicht_mail" } })).log as { result: string; detail?: string }[];
    expect(log.at(-1)).toMatchObject({ result: "skipped", detail: "heute schon eine E-Mail" });

    // Stufe „ein Tipp“ bzw. E-Mail-Funktionen aus bzw. keine Adresse: nicht geplant, das Fenster bietet sie von Hand an
    for (const o of [{ customer: { mailAblauf: { stufen: { nicht_erreicht: "tipp" } } } }, { customer: { mailFeaturesOff: true } }, { lead: { email: null } }]) {
      const s = await setup(o);
      expect((await zweiVersuche(s))?.mail).toBeNull();
    }
  });

  // ─── M4: Nicht erschienen ────────────────────────────────────────────────

  it("nicht_erschienen: Mail-Schritt am selben Tag 2 Std. nach der WhatsApp, entfällt bei Buchung", async () => {
    const s = await setup({ nachfassen: true, lead: { status: "Termin vereinbart" } });
    await startSequence(s.lead.id, "no_show", T0);
    await runSequences(T0);
    expect(wa).toHaveBeenCalledTimes(1);
    expect(mailsAn(s.lead.email)).toHaveLength(0);
    const seq = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: s.lead.id, kind: "no_show" } });
    expect(seq.nextAt?.toISOString()).toBe(new Date(T0.getTime() + 2 * H).toISOString());
    await runSequences(new Date(T0.getTime() + 2 * H));
    const m = mailsAn(s.lead.email);
    expect(m).toHaveLength(1);
    expect(m[0].subject).toBe("Frau Schneider, neuer Termin für unser Gespräch?");
    expect(m[0].text).toContain("Hier abmelden");

    // Buchung vor der Mail: keine Mail
    const b = await setup({ nachfassen: true, lead: { status: "Termin vereinbart" } });
    await startSequence(b.lead.id, "no_show", T0);
    await runSequences(T0);
    await prisma.appointment.create({ data: { customerId: b.c.id, leadId: b.lead.id, startsAt: new Date(T0.getTime() + 2 * DAY), endsAt: new Date(T0.getTime() + 2 * DAY + H), status: "booked", mode: "phone" } });
    await runSequences(new Date(T0.getTime() + 2 * H));
    expect(mailsAn(b.lead.email)).toHaveLength(0);
  });

  // ─── M6: Unterlagen fehlen ───────────────────────────────────────────────

  it("unterlagen_fehlen: nach der Mail aus dem Dialog Erinnerung nach 3 Tagen, danach Aufgabe; Upload stoppt; Abschluss nicht", async () => {
    const s = await setup({ lead: { status: "Abschluss" } });
    const liste = "• IBAN für den Beitragseinzug\n• Unterschriebener Antrag";
    const r = await sendLeadMailAction({
      leadId: s.lead.id,
      to: s.lead.email!,
      subject: "Es fehlen nur noch wenige Angaben",
      text: `Guten Tag Frau Schneider,\n\nes fehlen:\n${liste}`,
      fileIds: [],
      vorlageKey: "unterlagen_fehlen",
      erinnern: true,
      fehlende: liste,
    });
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.reminder).toMatch(/^Erinnerung per E-Mail am \S+, \d+\.\d+\., falls nichts kommt\.$/);
    const seq = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: s.lead.id, kind: "unterlagen" } });
    expect(seq.daten).toEqual({ fehlende: liste });
    // Abschluss-Status beendet die Erinnerung nicht (onLeadStatus „Abschluss“ lässt sie laufen)
    await onLeadStatus(s.lead.id, "Abschluss");
    expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq.id } })).stoppedAt).toBeNull();
    st.resend = [];
    // Erster Zeitpunkt im Versandfenster (Mo bis Sa 9 bis 19 Uhr) ab dem dritten Tag
    const tag3 = new Date(seq.nextAt!.getTime());
    tag3.setUTCHours(10, 0, 0, 0);
    if (tag3.getTime() < seq.nextAt!.getTime()) tag3.setUTCDate(tag3.getUTCDate() + 1);
    if (tag3.getUTCDay() === 0) tag3.setUTCDate(tag3.getUTCDate() + 1);
    await runSequences(tag3);
    const m = mailsAn(s.lead.email);
    expect(m).toHaveLength(1);
    expect(m[0].subject).toBe("Erinnerung: Frau Schneider, es fehlen nur noch wenige Angaben");
    expect(m[0].text).toContain(liste);
    // Zwei Tage später: Aufgabe „Unterlagen nachfassen“ über LeadTask (verdrängt keine Wiedervorlage)
    await prisma.lead.update({ where: { id: s.lead.id }, data: { followUpAt: null, followUpNote: null } });
    await runSequences(new Date(Math.max(seq.startedAt.getTime() + 5 * DAY, tag3.getTime() + 2 * H) + H));
    expect(await prisma.leadTask.findFirstOrThrow({ where: { leadId: s.lead.id, kind: "unterlagen_fehlen" } })).toMatchObject({ status: "aktiv", note: "Unterlagen nachfassen" });

    // Upload vor der Erinnerung: keine Mail
    const u = await setup();
    await starteUnterlagenErinnerung(u.lead.id, liste, { now: T0 });
    await prisma.leadFile.create({ data: { leadId: u.lead.id, customerId: u.c.id, kind: "sonstiges", fileName: "IBAN.jpg", contentType: "image/jpeg", size: 3, data: Buffer.from([0xff, 0xd8, 0xff]), createdAt: new Date(T0.getTime() + DAY) } });
    await runSequences(new Date(T0.getTime() + 3 * DAY));
    expect(mailsAn(u.lead.email)).toHaveLength(0);
    expect((await prisma.leadSequence.findFirstOrThrow({ where: { leadId: u.lead.id, kind: "unterlagen" } })).stopReason).toBe("Unterlagen sind da");

    // Stufe „aus“: keine Erinnerung per Mail, wie bisher eine Aufgabe
    const aus = await setup({ customer: { mailAblauf: { stufen: { unterlagen_fehlen: "aus" } } } });
    expect(await starteUnterlagenErinnerung(aus.lead.id, liste, { now: T0 })).toBeNull();
  });

  // ─── M6: Danke-Mail, Tür offen, Kündigung ─────────────────────────────────

  it("nach_abschluss: Haken im Abschluss-Blatt, zeitneutral, je Kontakt einmal; ohne Versandweg Text fürs eigene Mailprogramm", async () => {
    const s = await setup({ lead: { status: "Abschluss" } });
    const stand = await ladeAbschlussStand(s.lead.id, s.c.id, T0, { userId: s.owner.id });
    expect(stand?.dankeMail).toMatchObject({ app: true, vorausgewaehlt: false, gesendet: false, an: s.lead.email, vorschau: "Vielen Dank für Ihr Vertrauen." });
    expect(await sendeEinTippMail(s.lead.id, "nach_abschluss", { anlass: "abschluss", userId: s.owner.id })).toEqual({ ok: true });
    expect(await sendeEinTippMail(s.lead.id, "nach_abschluss", { anlass: "abschluss", userId: s.owner.id })).toEqual({ ok: false, error: "Diese E-Mail ist schon raus." });
    const m = mailsAn(s.lead.email);
    expect(m).toHaveLength(1);
    expect(m[0].text).not.toMatch(/in Kürze/);
    expect(m[0].text).toContain("melde mich, sobald es Neuigkeiten gibt");
    expect((await ladeAbschlussStand(s.lead.id, s.c.id, T0))?.dankeMail?.gesendet).toBe(true);

    // Stufe „automatisch“: vorausgewählt; „aus“: kein Haken
    const auto = await setup({ lead: { status: "Abschluss" }, customer: { mailAblauf: { stufen: { nach_abschluss: "auto" } } } });
    expect((await ladeAbschlussStand(auto.lead.id, auto.c.id, T0))?.dankeMail?.vorausgewaehlt).toBe(true);
    const aus = await setup({ lead: { status: "Abschluss" }, customer: { mailAblauf: { stufen: { nach_abschluss: "aus" } } } });
    expect((await ladeAbschlussStand(aus.lead.id, aus.c.id, T0))?.dankeMail).toBeNull();
    // „Meine Gesellschaft erlaubt das nicht“: kein Haken, Text fürs eigene Mailprogramm
    const off = await setup({ lead: { status: "Abschluss" }, customer: { mailFeaturesOff: true } });
    const o = (await ladeAbschlussStand(off.lead.id, off.c.id, T0))?.dankeMail;
    expect(o?.app).toBe(false);
    expect(o?.extern?.subject).toBe("Frau Schneider, vielen Dank für Ihr Vertrauen");
  });

  it("tuer_offen: Haken bei „Kein Interesse“, einmalig, nie nach STOPP", async () => {
    const s = await setup({ lead: { status: "Angebot gesendet", reached: true } });
    const info = await leadStepInfoAction(s.lead.id);
    expect(info.ok && info.info.tuerOffen).toMatchObject({ an: s.lead.email, vorausgewaehlt: false });
    const r = await markLeadLostResult(s.lead.id, { reason: "kein_interesse", tuerOffen: true });
    expect(r).toMatchObject({ ok: true, mail: { ok: true } });
    const m = mailsAn(s.lead.email);
    expect(m).toHaveLength(1);
    expect(m[0].subject).toBe("Frau Schneider, vielen Dank für Ihre Rückmeldung");
    expect(m[0].text).toContain("Hier abmelden");
    // einmalig: kein zweiter Haken
    const nochmal = await leadStepInfoAction(s.lead.id);
    expect(nochmal.ok && nochmal.info.tuerOffen).toBeNull();

    // STOPP per WhatsApp: kein Haken, und auch auf Wunsch keine Mail
    const stopp = await setup({ lead: { status: "Angebot gesendet", reached: true } });
    await prisma.conversation.create({ data: { customerId: stopp.c.id, contactPhone: stopp.phone, leadId: stopp.lead.id, optedOutAt: T0 } });
    const i2 = await leadStepInfoAction(stopp.lead.id);
    expect(i2.ok && i2.info.tuerOffen).toBeNull();
    const r2 = await markLeadLostResult(stopp.lead.id, { reason: "kein_interesse", tuerOffen: true });
    expect(r2).toMatchObject({ ok: true, mail: { ok: false, error: "Der Kontakt hat sich von E-Mails abgemeldet." } });
    expect(mailsAn(stopp.lead.email)).toHaveLength(0);
  });

  it("kuendigung: Aufgabe beim Abschluss, wenn der Komplettcheck einen Vertrag derselben Sparte zeigt; wartet hinter „Police fertig machen“", async () => {
    const s = await setup({
      lead: { source: "Privatschutz", vorvertraege: { at: T0.toISOString(), liste: [{ sparte: "Haftpflicht", gesellschaft: "HUK-Coburg" }, { sparte: "Kfz", gesellschaft: "Allianz" }] } },
    });
    await prisma.lead.update({ where: { id: s.lead.id }, data: { status: "Abschluss" } });
    await syncFollowUpWithStatus(s.lead.id, "Abschluss");
    const task = await prisma.leadTask.findFirstOrThrow({ where: { leadId: s.lead.id, kind: "kuendigung" } });
    expect(task).toMatchObject({ status: "wartet", note: "Alten Vertrag kündigen: Haftpflicht bei HUK-Coburg" });
    expect(versichererAusKuendigung(task.note)).toBe("HUK-Coburg");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: s.lead.id } })).followUpNote).toBe("Police fertig machen");
    // „Police fertig machen“ erledigt → die Kündigung rückt nach
    await prisma.lead.update({ where: { id: s.lead.id }, data: { followUpAt: null, followUpNote: null } });
    await aktiviereAufgaben(new Date(), { leadId: s.lead.id });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: s.lead.id } })).followUpNote).toBe("Alten Vertrag kündigen: Haftpflicht bei HUK-Coburg");

    // Kündigung schon gesendet: entfällt beim Aktivieren
    const g = await setup({ lead: { source: "Zahnzusatz", vorvertraege: { at: T0.toISOString(), liste: [{ sparte: "Zahnzusatz", gesellschaft: "DKV" }] } } });
    await prisma.lead.update({ where: { id: g.lead.id }, data: { status: "Abschluss" } });
    await syncFollowUpWithStatus(g.lead.id, "Abschluss");
    await prisma.contactMail.create({ data: { customerId: g.c.id, leadId: g.lead.id, kind: "kuendigung", recipient: g.lead.email!, subject: "Kündigung", body: "x", automatic: false } });
    await prisma.lead.update({ where: { id: g.lead.id }, data: { followUpAt: null, followUpNote: null } });
    await aktiviereAufgaben(new Date(), { leadId: g.lead.id });
    expect(await prisma.leadTask.findFirstOrThrow({ where: { leadId: g.lead.id, kind: "kuendigung" } })).toMatchObject({ status: "entfallen", endedReason: "Kündigung schon gesendet" });

    // Andere Sparte im Komplettcheck: keine Aufgabe
    const n = await setup({ lead: { source: "Zahnzusatzversicherung", vorvertraege: { at: T0.toISOString(), liste: [{ sparte: "Kfz", gesellschaft: "Allianz" }] } } });
    await prisma.lead.update({ where: { id: n.lead.id }, data: { status: "Abschluss" } });
    await syncFollowUpWithStatus(n.lead.id, "Abschluss");
    expect(await prisma.leadTask.count({ where: { leadId: n.lead.id, kind: "kuendigung" } })).toBe(0);
  });

  it("Ein-Tipp-Stand: willkommen bzw. Abmeldung sperrt werbliche Mails von Hand", async () => {
    const s = await setup({ lead: { status: "Abschluss" } });
    expect(await einTippMailStand(s.lead.id, "willkommen", { anlass: "police" })).toMatchObject({ app: true, vorschau: "Ihre Police ist fertig, herzlich willkommen!" });
  });
});
