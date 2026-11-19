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
import { STRECKE } from "@/lib/whatsapp/termin-strecke";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

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
  async function leadNachErstanschreiben(formData: { label: string; value: string }[] = [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" }]) {
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
              body: "[Erstinformation als PDF]\nHallo Julia Schneider, danke für Ihre Anfrage zum Privatschutz! Hier schreibt der digitale Assistent von Herrn Kannapinn.\n\n*Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*\n\nKI-Assistent · Oben: Erstinformation (gesetzlich)",
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

  it("Antwort auf die Öffnungsfrage → genau eine Zwischenfrage mit Knöpfen → Knopf → Terminvorschlag, der die Antwort aufgreift (ohne KI)", async () => {
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
    const vorschlag = gesendet().at(-1)!;
    expect(vorschlag.art).toBe("buttons");
    expect(vorschlag.body).toMatch(/^Danke! In einem kurzen(, kostenlosen)? Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Sie kosten und worauf Sie achten sollten\. Passt Ihnen .+ oder .+\?$/);
    expect(vorschlag.buttons!.map((b) => b.id.split(":")[0])).toEqual(["slot", "slot", "andere_zeit"]);
    c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c.qualificationData).toMatchObject({ vorhanden: "Beides neu", versichern: "Nur ich" });
    expect(c.qualified).toBe(true);
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: STRECKE.vorschlag } })).toBe(1);
    // genau einmal: insgesamt nur eine Zwischenfrage im Chat
    expect(await prisma.message.count({ where: { conversationId: conv.id, direction: "outbound", body: { contains: "Wer soll mitversichert sein?" } } })).toBe(1);
  });

  it("Terminwunsch auf die Öffnungsfrage: keine Zwischenfrage, der Assistent bietet direkt den Termin an", async () => {
    const { conv, phone } = await leadNachErstanschreiben();
    st.queue.push([{ type: "tool_use", id: "t1", name: "termin_vorschlagen", input: {} }], [{ type: "text", text: "(ignoriert)" }]);
    await text(phone, "Beides neu. Können wir morgen telefonieren?");
    expect(st.ai).toBeGreaterThan(0);
    expect(JSON.stringify(st.reqs[0])).toContain("Stell keine weitere Frage");
    expect(await prisma.message.count({ where: { conversationId: conv.id, body: { contains: "Wer soll mitversichert sein?" } } })).toBe(0);
    expect(gesendet().at(-1)!.body).toMatch(/^Danke! In einem kurzen(, kostenlosen)? Videotermin zeigt Ihnen Herr Kannapinn/); // Splittest terminvorschlag_kostenlos
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
    expect(gesendet().at(-1)!.body).toMatch(/^Danke! In einem kurzen(, kostenlosen)? Videotermin zeigt Ihnen Herr Kannapinn/);
    c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c.qualificationData).toMatchObject({ vorhanden: "Beides neu", wohnflaeche: "72 m²" });
    expect(c.qualified).toBe(true);
    expect(await prisma.message.count({ where: { conversationId: conv.id, direction: "outbound", body: { contains: "etwas genauer" } } })).toBe(1);
  });
});
