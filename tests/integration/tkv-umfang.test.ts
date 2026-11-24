// Tierkranken: gewünschter Umfang im Chat (Ole, 19.11.2026; Test Katze: Lead wählt „OPeration“, der Bot bestätigt den
// OP-Schutz und schreibt im selben Satz „was eine Krankenversicherung für Minka kostet“, und 25 Min. nach der
// Einladung kamen erneut Terminvorschläge). Gegen die Test-DB, WhatsApp, Kalender und LLM simuliert.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
const st: { queue: Block[][] } = { queue: [] };
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
      create: async () => ({ content: st.queue.shift() ?? [{ type: "text", text: "Alles klar." }], stop_reason: "end_turn" }),
    };
  },
}));
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));
vi.mock("@/lib/calendar", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar")>();
  const slots = () => {
    const iso = (h: number) => new Date(Math.ceil(Date.now() / 3600_000) * 3600_000 + h * 3600_000).toISOString();
    return [iso(3), iso(26), iso(50)].map((s) => ({ start: s, end: new Date(new Date(s).getTime() + 30 * 60_000).toISOString() }));
  };
  return { ...real, bookingDurationMin: async () => 30, bookingPausedUntil: async () => null, suggestSlots: async () => slots() };
});

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { runBotTurn } from "@/lib/whatsapp/bot";
import { cleanupCustomer, makeBuyer, makeCustomer, ohneSplittest, requireTestDb } from "./db";

ohneSplittest("termin_zusage");
ohneSplittest("partner_vor_termin", "termin_gebucht");
ohneSplittest("terminvorschlag_kostenlos");

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const HOUR = 3600_000;
const FRAGE = "Danke! Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung?";
type Sent = { art: string; body: string; buttons: { id: string; title: string }[] | null };
const gesendet = (): Sent[] => waSend.mock.calls.map((c) => ({ art: c[0] as string, body: String(c[3] ?? ""), buttons: c[0] === "buttons" ? (c[4] as { id: string; title: string }[]) : null }));
const tool = (name: string, input: unknown): Block => ({ type: "tool_use", id: `tu_${uid()}`, name, input });

describe("TKV: Umfang OP, voll, offen im Terminvorschlag; kein zweiter Vorschlag mit Termin", () => {
  let customerId = "";

  async function katzenChat(o: { antwort: string; source?: string; formData?: { label: string; value: string }[] }) {
    const now = new Date();
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: {
        customerId,
        name: "Julia Schneider",
        phone,
        email: "julia@example.com",
        source: o.source ?? "TKV-Katze",
        status: "Im Gespräch",
        reached: true,
        outreachAt: now,
        formData: o.formData ?? [
          { label: "Tierart", value: "Katze" },
          { label: "Name des Tieres", value: "Minka" },
          { label: "Geburtsjahr (Tier)", value: "2021" },
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
        qualified: false,
        windowExpiresAt: new Date(now.getTime() + 20 * HOUR),
        lastMessageAt: now,
        qualificationData: { entscheidung: "Entscheidet allein", tier: "3 Jahre" },
        messages: {
          create: [
            { direction: "outbound", body: "Hallo Julia, schön, dass Sie Minka gut absichern möchten 🐾 *Wie alt ist Minka?*", sentBy: "system", purpose: "outreach_tkv", createdAt: new Date(now.getTime() - 30 * 60_000) },
            { direction: "inbound", body: "3 Jahre", createdAt: new Date(now.getTime() - 20 * 60_000) },
            { direction: "outbound", body: FRAGE, sentBy: "bot", createdAt: new Date(now.getTime() - 10 * 60_000) },
            { direction: "inbound", body: o.antwort, createdAt: new Date(now.getTime() - 60_000) },
          ],
        },
      },
    });
    return { lead, conv };
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.ANTHROPIC_API_KEY ||= "test";
    const c = await makeCustomer({ name: `Agentur Kannapinn ${uid()}`, leadAddress: "sie" });
    customerId = c.id;
    await makeBuyer(customerId, "owner");
    await prisma.erstinformation.create({ data: { customerId, token: `tok-${uid()}`, name: "Ole Kannapinn", anrede: "Herr" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, followUpSequencesEnabled: false, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: `pnid-tkv-${uid()}`, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    st.queue = [];
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });

  const vorschlag = () => gesendet().find((s) => s.buttons?.some((b) => b.id.startsWith("slot:")));

  it.each([
    ["OPeration", "op", "was eine OP-Versicherung für Minka kostet", "nur OP-Schutz"],
    ["Tierarzt auch", "voll", "was eine Krankenversicherung für Minka kostet", "volle Krankenversicherung (auch Tierarztbehandlung)"],
    ["weiß nicht", "offen", "was OP- und Krankenschutz für Minka kosten", "OP- und Krankenschutz vergleichen"],
  ])("Antwort „%s“ (vom Assistenten festgehalten) → %s", async (antwort, umfang, satz, wunsch) => {
    const { lead, conv } = await katzenChat({ antwort });
    st.queue.push([
      tool("record_qualification", { zusammenfassung: "Katze Minka", angaben: { tarifwunsch: antwort }, qualifiziert: true }),
      tool("termin_vorschlagen", { einleitung: umfang === "op" ? "Alles klar, der OP-Schutz steht für Minka im Vordergrund." : "Alles klar." }),
    ]);
    await runBotTurn(conv.id);
    const v = vorschlag();
    expect(v?.body, JSON.stringify(gesendet())).toContain(satz);
    if (umfang === "op") expect(v?.body).not.toContain("Krankenversicherung");
    expect(v?.body).not.toMatch(/[–—]/);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).tkvUmfang).toBe(umfang);
    const q = (await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).qualificationData as Record<string, string>;
    expect(q.tarifwunsch).toBe(wunsch);
  });

  it("Sicherheitsnetz: Assistent hält die Antwort nicht fest, der Vorschlag nimmt sie trotzdem aus dem Verlauf", async () => {
    const { lead, conv } = await katzenChat({ antwort: "nur OP" });
    st.queue.push([tool("termin_vorschlagen", {})]);
    await runBotTurn(conv.id);
    expect(vorschlag()?.body).toContain("was eine OP-Versicherung für Minka kostet");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).tkvUmfang).toBe("op");
  });

  it("Lead mit künftigem Termin (auch ohne diesen Chat angelegt): keine neuen Zeiten, Verweis auf den Termin", async () => {
    const { lead, conv } = await katzenChat({ antwort: "Danke, bis dann" });
    await prisma.conversation.update({ where: { id: conv.id }, data: { qualified: true } });
    const start = new Date(Date.now() + 26 * HOUR);
    for (const conversationId of [conv.id, null]) {
      const t = await prisma.appointment.create({ data: { customerId, leadId: lead.id, conversationId, startsAt: start, mode: "video", status: "booked", meetUrl: "https://meet.google.com/abc" } });
      waSend.mockClear();
      st.queue.push([tool("termin_vorschlagen", { einleitung: "Gern." })], [{ type: "text", text: "Ihr Termin steht. Bis dann!" }]);
      await runBotTurn(conv.id);
      expect(vorschlag(), JSON.stringify(gesendet())).toBeUndefined();
      expect(gesendet().some((s) => /Ihr Termin steht/.test(s.body))).toBe(true);
      await prisma.appointment.update({ where: { id: t.id }, data: { status: "cancelled" } });
    }
  });
});
