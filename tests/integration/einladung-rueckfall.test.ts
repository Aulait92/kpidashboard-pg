// Einladung mit Kalendereintrag ohne Bestätigung der Adresse (Ole, 19.11.2026, lib/whatsapp/einladung-rueckfall.ts),
// gegen die Test-DB, WhatsApp (360dialog) und Mail simuliert, Zeit fest über die now-Parameter (T0 + Minuten):
// Abbruch vor der Adressfrage, keine Antwort auf die Adressfrage, Termin bald (5 Min.), keine E-Mail (Link per WhatsApp),
// spätere Korrektur (neue Adresse ja, alte nicht doppelt), Frage nach dem Kalendereintrag erst nach 10 Min.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const waSend = vi.fn();
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return {
    ...real,
    sendText: (...a: unknown[]) => waSend("text", ...a),
    sendTemplate: (...a: unknown[]) => waSend("template", ...a),
    sendButtons: (...a: unknown[]) => waSend("buttons", ...a),
    sendDocument: (...a: unknown[]) => waSend("document", ...a),
  };
});
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 1, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
// Ruhezeiten des Assistenten (Mo bis Sa 8 bis 20 Uhr) steuerbar, damit der Test nicht von der Uhrzeit abhängt
const fenster = { auf: true };
vi.mock("@/lib/whatsapp/termin-strecke", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/termin-strecke")>();
  return { ...real, inStreckenFenster: () => fenster.auf };
});
// Mails an den Lead: Art und Adresse (aus dem Chat, wie lib/calendar/lead-email.ts)
const mails: { id: string; kind: string; an: string }[] = [];
vi.mock("@/lib/calendar/lead-email", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar/lead-email")>();
  const { prisma } = await import("@/lib/prisma");
  return {
    ...real,
    sendLeadEmail: async (id: string, kind: string) => {
      const t = await prisma.appointment.findUniqueOrThrow({ where: { id }, select: { conversationId: true } });
      const conv = t.conversationId ? await prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { contactEmail: true } }) : null;
      if (!conv?.contactEmail) return { sent: false, reason: "no_email" };
      mails.push({ id, kind, an: conv.contactEmail });
      return { sent: true, to: conv.contactEmail };
    },
  };
});

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { runEinladungNachholen } from "@/lib/calendar/einladung";
import { kalenderLinkText, rueckfallFaellig, runKalenderFrage, waMerker } from "@/lib/whatsapp/einladung-rueckfall";
import { emailAntwort, emailBestaetigt, emailUebernehmen, merke, STRECKE } from "@/lib/whatsapp/termin-strecke";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4916${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const MIN = 60_000;
const T = (t0: Date, min: number) => new Date(t0.getTime() + min * MIN);
const gesendet = () => waSend.mock.calls.map((c) => ({ art: c[0] as string, to: c[2] as string, body: String(c[3] ?? ""), buttons: c[0] === "buttons" ? (c[4] as { id: string; title: string }[]) : null }));
const FRAGE = "Konnten Sie den Termin in Ihrem Kalender eintragen?";

describe("Einladung ohne Bestätigung (Rückfall)", () => {
  let customerId = "";
  const pnid = `pnid-rueckfall-${uid()}`;

  /**
   * Lead mit Chat und gebuchtem Termin (Einladung ausstehend). letzteBot = Minuten vor T0, zu denen die letzte Nachricht
   * des Assistenten kam (z. B. Komplettcheck bzw. Adressfrage), ohne Antwort danach.
   */
  async function termin(o: { t0: Date; startIn: number; gebuchtVor: number; letzteBot: number; leadEmail?: string | null; chatEmail?: string | null; botText?: string }) {
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: { customerId, name: "Julia Schneider", phone, email: o.leadEmail === undefined ? "julia@example.com" : o.leadEmail, source: "Privatschutz", status: "Im Gespräch", reached: true },
    });
    const conv = await prisma.conversation.create({
      data: {
        customerId,
        leadId: lead.id,
        contactPhone: phone,
        contactName: "Julia",
        contactEmail: o.chatEmail ?? null,
        botActive: true,
        windowExpiresAt: T(o.t0, 20 * 60),
        messages: {
          create: [
            { direction: "inbound", body: "Heute 16 Uhr", createdAt: T(o.t0, -o.gebuchtVor - 1) },
            { direction: "outbound", body: o.botText ?? "Ihr Videotermin ist gebucht: …", sentBy: "bot", createdAt: T(o.t0, -o.gebuchtVor) },
            ...(o.letzteBot !== o.gebuchtVor ? [{ direction: "outbound", body: "Möchten Sie, dass Herr Kannapinn auch kurz schaut, ob Sie insgesamt gut abgesichert sind?", sentBy: "bot", createdAt: T(o.t0, -o.letzteBot) }] : []),
          ],
        },
      },
    });
    const appt = await prisma.appointment.create({
      data: {
        customerId,
        leadId: lead.id,
        conversationId: conv.id,
        startsAt: T(o.t0, o.startIn),
        endsAt: T(o.t0, o.startIn + 30),
        mode: "video",
        status: "booked",
        calendarEventId: "ev1",
        manageToken: `tok-rueckfall-${uid()}`,
        meetUrl: "https://meet.google.com/abc-defg-hij",
        einladungAusstehend: T(o.t0, -o.gebuchtVor),
      },
    });
    return { lead, conv, appt, phone };
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    const c = await makeCustomer({ name: `Agentur Kannapinn ${uid()}`, leadAddress: "sie" });
    customerId = c.id;
    await makeBuyer(customerId, "owner");
    await prisma.erstinformation.create({ data: { customerId, token: `tok-${uid()}`, name: "Ole Kannapinn", anrede: "Herr" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(async () => {
    mails.length = 0;
    fenster.auf = true;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
    // Termine früherer Tests nicht mitnehmen
    await prisma.appointment.updateMany({ where: { customerId }, data: { status: "cancelled" } });
  });

  it("Regel: 30 Min. nach der letzten Nachricht ohne Antwort, kurzfristig (unter 3 Std.) 5 Min., spätestens 60 Min. vor Beginn", () => {
    const now = new Date("2026-11-20T09:00:00Z");
    const f = (startIn: number, gebuchtVor: number, letzteVor: number | null = null) =>
      rueckfallFaellig({ startsAt: T(now, startIn), gebuchtAt: T(now, -gebuchtVor), letzteNachricht: letzteVor == null ? null : T(now, -letzteVor), now });
    expect(f(2 * 24 * 60, 29)).toBe(false);
    expect(f(2 * 24 * 60, 30)).toBe(true);
    expect(f(2 * 24 * 60, 60, 29)).toBe(false); // letzte Nachricht (Bot oder Lead) erst 29 Min. her
    expect(f(2 * 24 * 60, 60, 30)).toBe(true);
    expect(f(2 * 60, 4)).toBe(false);
    expect(f(2 * 60, 5)).toBe(true);
    expect(f(59, 1, 0)).toBe(true);
  });

  it("Abbruch vor der Adressfrage (Komplettcheck offen): nach 30 Min. Einladung an die Adresse aus dem Formular, genau einmal", async () => {
    const t0 = new Date();
    const { appt, conv } = await termin({ t0, startIn: 2 * 24 * 60, gebuchtVor: 2, letzteBot: 1, chatEmail: null });
    await merke(conv.id, STRECKE.komplettFrage, { appointmentId: appt.id });
    expect((await runEinladungNachholen(T(t0, 28))).gesendet).toBe(0); // 29 Min. nach dem Komplettcheck
    const r = await runEinladungNachholen(T(t0, 29));
    expect(r.gesendet).toBe(1);
    expect(mails).toEqual([{ id: appt.id, kind: "booked", an: "julia@example.com" }]);
    const t = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(t.einladungAt).not.toBeNull();
    expect(t.einladungAusstehend).toBeNull();
    expect(t.einladungAdressen).toEqual(["julia@example.com"]);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).contactEmail).toBe("julia@example.com");
    await runEinladungNachholen(T(t0, 120));
    expect(mails).toHaveLength(1);
    expect(gesendet()).toHaveLength(0); // keine WhatsApp-Nachricht dazu
  });

  it("keine Antwort auf „Stimmt die Adresse?“: Einladung 30 Min. nach der Frage (nicht nach der Buchung)", async () => {
    const t0 = new Date();
    const { appt, conv } = await termin({ t0, startIn: 3 * 24 * 60, gebuchtVor: 50, letzteBot: 10, chatEmail: "Julia@Example.com" });
    await merke(conv.id, STRECKE.abschluss, { appointmentId: appt.id });
    expect((await runEinladungNachholen(t0)).gesendet).toBe(0);
    expect((await runEinladungNachholen(T(t0, 19))).gesendet).toBe(0);
    expect((await runEinladungNachholen(T(t0, 20))).gesendet).toBe(1);
    expect(mails.map((m) => m.an)).toEqual(["Julia@Example.com"]);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).einladungAdressen).toEqual(["julia@example.com"]);
  });

  it("Termin bald (unter 3 Std.): nach 5 Min. ohne Antwort", async () => {
    const t0 = new Date();
    const { appt } = await termin({ t0, startIn: 150, gebuchtVor: 4, letzteBot: 4, chatEmail: "julia@example.com" });
    expect((await runEinladungNachholen(t0)).gesendet).toBe(0);
    expect((await runEinladungNachholen(T(t0, 1))).gesendet).toBe(1);
    expect(mails.map((m) => m.id)).toEqual([appt.id]);
  });

  it("keine E-Mail bekannt: Link zum Eintragen per WhatsApp (Sie-Form, ohne Gedankenstriche), einmal; nichts bei Ruhezeit, Abmeldung, Absage", async () => {
    const t0 = new Date();
    const x = await termin({ t0, startIn: 2 * 24 * 60, gebuchtVor: 40, letzteBot: 40, leadEmail: null });
    // Ruhezeit: nichts, auch kein Merker
    fenster.auf = false;
    expect(await runEinladungNachholen(t0)).toEqual({ gesendet: 0, links: 0 });
    expect(gesendet()).toHaveLength(0);
    fenster.auf = true;
    expect(await runEinladungNachholen(t0)).toEqual({ gesendet: 0, links: 1 });
    const [link] = gesendet();
    expect(link.to).toBe(x.phone);
    expect(link.body).toMatch(/^Damit Sie den Termin nicht vergessen: \*.+\* mit Herrn Kannapinn\.\n\nTermin in den Kalender eintragen:\n/);
    expect(link.body).toContain("Google-Kalender: https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(link.body).toContain(`Apple, Outlook und andere: `);
    expect(link.body).toContain(`/book/manage/${x.appt.manageToken}/ics`);
    expect(link.body).toMatch(/Einfach antippen, dann öffnet sich der Kalendereintrag\.$/);
    expect(link.body).not.toMatch(/[–—]/);
    expect(mails).toHaveLength(0);
    const t = await prisma.appointment.findUniqueOrThrow({ where: { id: x.appt.id } });
    expect(t.einladungAt).toBeNull();
    expect(t.einladungAdressen).toEqual([waMerker(t.startsAt)]);
    // Nicht noch einmal
    expect(await runEinladungNachholen(T(t0, 60))).toEqual({ gesendet: 0, links: 0 });
    expect(gesendet()).toHaveLength(1);
    // Nennt der Lead später doch eine Adresse: die Einladung geht dorthin (wie bisher)
    await prisma.appointment.update({ where: { id: x.appt.id }, data: { komplettcheck: false } });
    await emailAntwort(x.conv.id, "julia.spaet@example.com", T(t0, 70));
    expect(mails.map((m) => m.an)).toEqual(["julia.spaet@example.com"]);

    // Abmeldung (STOP) bzw. abgesagter Termin: nichts
    const stop = await termin({ t0, startIn: 2 * 24 * 60, gebuchtVor: 40, letzteBot: 40, leadEmail: null });
    await prisma.conversation.update({ where: { id: stop.conv.id }, data: { optedOutAt: t0 } });
    const abgesagt = await termin({ t0, startIn: 2 * 24 * 60, gebuchtVor: 40, letzteBot: 40, chatEmail: "julia@example.com" });
    await prisma.appointment.update({ where: { id: abgesagt.appt.id }, data: { status: "cancelled" } });
    const pausiert = await termin({ t0, startIn: 2 * 24 * 60, gebuchtVor: 40, letzteBot: 40, chatEmail: "julia@example.com" });
    await prisma.lead.update({ where: { id: pausiert.lead.id }, data: { nachrichtenPausiertAt: t0 } });
    waSend.mockClear();
    mails.length = 0;
    expect(await runEinladungNachholen(T(t0, 1))).toEqual({ gesendet: 0, links: 0 });
    expect(gesendet()).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });

  it("Du-Form des Links", () => {
    const text = kalenderLinkText({ an: "du", start: new Date("2026-11-20T15:00:00Z"), person: { dat: "Ole" }, google: "https://g", ics: "https://i" });
    expect(text).toBe(
      "Damit du den Termin nicht vergisst: *Freitag, 20.11. um 16 Uhr* mit Ole.\n\nTermin in den Kalender eintragen:\nGoogle-Kalender: https://g\nApple, Outlook und andere: https://i\n\nEinfach antippen, dann öffnet sich der Kalendereintrag.",
    );
  });

  it("„Andere Adresse“ gewählt, keine neue genannt: die alte bekommt nichts, stattdessen der Link per WhatsApp", async () => {
    const t0 = new Date();
    const x = await termin({ t0, startIn: 2 * 24 * 60, gebuchtVor: 40, letzteBot: 40, chatEmail: "julia@example.com" });
    await merke(x.conv.id, STRECKE.emailFrage, { appointmentId: x.appt.id, andere: true });
    expect(await runEinladungNachholen(T(t0, 31))).toEqual({ gesendet: 0, links: 1 });
    expect(mails).toHaveLength(0);
  });

  it("spätere Korrektur: Einladung an die neue Adresse, die alte nicht noch einmal (Merkfeld je Termin und Adresse)", async () => {
    const t0 = new Date();
    const x = await termin({ t0, startIn: 3 * 24 * 60, gebuchtVor: 40, letzteBot: 40, chatEmail: "julia@example.com" });
    await runEinladungNachholen(t0);
    expect(mails.map((m) => m.an)).toEqual(["julia@example.com"]);
    // Lead antwortet später mit einer anderen Adresse
    await emailAntwort(x.conv.id, "Die richtige ist julia.neu@example.com", T(t0, 60));
    expect(mails.map((m) => [m.kind, m.an])).toEqual([
      ["booked", "julia@example.com"],
      ["booked", "julia.neu@example.com"],
    ]);
    expect(gesendet().at(-1)!.body).toBe("Danke, die Einladung ist an julia.neu@example.com unterwegs. Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreiben Sie mir einfach hier.");
    // Doch wieder die alte bzw. noch einmal die neue: an keine Adresse zweimal
    await emailUebernehmen(x.conv.id, "julia@example.com", T(t0, 70));
    await emailUebernehmen(x.conv.id, "julia.neu@example.com", T(t0, 80));
    expect(mails).toHaveLength(2);
    const t = await prisma.appointment.findUniqueOrThrow({ where: { id: x.appt.id } });
    expect(t.einladungAdressen.sort()).toEqual(["julia.neu@example.com", "julia@example.com"]);
  });

  it("„Konnten Sie den Termin eintragen?“ frühestens 10 Min. nach dem Versand der Einladung, einmal", async () => {
    const t0 = new Date();
    const x = await termin({ t0, startIn: 2 * 24 * 60, gebuchtVor: 5, letzteBot: 1, chatEmail: "julia@example.com" });
    await prisma.appointment.update({ where: { id: x.appt.id }, data: { komplettcheck: false } });
    await merke(x.conv.id, STRECKE.abschluss, { appointmentId: x.appt.id });
    expect(await emailBestaetigt(x.conv.id, t0)).toBe(true);
    // Direkt: nur „Die Einladung ist unterwegs“, keine Frage in derselben Minute
    expect(gesendet().map((s) => s.body)).toEqual(["Super, die Einladung ist unterwegs. Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreiben Sie mir einfach hier."]);
    expect(mails).toHaveLength(1);
    expect(await runKalenderFrage(T(t0, 9))).toEqual({ gefragt: 0 });
    // Ruhezeit: wartet
    fenster.auf = false;
    expect(await runKalenderFrage(T(t0, 11))).toEqual({ gefragt: 0 });
    fenster.auf = true;
    expect(await runKalenderFrage(T(t0, 11))).toEqual({ gefragt: 1 });
    const frage = gesendet().at(-1)!;
    expect(frage.body).toBe(FRAGE);
    expect(frage.buttons).toEqual([
      { id: "eingetragen:ja", title: "Ja, eingetragen" },
      { id: "eingetragen:nein", title: "Nein, bitte nochmal" },
    ]);
    expect(await runKalenderFrage(T(t0, 20))).toEqual({ gefragt: 0 });
    expect(gesendet().filter((s) => s.body === FRAGE)).toHaveLength(1);
  });

  it("Einladung ohne Bestätigung (Rückfall): keine Frage nach dem Kalendereintrag", async () => {
    const t0 = new Date();
    await termin({ t0, startIn: 2 * 24 * 60, gebuchtVor: 40, letzteBot: 40, chatEmail: "julia@example.com" });
    expect((await runEinladungNachholen(t0)).gesendet).toBe(1);
    expect(await runKalenderFrage(T(t0, 30))).toEqual({ gefragt: 0 });
    expect(gesendet()).toHaveLength(0);
  });
});
