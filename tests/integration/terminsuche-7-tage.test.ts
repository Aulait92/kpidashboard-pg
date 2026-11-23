// Terminsuche über 7 Tage (Ole, 22.11.2026), gegen die Test-DB, WhatsApp, Kalender und LLM simuliert (Muster wie
// zwischenfrage.test.ts): ferner Terminwunsch → Wiedervorlage und Bestätigung der App; zwei abgelehnte Runden (auch
// getippt) → Wunschtag-Frage mit Buchungslink; Kalender voll → Aufgabe für den Vermittler, „meldet sich persönlich“.
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
// Kalender: freie Zeiten relativ zu cal.base; voll = keine freien Zeiten
const cal = { base: Date.now(), voll: false };
const slotsAb = (base: number) => {
  const iso = (h: number) => new Date(Math.ceil(base / 3600_000) * 3600_000 + h * 3600_000).toISOString();
  return [iso(3), iso(26), iso(50)].map((s) => ({ start: s, end: new Date(new Date(s).getTime() + 30 * 60_000).toISOString() }));
};
vi.mock("@/lib/calendar", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar")>();
  return {
    ...real,
    bookingDurationMin: async () => 30,
    bookingPausedUntil: async () => null,
    suggestSlots: async () => (cal.voll ? [] : slotsAb(cal.base)),
  };
});

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { STRECKE } from "@/lib/whatsapp/termin-strecke";
import { KALENDER_VOLL_AUFGABE } from "@/lib/lead-sequences";
import { cleanupCustomer, makeBuyer, makeCustomer, ohneSplittest, requireTestDb } from "./db";

ohneSplittest("buchungslink_andere_zeit", "termin_gebucht");
ohneSplittest("partner_vor_termin", "termin_gebucht");

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const deTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);

type Sent = { art: string; to: string; body: string; buttons: { id: string; title: string }[] | null };
const gesendet = (): Sent[] =>
  waSend.mock.calls.map((c) => ({ art: c[0] as string, to: c[2] as string, body: String(c[3] ?? ""), buttons: c[0] === "buttons" ? (c[4] as { id: string; title: string }[]) : null }));
/** Werkzeugergebnisse, die die App dem Assistenten zurückgegeben hat */
const toolErgebnisse = () =>
  st.reqs.flatMap((r) =>
    ((r as { messages: { role: string; content: unknown }[] }).messages ?? []).flatMap((m) =>
      Array.isArray(m.content) ? (m.content as { type: string; content?: string }[]).filter((b) => b.type === "tool_result").map((b) => String(b.content)) : [],
    ),
  );

describe("Terminsuche über 7 Tage", () => {
  let customerId = "";
  const slug = `kannapinn-${uid()}`;
  const pnid = `pnid-sieben-${uid()}`;
  const value = (extra: Record<string, unknown>) => ({ messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: "4930123456789" }, ...extra });
  const inbound = (from: string, m: Record<string, unknown>) =>
    handleInboundPayload({ entry: [{ changes: [{ field: "messages", value: value({ contacts: [{ profile: { name: "Julia" } }], messages: [{ from, id: `wamid.in-${uid()}`, ...m }] }) }] }] });
  const text = (from: string, body: string) => inbound(from, { type: "text", text: { body } });

  // Qualifizierter Lead, dem die App gerade zwei Zeiten vorgeschlagen hat (Merker termin_vorschlag)
  async function leadMitVorschlag(opts: { vorschlag?: boolean } = {}) {
    const now = new Date();
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: { customerId, name: "Julia Schneider", phone, email: "julia@example.com", source: "Privatschutz", status: "Neuer Lead", outreachAt: now, formData: [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" }] },
    });
    const starts = slotsAb(cal.base).slice(0, 2).map((s) => s.start);
    const conv = await prisma.conversation.create({
      data: {
        customerId,
        leadId: lead.id,
        contactPhone: phone,
        contactName: "Julia",
        botActive: true,
        qualified: true,
        qualificationData: { vorhanden: "Beides neu", versichern: "Nur ich", entscheidung: "Entscheidet allein" },
        windowExpiresAt: new Date(now.getTime() + 20 * HOUR),
        lastMessageAt: now,
        messages: {
          create: [
            { direction: "outbound", kind: "template", purpose: "outreach_privatschutz", sentBy: "system", body: "[Erstinformation als PDF]\nHallo Julia Schneider, danke für Ihre Anfrage zum Privatschutz! Hier schreibt der digitale Assistent von Herrn Kannapinn.\n\n*Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*\n\nKI-Assistent · Oben: Erstinformation (gesetzlich)", createdAt: new Date(now.getTime() - 30 * 60_000) },
            { direction: "inbound", kind: "text", body: "Beides neu", createdAt: new Date(now.getTime() - 20 * 60_000) },
            ...(opts.vorschlag === false
              ? []
              : [
                  { direction: "outbound", kind: "text", sentBy: "bot", body: "Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Sie kosten. Passt Ihnen morgen um 10 Uhr oder Mittwoch um 14 Uhr?", createdAt: new Date(now.getTime() - 10 * 60_000) },
                  { direction: "internal", kind: STRECKE.vorschlag, sentBy: "system", body: JSON.stringify({ starts }), createdAt: new Date(now.getTime() - 10 * 60_000 + 1000) },
                ]),
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
    await prisma.calendarConnection.create({ data: { customerId, provider: "google", status: "connected", bookingSlug: slug } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    st.ai = 0;
    st.queue = [];
    st.reqs = [];
    cal.base = Date.now();
    cal.voll = false;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });

  describe("Wunsch mehr als 7 Tage in der Zukunft", () => {
    it("„erst in drei Wochen“: keine Zeiten, Wiedervorlage am Wunschtag um 10 Uhr, kurze Bestätigung der App (ohne KI)", async () => {
      const { lead, conv, phone } = await leadMitVorschlag();
      await text(phone, "Ich kann leider erst in drei Wochen");
      expect(st.ai).toBe(0);
      const recall = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, kind: "recall", stoppedAt: null } });
      const wunsch = new Date(Date.now() + 21 * DAY);
      // Wunschtag bzw. am Wochenende der Montag danach, 10 Uhr deutscher Zeit
      expect(recall.nextAt!.getTime()).toBeGreaterThanOrEqual(new Date(`${deTag(wunsch)}T00:00:00Z`).getTime());
      expect(recall.nextAt!.getTime()).toBeLessThan(new Date(`${deTag(wunsch)}T00:00:00Z`).getTime() + 3 * DAY);
      expect(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(recall.nextAt!)).toBe("10");
      const antwort = gesendet().at(-1)!;
      expect(antwort.buttons).toBeNull();
      expect(antwort.body).toMatch(/^Alles klar, dann melde ich mich am \w+, \d{1,2}\. \w+ wieder bei Ihnen und wir suchen einen passenden Termin mit Herrn Kannapinn\.$/);
      // keine neuen Zeiten, kein „Chat ruht“-Nachfassen neben der Wiedervorlage
      expect(await prisma.message.count({ where: { conversationId: conv.id, kind: STRECKE.vorschlag } })).toBe(1);
      expect(await prisma.leadSequence.count({ where: { leadId: lead.id, kind: "silent", stoppedAt: null } })).toBe(0);
      expect(await prisma.message.count({ where: { conversationId: conv.id, kind: "followup_scheduled" } })).toBe(1);
    });

    it("mit Rückfrage: der Assistent sucht mit ab in knapp drei Wochen, die App legt die Wiedervorlage an und bestätigt", async () => {
      const { lead, phone } = await leadMitVorschlag();
      const ab = deTag(new Date(Date.now() + 20 * DAY));
      st.queue.push([{ type: "tool_use", id: "s1", name: "get_available_slots", input: { ab } }], [{ type: "text", text: "(ignoriert)" }]);
      await text(phone, "Vorher bin ich viel unterwegs, ginge es auch in knapp drei Wochen?");
      expect(st.ai).toBe(1);
      const recall = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, kind: "recall", stoppedAt: null } });
      expect(recall.nextAt!.getTime()).toBeGreaterThan(Date.now() + 19 * DAY);
      expect(gesendet().at(-1)!.body).toMatch(/^Alles klar, dann melde ich mich am .+ wieder bei Ihnen/);
    });

    it("bis 7 Tage: weiter Zeiten ab dem Wunschtag, keine Wiedervorlage", async () => {
      const { lead, phone } = await leadMitVorschlag();
      const ab = deTag(new Date(Date.now() + 3 * DAY));
      st.queue.push([{ type: "tool_use", id: "s1", name: "get_available_slots", input: { ab } }], [{ type: "text", text: "Wie wäre es dann?" }]);
      await text(phone, "Lieber erst nächste Woche");
      expect(st.ai).toBeGreaterThan(0);
      expect(toolErgebnisse().some((t) => t.startsWith("Freie Zeiten"))).toBe(true);
      expect(await prisma.leadSequence.count({ where: { leadId: lead.id, kind: "recall" } })).toBe(0);
    });

    it("Vertragsende im Dezember ist kein Terminwunsch: der Assistent antwortet", async () => {
      const { lead, phone } = await leadMitVorschlag();
      st.queue.push([{ type: "text", text: "Danke für die Info!" }]);
      await text(phone, "Mein Hausratvertrag läuft im Dezember aus");
      expect(st.ai).toBeGreaterThan(0);
      expect(await prisma.leadSequence.count({ where: { leadId: lead.id, kind: "recall" } })).toBe(0);
    });
  });

  describe("Zwei Vorschlagsrunden abgelehnt", () => {
    it("getippt „passt nicht“ zweimal: erst neuer Vorschlag, dann Wunschtag-Frage mit Buchungslink (ohne KI)", async () => {
      const { conv, phone } = await leadMitVorschlag();
      st.queue.push([{ type: "tool_use", id: "v1", name: "termin_vorschlagen", input: { erneut: true } }], [{ type: "text", text: "(ignoriert)" }]);
      await text(phone, "Passt leider beides nicht");
      expect(st.ai).toBeGreaterThan(0);
      expect(gesendet().at(-1)!.buttons!.map((b) => b.id.split(":")[0])).toEqual(["slot", "slot", "andere_zeit"]);
      expect(await prisma.message.count({ where: { conversationId: conv.id, kind: STRECKE.vorschlag } })).toBe(2);

      st.ai = 0;
      waSend.mockClear();
      await text(phone, "Geht bei mir auch nicht");
      expect(st.ai).toBe(0);
      const link = gesendet().at(-1)!;
      expect(link.body).toContain(`/${slug}?c=`);
      expect(link.body).toMatch(/Ihren Wunschtag/);
      expect(link.body).toContain("bei Herrn Kannapinn");
      expect(await prisma.message.count({ where: { conversationId: conv.id, kind: STRECKE.vorschlag } })).toBe(2);
    });

    it("zweite Absage mit neuem Wunschtag: kein Link, der Assistent sucht dort", async () => {
      const { phone } = await leadMitVorschlag();
      st.queue.push([{ type: "tool_use", id: "v1", name: "termin_vorschlagen", input: { erneut: true } }], [{ type: "text", text: "(ignoriert)" }]);
      await text(phone, "passt nicht");
      st.ai = 0;
      waSend.mockClear();
      st.queue.push([{ type: "text", text: "Gern, dann schaue ich am Donnerstag." }]);
      await text(phone, "Passt auch nicht, aber Donnerstag ginge");
      expect(st.ai).toBeGreaterThan(0);
      expect(gesendet().some((s) => s.body.includes("?c="))).toBe(false);
    });
  });

  describe("Kalender voll", () => {
    it("termin_vorschlagen ohne freie Zeiten: Aufgabe und Hinweis für den Vermittler, der Lead hört „meldet sich persönlich“", async () => {
      cal.voll = true;
      const { lead, conv, phone } = await leadMitVorschlag({ vorschlag: false });
      st.queue.push([{ type: "tool_use", id: "v1", name: "termin_vorschlagen", input: { erneut: true } }], [{ type: "text", text: "(ignoriert)" }]);
      await text(phone, "Ja gerne, wann ginge es denn?");
      expect(st.ai).toBe(1);
      const antwort = gesendet().at(-1)!;
      expect(antwort.body).toBe("Vielen Dank! Herr Kannapinn meldet sich persönlich bei Ihnen, um einen passenden Termin zu finden.");
      expect(antwort.buttons).toBeNull();
      const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(l.followUpNote).toBe(KALENDER_VOLL_AUFGABE);
      expect(l.followUpAt!.getTime()).toBeLessThanOrEqual(Date.now());
      const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
      expect(c.needsAttention).toBe(true);
      expect(c.attentionReason).toMatch(/^Kalender voll/);
      expect(await prisma.leadSequence.count({ where: { leadId: lead.id, stoppedAt: null } })).toBe(0);
      expect(await prisma.message.count({ where: { conversationId: conv.id, kind: "kalender_voll" } })).toBe(1);
    });

    it("get_available_slots ohne freie Zeiten: ebenso deterministisch", async () => {
      cal.voll = true;
      const { lead, phone } = await leadMitVorschlag({ vorschlag: false });
      st.queue.push([{ type: "tool_use", id: "s1", name: "get_available_slots", input: {} }], [{ type: "text", text: "Leider ist gerade nichts frei." }]);
      await text(phone, "Wann hätte Herr Kannapinn denn Zeit?");
      expect(st.ai).toBe(1);
      expect(gesendet().at(-1)!.body).toBe("Vielen Dank! Herr Kannapinn meldet sich persönlich bei Ihnen, um einen passenden Termin zu finden.");
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBe(KALENDER_VOLL_AUFGABE);
    });
  });
});
