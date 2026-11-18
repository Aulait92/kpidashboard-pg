// Antwortadresse mit Eingang (Ole, 18.11.2026, Paket M2): Reply-To <kurz>.<code>@antwort… nur ohne Postfach und mit
// Schalter; Eingang „email.received“ → Zuordnung (Code, Absender, Kunde), Verlauf, Weiterleitung mit Reply-To = Lead,
// Push, Stopp-Regeln; Schutz (automatische Antwort, Schleife, SPF/DKIM/DMARC, Anhangfilter), Wiederholung, Löschung.
// Versand gemockt (lib/mail-guard, lib/push), Resend Receiving als Objekt übergeben, Datenbank echt.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Gesendet = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};
const st = vi.hoisted(() => ({ resend: [] as Gesendet[], push: [] as { an: string; title: string; body: string; url?: string }[], fehler: 0 }));

vi.mock("@/lib/mail-guard", () => ({
  mailClient: () => ({
    emails: {
      send: async (args: Gesendet) => {
        if (st.fehler > 0) {
          st.fehler--;
          return { data: null, error: { name: "rate_limit_exceeded", message: "zu viele" } };
        }
        st.resend.push(args);
        return { data: { id: `re_${Math.random().toString(36).slice(2, 10)}` }, error: null };
      },
    },
  }),
  wasBlocked: () => false,
  mailAllowed: () => true,
  MAIL_BLOCKED_TEXT: "gesperrt",
}));
vi.mock("@/lib/push", () => ({
  sendToAdmins: async () => ({ sent: 0, removed: 0, errors: [] }),
  sendToBuyersOfCustomer: async (customerId: string, p: { title: string; body: string; url?: string }) => {
    st.push.push({ an: `kunde:${customerId}`, ...p });
    return { sent: 1, removed: 0, errors: [] };
  },
  sendToUser: async (userId: string, p: { title: string; body: string; url?: string }) => {
    st.push.push({ an: `user:${userId}`, ...p });
    return { sent: 1, removed: 0, errors: [] };
  },
}));

import { prisma } from "@/lib/prisma";
import { leadVersandKontext, sendeLeadMail } from "@/lib/mail/lead-versand";
import { leadCode } from "@/lib/mail/antwort-adresse";
import { verarbeiteMailEingang, type EmailReceivedEvent } from "@/lib/mail/eingang";
import type { EingangApi, EmpfangeneMail, EmpfangenerAnhang } from "@/lib/mail/eingang-api";
import { stopReasonFor } from "@/lib/lead-sequences";
import { ladeSperrDaten } from "@/lib/mail/sperren";
import { mailsById } from "@/lib/mail/kontakt-mail";
import { eraseLead } from "@/lib/erasure";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const NOW = new Date("2026-11-18T10:00:00Z");
const FROM = "termine@dein-beratungstermin.de";
const DOMAIN = "antwort.dein-beratungstermin.de";

/** Resend Receiving als Attrappe: Mail und Anhänge je ID. */
function attrappe(mails: Record<string, Partial<EmpfangeneMail>>, anhaenge: Record<string, EmpfangenerAnhang[]> = {}): EingangApi & { abrufe: number } {
  const api = {
    abrufe: 0,
    async mail(id: string): Promise<EmpfangeneMail> {
      api.abrufe++;
      const m = mails[id];
      if (!m) throw new Error("resend_receiving_get:not_found");
      return { id, from: "", to: [], subject: "", text: null, html: null, headers: {}, authentication: { spf: "pass", dkim: "pass", dmarc: "pass" }, ...m };
    },
    async anhaenge(id: string) {
      return anhaenge[id] ?? [];
    },
    async anhang(emailId: string, id: string) {
      return (anhaenge[emailId] ?? []).find((a) => a.id === id) ?? null;
    },
    async datei(url: string) {
      return Buffer.from(`inhalt:${url}`);
    },
  };
  return api;
}

const ereignis = (emailId: string, to: string, from = "x@example.org"): EmailReceivedEvent => ({
  type: "email.received",
  created_at: NOW.toISOString(),
  data: { email_id: emailId, from, to: [to], cc: [], bcc: [], subject: "egal" },
});

describe("Antwortadresse mit Eingang", () => {
  const customers: string[] = [];
  const ENV = { ...process.env };
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of customers) await cleanupCustomer(id);
    process.env = { ...ENV };
  });
  beforeEach(() => {
    st.resend = [];
    st.push = [];
    st.fehler = 0;
    process.env.APP_URL = "https://app.test";
    delete process.env.PUBLIC_BOOKING_URL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.BOOKING_EMAIL_FROM = FROM;
    delete process.env.LEAD_EMAIL_FROM;
    delete process.env.MAIL_NUR_AN;
    process.env.AUTH_SECRET = "localtestsecret_localtestsecret_0123456789";
    process.env.MAIL_ANTWORT_EINGANG = "1";
  });

  async function setup(o: { berater?: boolean } = {}) {
    const slug = `kanna-${uid()}`;
    const c = await makeCustomer({ name: `Kannapinn Versicherungen ${uid()}`, leadAddress: "sie" });
    customers.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    await prisma.agentConfig.create({ data: { customerId: c.id, advisorEmail: "ole@kannapinn.test", active: true } });
    await prisma.calendarConnection.create({ data: { customerId: c.id, provider: "google", status: "connected", bookingSlug: slug, bookingSlugAlt: [`alt-${slug}`] } });
    let beraterId: string | null = null;
    if (o.berater) {
      const b = await makeBuyer(c.id, "advisor");
      await prisma.user.update({ where: { id: b.id }, data: { email: `berater${uid()}@kannapinn.test` } });
      beraterId = b.id;
    }
    const email = `julia${uid()}@example.org`;
    const lead = await prisma.lead.create({
      data: { customerId: c.id, name: "Julia Schneider", email, status: "Angebot gesendet", ...(beraterId ? { assignedUserId: beraterId } : {}) },
    });
    const code = leadCode(lead.id);
    return { c, owner, lead, email, slug, code, beraterId, adresse: `${slug}.${code}@${DOMAIN}` };
  }

  it("Reply-To: mit Schalter die Antwortadresse (Code gespeichert), ohne Schalter bzw. mit Postfach die Vermittleradresse", async () => {
    const { c, lead, email, slug, code, owner } = await setup();
    const k = await leadVersandKontext(c.id, { leadId: lead.id });
    expect(k.antwortAdresse).toBe(`${slug}.${code}@${DOMAIN}`);
    expect(k.replyTo).toBe("ole@kannapinn.test");
    expect((await prisma.lead.findUnique({ where: { id: lead.id }, select: { antwortCode: true } }))?.antwortCode).toBe(code);
    const res = await sendeLeadMail(k, { to: email, inhalt: () => ({ subject: "Test", text: "Hallo" }), protokoll: { customerId: c.id, leadId: lead.id, art: "manuell" } });
    expect(res).toEqual({ sent: true, via: "resend" });
    expect(st.resend[0].replyTo).toBe(`${slug}.${code}@${DOMAIN}`);

    // Schalter aus: wie bisher
    process.env.MAIL_ANTWORT_EINGANG = "0";
    st.resend = [];
    const aus = await leadVersandKontext(c.id, { leadId: lead.id });
    expect(aus.antwortAdresse).toBeNull();
    await sendeLeadMail(aus, { to: email, inhalt: () => ({ subject: "Test", text: "Hallo" }), protokoll: { customerId: c.id, leadId: lead.id, art: "manuell" } });
    expect(st.resend[0].replyTo).toBe("ole@kannapinn.test");

    // Postfach verbunden: keine Weiterleitungsadresse
    process.env.MAIL_ANTWORT_EINGANG = "1";
    await prisma.mailConnection.create({ data: { userId: owner.id, customerId: c.id, provider: "smtp", email: "ole@kannapinn.test", status: "ok" } });
    const pf = await leadVersandKontext(c.id, { leadId: lead.id });
    expect(pf.postfach).not.toBeNull();
    expect(pf.antwortAdresse).toBeNull();
  });

  it("Code → Verlauf, Weiterleitung mit Reply-To = Lead und erlaubten Anhängen, Push an den Berater, Stopp-Regel, einmalig", async () => {
    const { c, lead, email, adresse, beraterId } = await setup({ berater: true });
    await prisma.lead.update({ where: { id: lead.id }, data: { antwortCode: leadCode(lead.id) } });
    const berater = await prisma.user.findUnique({ where: { id: beraterId! }, select: { email: true } });
    const seq = await prisma.leadSequence.create({ data: { leadId: lead.id, customerId: c.id, kind: "offer", startedAt: new Date(NOW.getTime() - 86_400_000), nextAt: NOW } });
    const id = `em_${uid()}`;
    const api = attrappe(
      {
        [id]: {
          from: `Julia Schneider <${email}>`,
          to: [adresse],
          subject: "AW: Ihr Angebot",
          text: "Danke, ich schicke Ihnen die Police.\n\nAm 17.11.2026 schrieb Ole:\n> Hallo Frau Schneider",
          html: "<p>Danke, ich schicke Ihnen die Police.</p>",
          headers: { "message-id": "<a@b>" },
        },
      },
      {
        [id]: [
          { id: "a1", filename: "police.pdf", size: 1000, contentType: "application/pdf", inline: false, downloadUrl: "https://inbound-cdn.resend.com/a1" },
          { id: "a2", filename: "unterlagen.zip", size: 500, contentType: "application/zip", inline: false, downloadUrl: "https://inbound-cdn.resend.com/a2" },
          { id: "a3", filename: "logo.png", size: 200, contentType: "image/png", inline: true, downloadUrl: "https://inbound-cdn.resend.com/a3" },
        ],
      },
    );
    const r = await verarbeiteMailEingang(ereignis(id, adresse, email), { now: NOW, api });
    expect(r.ergebnis).toBe("antwort");

    // Verlauf: Eingang mit gekürztem Text, Absender als Gegenüber
    const cm = await prisma.contactMail.findFirst({ where: { leadId: lead.id, richtung: "eingang" } });
    expect(cm).toMatchObject({ kind: "antwort", status: "empfangen", recipient: email, subject: "AW: Ihr Angebot", body: "Danke, ich schicke Ihnen die Police.", automatic: false });
    const h = await prisma.leadHistory.findFirst({ where: { leadId: lead.id, mailId: cm!.id } });
    expect(h?.text).toBe(`E-Mail erhalten von ${email}: AW: Ihr Angebot`);
    const eintrag = (await mailsById([cm!.id])).get(cm!.id)!;
    expect(eintrag.richtung).toBe("eingang");
    expect(eintrag.anhaenge.map((a) => [a.name, !!a.link])).toEqual([
      ["police.pdf", true],
      ["unterlagen.zip", false],
    ]);

    // Weiterleitung an den zuständigen Berater: Absender termine@ mit „Julia Schneider (Antwort)“, Reply-To = Lead
    expect(st.resend).toHaveLength(1);
    const w = st.resend[0];
    expect(w.from).toBe(`"Julia Schneider (Antwort)" <${FROM}>`);
    expect(w.to).toBe(berater!.email);
    expect(w.replyTo).toBe(email);
    expect(w.subject).toBe("Antwort von Julia Schneider: Ihr Angebot");
    expect(w.headers?.["X-PG-Eingang"]).toBe(r.eingangId);
    expect(w.attachments?.map((a) => a.filename)).toEqual(["police.pdf"]);
    expect(w.text).toContain("Aus Sicherheitsgründen nicht weitergeleitet: unterlagen.zip.");
    expect(w.text).toContain(`Kontakt in der App: https://app.test/buyer/leads/${lead.id}`);
    expect(w.text).toContain("> Hallo Frau Schneider");

    // Push neutral an den Berater
    expect(st.push).toEqual([{ an: `user:${beraterId}`, title: "Neue Antwort von Julia Schneider", body: "Per E-Mail. Die Nachricht steht im Kontaktverlauf.", url: `/buyer/leads/${lead.id}`, tag: expect.any(String) }]);

    // Stopp-Regeln: Nachfassen endet, automatische Vorlagen-Mails ebenso
    expect(await stopReasonFor({ leadId: lead.id, customerId: c.id, startedAt: seq.startedAt, kind: "offer" }, NOW)).toBe("Lead hat per E-Mail geantwortet");
    expect((await ladeSperrDaten(lead.id, { antwortSeit: new Date(NOW.getTime() - 3600_000) })).antwort).toBe(true);
    expect((await ladeSperrDaten(lead.id, { antwortSeit: new Date(NOW.getTime() + 1000) })).antwort).toBe(false);

    // Wiederholung des Webhooks: nichts doppelt
    expect((await verarbeiteMailEingang(ereignis(id, adresse, email), { now: NOW, api })).ergebnis).toBe("doppelt");
    expect(st.resend).toHaveLength(1);
    expect(await prisma.contactMail.count({ where: { leadId: lead.id, richtung: "eingang" } })).toBe(1);
  });

  it("automatische Antwort: nur Hinweis im Verlauf, keine Weiterleitung, kein Push, zählt nicht als Antwort", async () => {
    const { c, lead, email, adresse } = await setup();
    await prisma.lead.update({ where: { id: lead.id }, data: { antwortCode: leadCode(lead.id) } });
    const id = `em_${uid()}`;
    const api = attrappe({ [id]: { from: email, subject: "Automatische Antwort: Ihr Angebot", text: "Ich bin bis 3.12. nicht im Büro.", headers: { "auto-submitted": "auto-replied" } } });
    const r = await verarbeiteMailEingang(ereignis(id, adresse, email), { now: NOW, api });
    expect(r).toMatchObject({ ergebnis: "hinweis", grund: "auto_antwort" });
    const cm = await prisma.contactMail.findFirst({ where: { leadId: lead.id, richtung: "eingang" } });
    expect(cm?.kind).toBe("antwort_auto");
    expect(cm?.reason).toContain("zählt nicht als Antwort");
    expect(st.resend).toHaveLength(0);
    expect(st.push).toHaveLength(0);
    expect(await stopReasonFor({ leadId: lead.id, customerId: c.id, startedAt: new Date(NOW.getTime() - 86_400_000), kind: "offer" }, NOW)).toBeNull();
  });

  it("Absender nicht bestätigt (DMARC fail): Hinweis, keine Weiterleitung", async () => {
    const { lead, email, adresse } = await setup();
    await prisma.lead.update({ where: { id: lead.id }, data: { antwortCode: leadCode(lead.id) } });
    const id = `em_${uid()}`;
    const api = attrappe({ [id]: { from: email, subject: "Bitte zahlen", text: "Link", authentication: { spf: "fail", dkim: "fail", dmarc: "fail" } } });
    expect((await verarbeiteMailEingang(ereignis(id, adresse, email), { now: NOW, api })).grund).toBe("absender_unbestaetigt");
    expect((await prisma.contactMail.findFirst({ where: { leadId: lead.id, richtung: "eingang" } }))?.kind).toBe("antwort_ungeprueft");
    expect(st.resend).toHaveLength(0);
  });

  it("Schleife: eigene Absender werden ignoriert", async () => {
    const { lead, adresse } = await setup();
    await prisma.lead.update({ where: { id: lead.id }, data: { antwortCode: leadCode(lead.id) } });
    const id = `em_${uid()}`;
    const api = attrappe({ [id]: { from: `"Julia (Antwort)" <${FROM}>`, subject: "Antwort von Julia: x", text: "x" } });
    expect(await verarbeiteMailEingang(ereignis(id, adresse, FROM), { now: NOW, api })).toMatchObject({ ergebnis: "ignoriert", grund: "schleife" });
    expect(await prisma.contactMail.count({ where: { leadId: lead.id } })).toBe(0);
    expect(st.resend).toHaveLength(0);
  });

  it("ohne gültigen Code: Absenderadresse → Lead des Kunden (auch über früheren Kurznamen)", async () => {
    const { lead, email, slug } = await setup();
    const id = `em_${uid()}`;
    const an = `alt-${slug}@${DOMAIN}`;
    const api = attrappe({ [id]: { from: email.toUpperCase(), subject: "Frage", text: "Noch eine Frage" } });
    const r = await verarbeiteMailEingang(ereignis(id, an, email), { now: NOW, api });
    expect(r.ergebnis).toBe("antwort");
    expect((await prisma.mailEingang.findUnique({ where: { id: r.eingangId! } }))?.zuordnung).toBe("absender");
    expect(await prisma.contactMail.count({ where: { leadId: lead.id, richtung: "eingang", kind: "antwort" } })).toBe(1);
    expect(st.resend[0].to).toBe("ole@kannapinn.test");
  });

  it("nur Kunde: Weiterleitung mit Hinweis, ohne Anhänge, ohne Verlauf und Push", async () => {
    const { c, slug } = await setup();
    const id = `em_${uid()}`;
    const api = attrappe(
      { [id]: { from: "fremd@example.net", subject: "Anfrage", text: "Hallo" } },
      { [id]: [{ id: "a1", filename: "x.pdf", size: 10, contentType: "application/pdf", inline: false, downloadUrl: "https://x" }] },
    );
    const r = await verarbeiteMailEingang(ereignis(id, `${slug}@${DOMAIN}`, "fremd@example.net"), { now: NOW, api });
    expect(r).toMatchObject({ ergebnis: "hinweis", grund: "kunde" });
    expect(st.resend).toHaveLength(1);
    expect(st.resend[0].text).toContain("keinem Kontakt zugeordnet");
    expect(st.resend[0].text).toContain("Anhänge wurden nicht weitergeleitet (1)");
    expect(st.resend[0].attachments).toBeUndefined();
    expect(st.push).toHaveLength(0);
    expect(await prisma.contactMail.count({ where: { customerId: c.id, richtung: "eingang" } })).toBe(0);
  });

  it("Schalter aus: unbekannte Adressen ignoriert, vergebene Codes weiter verarbeitet", async () => {
    process.env.MAIL_ANTWORT_EINGANG = "0";
    const { lead, email, slug, adresse } = await setup();
    const id1 = `em_${uid()}`;
    const api1 = attrappe({ [id1]: { from: email, subject: "x", text: "x" } });
    expect(await verarbeiteMailEingang(ereignis(id1, `${slug}@${DOMAIN}`, email), { now: NOW, api: api1 })).toMatchObject({ ergebnis: "ignoriert", grund: "schalter_aus" });
    expect(api1.abrufe).toBe(0);
    await prisma.lead.update({ where: { id: lead.id }, data: { antwortCode: leadCode(lead.id) } });
    const id2 = `em_${uid()}`;
    const api2 = attrappe({ [id2]: { from: email, subject: "x", text: "Antwort" } });
    expect((await verarbeiteMailEingang(ereignis(id2, adresse, email), { now: NOW, api: api2 })).ergebnis).toBe("antwort");
  });

  it("Weiterleitung scheitert: Fehler (Wiederholung), beim zweiten Versuch einmal weitergeleitet, Verlauf einmal", async () => {
    const { lead, email, adresse } = await setup();
    await prisma.lead.update({ where: { id: lead.id }, data: { antwortCode: leadCode(lead.id) } });
    const id = `em_${uid()}`;
    const api = attrappe({ [id]: { from: email, subject: "x", text: "Antwort" } });
    st.fehler = 1;
    await expect(verarbeiteMailEingang(ereignis(id, adresse, email), { now: NOW, api })).rejects.toThrow(/mail_eingang:weiterleitung/);
    expect((await prisma.mailEingang.findUnique({ where: { resendEmailId: id } }))?.ergebnis).toBe("fehler");
    expect((await verarbeiteMailEingang(ereignis(id, adresse, email), { now: NOW, api })).ergebnis).toBe("antwort");
    expect(st.resend).toHaveLength(1);
    expect(await prisma.contactMail.count({ where: { leadId: lead.id, richtung: "eingang" } })).toBe(1);
    expect(st.push).toHaveLength(1);
  });

  it("Löschung mit dem Lead: Eingang, Verlauf und Code weg", async () => {
    const { lead, email, adresse } = await setup();
    await prisma.lead.update({ where: { id: lead.id }, data: { antwortCode: leadCode(lead.id) } });
    const id = `em_${uid()}`;
    await verarbeiteMailEingang(ereignis(id, adresse, email), { now: NOW, api: attrappe({ [id]: { from: email, subject: "x", text: "Antwort" } }) });
    expect(await prisma.mailEingang.count({ where: { leadId: lead.id } })).toBe(1);
    await eraseLead(lead.id);
    expect(await prisma.mailEingang.count({ where: { resendEmailId: id } })).toBe(0);
    expect(await prisma.contactMail.count({ where: { leadId: lead.id } })).toBe(0);
    expect((await prisma.lead.findUnique({ where: { id: lead.id }, select: { antwortCode: true } }))?.antwortCode).toBeNull();
    // Spätere Mail an den Code: keinem Kontakt mehr zugeordnet (nur Kunde → Hinweis an den Vermittler)
    const id2 = `em_${uid()}`;
    const r = await verarbeiteMailEingang(ereignis(id2, adresse, email), { now: NOW, api: attrappe({ [id2]: { from: email, subject: "x", text: "x" } }) });
    expect(r.grund).toBe("kunde");
  });
});
