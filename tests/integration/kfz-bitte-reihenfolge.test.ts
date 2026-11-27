// Kfz-Lead, Fall Lohmann (Ole, 27.11.2026): Nach der letzten Angebotsfrage („bezahlt, finanziert oder geleast?“) kam
// „Vielen Dank! Den Link finden Sie hier: …“ und erst nach dem „Danke“ des Leads die Bitte um Fahrzeugschein und Rechnung.
// Ursache: Der Assistent hielt für die zweite Teilfrage nur „bezahlt“ fest, der Kilometerteil ging verloren, die App hielt
// eine Angebotsfrage für offen und schickte die Antwort des Assistenten (mit Link) statt der Bitte.
//   1. letzte Angebotsfrage beantwortet → sofort die Bitte um Fahrzeugschein und Rechnung, kein Link ohne Kontext
//   2. Ablage bzw. Unterlagen-Funktion aus → der Schluss nennt Fahrzeugschein und letzte Rechnung zum Mitbringen
//   3. Lead fragt nach dem Link → Link mit Termin und Uhrzeit
//   4. Assistent fragt nichts, obwohl eine Angebotsfrage offen ist → die App stellt sie selbst
// Aufbau wie tests/integration/assistent-strecke.test.ts (WhatsApp, Kalender, Policen-Modul und LLM simuliert).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
    sendList: (...a: unknown[]) => waSend("list", ...a),
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
      return policenBitte({ an: "sie", vermittler: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn", anrede: "Herr" }, kfz: true });
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
import { cleanupCustomer, makeBuyer, makeCustomer, ohneSplittest, requireTestDb } from "./db";

ohneSplittest("termin_zusage");
// Mitentscheider vor dem Terminvorschlag: immer eigene Frage (Ole, 22.11.2026, kein Splittest mehr)
ohneSplittest("partner_vor_termin", "termin_gebucht");

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const HOUR = 3600_000;

type Sent = { art: string; to: string; body: string; buttons: { id: string; title: string }[] | null; liste?: { id: string; title: string }[] };
const gesendet = (): Sent[] =>
  waSend.mock.calls.map((c) => ({
    art: c[0] as string,
    to: c[2] as string,
    body: String(c[3] ?? ""),
    buttons: c[0] === "buttons" ? (c[4] as { id: string; title: string }[]) : null,
    ...(c[0] === "list" ? { liste: (c[4] as { zeilen: { id: string; title: string }[] }).zeilen } : {}),
  }));



describe("Kfz-Lead (Fall Lohmann, 27.11.2026): Reihenfolge nach der letzten Angebotsfrage", () => {
  let customerId = "";
  const pnid = `pnid-kfz-${uid()}`;
  const value = (extra: Record<string, unknown>) => ({ messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: "4930123456789" }, ...extra });
  const inbound = (from: string, m: Record<string, unknown>) =>
    handleInboundPayload({ entry: [{ changes: [{ field: "messages", value: value({ contacts: [{ profile: { name: "Max" } }], messages: [{ from, id: `wamid.in-${uid()}`, ...m }] }) }] }] });
  const text = (from: string, body: string) => inbound(from, { type: "text", text: { body } });
  const knopf = (from: string, id: string, title: string) => inbound(from, { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });

  beforeAll(async () => {
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
    policenModul.an = true;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });

  async function kfzLead() {
    const now = new Date();
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: { customerId, name: "Max Muster", phone, email: "max@example.com", source: "Kfz-Versicherung", status: "Im Gespräch", reached: true, outreachAt: now, formData: [{ label: "Postleitzahl", value: "80331" }] },
    });
    const conv = await prisma.conversation.create({
      data: {
        customerId, leadId: lead.id, contactPhone: phone, contactName: "Max", botActive: true, qualified: true,
        windowExpiresAt: new Date(now.getTime() + 20 * HOUR), lastMessageAt: now,
        qualificationData: { entscheidung: "Entscheidet allein", geburt: "14.05.1985", beruf: "nicht im öffentlichen Dienst", kfzVertrag: "Wechsel; Vollkasko; keine Schäden" },
        messages: { create: [{ direction: "outbound", body: "Hallo, danke für Ihre Anfrage zur Kfz-Versicherung!", sentBy: "system", createdAt: new Date(now.getTime() - 5 * 60_000) }, { direction: "inbound", body: "Hallo", createdAt: new Date(now.getTime() - 4 * 60_000) }] },
      },
    });
    return { lead, conv, phone };
  }

  const dump = () => gesendet().map((s) => s.body);
  const rq = (angaben: Record<string, string>) => ({ type: "tool_use" as const, id: `q-${uid()}`, name: "record_qualification", input: { zusammenfassung: "x", angaben } });
  const LINK = "https://meet.google.com/abc-defg-hij";
  const KFZ_BITTE_RE = /^Danke! Damit Herr Kannapinn Ihren Beitrag vorab rechnen kann: Schicken Sie bitte ein Foto von Ihrem Fahrzeugschein/;

  /** Gebucht per Knopf, Komplettcheck „Nein“, Angebotsfragen bis zur letzten („bezahlt, finanziert oder geleast?“). */
  async function bisZurLetztenFrage() {
    const x = await kfzLead();
    const start = slotsAb(cal.base)[0].start;
    await knopf(x.phone, `slot:${start}`, "Heute 16 Uhr");
    const appt = await prisma.appointment.findFirstOrThrow({ where: { leadId: x.lead.id, status: "booked" } });
    await knopf(x.phone, "komplettcheck:nein", "Nein, danke");
    expect(gesendet().at(-1)!.body).toMatch(/Nutzen Sie das Fahrzeug privat oder auch geschäftlich\?$/);
    st.queue.push([rq({ kfzFahrer: "privat, Führerschein 2005, nur ich" })], [{ type: "text", text: "Wie viele Kilometer fahren Sie ungefähr im Jahr?" }]);
    await text(x.phone, "privat, seit 2005, nur ich");
    st.queue.push([rq({ kfzDetails: "12.000 km" })], [{ type: "text", text: "Ist das Fahrzeug bezahlt, finanziert oder geleast?" }]);
    await text(x.phone, "12000");
    expect(gesendet().at(-1)!.body).toBe("Ist das Fahrzeug bezahlt, finanziert oder geleast?");
    return { ...x, appt };
  }

  it("Fall Lohmann: nach der letzten Angebotsfrage sofort die Bitte um Fahrzeugschein und Rechnung, kein Link ohne Kontext", async () => {
    const { phone, conv } = await bisZurLetztenFrage();
    // Der Assistent hält nur den neuen Teil fest („bezahlt“ statt „12.000 km, bezahlt“) und schließt mit dem Link ab
    st.queue.push([rq({ kfzDetails: "bezahlt" })], [{ type: "text", text: `Vielen Dank! Den Link finden Sie hier: ${LINK}` }]);
    const ab = gesendet().length;
    await text(phone, "bezahlt");
    const neu = dump().slice(ab);
    expect(neu[0]).toMatch(KFZ_BITTE_RE);
    expect(neu.join("\n")).not.toContain(LINK);
    expect(neu.join("\n")).not.toMatch(/Den Link finden Sie hier/);
    const q = (await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id }, select: { qualificationData: true } })).qualificationData as Record<string, string>;
    expect(q.kfzDetails).toMatch(/12\.000 km/);
    expect(q.kfzDetails).toMatch(/bezahlt/);
  });

  it("Ablage bzw. Unterlagen-Funktion aus: keine Bitte, aber der Schluss nennt Fahrzeugschein und letzte Rechnung zum Mitbringen", async () => {
    policenModul.an = false;
    const { phone } = await bisZurLetztenFrage();
    st.queue.push([rq({ kfzDetails: "12.000 km, bezahlt" })], [{ type: "text", text: "Danke, notiert." }]);
    const ab = gesendet().length;
    await text(phone, "bezahlt");
    const neu = dump().slice(ab);
    expect(neu).toHaveLength(1);
    expect(neu[0]).toMatch(/Legen Sie zum Termin gern bereit: Ihren Fahrzeugschein, die letzte Rechnung Ihrer Kfz-Versicherung \(mit SF-Klasse\)/);
    expect(neu[0]).toMatch(/Zum Schluss:/);
  });

  it("Lead fragt nach dem Link: Antwort mit Termin und Uhrzeit (Sie-Form), Strecke läuft weiter", async () => {
    const { phone, appt } = await bisZurLetztenFrage();
    st.queue.push([{ type: "text", text: `Gern, hier ist er: ${LINK}` }]);
    const ab = gesendet().length;
    await text(phone, "Wo finde ich eigentlich den Link?");
    const neu = dump().slice(ab);
    expect(neu).toHaveLength(1);
    const { zeitLang } = await import("@/lib/whatsapp/gespraech");
    // Link mit Kontext, die offene Angebotsfrage bleibt sichtbar (die App stellt sie, weil der Assistent nichts fragt)
    expect(neu[0]).toBe(`Ihr Videotermin mit Herrn Kannapinn ist am ${zeitLang(appt.startsAt)}. Hier ist der Link: ${LINK}\n\nIst das Fahrzeug bezahlt, finanziert oder geleast?`);
  });

  it("Assistent schließt ab, obwohl eine Angebotsfrage offen ist: die App stellt sie selbst", async () => {
    const { phone } = await bisZurLetztenFrage();
    st.queue.push([{ type: "text", text: "Vielen Dank!" }]);
    const ab = gesendet().length;
    await text(phone, "Moment, muss ich nachschauen");
    expect(dump().slice(ab)).toEqual(["Vielen Dank!\n\nIst das Fahrzeug bezahlt, finanziert oder geleast?"]);
  });
});
