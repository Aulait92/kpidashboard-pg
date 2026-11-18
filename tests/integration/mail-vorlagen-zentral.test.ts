// E-Mail-Vorlagen in der Customer Journey, Pakete M0, M1, M9 (Ole, 17.11.2026, docs/plan-mail-vorlagen.md):
// zentrale Funktion je Lead und Vorlage, Sperren, Idempotenz, Tageslimit, BCC-Kopie, Abmeldelink, Dialog über den
// Lead-Mail-Baustein (ohne Postfach über Resend), „Gesendet?“ → Verlauf, Erklärschritt in den Einstellungen.
// Versand gemockt (lib/mail-guard), Datenbank echt.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ResendMail = { from: string; to: string; replyTo?: string; subject: string; text: string; html?: string; attachments?: { filename: string }[] };
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
import { sendeVorlagenMail, bereiteVorlagenMail } from "@/lib/mail/vorlagen-mail";
import { leadSignatur } from "@/lib/mail/lead-absender";
import { verarbeiteResendEreignis } from "@/lib/mail/kontakt-mail";
import { unsubscribe } from "@/lib/bestand/abmelden";
import { leadAbmeldeUrl } from "@/lib/bestand/links";
import { ABMELDE_TEXT } from "@/lib/mail/rahmen";
import { leseMailAblauf } from "@/lib/mail/ablauf";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { mailSelbstGesendetAction, sendLeadMailAction } from "@/app/buyer/postfach/actions";
import { serviceMailsBestaetigenAction, setMailKopieAction, setMailStufeAction, serviceMailVorschauAction } from "@/app/buyer/einstellungen/assistent/actions";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const FROM = "termine@dein-beratungstermin.de";
// Dienstag, 17.11.2026, 18:00 Uhr Berlin
const NOW = new Date("2026-11-17T17:00:00Z");
const MORGEN = new Date("2026-11-18T09:00:00Z");

describe("Vorlagen-Mails zentral", () => {
  const customers: string[] = [];
  const ENV = { ...process.env };
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of customers) await cleanupCustomer(id);
    process.env = { ...ENV };
  });
  beforeEach(() => {
    st.resend = [];
    process.env.APP_URL = "https://app.test";
    delete process.env.PUBLIC_BOOKING_URL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.BOOKING_EMAIL_FROM = FROM;
    delete process.env.LEAD_EMAIL_FROM;
  });

  async function setup(o: { customer?: Record<string, unknown>; lead?: Record<string, unknown> } = {}) {
    const c = await makeCustomer({ name: `Kannapinn Versicherungen ${uid()}`, leadAddress: "sie", ...o.customer });
    customers.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    await prisma.user.update({ where: { id: owner.id }, data: { email: `ole${uid()}@kannapinn.test` } });
    await prisma.agentConfig.create({ data: { customerId: c.id, advisorEmail: "ole@kannapinn.test" } });
    await prisma.erstinformation.create({
      data: { customerId: c.id, token: `tok${uid()}${uid()}`, name: "Ole Kannapinn", anrede: "Herr", firma: "Kannapinn Versicherungen GmbH", anschrift: "Hauptstraße 1\n80331 München", telefon: "089 123456" },
    });
    const lead = await prisma.lead.create({
      data: { customerId: c.id, name: "Julia Schneider", email: `julia${uid()}@example.org`, status: "Neuer Lead", formData: [{ label: "Anrede", value: "Frau" }], source: "Zahnzusatzversicherung", ...o.lead },
    });
    st.customerId = c.id;
    st.userId = owner.id;
    st.email = (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email;
    return { c, owner, lead };
  }

  it("automatisch: Standardtext mit Platzhaltern, „Name | Agentur“, Antwort an den Berater, Signatur, im Verlauf als Vorlage", async () => {
    const { lead } = await setup();
    const r = await sendeVorlagenMail(lead.id, "nicht_erreicht", { anlass: "anruf-2", now: NOW });
    expect(r).toEqual({ sent: true, via: "resend" });
    expect(st.resend).toHaveLength(1);
    const m = st.resend[0];
    expect(m.from).toBe(`"Ole Kannapinn | Kannapinn Versicherungen GmbH" <${FROM}>`);
    expect(m.replyTo).toBe("ole@kannapinn.test");
    expect(m.subject).toBe("Frau Schneider, kurz zu Ihrer Zahnzusatzversicherung");
    expect(m.text.startsWith("Guten Tag Frau Schneider,\n\nich habe gerade versucht, Sie anzurufen")).toBe(true);
    expect(m.text).toContain("Viele Grüße\nOle Kannapinn\nKannapinn Versicherungen GmbH\nHauptstraße 1, 80331 München\nTelefon: 089 123456");
    expect(m.text).not.toContain("{");
    expect(m.text).not.toContain(ABMELDE_TEXT);
    expect(m.html).toContain("<strong>Ole Kannapinn</strong>");
    expect(hatGedankenstrich(m.text)).toBe(false);
    const cm = await prisma.contactMail.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(cm).toMatchObject({ kind: "nicht_erreicht", automatic: true, provider: "resend", status: "versendet" });
    const h = await prisma.leadHistory.findFirstOrThrow({ where: { leadId: lead.id, kind: "email" } });
    expect(h.text).toBe(`E-Mail (automatisch, Nicht erreicht) an ${lead.email}: ${m.subject}`);
    const res = await prisma.leadMailVersand.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(res).toMatchObject({ vorlage: "nicht_erreicht", anlass: "anruf-2", status: "gesendet", contactMailId: cm.id, tag: "2026-11-17" });
  });

  it("Idempotenz je Anlass, höchstens eine automatische Mail je Tag, Pflicht-Mail ausgenommen, am nächsten Tag wieder frei", async () => {
    const { lead } = await setup();
    expect((await sendeVorlagenMail(lead.id, "nicht_erreicht", { anlass: "anruf-2", now: NOW })).sent).toBe(true);
    expect(await sendeVorlagenMail(lead.id, "nicht_erreicht", { anlass: "anruf-2", now: NOW })).toEqual({ sent: false, reason: "schon_gesendet" });
    expect(await sendeVorlagenMail(lead.id, "nicht_erreicht", { anlass: "anruf-2", now: MORGEN })).toEqual({ sent: false, reason: "schon_gesendet" });
    expect(await sendeVorlagenMail(lead.id, "wie_besprochen", { anlass: "bedenkzeit-1", now: NOW })).toEqual({ sent: false, reason: "tageslimit" });
    // gleichzeitig: nur eine kommt durch
    const [a, b] = await Promise.all([
      sendeVorlagenMail(lead.id, "wie_besprochen", { anlass: "x-1", now: MORGEN }),
      sendeVorlagenMail(lead.id, "nicht_erschienen", { anlass: "x-2", now: MORGEN }),
    ]);
    expect([a.sent, b.sent].filter(Boolean)).toHaveLength(1);
    // Pflicht (z. B. Bestätigung mit Vorbereitung) zählt nicht gegen das Limit
    expect((await sendeVorlagenMail(lead.id, "termin_vorbereitung", { anlass: "termin-1", pflicht: true, now: MORGEN })).sent).toBe(true);
    expect(st.resend).toHaveLength(3);
    expect(await prisma.contactMail.count({ where: { leadId: lead.id } })).toBe(3);
  });

  it("Sperren: E-Mail-Funktionen aus, Stufe aus, Abschluss, gelöscht, ruhend, Antwort seit dem Anlass", async () => {
    const off = await setup({ customer: { mailFeaturesOff: true } });
    expect(await sendeVorlagenMail(off.lead.id, "nicht_erreicht", { anlass: "a", now: NOW })).toEqual({ sent: false, reason: "mail_aus" });

    const stufe = await setup({ customer: { mailAblauf: { stufen: { nicht_erreicht: "aus" } } } });
    expect(await sendeVorlagenMail(stufe.lead.id, "nicht_erreicht", { anlass: "a", now: NOW })).toEqual({ sent: false, reason: "stufe" });
    expect(await sendeVorlagenMail(stufe.lead.id, "angebot", { anlass: "a", now: NOW })).toEqual({ sent: false, reason: "stufe" });

    const won = await setup({ lead: { status: "Abschluss" } });
    expect(await sendeVorlagenMail(won.lead.id, "nicht_erreicht", { anlass: "a", now: NOW })).toEqual({ sent: false, reason: "status" });

    const weg = await setup({ lead: { erasedAt: NOW } });
    expect(await sendeVorlagenMail(weg.lead.id, "nicht_erreicht", { anlass: "a", now: NOW })).toEqual({ sent: false, reason: "geloescht" });

    const ruht = await setup({ customer: { dormantSince: NOW } });
    expect(await sendeVorlagenMail(ruht.lead.id, "nicht_erreicht", { anlass: "a", now: NOW })).toEqual({ sent: false, reason: "ruhend" });

    const antw = await setup();
    const conv = await prisma.conversation.create({ data: { customerId: antw.c.id, contactPhone: `49151${Date.now() % 1e8}`, leadId: antw.lead.id, status: "open" } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Hallo", createdAt: NOW } });
    expect(await sendeVorlagenMail(antw.lead.id, "nicht_erreicht", { anlass: "a", antwortSeit: new Date(NOW.getTime() - 60_000), now: NOW })).toEqual({ sent: false, reason: "antwort" });
    expect((await sendeVorlagenMail(antw.lead.id, "nicht_erreicht", { anlass: "b", antwortSeit: new Date(NOW.getTime() + 60_000), now: NOW })).sent).toBe(true);
    expect(st.resend).toHaveLength(1);
    expect(await prisma.leadMailVersand.count({ where: { leadId: { in: [off.lead.id, stufe.lead.id, won.lead.id, weg.lead.id, ruht.lead.id] } } })).toBe(0);
  });

  it("Versand scheitert: Reservierung wird freigegeben, später neuer Versuch", async () => {
    const { lead } = await setup();
    delete process.env.RESEND_API_KEY;
    expect(await sendeVorlagenMail(lead.id, "nicht_erreicht", { anlass: "anruf-2", now: NOW })).toEqual({ sent: false, reason: "not_configured" });
    expect(await prisma.leadMailVersand.count({ where: { leadId: lead.id } })).toBe(0);
    process.env.RESEND_API_KEY = "re_test";
    expect((await sendeVorlagenMail(lead.id, "nicht_erreicht", { anlass: "anruf-2", now: NOW })).sent).toBe(true);
  });

  it("Kunden-Vorlage vor dem Standard; Du-Fassung; Vorschau und Versand aus derselben Funktion", async () => {
    const { c, lead } = await setup({ customer: { leadAddress: "du" } });
    await prisma.mailTemplate.create({ data: { customerId: c.id, name: "Nicht erreicht", standardKey: "nicht_erreicht", subject: "{betreff_name}Rückruf", body: "{anrede},\n\nkurz: ich rufe wieder an.\n\n{signatur}" } });
    const vb = await bereiteVorlagenMail(lead.id, "nicht_erreicht", { now: NOW });
    expect(vb?.vorlage.eigene).toBe(true);
    const vorschau = vb!.inhalt(leadSignatur(vb!.kontext.daten));
    await sendeVorlagenMail(lead.id, "nicht_erreicht", { anlass: "a", now: NOW });
    expect(st.resend[0].subject).toBe("Julia, Rückruf");
    expect(st.resend[0].text).toBe(vorschau.text);
    expect(st.resend[0].text.startsWith("Hallo Julia,\n\nkurz: ich rufe wieder an.")).toBe(true);
  });

  it("BCC-Kopie: eigene Mail an die eigene Adresse, nicht im Verlauf; Bounce der Kopie markiert die Lead-Mail nicht", async () => {
    const { lead } = await setup({ customer: { mailAblauf: { bcc: { an: true, adresse: null } } } });
    await sendeVorlagenMail(lead.id, "nicht_erreicht", { anlass: "a", now: NOW });
    expect(st.resend).toHaveLength(2);
    const [an, kopie] = st.resend;
    expect(an.to).toBe(lead.email);
    expect(kopie.to).toBe("ole@kannapinn.test");
    expect(kopie.subject).toBe(`Kopie: ${an.subject}`);
    expect(kopie.replyTo).toBe(lead.email);
    expect(kopie.text.startsWith(`Kopie Ihrer E-Mail an ${lead.email}`)).toBe(true);
    expect(await prisma.contactMail.count({ where: { leadId: lead.id } })).toBe(1);
    expect(await verarbeiteResendEreignis({ type: "email.bounced", data: { email_id: kopie.id, bounce: { message: "Mailbox full" } } })).toBe(0);
    expect((await prisma.contactMail.findFirstOrThrow({ where: { leadId: lead.id } })).status).toBe("versendet");
    // gewählte Adresse
    await prisma.customer.update({ where: { id: st.customerId }, data: { mailAblauf: { bcc: { an: true, adresse: "buero@kannapinn.test" } } } });
    await sendeVorlagenMail(lead.id, "wie_besprochen", { anlass: "b", now: MORGEN });
    expect(st.resend[3].to).toBe("buero@kannapinn.test");
  });

  it("werblich: Abmeldelink; nach der Abmeldung keine werblichen und keine automatischen Mails mehr", async () => {
    const { c, lead } = await setup({ lead: { status: "Angebot gesendet" } });
    await sendeVorlagenMail(lead.id, "nachfassen_angebot", { anlass: "angebot-1", now: NOW });
    const url = leadAbmeldeUrl(lead.id);
    expect(st.resend[0].text).toContain(`${ABMELDE_TEXT} ${url}`);
    expect(st.resend[0].html).toContain(`href="${url}"`);
    const t = await unsubscribe(url.split("/abmelden/")[1], "email", { ip: null, userAgent: null });
    expect(t).toMatchObject({ leadId: lead.id, customerId: c.id, existingCustomerId: null, du: false });
    expect(await prisma.bestandOptOut.count({ where: { customerId: c.id, kind: "email" } })).toBe(1);
    expect(await sendeVorlagenMail(lead.id, "nachfassen_angebot", { anlass: "angebot-2", now: MORGEN })).toEqual({ sent: false, reason: "abgemeldet" });
    expect(await sendeVorlagenMail(lead.id, "wie_besprochen", { anlass: "b", now: MORGEN })).toEqual({ sent: false, reason: "abgemeldet" });
  });

  it("Dialog: ohne Postfach über Resend mit „Name | Agentur“, Antwort an den Schreiber, Vorlage als Art; „Gesendet?“ → Verlauf", async () => {
    const { lead } = await setup({ customer: { mailAblauf: { bcc: { an: true, adresse: null } } } });
    const r = await sendLeadMailAction({ leadId: lead.id, to: lead.email!, subject: "Kurz zu Ihrer Anfrage", text: "Guten Tag Frau Schneider,\n\nanbei.\n\nViele Grüße\nOle Kannapinn", fileIds: [], vorlageKey: "nicht_erreicht" });
    expect(r.ok).toBe(true);
    expect(st.resend).toHaveLength(2);
    expect(st.resend[0]).toMatchObject({ from: `"Ole Kannapinn | Kannapinn Versicherungen GmbH" <${FROM}>`, to: lead.email, subject: "Kurz zu Ihrer Anfrage" });
    // Inhaber schreibt selbst: Antwort an die hinterlegte Antwortadresse; Kopie an den Schreiber
    expect(st.resend[0].replyTo).toBe("ole@kannapinn.test");
    expect(st.resend[1].to).toBe(st.email);
    expect(await prisma.contactMail.findFirstOrThrow({ where: { leadId: lead.id } })).toMatchObject({ kind: "nicht_erreicht", automatic: false, userId: st.userId, provider: "resend" });

    const g = await mailSelbstGesendetAction({ leadId: lead.id, to: lead.email!, subject: "Ihr Angebot", text: "Guten Tag,\n\nhier das Angebot.", vorlageKey: "angebot" });
    expect(g.ok).toBe(true);
    const selbst = await prisma.contactMail.findFirstOrThrow({ where: { leadId: lead.id, provider: "mailprogramm" } });
    expect(selbst).toMatchObject({ kind: "angebot", automatic: false, status: "versendet", subject: "Ihr Angebot" });
    const h = await prisma.leadHistory.findFirstOrThrow({ where: { leadId: lead.id, mailId: selbst.id } });
    expect(h.text).toBe(`E-Mail (Angebot, im eigenen Mailprogramm gesendet) an ${lead.email}: Ihr Angebot`);
    expect(st.resend).toHaveLength(2);
  });

  it("Dialog: E-Mail-Funktionen aus → kein Versand über die App; abgemeldet → werbliche Vorlage gesperrt, persönliche Mail geht", async () => {
    const off = await setup({ customer: { mailFeaturesOff: true } });
    const r = await sendLeadMailAction({ leadId: off.lead.id, to: off.lead.email!, subject: "Hallo", text: "Text", fileIds: [] });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("E-Mail-Funktionen sind ausgeschaltet") });
    expect(st.resend).toHaveLength(0);

    const ab = await setup();
    const { optOutHash } = await import("@/lib/bestand/links");
    await prisma.bestandOptOut.create({ data: { customerId: ab.c.id, kind: "email", hash: optOutHash("email", ab.lead.email!), scope: "email" } });
    expect(await sendLeadMailAction({ leadId: ab.lead.id, to: ab.lead.email!, subject: "Frage", text: "Text", fileIds: [], vorlageKey: "nachfassen_angebot" })).toMatchObject({ ok: false, error: "Der Kontakt hat sich von E-Mails abgemeldet." });
    expect((await sendLeadMailAction({ leadId: ab.lead.id, to: ab.lead.email!, subject: "Ihre Unterlagen", text: "Text", fileIds: [], vorlageKey: "willkommen" })).ok).toBe(true);
  });

  it("Erklärschritt: Vorschau aus den Versandfunktionen, Hauptknopf setzt Voreinstellungen und Kopie, Liste je Mail", async () => {
    const { c } = await setup();
    const v = await serviceMailVorschauAction({ name: "Ole Kannapinn", firma: "Neue Agentur", telefon: "", anschrift: "" });
    expect(v.ok && v.vorschau).toMatchObject({ von: "Ole Kannapinn | Neue Agentur", adresse: FROM, postfach: false });
    expect(v.ok && v.vorschau.subject).toMatch(/^Ihr Termin mit Herrn Kannapinn: /);
    expect(v.ok && v.vorschau.html).toContain("Neue Agentur");
    expect(leseMailAblauf((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).mailAblauf).bestaetigtAt).toBeNull();

    expect(await serviceMailsBestaetigenAction({ stufen: { tuer_offen: "aus", angebot: "auto" }, angaben: { telefon: "089 999" } })).toEqual({ ok: true });
    const a = leseMailAblauf((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).mailAblauf);
    expect(a.bestaetigtAt).not.toBeNull();
    expect(a.bcc).toEqual({ an: true, adresse: null });
    expect(a.stufen).toMatchObject({ nicht_erreicht: "auto", tuer_offen: "aus", angebot: "tipp" });
    expect((await prisma.erstinformation.findUniqueOrThrow({ where: { customerId: c.id } })).telefon).toBe("089 999");

    expect(await setMailStufeAction("nicht_erreicht", "tipp")).toEqual({ ok: true });
    expect(await setMailKopieAction({ an: true, adresse: "falsch" })).toMatchObject({ ok: false });
    expect(await setMailKopieAction({ an: true, adresse: "Buero@Kannapinn.test" })).toEqual({ ok: true });
    const b = leseMailAblauf((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).mailAblauf);
    expect(b.stufen.nicht_erreicht).toBe("tipp");
    expect(b.bcc).toEqual({ an: true, adresse: "buero@kannapinn.test" });
  });
});
