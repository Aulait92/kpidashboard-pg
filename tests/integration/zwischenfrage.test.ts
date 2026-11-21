// Zwischenfrage vor dem Terminvorschlag und Vermittler-Nennung (Ole, Testchat 17.11.2026), gegen die Test-DB, WhatsApp,
// Kalender und LLM simuliert (Muster wie assistent-strecke.test.ts).
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
const cal = { base: Date.now(), busy: new Set<string>() };
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
    bookAppointment: async (o: { customerId: string; leadId: string | null; conversationId: string; start: string; mode: string }) => {
      if (cal.busy.has(o.start)) throw new real.SlotBusyError();
      const a = await prisma.appointment.create({ data: { customerId: o.customerId, leadId: o.leadId, conversationId: o.conversationId, startsAt: new Date(o.start), mode: o.mode, meetUrl: "https://meet.google.com/abc-defg-hij", status: "booked" } });
      return { appointmentId: a.id, meetUrl: a.meetUrl, start: o.start, manageUrl: "https://x/manage" };
    },
  };
});

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { runPartnerVorTerminNachholen, STRECKE } from "@/lib/whatsapp/termin-strecke";
import { cleanupCustomer, makeBuyer, makeCustomer, ohneSplittest, requireTestDb } from "./db";

// Buchungen im Chat immer mit Fassung a der Bestätigung (Splittest termin_zusage; Fassung b: eigener Test)
ohneSplittest("termin_zusage");
// „Entscheidet noch jemand mit?“ vor dem Terminvorschlag immer als eigene Frage (Fassung a, Standard; Ole 21.11.2026)
ohneSplittest("partner_vor_termin", "termin_gebucht");

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const HOUR = 3600_000;

type Sent = { art: string; to: string; body: string; buttons: { id: string; title: string }[] | null };
const gesendet = (): Sent[] =>
  waSend.mock.calls.map((c) => ({ art: c[0] as string, to: c[2] as string, body: String(c[3] ?? ""), buttons: c[0] === "buttons" ? (c[4] as { id: string; title: string }[]) : null }));

describe("Zwischenfrage vor dem Terminvorschlag (Privatschutz) und Vermittler-Nennung", () => {
  let customerId = "";
  const pnid = `pnid-zwischen-${uid()}`;
  const value = (extra: Record<string, unknown>) => ({ messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: "4930123456789" }, ...extra });
  const inbound = (from: string, m: Record<string, unknown>) =>
    handleInboundPayload({ entry: [{ changes: [{ field: "messages", value: value({ contacts: [{ profile: { name: "Julia" } }], messages: [{ from, id: `wamid.in-${uid()}`, ...m }] }) }] }] });
  const text = (from: string, body: string) => inbound(from, { type: "text", text: { body } });
  const knopf = (from: string, id: string, title: string) => inbound(from, { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });

  // Lead nach dem Erstanschreiben v8 (Vorlage mit PDF und Fußzeile), Formular nur mit Versicherungsinteresse
  async function leadNachErstanschreiben(
    formData: { label: string; value: string }[] = [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" }],
    body = "[Erstinformation als PDF]\nHallo Julia Schneider, danke für Ihre Anfrage zum Privatschutz! Hier schreibt der digitale Assistent von Herrn Kannapinn.\n\n*Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*\n\nKI-Assistent · Oben: Erstinformation (gesetzlich)",
  ) {
    const now = new Date();
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: { customerId, name: "Julia Schneider", phone, email: "julia@example.com", source: "Privatschutz", status: "Neuer Lead", outreachAt: now, formData },
    });
    const conv = await prisma.conversation.create({
      data: {
        customerId,
        leadId: lead.id,
        contactPhone: phone,
        contactName: "Julia",
        botActive: true,
        windowExpiresAt: new Date(now.getTime() + 20 * HOUR),
        lastMessageAt: now,
        messages: {
          create: [
            {
              direction: "outbound",
              kind: "template",
              purpose: "outreach_privatschutz",
              sentBy: "system",
              body,
              createdAt: new Date(now.getTime() - 10 * 60_000),
            },
          ],
        },
      },
    });
    return { lead, conv, phone };
  }

  beforeAll(async () => {
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
    st.reqs = [];
    cal.base = Date.now();
    cal.busy.clear();
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });

  it("Antwort auf die Öffnungsfrage → genau eine Zwischenfrage mit Knöpfen → Knopf → „Entscheidet noch jemand mit?“ → Knopf → Terminvorschlag, der die Antwort aufgreift (ohne KI)", async () => {
    const { conv, phone } = await leadNachErstanschreiben();
    await text(phone, "Beides neu");
    expect(st.ai).toBe(0);
    const frage = gesendet().at(-1)!;
    expect(frage.art).toBe("buttons");
    expect(frage.body).toBe("Danke! Damit Herr Kannapinn Ihnen im Termin gleich passende Beiträge zeigen kann: Wer soll mitversichert sein?");
    expect(frage.buttons!.map((b) => b.title)).toEqual(["Nur ich", "Zu zweit", "Familie mit Kindern"]);
    let c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c.qualificationData).toMatchObject({ vorhanden: "Beides neu" });
    expect(c.qualified).toBe(false);

    waSend.mockClear();
    await knopf(phone, frage.buttons![0].id, "Nur ich");
    expect(st.ai).toBe(0);
    // Ole, 21.11.2026 spät: vor dem Terminvorschlag als eigene Frage, wer mitentscheidet (Knöpfe wie nach der Buchung)
    const partner = gesendet().at(-1)!;
    expect(partner.body).toBe("Danke! Entscheidet noch jemand mit, zum Beispiel Ihr Partner?");
    expect(partner.buttons!.map((b) => b.id)).toEqual(["partner:ja", "partner:nein"]);
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: STRECKE.vorschlag } })).toBe(0);
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: STRECKE.partnerVorFrage } })).toBe(1);
    await knopf(phone, "partner:nein", "Nein, ich allein");
    expect(st.ai).toBe(0);
    const vorschlag = gesendet().at(-1)!;
    expect(vorschlag.art).toBe("buttons");
    expect(vorschlag.body).toMatch(/^Danke! In einem kurzen(, kostenlosen)? Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Sie kosten und worauf Sie achten sollten\. Passt Ihnen .+ oder .+\?$/);
    expect(vorschlag.buttons!.map((b) => b.id.split(":")[0])).toEqual(["slot", "slot", "andere_zeit"]);
    c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c.qualificationData).toMatchObject({ vorhanden: "Beides neu", versichern: "Nur ich", entscheidung: "Entscheidet allein" });
    expect(c.qualified).toBe(true);
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: STRECKE.vorschlag } })).toBe(1);
    // genau einmal: insgesamt nur eine Zwischenfrage im Chat
    expect(await prisma.message.count({ where: { conversationId: conv.id, direction: "outbound", body: { contains: "Wer soll mitversichert sein?" } } })).toBe(1);
  });

  it("v12: Knopf „Alles neu“ auf die feste erste Frage → trotzdem genau eine Zwischenfrage (Ole, 20.11.2026, Testchat)", async () => {
    const { conv, phone } = await leadNachErstanschreiben(undefined, "[Erstinformation als PDF]\nHallo Julia Schneider, danke für Ihre Anfrage zu Haftpflicht und Hausrat! *Ist davon schon etwas versichert?*\n\nDigitaler KI-Assistent");
    await inbound(phone, { type: "button", button: { text: "Alles neu", payload: "Alles neu" } });
    expect(st.ai).toBe(0);
    const frage = gesendet().at(-1)!;
    expect(frage.art).toBe("buttons");
    expect(frage.body).toBe("Danke! Damit Herr Kannapinn Ihnen im Termin gleich passende Beiträge zeigen kann: Wer soll mitversichert sein?");
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c.qualificationData).toMatchObject({ vorhanden: "noch nichts versichert, alles neu" });
  });

  it("Terminwunsch auf die Öffnungsfrage: keine Zwischenfrage, der Assistent bietet direkt den Termin an", async () => {
    const { conv, phone } = await leadNachErstanschreiben();
    st.queue.push([{ type: "tool_use", id: "t1", name: "termin_vorschlagen", input: {} }], [{ type: "text", text: "(ignoriert)" }]);
    await text(phone, "Beides neu. Können wir morgen telefonieren?");
    expect(st.ai).toBeGreaterThan(0);
    expect(JSON.stringify(st.reqs[0])).toContain("Stell keine weitere Frage");
    expect(await prisma.message.count({ where: { conversationId: conv.id, body: { contains: "Wer soll mitversichert sein?" } } })).toBe(0);
    expect(gesendet().at(-1)!.body).toMatch(/^Danke! In einem kurzen(, kostenlosen)? Videotermin zeigt Ihnen Herr Kannapinn/); // Splittest terminvorschlag_kostenlos
    // Terminwunsch: keine Frage nach dem Mitentscheider davor (die Buchung geht vor), auch kein Halbsatz
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: STRECKE.partnerVorFrage } })).toBe(0);
    expect(gesendet().at(-1)!.body).not.toMatch(/Entscheide/);
  });

  it("Freitext statt Knopf auf die Zwischenfrage: nicht erneut fragen, der Assistent übernimmt; Vermittler gesiezt nie mit Vor- und Nachnamen", async () => {
    const { conv, phone } = await leadNachErstanschreiben();
    await text(phone, "Hausrat habe ich schon");
    expect(gesendet().at(-1)!.body).toContain("Wer soll mitversichert sein?");
    waSend.mockClear();
    st.queue.push([{ type: "text", text: "Gern! Ole Kannapinn meldet sich, und der Termin mit Ole Kannapinn dauert nur 20 Minuten." }]);
    await text(phone, "Wie lange dauert so ein Termin denn?");
    expect(st.ai).toBeGreaterThan(0);
    const sys = JSON.stringify((st.reqs[0] as { system: unknown }).system);
    expect(sys).toContain("Stell keine weitere Frage");
    expect(sys).toContain("Nie „Ole Kannapinn“");
    const antwort = gesendet().at(-1)!.body;
    expect(antwort).toBe("Gern! Herr Kannapinn meldet sich, und der Termin mit Herrn Kannapinn dauert nur 20 Minuten.");
    expect(await prisma.message.count({ where: { conversationId: conv.id, body: { contains: "Wer soll mitversichert sein?" } } })).toBe(1);
  });

  it("Wohnfläche als Zahl ohne Knöpfe: Spanne → einmal genauer nachfragen → Zahl → Terminvorschlag (Ole, 19.11.2026)", async () => {
    const { conv, phone } = await leadNachErstanschreiben([
      { label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" },
      { label: "Familienstand", value: "verheiratet" },
    ]);
    await text(phone, "Beides neu");
    const frage = gesendet().at(-1)!;
    expect(frage.body).toBe("Danke! Damit Herr Kannapinn Ihnen im Termin gleich passende Beiträge zeigen kann: Wie viele Quadratmeter Wohnfläche hat Ihre Wohnung? Bitte als Zahl, zum Beispiel 72.");
    expect(frage.buttons ?? null).toBeNull();

    await text(phone, "60 bis 80");
    expect(st.ai).toBe(0);
    expect(gesendet().at(-1)!.body).toBe("Danke! Wissen Sie es etwas genauer? Eine Zahl reicht.");
    let c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c.qualificationData).toMatchObject({ wohnflaeche: "ca. 70 m²" });
    expect(c.qualified).toBe(false);

    await text(phone, "ca. 72 qm");
    expect(st.ai).toBe(0);
    // verheiratet: Partner bekannt, direkt gefragt; getippte Antwort zählt wie der Knopf, Zeiten „für Sie beide“
    expect(gesendet().at(-1)!.body).toBe("Danke! Entscheiden Sie gemeinsam mit Ihrem Partner?");
    await text(phone, "ja, meine Frau");
    expect(st.ai).toBe(0);
    expect(gesendet().at(-1)!.body).toMatch(/^Prima, dann schlage ich Zeiten vor, die für Sie beide passen\. In einem kurzen(, kostenlosen)? Videotermin zeigt Ihnen Herr Kannapinn/);
    expect(gesendet().at(-1)!.buttons!.map((b) => b.id.split(":")[0])).toEqual(["slot", "slot", "andere_zeit"]);
    c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c.qualificationData).toMatchObject({ vorhanden: "Beides neu", wohnflaeche: "72 m²", entscheidung: "Partner entscheidet mit, soll beim Termin dabei sein" });
    expect(c.qualified).toBe(true);
    expect(await prisma.message.count({ where: { conversationId: conv.id, direction: "outbound", body: { contains: "etwas genauer" } } })).toBe(1);
  });

  // Ole, 21.11.2026 spät: Die Frage nach dem Mitentscheider darf keine Buchung kosten
  describe("„Entscheidet noch jemand mit?“ vor dem Terminvorschlag", () => {
    async function bisPartnerFrage() {
      const x = await leadNachErstanschreiben();
      await text(x.phone, "Beides neu");
      await knopf(x.phone, "zwischen:versichern:zu_zweit", "Zu zweit");
      expect(gesendet().at(-1)!.body).toBe("Danke! Entscheiden Sie gemeinsam mit Ihrem Partner?");
      return x;
    }

    it("ohne Antwort: nach 30 Min. trotzdem der Terminvorschlag (ohne „Danke!“), nur Mo bis Sa 8 bis 20 Uhr, genau einmal", async () => {
      const { conv } = await bisPartnerFrage();
      const now = new Date("2026-11-17T11:00:00Z"); // Di 12 Uhr
      await prisma.message.updateMany({ where: { conversationId: conv.id, kind: STRECKE.partnerVorFrage }, data: { createdAt: new Date(now.getTime() - 20 * 60_000) } });
      await prisma.message.updateMany({ where: { conversationId: conv.id, direction: "inbound" }, data: { createdAt: new Date(now.getTime() - 25 * 60_000) } });
      expect((await runPartnerVorTerminNachholen(now)).gesendet).toBe(0); // erst 20 Min.
      await prisma.message.updateMany({ where: { conversationId: conv.id, kind: STRECKE.partnerVorFrage }, data: { createdAt: new Date(now.getTime() - 40 * 60_000) } });
      await prisma.message.updateMany({ where: { conversationId: conv.id, direction: "inbound" }, data: { createdAt: new Date(now.getTime() - 45 * 60_000) } });
      expect((await runPartnerVorTerminNachholen(new Date("2026-11-17T20:30:00Z"))).gesendet).toBe(0); // 21:30 Uhr: wartet
      st.ai = 0;
      expect((await runPartnerVorTerminNachholen(now)).gesendet).toBe(1);
      expect(st.ai).toBe(0);
      const vorschlag = gesendet().at(-1)!;
      expect(vorschlag.body).toMatch(/^In einem kurzen(, kostenlosen)? Videotermin zeigt Ihnen Herr Kannapinn/);
      expect(vorschlag.buttons!.map((b) => b.id.split(":")[0])).toEqual(["slot", "slot", "andere_zeit"]);
      expect((await runPartnerVorTerminNachholen(now)).gesendet).toBe(0);
      const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
      expect((c.qualificationData as Record<string, unknown>).entscheidung).toBeUndefined();
    });

    it("Terminwunsch statt Antwort: nicht blockieren, der Assistent bucht; ausdrückliche Angabe wird festgehalten, keine Frage mehr vorab", async () => {
      const { conv, phone, lead } = await bisPartnerFrage();
      const slot = slotsAb(cal.base)[2].start;
      st.queue.push([{ type: "tool_use", id: "b1", name: "book_appointment", input: { modus: "video", start: slot } }], [{ type: "text", text: "(ignoriert)" }]);
      st.ai = 0;
      await text(phone, "Mit meiner Frau, morgen Nachmittag geht");
      expect(st.ai).toBeGreaterThan(0);
      expect(JSON.stringify((st.reqs.at(-1) as { system: unknown }).system)).toContain("Offen ist die Frage, ob noch jemand mitentscheidet");
      expect(await prisma.appointment.count({ where: { leadId: lead.id, status: "booked" } })).toBe(1);
      expect(gesendet().some((s) => /ist gebucht:/.test(s.body))).toBe(true);
      const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
      expect((c.qualificationData as Record<string, unknown>).entscheidung).toBe("Partner entscheidet mit, soll beim Termin dabei sein");
      expect((await runPartnerVorTerminNachholen(new Date("2026-11-17T11:00:00Z"))).gesendet).toBe(0);
    });

    it("Rückfrage statt Antwort: der Assistent antwortet und schickt sofort die Zeiten (keine zweite Frage)", async () => {
      const { conv, phone } = await bisPartnerFrage();
      st.queue.push([{ type: "tool_use", id: "t1", name: "termin_vorschlagen", input: { einleitung: "Damit Herr Kannapinn Sie beide gleich richtig beraten kann." } }], [{ type: "text", text: "(ignoriert)" }]);
      await text(phone, "Warum ist das wichtig?");
      const vorschlag = gesendet().at(-1)!;
      expect(vorschlag.body).toMatch(/^Damit Herr Kannapinn Sie beide gleich richtig beraten kann\. In einem kurzen/);
      expect(vorschlag.buttons!.map((b) => b.id.split(":")[0])).toEqual(["slot", "slot", "andere_zeit"]);
      expect(await prisma.message.count({ where: { conversationId: conv.id, kind: STRECKE.partnerVorFrage } })).toBe(1);
    });
  });
});
