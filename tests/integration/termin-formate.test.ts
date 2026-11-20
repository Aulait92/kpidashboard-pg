// Terminarten (Ole, 18.11.2026): Der Assistent schlägt immer Video vor. Telefon bzw. vor Ort nur, wenn der Lead es
// ausdrücklich wünscht UND der Vermittler es freigegeben hat (Einrichtung bzw. Einstellungen → Assistent, Standard aus).
// Sonst bucht die App nicht, der Assistent antwortet freundlich mit dem Video-Satz. Vor Ort: Agentur-Adresse am Termin.
// Gegen die Test-DB, WhatsApp, Kalender und LLM simuliert (wie tests/integration/assistent-strecke.test.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
const st: { queue: Block[][]; reqs: Array<{ system: string; messages: Array<{ role: string; content: unknown }> }> } = { queue: [], reqs: [] };
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
      create: async (req: { system: string; messages: Array<{ role: string; content: unknown }> }) => {
        st.reqs.push(JSON.parse(JSON.stringify(req)));
        return { content: st.queue.shift() ?? [{ type: "text", text: "Alles klar." }], stop_reason: "end_turn" };
      },
    };
  },
}));
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));
const gebucht: Array<{ mode: string; ort?: string | null }> = [];
vi.mock("@/lib/calendar", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar")>();
  const { prisma } = await import("@/lib/prisma");
  return {
    ...real,
    bookingDurationMin: async () => 30,
    bookingPausedUntil: async () => null,
    suggestSlots: async () => [],
    bookAppointment: async (o: { customerId: string; leadId: string | null; conversationId: string; start: string; mode: string; ort?: string | null }) => {
      gebucht.push({ mode: o.mode, ort: o.ort });
      const a = await prisma.appointment.create({
        data: { customerId: o.customerId, leadId: o.leadId, conversationId: o.conversationId, startsAt: new Date(o.start), mode: o.mode, ort: o.ort ?? null, meetUrl: o.mode === "video" ? "https://meet.google.com/abc-defg-hij" : null, status: "booked", calendarEventId: "ev1" },
      });
      return { appointmentId: a.id, meetUrl: a.meetUrl, start: o.start, manageUrl: "https://x/manage" };
    },
  };
});

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { runBotTurn } from "@/lib/whatsapp/bot";
import { loadTerminFormate, saveTerminFormate } from "@/lib/termin-formate-server";
import { nurVideoSatz } from "@/lib/termin-formate";
import { cleanupCustomer, makeBuyer, makeCustomer, ohneSplittest, requireTestDb } from "./db";

// Buchungen im Chat immer mit Fassung a der Bestätigung (Splittest termin_zusage; Fassung b: eigener Test)
ohneSplittest("termin_zusage");

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4916${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const HOUR = 3600_000;
const ADRESSE = "Musterstraße 1\n10115 Berlin";

const gesendet = () => waSend.mock.calls.map((c) => String(c[3] ?? ""));
const toolErgebnisse = () =>
  st.reqs
    .flatMap((r) => r.messages)
    .flatMap((m) => (Array.isArray(m.content) ? (m.content as Array<{ type: string; content?: unknown }>) : []))
    .filter((b) => b.type === "tool_result")
    .map((b) => String(b.content));

describe("Terminarten: Video immer, Telefon und vor Ort nur freigegeben und auf Wunsch", () => {
  let customerId = "";
  const pnid = `pnid-formate-${uid()}`;

  async function chat(wunsch: string, an: "sie" | "du" = "sie") {
    await prisma.customer.update({ where: { id: customerId }, data: { leadAddress: an } });
    const now = new Date();
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: { customerId, name: "Julia Schneider", phone, email: "julia@example.com", source: "Privatschutz", status: "Im Gespräch", reached: true, outreachAt: now },
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
        qualificationData: { versichern: "Familie", vorhanden: "neu" },
        messages: {
          create: [
            { direction: "outbound", body: "Hallo Julia Schneider, danke für Ihre Anfrage! Ich bin der digitale KI-Assistent von Herrn Kannapinn.", sentBy: "system", createdAt: new Date(now.getTime() - 30 * 60_000) },
            { direction: "inbound", body: wunsch, createdAt: new Date(now.getTime() - 60_000) },
          ],
        },
      },
    });
    return { lead, conv };
  }
  const start = () => new Date(Math.ceil(Date.now() / HOUR) * HOUR + 26 * HOUR).toISOString();

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.ANTHROPIC_API_KEY ||= "test";
    const c = await makeCustomer({ name: `Agentur Kannapinn ${uid()}`, leadAddress: "sie" });
    customerId = c.id;
    await makeBuyer(customerId, "owner");
    await prisma.erstinformation.create({ data: { customerId, token: `tok-${uid()}`, name: "Ole Kannapinn", anrede: "Herr", firma: "Agentur Kannapinn", anschrift: ADRESSE } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(async () => {
    st.queue = [];
    st.reqs = [];
    gebucht.length = 0;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
    await saveTerminFormate(customerId, { telefon: false, vorOrt: false });
  });

  it("Bestandskunden und neue Kunden: beides aus (Standard der Migration)", async () => {
    const c = await makeCustomer();
    await prisma.agentConfig.create({ data: { customerId: c.id } });
    expect(await loadTerminFormate(c.id)).toEqual({ telefon: false, vorOrt: false });
    await cleanupCustomer(c.id);
    // Ohne Assistenten-Einstellungen (z. B. in der Einrichtung): Standard aus, Speichern legt sie an
    const d = await makeCustomer();
    expect(await loadTerminFormate(d.id)).toEqual({ telefon: false, vorOrt: false });
    await saveTerminFormate(d.id, { telefon: true, vorOrt: false });
    expect(await loadTerminFormate(d.id)).toEqual({ telefon: true, vorOrt: false });
    await cleanupCustomer(d.id);
  });

  it("nicht freigegeben: Telefonwunsch wird nicht gebucht, freundlicher Video-Satz, dann Video", async () => {
    const { conv } = await chat("Können wir das bitte telefonisch machen?");
    const s = start();
    st.queue.push(
      [{ type: "tool_use", id: "t1", name: "book_appointment", input: { modus: "phone", start: s } }],
      [{ type: "tool_use", id: "t2", name: "book_appointment", input: { modus: "video", start: s } }],
    );
    await runBotTurn(conv.id);
    // Regel im Prompt: immer Video, Wunsch nach Telefon/vor Ort mit dem Video-Satz beantworten
    expect(st.reqs[0].system).toContain("Schlag immer einen Videotermin vor");
    expect(st.reqs[0].system).toContain(nurVideoSatz("sie"));
    expect(st.reqs[0].system).not.toMatch(/darfst du Telefon/);
    // Telefon nicht gebucht, Hinweis an den Assistenten; danach Video
    expect(toolErgebnisse()[0]).toMatch(/nicht freigegeben: NICHT buchen/);
    expect(toolErgebnisse()[0]).toContain("Der Termin findet per Video statt, das geht ganz einfach am Handy, ohne App.");
    expect(gebucht.map((g) => g.mode)).toEqual(["video"]);
    expect(gesendet().some((b) => b.startsWith("Ihr Videotermin ist gebucht:"))).toBe(true);
  });

  it("nicht freigegeben, Du-Ansprache: Video-Satz in Du-Form", async () => {
    const { conv } = await chat("Kann ich auch in die Agentur kommen?", "du");
    st.queue.push([{ type: "tool_use", id: "t1", name: "book_appointment", input: { modus: "onsite", start: start() } }], [{ type: "text", text: nurVideoSatz("du") }]);
    await runBotTurn(conv.id);
    expect(gebucht).toEqual([]);
    expect(toolErgebnisse()[0]).toContain(nurVideoSatz("du"));
    expect(nurVideoSatz("du")).toContain("deinem Handy");
    expect(st.reqs[0].system).toContain(nurVideoSatz("du"));
  });

  it("Telefon freigegeben: auf ausdrücklichen Wunsch Telefontermin ohne Video-Link", async () => {
    await saveTerminFormate(customerId, { telefon: true, vorOrt: false });
    const { conv } = await chat("Ich möchte lieber telefonieren.");
    st.queue.push([{ type: "tool_use", id: "t1", name: "book_appointment", input: { modus: "phone", start: start() } }]);
    await runBotTurn(conv.id);
    expect(st.reqs[0].system).toContain("Nur wenn der Lead ausdrücklich etwas anderes wünscht, darfst du Telefon (modus phone) buchen.");
    expect(st.reqs[0].system).toContain("Schlag immer einen Videotermin vor");
    expect(gebucht).toEqual([{ mode: "phone", ort: null }]);
    const appt = await prisma.appointment.findFirstOrThrow({ where: { conversationId: conv.id } });
    expect(appt.mode).toBe("phone");
    expect(appt.meetUrl).toBeNull();
    expect(gesendet().some((b) => b.startsWith("Ihr Telefontermin ist gebucht:"))).toBe(true);
  });

  it("vor Ort freigegeben: Termin mit Agentur-Adresse in der Bestätigung", async () => {
    await saveTerminFormate(customerId, { telefon: false, vorOrt: true });
    const { conv } = await chat("Ich komme lieber persönlich in die Agentur.");
    st.queue.push([{ type: "tool_use", id: "t1", name: "book_appointment", input: { modus: "onsite", start: start() } }]);
    await runBotTurn(conv.id);
    expect(gebucht).toEqual([{ mode: "onsite", ort: "Agentur Kannapinn, Musterstraße 1, 10115 Berlin" }]);
    const appt = await prisma.appointment.findFirstOrThrow({ where: { conversationId: conv.id } });
    expect(appt.ort).toBe("Agentur Kannapinn, Musterstraße 1, 10115 Berlin");
    const msg = gesendet().find((b) => b.startsWith("Ihr Termin vor Ort ist gebucht:"))!;
    expect(msg).toContain("Adresse: Agentur Kannapinn, Musterstraße 1, 10115 Berlin");
    expect(msg).not.toMatch(/[–—]|Link/);
  });
});
