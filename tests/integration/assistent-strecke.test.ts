// Termin-Strecke mit Knöpfen (Ole, 17.11.2026; Reihenfolge P2), gegen die Test-DB, WhatsApp, Kalender, Mail und LLM
// simuliert: Terminvorschlag mit Zeit-Knöpfen → Klick bucht sofort (kurze Bestätigung, auch ohne E-Mail) → Komplettcheck
// (Ja: 45 Min. frei bzw. zwei andere Zeiten) → offene Angebotsfragen → bei Ja Vertragsfrage → Policen-Bitte (genau
// einmal) → Schluss mit „Stimmt die Adresse?“. Einladung an den Lead genau einmal, sobald Adresse und Komplettcheck
// feststehen, ohne Antwort nach 30 Min. (kurzfristig 5, spätestens 60 Min. vor Beginn); Änderungen danach als EINE
// Aktualisierung. Rückfall ohne Antwort: nächster Schritt, nie Schluss bei offenen Angebotsfragen. Policen-Erinnerungen.
//   Nachfassen 2 Std. nach dem Terminvorschlag: gleiche Zeit-Knöpfe, nur 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr, nicht
//   nach Antwort, Abmeldung, „Kein Interesse“ oder pausiertem Assistenten.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
const st: { ai: number; queue: Block[][]; reqs: unknown[] } = { ai: 0, queue: [], reqs: [] };
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
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (req: unknown) => {
        st.ai++;
        st.reqs.push(req);
        return { content: st.queue.shift() ?? [{ type: "text", text: "Alles klar." }], stop_reason: "end_turn" };
      },
    };
  },
}));
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));
// Kalender: freie Zeiten relativ zu slotBase, Buchung legt nur den Termin an
const cal = { base: Date.now(), busy: new Set<string>(), langBelegt: false, verlegt: [] as [string, string][] };
// Mails an den Lead (lib/calendar/lead-email.ts): Art, Adresse (Chat) und Ende des Termins beim Versand
const mails: { id: string; kind: string; ende: string; an?: string | null }[] = [];
// Policen-Modul (lib/policen/server.ts): Bitte nur mit Schalter, Erinnern nur mit Opt-in; Antwort auf die Einwilligung
const policenModul = { an: true, optIn: new Set<string>() };
vi.mock("@/lib/policen/server", async (orig) => {
  const real = await orig<typeof import("@/lib/policen/server")>();
  return {
    ...real,
    policenBitteFuerChat: async () => {
      if (!policenModul.an) return null;
      const { policenBitte } = await import("@/lib/policen/bitte");
      return policenBitte({ an: "sie", vermittler: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn", anrede: "Herr" } });
    },
    darfPolicenErinnern: async (leadId: string) => policenModul.an && policenModul.optIn.has(leadId),
    // Satz am Vortag: ohne Opt-in (A8 a), aber nur mit eingeschalteter Funktion
    darfPolicenVortagSatz: async (leadId: string, now?: Date) => policenModul.an && real.darfPolicenVortagSatz(leadId, now),
    handlePolicenAntwort: async (conversationId: string, o: { payload?: string | null }) => {
      if (o.payload !== "policen:ja" && o.payload !== "policen:nein") return { handled: false };
      const { prisma } = await import("@/lib/prisma");
      const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
      const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { customerId: true, contactPhone: true } });
      const { lieberNichtText, nachEinwilligungText } = await import("@/lib/policen/bitte");
      await sendWhatsAppMessage({ customerId: c.customerId, to: c.contactPhone, body: o.payload === "policen:ja" ? nachEinwilligungText("sie") : lieberNichtText("sie"), sentBy: "bot" });
      return { handled: true };
    },
  };
});
vi.mock("@/lib/calendar/lead-email", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar/lead-email")>();
  const { prisma } = await import("@/lib/prisma");
  return {
    ...real,
    sendLeadEmail: async (id: string, kind: string) => {
      const t = await prisma.appointment.findUniqueOrThrow({ where: { id }, select: { conversationId: true, startsAt: true, endsAt: true } });
      const conv = t.conversationId ? await prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { contactEmail: true } }) : null;
      if (!conv?.contactEmail) return { sent: false, reason: "no_email" };
      mails.push({ id, kind, ende: (t.endsAt ?? new Date(t.startsAt.getTime() + 30 * 60_000)).toISOString(), an: conv.contactEmail });
      return { sent: true, to: conv.contactEmail };
    },
  };
});
const slotsAb = (base: number) => {
  const iso = (h: number) => new Date(Math.ceil(base / 3600_000) * 3600_000 + h * 3600_000).toISOString();
  return [iso(3), iso(4), iso(26), iso(27), iso(50)].filter((s) => !cal.busy.has(s)).map((s) => ({ start: s, end: new Date(new Date(s).getTime() + 30 * 60_000).toISOString() }));
};
vi.mock("@/lib/calendar", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar")>();
  const { prisma } = await import("@/lib/prisma");
  return {
    ...real,
    bookingDurationMin: async () => 30,
    bookingPausedUntil: async () => null,
    suggestSlots: async () => slotsAb(cal.base),
    adapterFor: async () => ({
      getBusy: async (min: Date, max: Date) => (cal.langBelegt ? [{ start: min, end: max }] : []),
      updateEventEnd: async () => {},
      updateEventTime: async (id: string, start: Date) => {
        cal.verlegt.push([id, start.toISOString()]);
      },
    }),
    bookAppointment: async (o: { customerId: string; leadId: string | null; conversationId: string; start: string; mode: string }) => {
      if (cal.busy.has(o.start)) throw new real.SlotBusyError();
      const a = await prisma.appointment.create({ data: { customerId: o.customerId, leadId: o.leadId, conversationId: o.conversationId, startsAt: new Date(o.start), mode: o.mode, meetUrl: "https://meet.google.com/abc-defg-hij", status: "booked", calendarEventId: "ev1" } });
      return { appointmentId: a.id, meetUrl: a.meetUrl, start: o.start, manageUrl: "https://x/manage" };
    },
    // Verschieben durch den Assistenten (Splittest termin_zusage, „Lieber andere Zeit“): neuer Termin, alter abgesagt
    rescheduleAppointment: async (o: { appointmentId: string; start: string }) => {
      const alt = await prisma.appointment.findUniqueOrThrow({ where: { id: o.appointmentId } });
      const neu = await prisma.appointment.create({ data: { customerId: alt.customerId, leadId: alt.leadId, conversationId: alt.conversationId, startsAt: new Date(o.start), mode: alt.mode, meetUrl: alt.meetUrl, status: "booked", calendarEventId: "ev2" } });
      await prisma.appointment.update({ where: { id: alt.id }, data: { status: "cancelled" } });
      return { appointmentId: neu.id, meetUrl: neu.meetUrl, start: o.start, manageUrl: "https://x/manage" };
    },
  };
});

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { runBotTurn } from "@/lib/whatsapp/bot";
import { runSequences } from "@/lib/lead-sequences";
import { emailUebernehmen, merke, policenVortagSatzFuer, runPolicenErinnerung, runStreckeAbschliessen, STRECKE } from "@/lib/whatsapp/termin-strecke";
import { einladungFaellig, einladungSenden, runEinladungNachholen } from "@/lib/calendar/einladung";
import { komplettcheckVerlaengern } from "@/lib/komplettcheck-dauer";
import { vortagText } from "@/lib/showup";
import { cleanupCustomer, makeBuyer, makeCustomer, ohneSplittest, requireTestDb } from "./db";
import { testLeadAnswers } from "@/lib/testlead";
import { KOMPLETTCHECK_RE } from "@/lib/whatsapp/gespraech";
import { experimenteCacheLeeren, zuteilen } from "@/lib/experimente";

// Buchungen im Chat immer mit Fassung a der Bestätigung (Splittest termin_zusage; Fassung b: eigener Test)
ohneSplittest("termin_zusage");

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const HOUR = 3600_000;
/** Policen-Bitte (Text aus lib/policen/bitte.ts) */
const POLICEN_BITTE_RE = /Termin gut vorbereiten kann: Schick(en Sie)? bitte vorab/;
/** Termindauer in einem Text an den Lead */
const DAUER_RE = /\d+\s*(Minuten|Min\.)/i;

type Sent = { art: string; to: string; body: string; buttons: { id: string; title: string }[] | null };
const gesendet = (): Sent[] =>
  waSend.mock.calls.map((c) => ({ art: c[0] as string, to: c[2] as string, body: String(c[3] ?? ""), buttons: c[0] === "buttons" ? (c[4] as { id: string; title: string }[]) : null }));


describe("Termin-Strecke mit Knöpfen", () => {
  let customerId = "";
  const pnid = `pnid-strecke-${uid()}`;
  const value = (extra: Record<string, unknown>) => ({ messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: "4930123456789" }, ...extra });
  const inbound = (from: string, m: Record<string, unknown>) =>
    handleInboundPayload({ entry: [{ changes: [{ field: "messages", value: value({ contacts: [{ profile: { name: "Julia" } }], messages: [{ from, id: `wamid.in-${uid()}`, ...m }] }) }] }] });
  const text = (from: string, body: string) => inbound(from, { type: "text", text: { body } });
  const knopf = (from: string, id: string, title: string) => inbound(from, { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });

  async function leadMitChat(o: { qualificationData?: Record<string, string>; now?: Date; email?: string | null; source?: string; formData?: { label: string; value: string }[]; id?: string } = {}) {
    const now = o.now ?? new Date();
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: {
        ...(o.id ? { id: o.id } : {}),
        customerId,
        name: "Julia Schneider",
        phone,
        email: o.email === undefined ? "julia@example.com" : o.email,
        source: o.source ?? "Privatschutz",
        status: "Im Gespräch",
        reached: true,
        outreachAt: now,
        formData: o.formData ?? [
          { label: "Lebenssituation", value: "Familie mit Kindern" },
          { label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" },
          { label: "Postleitzahl", value: "80331" },
        ],
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        customerId,
        leadId: lead.id,
        contactPhone: phone,
        contactName: "Julia",
        botActive: true,
        qualified: true,
        windowExpiresAt: new Date(now.getTime() + 20 * HOUR),
        lastMessageAt: now,
        qualificationData: o.qualificationData ?? { versichern: "Familie", vorhanden: "neu" },
        messages: {
          create: [
            { direction: "outbound", body: "Hallo Julia Schneider, danke für Ihre Anfrage zum Thema Privatschutz! Ich bin der digitale KI-Assistent von Herrn Kannapinn.", sentBy: "system", createdAt: new Date(now.getTime() - 30 * 60_000) },
            { direction: "inbound", body: "Beides ist neu", createdAt: new Date(now.getTime() - 20 * 60_000) },
          ],
        },
      },
    });
    return { lead, conv, phone };
  }

  beforeAll(async () => {
    // Policen-Funktion an (privater EU-Bucket eingerichtet, lib/policen/ablage.ts): Bitte nach der Vertragsfrage
    Object.assign(process.env, {
      POLICEN_S3_ENDPOINT: "https://test123.eu.r2.cloudflarestorage.com",
      POLICEN_S3_BUCKET: "pg-policen-eu",
      POLICEN_S3_ACCESS_KEY_ID: "id",
      POLICEN_S3_SECRET_ACCESS_KEY: "secret",
      POLICEN_SCHLUESSEL: Buffer.alloc(32, 11).toString("base64"),
    });
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.ANTHROPIC_API_KEY ||= "test";
    const c = await makeCustomer({ name: `Agentur Kannapinn ${uid()}`, leadAddress: "sie" });
    customerId = c.id;
    await makeBuyer(customerId, "owner");
    await prisma.erstinformation.create({ data: { customerId, token: `tok-${uid()}`, name: "Ole Kannapinn", anrede: "Herr" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, followUpSequencesEnabled: true, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    st.ai = 0;
    st.queue = [];
    cal.base = Date.now();
    cal.busy.clear();
    cal.langBelegt = false;
    mails.length = 0;
    policenModul.an = true;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });

  // Policen-Bitte (P2, Ole 17.11.2026): jeder Lead genau einmal, ob Ja, Nein oder ohne Antwort
  const policenBitten = (s: Sent[]) => s.filter((x) => POLICEN_BITTE_RE.test(x.body)).length;
  // Keine konkrete Termindauer an den Lead (Ole, 17.11.2026 spät): keine Zahl mit Minuten (die Komplettcheck-Frage
  // „ein paar Minuten länger“ ist ausdrücklich erlaubt)
  afterEach(() => {
    for (const s of gesendet()) expect(s.body, s.body).not.toMatch(DAUER_RE);
  });
  const art = (s: Sent): string =>
    /ist gebucht:/.test(s.body)
      ? "buchung"
      : KOMPLETTCHECK_RE.test(s.body)
        ? "komplettcheck"
        : /passende Beiträge zeigen kann/.test(s.body)
          ? "angebotsfrage"
          : /Welche Versicherungen haben/.test(s.body)
            ? "vertragsfrage"
            : POLICEN_BITTE_RE.test(s.body)
              ? "policen"
              : /Zum Schluss:/.test(s.body)
                ? "schluss"
                : /Einladung ist (an \S+ )?unterwegs/.test(s.body)
                  ? "ende"
                  : "sonst";

  async function gebuchtPerKnopf(o: Parameters<typeof leadMitChat>[0] = {}) {
    const x = await leadMitChat(o);
    const start = slotsAb(cal.base)[0].start;
    await knopf(x.phone, `slot:${start}`, "Heute 16 Uhr");
    const appt = await prisma.appointment.findFirstOrThrow({ where: { leadId: x.lead.id, status: "booked" } });
    return { ...x, appt, start };
  }

  it("Pfad Ja: kurze Buchung, Komplettcheck, Angebotsfrage, Vertragsfrage, Policen-Bitte, Schluss; Einladung genau einmal mit 45 Min.", async () => {
    const { lead, conv, phone } = await leadMitChat({ qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95 m²" } });
    // Vorschlag der App mit Knöpfen
    st.queue.push([{ type: "tool_use", id: "t1", name: "termin_vorschlagen", input: {} }], [{ type: "text", text: "(ignoriert)" }]);
    await runBotTurn(conv.id);
    const vorschlag = gesendet().at(-1)!;
    expect(vorschlag.buttons!.map((b) => b.id.split(":")[0])).toEqual(["slot", "slot", "andere_zeit"]);
    const merker = await prisma.message.findFirst({ where: { conversationId: conv.id, kind: STRECKE.vorschlag } });
    const starts = (JSON.parse(merker!.body!) as { starts: string[] }).starts;

    // Klick: sofort gebucht (Zeit fest im Kalender), kurze Bestätigung, dann der Komplettcheck; noch keine Einladung
    const ab = gesendet().length;
    st.ai = 0;
    await knopf(phone, vorschlag.buttons![1].id, vorschlag.buttons![1].title);
    expect(st.ai).toBe(0);
    const appt = await prisma.appointment.findFirstOrThrow({ where: { leadId: lead.id, status: "booked" } });
    expect(appt.startsAt.toISOString()).toBe(starts[1]);
    expect(appt.einladungAusstehend).not.toBeNull();
    expect(appt.einladungAt).toBeNull();
    const [buchung, komplett] = gesendet().slice(ab);
    expect(buchung.body).toMatch(/^Ihr Videotermin ist gebucht: \*.+\*\. Herr Kannapinn hält sich die Zeit nur für Sie frei und bereitet Ihre Beiträge vor\.\nIhr Link: https:\/\/meet\.google\.com\/abc-defg-hij$/);
    expect(buchung.body.split("\n").length).toBeLessThanOrEqual(3);
    expect(buchung.body).not.toMatch(/Einladung|Handy-Browser|dazwischenkommt/);
    expect(komplett.buttons?.map((b) => b.id)).toEqual(["komplettcheck:ja", "komplettcheck:nein"]);
    expect(mails).toHaveLength(0);

    // „Ja, gern“: Kalender frei → 45 Min., dann die offene Angebotsfrage
    const ab2 = gesendet().length;
    await knopf(phone, "komplettcheck:ja", "Ja, gern");
    const t2 = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(t2.komplettcheck).toBe(true);
    expect(t2.verlaengerung).toBe("verlaengert");
    expect(t2.endsAt!.getTime() - t2.startsAt.getTime()).toBe(45 * 60_000);
    expect(gesendet().slice(ab2).map((s) => s.body)).toEqual(["Super! Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Sind Sie im öffentlichen Dienst tätig?"]);
    expect(mails).toHaveLength(0);

    // Letzte Angabe → Vertragsfrage
    st.queue.push([{ type: "tool_use", id: "q1", name: "record_qualification", input: { zusammenfassung: "x", angaben: { beruf: "nicht im öffentlichen Dienst" } } }], [{ type: "text", text: "Danke, notiert." }]);
    await knopf(phone, "folge:oeffentlicherDienst:nein", "Nein");
    expect(gesendet().at(-1)!.body).toMatch(/^Danke! (Damit Herr Kannapinn sieht, ob Sie irgendwo doppelt zahlen: )?Welche Versicherungen haben Sie und Ihre Familie heute schon\?/);

    // Verträge ohne Gesellschaft bei BU und Kfz → genau eine Nachfrage (Ole, 19.11.2026)
    await text(phone, "Haftpflicht bei der HUK, eine BU und Kfz");
    expect(gesendet().at(-1)!.body).toBe("Danke! Wissen Sie noch, bei welcher Gesellschaft die Berufsunfähigkeit und die Kfz sind? Dann kann Herr Kannapinn gezielt vergleichen.");
    // Antwort (Tippfehler, eine Sparte unbekannt) → ergänzt, keine zweite Nachfrage; dann Policen-Bitte (Text aus dem
    // Policen-Modul) und die Einwilligung als eigene Nachricht mit Knöpfen
    await text(phone, "BU bei der Allainz, Kfz weiß ich nicht");
    const vv = (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { vorvertraege: true } })).vorvertraege as { liste: { sparte: string; gesellschaft: string | null }[] };
    expect(vv.liste.map((v) => [v.sparte, v.gesellschaft])).toEqual([
      ["Haftpflicht", "HUK-Coburg"],
      ["Berufsunfähigkeit", "Allianz"],
      ["Kfz", null],
    ]);
    const [bitte, einwilligung] = gesendet().slice(-2);
    expect(bitte.body).toMatch(/^Danke! Damit Herr Kannapinn Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab Fotos oder PDFs Ihrer aktuellen Policen/);
    expect(einwilligung.buttons?.map((b) => b.id)).toEqual(["policen:ja", "policen:nein"]);

    // „Lieber nicht“ → Antwort des Policen-Moduls, dann der Schluss mit Bereitlegen in einer Zeile und der Adresse
    await knopf(phone, "policen:nein", "Lieber nicht");
    const [lieber, schluss] = gesendet().slice(-2);
    expect(lieber.body).toMatch(/^Kein Problem, Ihr Termin findet trotzdem statt/);
    expect(schluss.body).toBe(
      "Damit ist alles Wichtige für Herrn Kannapinn notiert. Legen Sie zum Termin gern bereit: Ihre übrigen Policen, die Geburtsdaten der Mitversicherten und Ihre IBAN für einen direkten Abschluss.\n\n" +
        "Zum Schluss: Die Einladung mit Kalendereintrag geht an julia@example.com. Stimmt die Adresse?",
    );
    expect(schluss.buttons).toEqual([
      { id: "email:ja", title: "Ja, stimmt" },
      { id: "email:andere", title: "Andere Adresse" },
    ]);
    expect(mails).toHaveLength(0);

    // „Ja, stimmt“ → Einladung genau einmal (mit 45 Min.), zugesagt, Abschlusssatz
    await knopf(phone, "email:ja", "Ja, stimmt");
    expect(gesendet().at(-1)!.body).toBe("Super, die Einladung ist unterwegs. Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreiben Sie mir einfach hier.");
    // Die Frage nach dem Kalendereintrag kommt nicht in derselben Minute, sondern frühestens 10 Min. später über den
    // Cron (Ole, 19.11.2026; tests/integration/einladung-rueckfall.test.ts)
    expect(mails).toEqual([{ id: appt.id, kind: "booked", ende: t2.endsAt!.toISOString(), an: "julia@example.com" }]);
    const t3 = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(t3.confirmedAt).not.toBeNull();
    expect(t3.einladungAt).not.toBeNull();
    expect(t3.einladungAn).toBe("julia@example.com");
    // Reihenfolge und genau eine Policen-Bitte
    const an = gesendet().filter((s) => s.to === phone).map(art).filter((x) => x !== "sonst");
    expect(an).toEqual(["buchung", "komplettcheck", "angebotsfrage", "vertragsfrage", "policen", "schluss", "ende"]); // Einwilligung und Antwort des Policen-Moduls als „sonst“
    expect(policenBitten(gesendet())).toBe(1);
    // Doppelter Klick: nichts doppelt
    waSend.mockClear();
    await knopf(phone, "email:ja", "Ja, stimmt");
    await runEinladungNachholen(new Date(Date.now() + 2 * HOUR));
    expect(mails).toHaveLength(1);
    // Frage nach dem Kalendereintrag nur einmal je Termin
    expect(gesendet().filter((s) => s.body === "Konnten Sie den Termin in Ihrem Kalender eintragen?")).toHaveLength(0);

    // „Nein, bitte nochmal“ → Termin als Text mit Links zum Eintragen (Google-Kalender, Kalenderdatei)
    const token = `tok-eingetragen-${uid()}`;
    await prisma.appointment.update({ where: { id: appt.id }, data: { manageToken: token } });
    await knopf(phone, "eingetragen:nein", "Nein, bitte nochmal");
    const nochmal = gesendet().at(-1)!.body;
    expect(nochmal).toMatch(/^Kein Problem, hier ist Ihr Termin noch einmal: \*.+\* mit Herrn Kannapinn\./);
    expect(nochmal).toContain("Google-Kalender: https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(nochmal).toContain(`Apple, Outlook und andere: `);
    expect(nochmal).toContain(`/book/manage/${token}/ics`);
    expect(nochmal).toContain("Einfach antippen, dann öffnet sich der Kalendereintrag.");
    expect(nochmal).not.toMatch(/[–—]/);
    // „Ja, eingetragen“ → kurzer Dank, sonst nichts
    const vorher = gesendet().length;
    await knopf(phone, "eingetragen:ja", "Ja, eingetragen");
    expect(gesendet().length).toBe(vorher + 1);
    expect(gesendet().at(-1)!.body).toMatch(/^Super, vielen Dank! Dann bis .+ Uhr\.$/);
    expect(gesendet().at(-1)!.buttons).toBeNull();
  });

  it("Frage nach dem Kalendereintrag nur im offenen 24-h-Fenster; Du-Form", async () => {
    const { conv, phone } = await gebuchtPerKnopf();
    await knopf(phone, "komplettcheck:nein", "Nein, danke");
    // Fenster zu (z. B. sehr späte Antwort über eine Vorlage): keine interaktive Frage
    await prisma.conversation.update({ where: { id: conv.id }, data: { windowExpiresAt: new Date(Date.now() - 60_000) } });
    const { emailBestaetigt } = await import("@/lib/whatsapp/termin-strecke");
    await merke(conv.id, STRECKE.abschluss, {});
    waSend.mockClear();
    expect(await emailBestaetigt(conv.id)).toBe(true);
    expect(gesendet().map((s) => s.body)).toEqual(["Super, die Einladung ist unterwegs. Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreiben Sie mir einfach hier."]);
    const { eingetragenFrage, kalenderNochmalText, eingetragenDank } = await import("@/lib/whatsapp/gespraech");
    expect(eingetragenFrage("du")).toBe("Konntest du den Termin in deinem Kalender eintragen?");
    expect(eingetragenDank("du", new Date("2026-11-20T15:00:00Z"))).toMatch(/^Super, danke dir! Dann bis /);
    expect(kalenderNochmalText({ an: "du", start: new Date("2026-11-20T15:00:00Z"), person: { dat: "Ole" }, google: "https://g", ics: "https://i" })).toMatch(/^Kein Problem, hier ist dein Termin noch einmal: \*.+\* mit Ole\./);
  });

  // Live-Test 18.11.2026: Komplettcheck per Knopf, danach rief der Assistent bei der Antwort aufs Geburtsdatum noch einmal
  // komplettcheck auf; der doppelte Vermerk wurde still geschluckt und der Lead bekam keine Antwort (erst, als er
  // 7 Min. später erneut schrieb). Jede Antwort auf eine Angebotsfrage bekommt sofort im selben Webhook eine Antwort.
  it("Angebotsfragen nach Komplettcheck per Knopf: Datum, Zahl und Ja/Nein werden sofort beantwortet, auch wenn der Assistent komplettcheck erneut aufruft", async () => {
    const { appt, conv, phone } = await gebuchtPerKnopf({ qualificationData: { versichern: "Familie", vorhanden: "neu" } });
    await knopf(phone, "komplettcheck:ja", "Ja, gern");
    expect(gesendet().at(-1)!.body).toMatch(/Wie lautet Ihr Geburtsdatum\?$/);
    const komplettDoppelt = { type: "tool_use" as const, id: "k", name: "komplettcheck", input: { ja: true } };
    const antwort = async (eingabe: string, angaben: Record<string, string>, ki: string) => {
      st.queue.push([{ type: "tool_use", id: `q-${uid()}`, name: "record_qualification", input: { zusammenfassung: "x", angaben } }, { ...komplettDoppelt, id: `k-${uid()}` }], [{ type: "text", text: ki }]);
      const ab = gesendet().length;
      await text(phone, eingabe);
      return gesendet().slice(ab).map((s) => s.body);
    };

    expect(await antwort("22.08.1992", { geburt: "22.08.1992" }, "Danke! Wie viele Quadratmeter Wohnfläche hat Ihre Wohnung? Bitte als Zahl, zum Beispiel 72.")).toEqual(["Danke! Wie viele Quadratmeter Wohnfläche hat Ihre Wohnung? Bitte als Zahl, zum Beispiel 72."]);
    expect(await antwort("95", { wohnflaeche: "95 m²" }, "Danke! Sind Sie im öffentlichen Dienst tätig?")).toEqual(["Danke! Sind Sie im öffentlichen Dienst tätig?"]);
    // Letzte Angebotsfrage: statt eigener Worte die Vertragsfrage der App
    const letzte = await antwort("Nein", { beruf: "nicht im öffentlichen Dienst" }, "Danke, notiert.");
    expect(letzte).toHaveLength(1);
    expect(letzte[0]).toMatch(/^Danke! (Damit Herr Kannapinn sieht, ob Sie irgendwo doppelt zahlen: )?Welche Versicherungen haben Sie und Ihre Familie heute schon\?/);

    const q = (await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id }, select: { qualificationData: true } })).qualificationData as Record<string, string>;
    expect(q).toMatchObject({ geburt: "22.08.1992", wohnflaeche: "95 m²" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).komplettcheck).toBe(true);
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: STRECKE.komplett } })).toBe(1);
    // Offene Einladung nicht in die folgenden Tests (runEinladungNachholen) mitnehmen
    await prisma.appointment.update({ where: { id: appt.id }, data: { einladungAusstehend: null } });
  });

  it("Pfad Nein: Angebotsfrage, Policen-Bitte nur für die Sparte, Schluss; andere Adresse (geprüft) bekommt die einzige Einladung", async () => {
    const { appt, phone } = await gebuchtPerKnopf({ qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95" } });
    await knopf(phone, "komplettcheck:nein", "Nein, danke");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).komplettcheck).toBe(false);
    expect(gesendet().at(-1)!.body).toBe("Alles klar. Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Sind Sie im öffentlichen Dienst tätig?");
    st.queue.push([{ type: "tool_use", id: "q1", name: "record_qualification", input: { zusammenfassung: "x", angaben: { beruf: "nicht im öffentlichen Dienst" } } }], [{ type: "text", text: "Danke, notiert." }]);
    await knopf(phone, "folge:oeffentlicherDienst:nein", "Nein");
    const bitte = gesendet().at(-2)!;
    expect(bitte.body).toBe(
      "Danke! Damit Herr Kannapinn Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab Fotos oder PDFs Ihrer aktuellen Policen hier in den Chat, egal ob Haftpflicht, Hausrat oder Kfz. Dann sieht er vorher, ob Sie etwas doppelt zahlen und wann Sie kündigen können, und versucht, Ihnen Geld zu sparen. So wird der Termin kürzer und konkreter.",
    );
    expect(gesendet().at(-1)!.buttons?.map((b) => b.id)).toEqual(["policen:ja", "policen:nein"]);
    // Antwort als Text statt Knopf: der Assistent antwortet, dann der Schluss
    st.queue.push([{ type: "text", text: "Gern, ganz in Ruhe." }]);
    await text(phone, "Mache ich später");
    const [antwort, schluss] = gesendet().slice(-2);
    expect(antwort.body).toBe("Gern, ganz in Ruhe.");
    expect(schluss.body).toBe(
      "Danke, damit sind alle wichtigen Angaben für Herrn Kannapinn notiert. Legen Sie zum Termin gern bereit: die Geburtsdaten der Mitversicherten und Ihre IBAN für einen direkten Abschluss.\n\n" +
        "Zum Schluss: Die Einladung mit Kalendereintrag geht an julia@example.com. Stimmt die Adresse?",
    );
    // „Andere Adresse“ → Frage; unvollständige Adresse → noch einmal; gültige → Einladung an die neue, genau einmal
    await knopf(phone, "email:andere", "Andere Adresse");
    expect(gesendet().at(-1)!.body).toBe("Gern! An welche E-Mail-Adresse soll die Einladung gehen?");
    // Solange keine neue Adresse da ist, geht nichts an die alte (auch nicht nach 30 Min.)
    expect((await runEinladungNachholen(new Date(Date.now() + 30 * 60_000))).gesendet).toBe(0);
    await text(phone, "julia.neu@example");
    expect(gesendet().at(-1)!.body).toBe("Die Adresse scheint nicht vollständig zu sein. Schreiben Sie sie mir bitte noch einmal, z. B. name@beispiel.de.");
    await text(phone, "julia.neu@example.com");
    expect(gesendet().at(-1)!.body).toBe("Danke, die Einladung ist an julia.neu@example.com unterwegs. Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreiben Sie mir einfach hier.");
    expect(mails.map((m) => m.kind)).toEqual(["booked"]);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).einladungAn).toBe("julia.neu@example.com");
    expect(policenBitten(gesendet())).toBe(1);
    expect(st.ai).toBeGreaterThan(0);
  });

  it("Komplettcheck „Ja“, Zeit danach belegt: zwei Zeiten mit 45 Min.; Wahl verlegt denselben Termin, erst danach Einladung", async () => {
    const { appt, phone } = await gebuchtPerKnopf({ qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95" } });
    cal.langBelegt = true;
    await knopf(phone, "komplettcheck:ja", "Ja, gern");
    const angebot = gesendet().at(-1)!;
    expect(angebot.body).toMatch(/^Super! Für den Komplettcheck nimmt sich Herr Kannapinn gern etwas mehr Zeit, direkt nach Ihrem Termin ist aber schon etwas anderes geplant\. Passt Ihnen auch .+ oder .+\? Sonst bleibt es bei Ihrer Zeit\.$/);
    expect(angebot.buttons!.map((b) => b.id.split(":")[0])).toEqual(["lang", "lang", "lang"]);
    expect(angebot.buttons![2]).toEqual({ id: "lang:behalten", title: "Zeit behalten" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).verlaengerung).toBe("angebot");
    // Ohne Antwort geht die Einladung nach 30 Min. trotzdem (aktueller Stand)
    cal.langBelegt = false;
    const wahl = angebot.buttons![1].id.slice(5);
    await knopf(phone, angebot.buttons![1].id, angebot.buttons![1].title);
    const t = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(t.id).toBe(appt.id);
    expect(t.startsAt.toISOString()).toBe(wahl);
    expect(t.endsAt!.getTime() - t.startsAt.getTime()).toBe(45 * 60_000);
    expect(t.verlaengerung).toBe("verlaengert");
    expect(cal.verlegt).toContainEqual(["ev1", wahl]);
    expect(gesendet().at(-1)!.body).toMatch(/^Super, Ihr Termin ist jetzt am \*.+\*\. Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Sind Sie im öffentlichen Dienst tätig\?$/);
    expect(mails).toHaveLength(0);
  });

  it("Komplettcheck „Ja“, Zeit belegt, „Zeit behalten“: Hinweis an den Vermittler, weiter mit der Angebotsfrage", async () => {
    const { appt, phone } = await gebuchtPerKnopf({ qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95" } });
    cal.langBelegt = true;
    await knopf(phone, "komplettcheck:ja", "Ja, gern");
    await knopf(phone, "lang:behalten", "Zeit behalten");
    const t = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(t.verlaengerung).toBe("hinweis");
    expect(t.startsAt.getTime()).toBe(appt.startsAt.getTime());
    expect(gesendet().at(-1)!.body).toMatch(/^Alles klar, es bleibt bei \*.+\*\. Herr Kannapinn plant etwas mehr Zeit ein\. Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: /);
  });

  it("E-Mail unbekannt und Policen-Bitte aus (Schalter): sofort gebucht, Schluss fragt freiwillig nach der Adresse", async () => {
    policenModul.an = false;
    const { lead, conv, phone } = await gebuchtPerKnopf({ email: null, qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95", beruf: "Angestellt" } });
    expect(st.ai).toBe(0);
    const [buchung, komplett] = gesendet();
    expect(buchung.body).toMatch(/^Ihr Videotermin ist gebucht: /);
    expect(komplett.buttons?.map((b) => b.id)).toEqual(["komplettcheck:ja", "komplettcheck:nein"]);
    await knopf(phone, "komplettcheck:nein", "Nein, danke");
    const schluss = gesendet().at(-1)!;
    expect(schluss.body).toBe(
      "Alles klar, damit ist alles Wichtige für Herrn Kannapinn notiert. Legen Sie zum Termin gern bereit: die Geburtsdaten der Mitversicherten und Ihre IBAN für einen direkten Abschluss.\n\n" +
        "Zum Schluss: Möchten Sie die Einladung mit Kalendereintrag per E-Mail? Dann schreiben Sie mir einfach Ihre Adresse.",
    );
    expect(schluss.buttons).toBeNull();
    expect(policenBitten(gesendet())).toBe(0);
    await text(phone, "Klar, julia.becker@example.com");
    expect(st.ai).toBe(0);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).contactEmail).toBe("julia.becker@example.com");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).email).toBe("julia.becker@example.com");
    expect(gesendet().at(-1)!.body).toBe("Danke, die Einladung ist an julia.becker@example.com unterwegs. Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreiben Sie mir einfach hier.");
    expect(mails.map((m) => m.kind)).toEqual(["booked"]);
  });

  it("neue E-Mail im Chat: bisherige bleibt als weitere E-Mail; Bestätigung frei formuliert; Löschung leert alles", async () => {
    const { lead, phone } = await leadMitChat();
    st.queue.push([{ type: "tool_use", id: "e1", name: "update_email", input: { email: "Julia.Neu@Example.com" } }], [{ type: "text", text: "Danke, ist übernommen." }]);
    await text(phone, "Bitte an julia.neu@example.com");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { email: true, weitereEmails: true } });
    expect(l).toEqual({ email: "julia.neu@example.com", weitereEmails: ["julia@example.com"] });
    st.queue.push([{ type: "tool_use", id: "e2", name: "update_email", input: { email: "JULIA@example.com" } }], [{ type: "text", text: "Gern." }]);
    await text(phone, "Doch lieber die alte Adresse julia@example.com");
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { email: true, weitereEmails: true } })).toEqual({ email: "julia@example.com", weitereEmails: ["julia.neu@example.com"] });
    // Mit Termin: „passt so“ frei formuliert → termin_zugesagt → die App bestätigt und lädt ein
    const conv = await prisma.conversation.findFirstOrThrow({ where: { leadId: lead.id } });
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, startsAt: new Date(Date.now() + 3 * 24 * HOUR), mode: "video", status: "booked", conversationId: conv.id, komplettcheck: false, einladungAusstehend: new Date() } });
    st.queue.push([{ type: "tool_use", id: "z1", name: "termin_zugesagt", input: {} }], [{ type: "text", text: "(ignoriert)" }]);
    await text(phone, "Ja das passt so, danke");
    const t = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(t.confirmedAt).not.toBeNull();
    expect(gesendet().at(-1)!.body).toBe("Super, die Einladung ist unterwegs. Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreiben Sie mir einfach hier.");
    expect(mails.map((m) => m.kind)).toEqual(["booked"]);
    const { eraseLead } = await import("@/lib/erasure");
    await eraseLead(lead.id);
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { email: true, weitereEmails: true } })).toEqual({ email: null, weitereEmails: [] });
  });

  it("Zeit-Knopf, Zeit inzwischen belegt: nicht gebucht, der Assistent bekommt den Hinweis", async () => {
    const { lead, phone } = await leadMitChat();
    const start = slotsAb(cal.base)[0].start;
    cal.busy.add(start);
    st.queue.push([{ type: "text", text: "Entschuldigung, die Zeit ist gerade weg." }]);
    await knopf(phone, `slot:${start}`, "Heute 16 Uhr");
    expect(await prisma.appointment.count({ where: { leadId: lead.id } })).toBe(0);
    expect(st.ai).toBe(1);
  });

  describe("Einladung ohne Antwort (Rückfall) und Änderungen nach dem Versand", () => {
    async function ausstehend(o: { startIn: number; gebuchtVor: number; antwortVor?: number; email?: string | null }) {
      const now = new Date();
      // Chatverlauf 20 Min. früher (letzte Nachricht 40 Min. her), damit er die Wartezeit nicht bestimmt
      const { lead, conv } = await leadMitChat({ email: o.email === undefined ? "julia@example.com" : o.email, now: new Date(now.getTime() - 20 * 60_000) });
      await prisma.conversation.update({ where: { id: conv.id }, data: { contactEmail: o.email === undefined ? "julia@example.com" : o.email } });
      if (o.antwortVor != null) await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Ok", createdAt: new Date(now.getTime() - o.antwortVor) } });
      const appt = await prisma.appointment.create({
        data: { customerId, leadId: lead.id, conversationId: conv.id, startsAt: new Date(now.getTime() + o.startIn), mode: "video", status: "booked", calendarEventId: "ev1", einladungAusstehend: new Date(now.getTime() - o.gebuchtVor) },
      });
      return { appt, conv, lead, now };
    }
    const MIN = 60_000;

    it("Regel der Mail-Strecke (einladungFaellig): 15 Min. ohne Antwort, kurzfristig (unter 3 Std.) 5 Min., spätestens 60 Min. vor Beginn", () => {
      const now = new Date("2026-11-20T10:00:00Z");
      const f = (startIn: number, gebuchtVor: number, antwortVor: number | null = null) =>
        einladungFaellig({ startsAt: new Date(now.getTime() + startIn), gebuchtAt: new Date(now.getTime() - gebuchtVor), letzteAntwort: antwortVor == null ? null : new Date(now.getTime() - antwortVor), now });
      expect(f(2 * 24 * HOUR, 14 * MIN)).toBe(false);
      expect(f(2 * 24 * HOUR, 15 * MIN)).toBe(true);
      expect(f(2 * 24 * HOUR, 30 * MIN, 10 * MIN)).toBe(false); // Lead schreibt noch
      expect(f(2 * HOUR, 4 * MIN)).toBe(false);
      expect(f(2 * HOUR, 5 * MIN)).toBe(true);
      expect(f(59 * MIN, 1 * MIN, 0)).toBe(true);
    });

    it("30 Min. ohne Antwort (WhatsApp, einladung-rueckfall.ts): Einladung an die bekannte Adresse, genau einmal", async () => {
      const a = await ausstehend({ startIn: 2 * 24 * HOUR, gebuchtVor: 29 * MIN, antwortVor: 35 * MIN });
      expect((await runEinladungNachholen(a.now)).gesendet).toBe(0);
      const b = await ausstehend({ startIn: 2 * 24 * HOUR, gebuchtVor: 31 * MIN, antwortVor: 35 * MIN });
      await runEinladungNachholen(b.now);
      expect(mails.filter((m) => m.id === b.appt.id).map((m) => m.kind)).toEqual(["booked"]);
      expect(mails.some((m) => m.id === a.appt.id)).toBe(false);
      await runEinladungNachholen(new Date(b.now.getTime() + HOUR));
      expect(mails.filter((m) => m.id === b.appt.id)).toHaveLength(1);
      expect(await einladungSenden(b.appt.id)).toBe("schon");
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: b.appt.id } })).einladungAusstehend).toBeNull();
    });

    it("kurzfristig 5 Min., 60-Min.-Grenze auch bei laufendem Chat, ohne Adresse nichts", async () => {
      const k = await ausstehend({ startIn: 2 * HOUR, gebuchtVor: 6 * MIN, antwortVor: 7 * MIN });
      const g = await ausstehend({ startIn: 55 * MIN, gebuchtVor: 2 * MIN, antwortVor: 0 });
      const o = await ausstehend({ startIn: 55 * MIN, gebuchtVor: 30 * MIN, email: null });
      await runEinladungNachholen(new Date());
      expect(mails.filter((m) => m.id === k.appt.id)).toHaveLength(1);
      expect(mails.filter((m) => m.id === g.appt.id)).toHaveLength(1);
      expect(mails.filter((m) => m.id === o.appt.id)).toHaveLength(0);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: o.appt.id } })).einladungAt).toBeNull();
    });

    it("Änderung nach dem Versand: neue Adresse bzw. 45 Min. als EINE Aktualisierung (gleiche UID, SEQUENCE + 1)", async () => {
      const a = await ausstehend({ startIn: 3 * 24 * HOUR, gebuchtVor: 40 * MIN });
      await runEinladungNachholen(a.now);
      expect(mails.map((m) => m.kind)).toEqual(["booked"]);
      // Neue Adresse: Einladung an die neue (Aktualisierung), die alte bekommt nichts mehr
      await emailUebernehmen(a.conv.id, "julia.neu@example.com");
      let t = await prisma.appointment.findUniqueOrThrow({ where: { id: a.appt.id } });
      expect(t.einladungSeq).toBe(1);
      expect(t.einladungAn).toBe("julia.neu@example.com");
      expect(mails.map((m) => [m.kind, m.an])).toEqual([
        ["booked", "julia@example.com"],
        ["booked", "julia.neu@example.com"],
      ]);
      // Dieselbe Adresse noch einmal: nichts
      await emailUebernehmen(a.conv.id, "julia.neu@example.com");
      expect(mails).toHaveLength(2);
      // Komplettcheck „Ja“ danach: Kalender frei → EINE Aktualisierung (aktualisierter Kalendereintrag, ohne Dauer)
      await komplettcheckVerlaengern(a.appt.id, { angebot: true });
      t = await prisma.appointment.findUniqueOrThrow({ where: { id: a.appt.id } });
      expect(t.einladungSeq).toBe(2);
      expect(mails.at(-1)?.kind).toBe("updated");
      // Kalenderdatei: gleiche UID, SEQUENCE wie am Termin
      const { customerEventById, buildIcs } = await import("@/lib/calendar/add-to-calendar");
      const ics = buildIcs((await customerEventById(a.appt.id))!);
      expect(ics).toContain(`UID:${a.appt.id}@termin`);
      expect(ics).toContain("SEQUENCE:2");
    });

    it("Komplettcheck vor dem Versand: keine eigene Mail, die spätere Einladung hat schon 45 Min.", async () => {
      const a = await ausstehend({ startIn: 3 * 24 * HOUR, gebuchtVor: 1 * MIN });
      expect(await komplettcheckVerlaengern(a.appt.id, { angebot: true })).toBe("verlaengert");
      expect(mails).toHaveLength(0);
      await runEinladungNachholen(new Date(a.now.getTime() + 35 * MIN));
      expect(mails).toHaveLength(1);
      expect(new Date(mails[0].ende).getTime() - a.appt.startsAt.getTime()).toBe(45 * MIN);
    });
  });

  // TKV Katze (Live-Test 18.11.2026: die Gesundheitsfrage kam nach der Buchung nie, es ging direkt zum Komplettcheck):
  // feste Tierfragen nach der Buchung, eine pro Nachricht, nur was fehlt, ohne Assistent; danach der Komplettcheck
  describe("Tierkrankenversicherung: Tierfragen nach der Buchung", () => {
    const katze = (ohne: RegExp | null = null) => testLeadAnswers("TKV-Katze").filter((f) => !ohne || !ohne.test(f.label));
    const tierLead = (o: { formData?: { label: string; value: string }[]; qualificationData?: Record<string, string> } = {}) =>
      leadMitChat({ source: "TKV-Katze", formData: o.formData ?? katze(/rasse/i), qualificationData: o.qualificationData ?? { tier: "Minka, 4 Jahre", tarifwunsch: "nur OP-Schutz" } });
    const angaben = async (convId: string) => (await prisma.conversation.findUniqueOrThrow({ where: { id: convId }, select: { qualificationData: true } })).qualificationData as Record<string, string>;

    it("gebucht → Gesundheit mit Knöpfen → „War in Behandlung“ → Freitext gespeichert → fehlende Rasse → Tierversicherung → Geburtsdatum → Komplettcheck", async () => {
      const x = await tierLead();
      const start = slotsAb(cal.base)[0].start;
      st.ai = 0;
      await knopf(x.phone, `slot:${start}`, "Heute 16 Uhr");
      const [buchung, gesund] = gesendet();
      expect(buchung.body).toMatch(/^Ihr Videotermin ist gebucht:/);
      expect(gesund.body).toBe("Ist Minka aktuell gesund?");
      expect(gesund.buttons).toEqual([
        { id: "tier:gesundheit:gesund", title: "Ja, gesund" },
        { id: "tier:gesundheit:behandlung", title: "War in Behandlung" },
      ]);
      expect(gesendet().some((s) => KOMPLETTCHECK_RE.test(s.body))).toBe(false);

      await knopf(x.phone, "tier:gesundheit:behandlung", "War in Behandlung");
      expect(gesendet().at(-1)!.body).toBe("Danke! Was war es ungefähr, und wann? Ein Stichwort reicht, z. B. Zahnbehandlung im Frühjahr. Herr Kannapinn bespricht das im Termin mit Ihnen.");
      expect(gesendet().at(-1)!.buttons).toBeNull();

      await text(x.phone, "Zahnsteinentfernung im Mai");
      expect((await angaben(x.conv.id)).tiergesundheit).toBe("War in Behandlung: Zahnsteinentfernung im Mai");
      const rasse = gesendet().at(-1)!;
      expect(rasse.body).toBe("Danke! Welche Rasse hat Minka?");
      expect(rasse.buttons).toEqual([{ id: "tier:rasse:mischling", title: "Hauskatze/Mischling" }]);

      await knopf(x.phone, "tier:rasse:mischling", "Hauskatze/Mischling");
      expect((await angaben(x.conv.id)).tier).toBe("Minka, 4 Jahre; Rasse: Hauskatze/Mischling");
      expect(gesendet().at(-1)!.body).toBe("Danke! Hat Minka schon eine Tierversicherung?");
      await text(x.phone, "nein");
      expect(gesendet().at(-1)!.body).toBe("Danke! Für das Angebot braucht Herr Kannapinn noch Ihr eigenes Geburtsdatum als Versicherungsnehmer. Wie lautet es?");
      // Live-Test 19.11.2026: das Geburtsdatum der Katze kam als Antwort → beim Tier notiert, einmal nach dem eigenen gefragt
      await text(x.phone, "23.09.2025");
      expect((await angaben(x.conv.id)).geburt).toBeUndefined();
      expect((await angaben(x.conv.id)).tier).toBe("Minka, 4 Jahre; Rasse: Hauskatze/Mischling; Datum aus dem Chat: 23.09.2025");
      expect(gesendet().at(-1)!.body).toBe(
        "Danke, das ist sicher das Geburtsdatum von Minka, das habe ich notiert. Für den Vertrag braucht Herr Kannapinn noch Ihr eigenes Geburtsdatum.",
      );
      await text(x.phone, "14.05.1985");
      const komplett = gesendet().at(-1)!;
      expect(komplett.body).toMatch(/^Danke! (Soll Herr Kannapinn im Termin auch kurz schauen, ob Sie insgesamt gut abgesichert sind|Soll Herr Kannapinn im Termin auch kurz \*?über Ihre anderen Versicherungen)/);
      expect(komplett.buttons?.map((b) => b.id)).toEqual(["komplettcheck:ja", "komplettcheck:nein"]);
      // Geschlecht, Geburtsjahr, Haltung, Schutzwunsch (Formular bzw. Erstanschreiben) und Kastration nie gefragt
      expect(gesendet().some((s) => /männlich|geboren|Wohnungskatze|Operation|kastriert/i.test(s.body))).toBe(false);
      expect(st.ai).toBe(0);
      const g = await angaben(x.conv.id);
      expect(g).toMatchObject({ tiergesundheit: "War in Behandlung: Zahnsteinentfernung im Mai", vorhanden: "keine Tierversicherung", geburt: "14.05.1985", tarifwunsch: "nur OP-Schutz" });

      // Terminvorbereitung: Gesundheit gut sichtbar
      const { kundeWill } = await import("@/lib/terminvorbereitung-neu");
      const { abschnitte } = await import("@/lib/termin-vorbereitung");
      const d = { lead: { produkt: "TKV-Katze", adresse: null }, formular: katze(/rasse/i), angaben: g, zusammenfassung: null } as unknown as Parameters<typeof abschnitte>[0];
      expect(kundeWill(d).punkte).toContain("Gesundheit des Tieres: War in Behandlung: Zahnsteinentfernung im Mai");
      expect(abschnitte(d)[0].felder[0]).toEqual({ label: "Gesundheit des Tieres", wert: "War in Behandlung: Zahnsteinentfernung im Mai" });
      expect(abschnitte(d)[0].felder.find((f) => f.label === "Rasse")?.wert).toBe("Hauskatze/Mischling");

      // Komplettcheck „Nein“: keine Angebotsfragen der Rechner-Tabelle mehr, weiter zur Policen-Bitte bzw. zum Schluss
      await knopf(x.phone, "komplettcheck:nein", "Nein, danke");
      const an = gesendet().filter((s) => s.to === x.phone).map(art);
      expect(an).not.toContain("angebotsfrage");
      expect(an.slice(0, 2)).toEqual(["buchung", "sonst"]);
      expect(an).toContain("komplettcheck");
      // Ohne Komplettcheck keine Policen-Bitte zu Haftpflicht, Hausrat, Kfz, gleich der Schluss
      expect(an).not.toContain("policen");
      expect(an.at(-1)).toBe("schluss");
    });

    it("„Ja, gesund“ per Text, Rückfrage dazwischen: Assistent antwortet, die Frage kommt noch einmal; alles da → direkt Komplettcheck", async () => {
      const x = await tierLead({ formData: katze(), qualificationData: { tier: "Minka, 4 Jahre", tarifwunsch: "nur OP-Schutz", vorhanden: "keine", geburt: "01.01.1990" } });
      await knopf(x.phone, `slot:${slotsAb(cal.base)[0].start}`, "Heute 16 Uhr");
      expect(gesendet().at(-1)!.body).toBe("Ist Minka aktuell gesund?");
      // Rückfrage: der Assistent antwortet, danach dieselbe Frage mit Knöpfen
      st.queue.push([{ type: "text", text: "Das klärt Herr Kannapinn gern im Termin." }]);
      await text(x.phone, "Was kostet das ungefähr?");
      const [antwort, nochmal] = gesendet().slice(-2);
      expect(antwort.body).toMatch(/Das klärt Herr Kannapinn gern im Termin/);
      expect(nochmal.body).toBe("Ist Minka aktuell gesund?");
      expect(nochmal.buttons?.[0].id).toBe("tier:gesundheit:gesund");
      st.ai = 0;
      await text(x.phone, "Ja, sie ist kerngesund");
      expect((await angaben(x.conv.id)).tiergesundheit).toBe("gesund");
      expect(gesendet().at(-1)!.body).toMatch(/^Danke! (Soll Herr Kannapinn im Termin auch kurz schauen|Soll Herr Kannapinn im Termin auch kurz \*?über Ihre anderen Versicherungen)/);
      expect(st.ai).toBe(0);
      // Doppelter Klick auf den alten Knopf: nichts
      const n = gesendet().length;
      await knopf(x.phone, "tier:gesundheit:gesund", "Ja, gesund");
      expect(gesendet()).toHaveLength(n);
    });

    it("ohne Antwort: nach einer Stunde der Komplettcheck (übrige Tierfragen klärt der Vermittler im Termin)", async () => {
      const now = new Date("2026-11-17T11:00:00Z");
      const x = await leadMitChat({ now: new Date(now.getTime() - 3 * HOUR), source: "TKV-Katze", formData: katze(), qualificationData: { tarifwunsch: "nur OP-Schutz" } });
      const appt = await prisma.appointment.create({
        data: { customerId, leadId: x.lead.id, conversationId: x.conv.id, startsAt: new Date(Math.max(now.getTime(), Date.now()) + 2 * 24 * HOUR), mode: "video", status: "booked" },
      });
      await prisma.conversation.update({ where: { id: x.conv.id }, data: { windowExpiresAt: new Date(Math.max(now.getTime(), Date.now()) + 10 * HOUR) } });
      await prisma.message.create({ data: { conversationId: x.conv.id, direction: "internal", kind: STRECKE.tierFrage, body: JSON.stringify({ appointmentId: appt.id, key: "gesundheit" }), sentBy: "bot", createdAt: new Date(now.getTime() - 2 * HOUR) } });
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      expect(gesendet().at(-1)!.body).toMatch(/^Noch eine kurze Frage: (Soll Herr Kannapinn im Termin auch kurz schauen|Soll Herr Kannapinn im Termin auch kurz \*?über Ihre anderen Versicherungen)/);
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0);
    });
  });

  // Splittest termin_zusage (Ole, 20.11.2026): Fassung b nur für Lead-IDs, die b zugeteilt werden; der Test läuft hier
  // (in den übrigen Tests dieser Datei angehalten, ohneSplittest)
  describe("Splittest termin_zusage, Fassung b: Bestätigung mit Zusage-Frage", () => {
    const idFuer = (v: "a" | "b") => {
      for (;;) {
        const id = `zusage${uid()}${uid()}`;
        if (zuteilen("termin_zusage", id) === v) return id;
      }
    };
    const ZUSAGE_KNOEPFE = [
      { id: "zusage:ja", title: "Ja, sicher" },
      { id: "zusage:andere", title: "Lieber andere Zeit" },
    ];
    const KOMPLETT_OHNE_DANKE =
      "(Soll Herr Kannapinn im Termin auch kurz schauen, ob Sie und Ihre Familie insgesamt gut abgesichert sind|Soll Herr Kannapinn im Termin auch kurz \\*über die anderen Versicherungen von Ihnen und Ihrer Familie)";
    beforeAll(async () => {
      await prisma.experiment.update({ where: { key: "termin_zusage" }, data: { aktiv: true } });
      experimenteCacheLeeren();
    });
    afterAll(async () => {
      await prisma.experiment.update({ where: { key: "termin_zusage" }, data: { aktiv: false } });
      experimenteCacheLeeren();
    });
    const ereignisse = async (leadId: string) =>
      (await prisma.experimentEreignis.findMany({ where: { experiment: "termin_zusage", einheit: leadId }, select: { ziel: true } })).map((e) => e.ziel);
    const zuteilung = (leadId: string) => prisma.experimentZuteilung.findUnique({ where: { experiment_einheit: { experiment: "termin_zusage", einheit: leadId } } });

    it("Fassung a unverändert: Bestätigung ohne Frage, Komplettcheck sofort", async () => {
      const x = await leadMitChat({ id: idFuer("a") });
      await knopf(x.phone, `slot:${slotsAb(cal.base)[0].start}`, "Heute 16 Uhr");
      expect(gesendet().map(art)).toEqual(["buchung", "komplettcheck"]);
      expect(gesendet()[0].body).not.toMatch(/fest mit Ihnen rechnen/);
      expect(await zuteilung(x.lead.id)).toMatchObject({ variante: "a" });
    });

    it("Bestätigung mit Frage als eine Nachricht; „Ja, sicher“ → zugesagt, Komplettcheck mit „Super, danke!“", async () => {
      const x = await leadMitChat({ id: idFuer("b") });
      st.ai = 0;
      await knopf(x.phone, `slot:${slotsAb(cal.base)[0].start}`, "Heute 16 Uhr");
      const [best, ...rest] = gesendet();
      expect(rest).toHaveLength(0);
      expect(best.body).toMatch(
        /^Ihr Videotermin ist gebucht: \*.+\*\. Herr Kannapinn hält sich die Zeit nur für Sie frei und bereitet Ihre Beiträge vor\.\nIhr Link: https:\/\/meet\.google\.com\/abc-defg-hij\n\n\*Kann Herr Kannapinn fest mit Ihnen rechnen\?\*$/,
      );
      expect(best.body.split("\n")).toHaveLength(4);
      expect(best.buttons).toEqual(ZUSAGE_KNOEPFE);
      expect(await zuteilung(x.lead.id)).toMatchObject({ variante: "b" });
      const appt = await prisma.appointment.findFirstOrThrow({ where: { leadId: x.lead.id, status: "booked" } });
      expect(await prisma.message.count({ where: { conversationId: x.conv.id, kind: STRECKE.zusageFrage, body: { contains: appt.id } } })).toBe(1);
      expect(appt.confirmedAt).toBeNull();

      await knopf(x.phone, "zusage:ja", "Ja, sicher");
      expect(st.ai).toBe(0);
      const neu = gesendet().slice(1);
      expect(neu).toHaveLength(1);
      expect(neu[0].body).toMatch(new RegExp(`^Super, danke! ${KOMPLETT_OHNE_DANKE}`));
      expect(neu[0].body).not.toMatch(/Danke! (Soll|Oft)/);
      expect(neu[0].buttons?.map((b) => b.id)).toEqual(["komplettcheck:ja", "komplettcheck:nein"]);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).confirmedAt).not.toBeNull();
      const z = await prisma.message.findFirstOrThrow({ where: { conversationId: x.conv.id, kind: "appointment_confirmed" } });
      expect(JSON.parse(z.body!)).toMatchObject({ appointmentId: appt.id, via: "zusage_knopf" });
      expect(await ereignisse(x.lead.id)).toEqual(["zusage_ja"]);
      // doppelter Klick: nichts
      await knopf(x.phone, "zusage:ja", "Ja, sicher");
      expect(gesendet()).toHaveLength(2);
      // die Strecke läuft wie bisher weiter
      await knopf(x.phone, "komplettcheck:nein", "Nein, danke");
      expect(gesendet().length).toBeGreaterThan(2);
    });

    it("getipptes „Passt!“ zählt als Zusage (ohne Assistent)", async () => {
      const x = await leadMitChat({ id: idFuer("b") });
      await knopf(x.phone, `slot:${slotsAb(cal.base)[0].start}`, "Heute 16 Uhr");
      st.ai = 0;
      await text(x.phone, "Passt!");
      expect(st.ai).toBe(0);
      expect(gesendet().at(-1)!.body).toMatch(new RegExp(`^Super, danke! ${KOMPLETT_OHNE_DANKE}`));
      expect(await ereignisse(x.lead.id)).toEqual(["zusage_ja"]);
    });

    it("„Lieber andere Zeit“ → Assistent bietet Zeiten an (noch kein Komplettcheck) und verlegt; danach Komplettcheck wie bisher, Zusage-Frage nicht erneut", async () => {
      const x = await leadMitChat({ id: idFuer("b") });
      await knopf(x.phone, `slot:${slotsAb(cal.base)[0].start}`, "Heute 16 Uhr");
      const alt = await prisma.appointment.findFirstOrThrow({ where: { leadId: x.lead.id, status: "booked" } });
      const neueZeit = slotsAb(cal.base)[2].start;
      st.reqs = [];
      st.queue.push([{ type: "tool_use", id: "g1", name: "get_available_slots", input: {} }], [{ type: "text", text: "Gern! Passt Ihnen morgen um 10 Uhr oder morgen um 11 Uhr?" }]);
      await knopf(x.phone, "zusage:andere", "Lieber andere Zeit");
      expect(gesendet().slice(1).map((s) => s.body)).toEqual(["Gern! Passt Ihnen morgen um 10 Uhr oder morgen um 11 Uhr?"]);
      expect(st.reqs.some((r) => JSON.stringify(r).includes("„Lieber andere Zeit“"))).toBe(true);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: alt.id } })).rescheduleRequestedAt).not.toBeNull();
      expect(await ereignisse(x.lead.id)).toEqual(["zusage_andere"]);

      st.queue.push([{ type: "tool_use", id: "r1", name: "reschedule_appointment", input: { start: neueZeit } }], [{ type: "text", text: "Erledigt, Ihr Termin ist verschoben." }]);
      await text(x.phone, "Die erste bitte");
      const danach = gesendet().slice(2);
      expect(danach.map(art)).toEqual(["sonst", "komplettcheck"]);
      expect(danach[1].body).toMatch(/^Danke! /);
      const neu = await prisma.appointment.findFirstOrThrow({ where: { leadId: x.lead.id, status: "booked" } });
      expect(neu.startsAt.toISOString()).toBe(neueZeit);
      expect(await prisma.message.count({ where: { conversationId: x.conv.id, kind: STRECKE.komplettFrage, body: { contains: neu.id } } })).toBe(1);
      expect(gesendet().filter((s) => /fest mit Ihnen rechnen/.test(s.body))).toHaveLength(1);
    });

    it("Tierkrankenversicherung: „Ja, sicher“ → erste Tierfrage mit „Super, danke!“", async () => {
      const x = await leadMitChat({
        id: idFuer("b"),
        source: "TKV-Katze",
        formData: testLeadAnswers("TKV-Katze").filter((f) => !/rasse/i.test(f.label)),
        qualificationData: { tier: "Minka, 4 Jahre", tarifwunsch: "nur OP-Schutz" },
      });
      await knopf(x.phone, `slot:${slotsAb(cal.base)[0].start}`, "Heute 16 Uhr");
      expect(gesendet()).toHaveLength(1);
      expect(gesendet()[0].body).toMatch(/\n\n\*Kann Herr Kannapinn fest mit Ihnen rechnen\?\*$/);
      await knopf(x.phone, "zusage:ja", "Ja, sicher");
      expect(gesendet().at(-1)!.body).toBe("Super, danke! Ist Minka aktuell gesund?");
      expect(gesendet().at(-1)!.buttons?.[0].id).toBe("tier:gesundheit:gesund");
    });

    it("ohne Tipp: nach 1 Std. (Mo bis Sa 8 bis 20 Uhr) Komplettcheck mit „Noch eine kurze Frage:“; eine Rückfrage des Leads verschiebt die Stunde", async () => {
      const now = new Date("2026-11-17T11:00:00Z"); // Di 12 Uhr
      const x = await leadMitChat({ id: idFuer("b"), now: new Date(now.getTime() - 3 * HOUR) });
      const appt = await prisma.appointment.create({
        data: { customerId, leadId: x.lead.id, conversationId: x.conv.id, startsAt: new Date(Math.max(now.getTime(), Date.now()) + 2 * 24 * HOUR), mode: "video", status: "booked" },
      });
      await prisma.conversation.update({ where: { id: x.conv.id }, data: { windowExpiresAt: new Date(Math.max(now.getTime(), Date.now()) + 10 * HOUR) } });
      await prisma.message.create({
        data: { conversationId: x.conv.id, direction: "internal", kind: STRECKE.zusageFrage, body: JSON.stringify({ appointmentId: appt.id }), sentBy: "bot", createdAt: new Date(now.getTime() - 30 * 60_000) },
      });
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0); // erst 30 Min.
      await prisma.message.updateMany({ where: { conversationId: x.conv.id, kind: STRECKE.zusageFrage }, data: { createdAt: new Date(now.getTime() - 2 * HOUR) } });
      expect((await runStreckeAbschliessen(new Date("2026-11-17T19:30:00Z"))).gesendet).toBe(0); // 20:30 Uhr: wartet
      // Rückfrage des Leads vor 30 Min. (der Assistent hat geantwortet): die Stunde zählt ab da
      const frage = await prisma.message.create({ data: { conversationId: x.conv.id, direction: "inbound", body: "Wie lange dauert das?", createdAt: new Date(now.getTime() - 30 * 60_000) } });
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0);
      await prisma.message.update({ where: { id: frage.id }, data: { createdAt: new Date(now.getTime() - 90 * 60_000) } });
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      const k = gesendet().at(-1)!;
      expect(k.body).toMatch(new RegExp(`^Noch eine kurze Frage: ${KOMPLETT_OHNE_DANKE}`));
      expect(k.buttons?.map((b) => b.id)).toEqual(["komplettcheck:ja", "komplettcheck:nein"]);
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).confirmedAt).toBeNull();
    });
  });

  describe("Rückfall ohne Antwort (nach einer Stunde der nächste Schritt, nie Schluss bei offenen Angebotsfragen)", () => {
    // Di 17.11.2026, 12 Uhr deutscher Zeit; die letzte Nachricht des Leads liegt davor
    const now = new Date("2026-11-17T11:00:00Z");
    async function terminMitMerker(kind: string, o: { qualificationData?: Record<string, string>; komplettcheck?: boolean; email?: string | null } = {}) {
      const { conv, lead, phone } = await leadMitChat({ now: new Date(now.getTime() - 3 * HOUR), qualificationData: o.qualificationData, email: o.email });
      const appt = await prisma.appointment.create({
        data: { customerId, leadId: lead.id, conversationId: conv.id, startsAt: new Date(Math.max(now.getTime(), Date.now()) + 2 * 24 * HOUR), mode: "video", status: "booked", komplettcheck: o.komplettcheck ?? null },
      });
      await prisma.conversation.update({ where: { id: conv.id }, data: { windowExpiresAt: new Date(Math.max(now.getTime(), Date.now()) + 10 * HOUR) } });
      if (o.komplettcheck != null) {
        await prisma.message.create({ data: { conversationId: conv.id, direction: "internal", kind: STRECKE.komplettFrage, body: JSON.stringify({ appointmentId: appt.id }), sentBy: "bot", createdAt: new Date(now.getTime() - 3 * HOUR) } });
        await prisma.message.create({ data: { conversationId: conv.id, direction: "internal", kind: STRECKE.komplett, body: JSON.stringify({ appointmentId: appt.id, ja: o.komplettcheck }), sentBy: "bot", createdAt: new Date(now.getTime() - 3 * HOUR) } });
      }
      await prisma.message.create({ data: { conversationId: conv.id, direction: "internal", kind, body: JSON.stringify({ appointmentId: appt.id }), sentBy: "bot", createdAt: new Date(now.getTime() - 30 * 60_000) } });
      const alt = async () => prisma.message.updateMany({ where: { conversationId: conv.id, kind }, data: { createdAt: new Date(now.getTime() - 2 * HOUR) } });
      return { conv, lead, phone, appt, alt };
    }
    const an = (phone: string) => gesendet().filter((s) => s.to === phone);
    const ALLES = { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95", beruf: "Angestellt" };

    it("Komplettcheck ohne Antwort, Angebotsfragen offen: erste Angebotsfrage, kein Schluss", async () => {
      const t = await terminMitMerker(STRECKE.komplettFrage, { qualificationData: { versichern: "Familie", vorhanden: "neu" } });
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0); // erst 30 Minuten
      await t.alt();
      expect((await runStreckeAbschliessen(new Date("2026-11-17T20:00:00Z"))).gesendet).toBe(0); // 21 Uhr: nicht
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      expect(an(t.phone).at(-1)!.body).toBe("Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Wie lautet Ihr Geburtsdatum?");
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0);
      expect(an(t.phone).some((s) => /Zum Schluss:/.test(s.body))).toBe(false);
    });

    it("Pfad keine Antwort komplett: Policen-Bitte genau einmal (mit Einwilligung), dann nach 1 Std. der Schluss", async () => {
      const t = await terminMitMerker(STRECKE.komplettFrage, { qualificationData: ALLES });
      await t.alt();
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      expect(an(t.phone).at(-2)!.body).toMatch(/^Damit Herr Kannapinn Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab Fotos oder PDFs Ihrer aktuellen Policen/);
      expect(an(t.phone).at(-1)!.buttons?.map((b) => b.id)).toEqual(["policen:ja", "policen:nein"]);
      await prisma.message.updateMany({ where: { conversationId: t.conv.id, kind: STRECKE.policenBitte }, data: { createdAt: new Date(now.getTime() - 2 * HOUR) } });
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      const schluss = an(t.phone).at(-1)!;
      expect(schluss.body).toMatch(/^Damit ist alles Wichtige für Herrn Kannapinn notiert\. Legen Sie zum Termin gern bereit: [\s\S]*Zum Schluss: Die Einladung mit Kalendereintrag geht an julia@example\.com\. Stimmt die Adresse\?$/);
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0);
      expect(policenBitten(an(t.phone))).toBe(1);
    });

    it("Vertragsfrage ohne Antwort (Ja): die Verträge entfallen, die volle Policen-Bitte nicht", async () => {
      const t = await terminMitMerker(STRECKE.vertragsfrage, { komplettcheck: true, qualificationData: ALLES });
      await t.alt();
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      expect(an(t.phone).at(-2)!.body).toMatch(/^Damit Herr Kannapinn Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab Fotos oder PDFs Ihrer aktuellen Policen/);
      expect(policenBitten(an(t.phone))).toBe(1);
    });

    it("Vertragsfrage ohne Antwort, Angebotsfragen offen: nichts", async () => {
      const t = await terminMitMerker(STRECKE.vertragsfrage, { komplettcheck: true, qualificationData: { versichern: "Familie", vorhanden: "neu" } });
      await t.alt();
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0);
      expect(an(t.phone)).toHaveLength(0);
    });
  });

  describe("Policen-Erinnerungen (höchstens 2, Opt-in, Stopp)", () => {
    async function gebeten(o: { startIn: number; gebuchtVor: number; optIn?: boolean; komplettcheck?: boolean }) {
      const now = new Date();
      const { conv, lead, phone } = await leadMitChat({});
      await prisma.conversation.update({ where: { id: conv.id }, data: { windowExpiresAt: new Date(now.getTime() + 2 * HOUR) } });
      const appt = await prisma.appointment.create({
        data: { customerId, leadId: lead.id, conversationId: conv.id, startsAt: new Date(now.getTime() + o.startIn), mode: "video", status: "booked", komplettcheck: o.komplettcheck ?? true, createdAt: new Date(now.getTime() - o.gebuchtVor) },
      });
      await prisma.message.create({ data: { conversationId: conv.id, direction: "internal", kind: STRECKE.policenBitte, body: JSON.stringify({ appointmentId: appt.id, police: null }), sentBy: "bot", createdAt: new Date(now.getTime() - o.gebuchtVor) } });
      if (o.optIn !== false) policenModul.optIn.add(lead.id);
      return { conv, lead, phone, appt, now };
    }
    // Werktag 12 Uhr deutscher Zeit (Erinnerungen nur Mo bis Sa 8 bis 20 Uhr)
    const mittag = () => {
      const d = new Date();
      d.setUTCHours(11, 0, 0, 0);
      return d;
    };
    const nur = (phone: string) => gesendet().filter((s) => s.to === phone);

    it("nie geschickt: 24 Std. nach der Buchung die Erinnerung (mit STOP), am Vortag die Zeile, danach Schluss", async () => {
      vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
      vi.setSystemTime(mittag());
      try {
        const g = await gebeten({ startIn: 3 * 24 * HOUR, gebuchtVor: 25 * HOUR });
        expect((await runPolicenErinnerung(new Date())).gesendet).toBeGreaterThanOrEqual(1);
        expect(nur(g.phone).at(-1)!.body).toBe(
          "Kurze Erinnerung: Haben Sie Ihre Policen für Haftpflicht, Hausrat oder Kfz schon zur Hand? Einfach abfotografieren und hier schicken, dann kann Herr Kannapinn alles vorbereiten.\n\nKeine Nachrichten mehr? Antworten Sie einfach STOP.",
        );
        await runPolicenErinnerung(new Date());
        expect(nur(g.phone)).toHaveLength(1);
        const satz = await policenVortagSatzFuer(g.appt, "sie");
        expect(satz).toBe("Wenn Sie mögen, schicken Sie vorab Ihre Policen hier in den Chat (ein Foto reicht), dann kann sich Ihr Berater schon vorbereiten. Geht aber auch ohne.");
        expect(vortagText({ an: "sie", hi: "Guten Tag Frau Schneider,", wann: "morgen um 10 Uhr", nutzen: "In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was es kostet.", komplettcheck: true, mode: "video", meetUrl: "https://x", person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" }, policen: satz })).toContain(
          "was es kostet. Wenn Sie mögen, schicken Sie vorab Ihre Policen hier in den Chat (ein Foto reicht)",
        );
        await merke(g.conv.id, STRECKE.policenErinnerung, { appointmentId: g.appt.id, art: "vortag" });
        expect(await policenVortagSatzFuer(g.appt, "sie")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("Termin in 2 Tagen oder weniger: keine eigene Erinnerung, nur die Zeile am Vortag", async () => {
      vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
      vi.setSystemTime(mittag());
      try {
        const g = await gebeten({ startIn: 20 * HOUR, gebuchtVor: 25 * HOUR }); // Buchung bis Termin unter 2 Tagen
        await runPolicenErinnerung(new Date());
        expect(nur(g.phone)).toHaveLength(0);
        expect(await policenVortagSatzFuer(g.appt, "sie")).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("Stopp: Police da, „habe keine“, „Lieber nicht“, Schalter aus; ohne Opt-in bleibt der Satz", async () => {
      const doc = await gebeten({ startIn: 3 * 24 * HOUR, gebuchtVor: 25 * HOUR });
      await prisma.leadDocument.create({ data: { leadId: doc.lead.id, customerId, fileName: "hausrat.pdf", mimeType: "application/pdf", size: 10 } });
      expect(await policenVortagSatzFuer(doc.appt, "sie")).toBeNull();
      const keine = await gebeten({ startIn: 3 * 24 * HOUR, gebuchtVor: 25 * HOUR });
      await prisma.message.create({ data: { conversationId: keine.conv.id, direction: "inbound", body: "Habe keine, ist alles neu" } });
      expect(await policenVortagSatzFuer(keine.appt, "sie")).toBeNull();
      const lieber = await gebeten({ startIn: 3 * 24 * HOUR, gebuchtVor: 25 * HOUR });
      await prisma.message.create({ data: { conversationId: lieber.conv.id, direction: "inbound", body: "Lieber nicht" } });
      expect(await policenVortagSatzFuer(lieber.appt, "sie")).toBeNull();
      const ohne = await gebeten({ startIn: 3 * 24 * HOUR, gebuchtVor: 25 * HOUR, optIn: false });
      // Ohne Opt-in kommt der Satz trotzdem (Vortags-Terminerinnerung, A8 a, seit 19.11.2026)
      expect(await policenVortagSatzFuer(ohne.appt, "sie")).not.toBeNull();
      const aus = await gebeten({ startIn: 3 * 24 * HOUR, gebuchtVor: 25 * HOUR });
      expect(await policenVortagSatzFuer(aus.appt, "sie")).not.toBeNull();
      policenModul.an = false;
      expect(await policenVortagSatzFuer(aus.appt, "sie")).toBeNull();
    });
  });
});

describe("Nachfassen 2 Std. nach dem Terminvorschlag", () => {
  let customerId = "";
  // Di 24.11.2026, 12 Uhr deutscher Zeit
  const NOW = new Date("2026-11-24T11:00:00Z");
  let n = 0;

  async function vorschlagOhneAntwort(o: { status?: string; botActive?: boolean; fenster?: number; antwort?: boolean } = {}) {
    const phone = `4916200${String(++n).padStart(5, "0")}`;
    const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, source: "Privatschutz", status: o.status ?? "Im Gespräch", reached: true } });
    const vorAt = new Date(NOW.getTime() - 2.5 * HOUR);
    const conv = await prisma.conversation.create({
      data: {
        customerId,
        leadId: lead.id,
        contactPhone: phone,
        botActive: o.botActive ?? true,
        windowExpiresAt: new Date(NOW.getTime() + (o.fenster ?? 10) * HOUR),
        lastMessageAt: vorAt,
        messages: {
          create: [
            { direction: "inbound", body: "Beides neu", createdAt: new Date(vorAt.getTime() - 60_000) },
            { direction: "outbound", body: "Danke! … Passt Ihnen …?", sentBy: "bot", createdAt: vorAt },
          ],
        },
      },
    });
    const starts = slotsAb(NOW.getTime()).slice(0, 3).map((s) => s.start);
    await prisma.message.create({ data: { conversationId: conv.id, direction: "internal", kind: STRECKE.vorschlag, body: JSON.stringify({ starts: [starts[0], starts[2]] }), sentBy: "bot", createdAt: new Date(vorAt.getTime() + 1000) } });
    if (o.antwort) await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Moment, ich schaue", createdAt: new Date(vorAt.getTime() + 60_000) } });
    const seq = await prisma.leadSequence.create({ data: { leadId: lead.id, customerId, kind: "silent", step: 0, startedAt: vorAt, nextAt: new Date(vorAt.getTime() + 2 * HOUR) } });
    return { lead, conv, seq, starts: [starts[0], starts[2]] };
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    customerId = (await makeCustomer({ name: `Agentur Kannapinn ${uid()}`, leadAddress: "sie" })).id;
    await prisma.erstinformation.create({ data: { customerId, token: `tok-${uid()}`, name: "Ole Kannapinn", anrede: "Herr" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, followUpSequencesEnabled: true } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: `pnid-nf-${uid()}`, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    // Uhr auf NOW stellen: der Versand prüft das 24-h-Fenster gegen die echte Uhrzeit (sendWhatsAppNotice),
    // sonst wäre das Fenster (NOW + 10 Std.) nach dem 24.11.2026 zu und der Test hinge vom Datum ab.
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    cal.base = NOW.getTime();
    cal.busy.clear();
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });
  afterEach(() => vi.useRealTimers());
  const meine = (phone: string) => gesendet().filter((s) => s.to === phone);

  it("einmal mit denselben Zeit-Knöpfen, solange frei; sonst neu berechnet", async () => {
    const { lead, seq, starts } = await vorschlagOhneAntwort();
    await runSequences(NOW);
    const s = meine(lead.phone!);
    expect(s).toHaveLength(1);
    expect(s[0].art).toBe("buttons");
    expect(s[0].body).toMatch(/^Kurze Nachfrage: Passt Ihnen .+ oder .+ für den Videotermin mit Herrn Kannapinn\?$/);
    expect(s[0].buttons!.map((b) => b.id)).toEqual([`slot:${starts[0]}`, `slot:${starts[1]}`, "andere_zeit"]);
    const after = await prisma.leadSequence.findUnique({ where: { id: seq.id } });
    expect(after?.step).toBe(1);
    // Erste Zeit inzwischen belegt: neu berechnet
    const b = await vorschlagOhneAntwort();
    cal.busy.add(b.starts[0]);
    await runSequences(NOW);
    const ids = meine(b.lead.phone!)[0].buttons!.map((x) => x.id);
    expect(ids[0]).not.toBe(`slot:${b.starts[0]}`);
    expect(ids.at(-1)).toBe("andere_zeit");
  });

  it("nur Mo bis Sa 8 bis 20 Uhr: um 20:30 und sonntags wartet der Schritt, um 8:15 geht er raus", async () => {
    const { lead } = await vorschlagOhneAntwort({ fenster: 30 });
    await runSequences(new Date("2026-11-24T19:30:00Z")); // 20:30
    await runSequences(new Date("2026-11-29T10:00:00Z")); // Sonntag
    expect(meine(lead.phone!)).toHaveLength(0);
    await runSequences(new Date("2026-11-24T07:15:00Z")); // Dienstag 8:15: Schritt noch nicht fällig
    expect(meine(lead.phone!)).toHaveLength(0);
    await runSequences(new Date("2026-11-25T07:15:00Z")); // Mittwoch 8:15, Fenster noch offen
    expect(meine(lead.phone!)).toHaveLength(1);
  });

  it("nicht außerhalb des 24-h-Fensters, nicht nach Antwort, „Kein Interesse“ oder pausiertem Assistenten", async () => {
    const zu = await vorschlagOhneAntwort({ fenster: -1 });
    const antwort = await vorschlagOhneAntwort({ antwort: true });
    const kein = await vorschlagOhneAntwort({ status: "Kein Interesse" });
    const pause = await vorschlagOhneAntwort({ botActive: false });
    await runSequences(NOW);
    for (const x of [zu, antwort, kein, pause]) expect(meine(x.lead.phone!), x.lead.status ?? "").toHaveLength(0);
    // Fenster zu: still übersprungen (keine Vorlage), weitere Schritte bleiben
    const s = await prisma.leadSequence.findUnique({ where: { id: zu.seq.id } });
    expect(s?.stoppedAt).toBeNull();
    expect(JSON.stringify(s?.log)).toContain("Termin-Nachfassen: 24h-Fenster geschlossen");
    for (const x of [antwort, kein, pause]) expect((await prisma.leadSequence.findUnique({ where: { id: x.seq.id } }))?.stoppedAt).not.toBeNull();
    expect((await prisma.leadSequence.findUnique({ where: { id: antwort.seq.id } }))?.stopReason).toBe("Lead hat geantwortet");
    expect((await prisma.leadSequence.findUnique({ where: { id: pause.seq.id } }))?.stopReason).toBe("Assistent pausiert");
  });

  it("nach Buchung kein Nachfassen", async () => {
    const { lead, conv, seq } = await vorschlagOhneAntwort();
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, conversationId: conv.id, startsAt: new Date(NOW.getTime() + 24 * HOUR), mode: "video", status: "booked" } });
    await runSequences(NOW);
    expect(meine(lead.phone!)).toHaveLength(0);
    expect((await prisma.leadSequence.findUnique({ where: { id: seq.id } }))?.stopReason).toBe("Termin gebucht");
  });
});
