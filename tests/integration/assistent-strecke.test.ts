// Termin-Strecke mit Knöpfen (Ole, 17.11.2026), gegen die Test-DB, WhatsApp, Kalender und LLM simuliert:
//   Terminvorschlag der App mit Zeit-Knöpfen → Knopf-Klick bucht genau diese Zeit (ohne LLM) → Komplettcheck
//   [Ja, gern] → Vermerk am Termin, Vertragsfrage → Antwort ausgewertet am Lead → Abschluss mit Kalender-Knöpfen.
//   Nachfassen 2 Std. nach dem Terminvorschlag: gleiche Zeit-Knöpfe, nur 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr, nicht
//   nach Antwort, Abmeldung, „Kein Interesse“ oder pausiertem Assistenten.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
const st: { ai: number; queue: Block[][] } = { ai: 0, queue: [] };
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
      create: async () => {
        st.ai++;
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
import { runBotTurn } from "@/lib/whatsapp/bot";
import { runSequences } from "@/lib/lead-sequences";
import { runStreckeAbschliessen, STRECKE } from "@/lib/whatsapp/termin-strecke";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const HOUR = 3600_000;

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

  async function leadMitChat(o: { qualificationData?: Record<string, string>; now?: Date } = {}) {
    const now = o.now ?? new Date();
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: {
        customerId,
        name: "Julia Schneider",
        phone,
        email: "julia@example.com",
        source: "Privatschutz",
        status: "Im Gespräch",
        reached: true,
        outreachAt: now,
        formData: [
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
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });

  it("Terminvorschlag mit Zeit-Knöpfen, Klick bucht genau diese Zeit, Komplettcheck „Ja, gern“, Verträge, Abschluss, Kalender", async () => {
    const { lead, conv, phone } = await leadMitChat({ qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", beruf: "Angestellt, nicht öffentlicher Dienst", wohnflaeche: "95 m²" } });
    // 1. Der Assistent entscheidet sich für den Vorschlag, die App schreibt ihn mit Knöpfen
    st.queue.push([{ type: "tool_use", id: "t1", name: "termin_vorschlagen", input: {} }], [{ type: "text", text: "(ignoriert)" }]);
    await runBotTurn(conv.id);
    const vorschlag = gesendet().at(-1)!;
    expect(vorschlag.art).toBe("buttons");
    expect(vorschlag.body).toMatch(/^Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten\. Passt Ihnen .+ oder .+\?$/);
    expect(vorschlag.buttons!.map((b) => b.id.split(":")[0])).toEqual(["slot", "slot", "andere_zeit"]);
    expect(vorschlag.buttons!.at(-1)!.title).toBe("Andere Zeit");
    for (const b of vorschlag.buttons!) expect(b.title.length).toBeLessThanOrEqual(20);
    const merker = await prisma.message.findFirst({ where: { conversationId: conv.id, kind: STRECKE.vorschlag } });
    const starts = (JSON.parse(merker!.body!) as { starts: string[] }).starts;
    expect(vorschlag.buttons![1].id).toBe(`slot:${starts[1]}`);

    // 2. Klick auf die zweite Zeit: die App bucht genau diese Zeit, ohne LLM
    waSend.mockClear();
    st.ai = 0;
    await knopf(phone, vorschlag.buttons![1].id, vorschlag.buttons![1].title);
    expect(st.ai).toBe(0);
    const appt = await prisma.appointment.findFirst({ where: { leadId: lead.id, status: "booked" } });
    expect(appt?.startsAt.toISOString()).toBe(starts[1]);
    const [buchung, komplett] = gesendet();
    expect(buchung.art).toBe("text");
    expect(buchung.body).toMatch(/^Ihr Videotermin ist gebucht: \*.+\*\.\nHier ist Ihr Link: https:\/\/meet\.google\.com\/abc-defg-hij\n\nHerr Kannapinn hält sich diese Zeit nur für Sie frei/);
    // alle Angaben fürs Angebot bekannt: gleich der Komplettcheck mit Knöpfen
    expect(komplett.art).toBe("buttons");
    expect(komplett.body).toBe(
      "Danke! Soll Herr Kannapinn im Termin auch kurz schauen, ob Sie und Ihre Familie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können? Das dauert nur ein paar Minuten länger.",
    );
    expect(komplett.buttons).toEqual([
      { id: "komplettcheck:ja", title: "Ja, gern" },
      { id: "komplettcheck:nein", title: "Nein, danke" },
    ]);

    // 3. „Ja, gern“: Vermerk am Termin, Frage nach den Verträgen (ohne LLM, kein „Kein Bedarf“)
    waSend.mockClear();
    await knopf(phone, "komplettcheck:ja", "Ja, gern");
    expect(st.ai).toBe(0);
    expect((await prisma.appointment.findUnique({ where: { id: appt!.id } }))?.komplettcheck).toBe(true);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.status).not.toBe("Kein Interesse");
    expect(gesendet().map((s) => s.body)).toEqual([
      "Super! Welche Versicherungen haben Sie und Ihre Familie heute schon? Zum Beispiel Haftpflicht, Hausrat, Unfall, Berufsunfähigkeit, Rechtsschutz, Kfz, Kranken- oder Lebensversicherung und Altersvorsorge. Gern auch mit Gesellschaft.",
    ]);

    // 4. Antwort frei: ausgewertet (hier ohne KI-Werkzeug: Rückfall per Muster), am Lead gespeichert, Abschluss
    waSend.mockClear();
    await text(phone, "Haftpflicht bei der HUK, eine BU und Kfz");
    const l = await prisma.lead.findUnique({ where: { id: lead.id }, select: { vorvertraege: true } });
    expect((l?.vorvertraege as { liste: { sparte: string; gesellschaft: string | null }[] }).liste.map((v) => [v.sparte, v.gesellschaft])).toEqual([
      ["Haftpflicht", "HUK"],
      ["Berufsunfähigkeit", null],
      ["Kfz", null],
    ]);
    const abschluss = gesendet().at(-1)!;
    expect(abschluss.body).toBe(
      "Danke, das schaut sich Herr Kannapinn im Termin mit an.\n\nBitte legen Sie zum Termin bereit:\n• Ihre bisherigen Policen, gern auch von Ihren anderen Verträgen\n• Ihre IBAN, falls Sie direkt abschließen möchten\n\n" +
        "Die Einladung mit Kalendereintrag habe ich Ihnen an julia@example.com geschickt. *Haben Sie sich den Termin schon im Kalender eingetragen?*",
    );
    expect(abschluss.buttons).toEqual([
      { id: "kalender:ja", title: "Ja" },
      { id: "kalender:gleich", title: "Mache ich gleich" },
    ]);

    // 5. „Mache ich gleich“: zugesagt
    waSend.mockClear();
    await knopf(phone, "kalender:gleich", "Mache ich gleich");
    expect((await prisma.appointment.findUnique({ where: { id: appt!.id } }))?.confirmedAt).not.toBeNull();
    expect(gesendet()[0].body).toMatch(/^Danke! Die Einladung mit Kalendereintrag haben Sie per E-Mail\. Bis .+ um .+ Uhr\.$/);
    // Doppelter Klick schickt nichts doppelt
    waSend.mockClear();
    await knopf(phone, "komplettcheck:ja", "Ja, gern");
    expect(waSend).not.toHaveBeenCalled();
  });

  it("Ja/Nein-Angabe als Knöpfe, Payload gibt dem Assistenten die Frage; „Nein, danke“ beim Komplettcheck führt direkt zum Abschluss", async () => {
    const { lead, conv, phone } = await leadMitChat({ qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95" } });
    const start = slotsAb(cal.base)[0].start;
    await knopf(phone, `slot:${start}`, "Heute 16 Uhr");
    const [, folge] = gesendet();
    expect(folge.body).toBe("Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Sind Sie im öffentlichen Dienst tätig?");
    expect(folge.buttons).toEqual([
      { id: "folge:oeffentlicherDienst:ja", title: "Ja" },
      { id: "folge:oeffentlicherDienst:nein", title: "Nein" },
    ]);
    // Antwort per Knopf: der Assistent hält fest; letzte Frage → die App schickt den Komplettcheck
    waSend.mockClear();
    st.queue.push([{ type: "tool_use", id: "q1", name: "record_qualification", input: { zusammenfassung: "x", angaben: { beruf: "nicht im öffentlichen Dienst" } } }], [{ type: "text", text: "Danke, notiert." }]);
    await knopf(phone, "folge:oeffentlicherDienst:nein", "Nein");
    expect(st.ai).toBeGreaterThan(0);
    const komplett = gesendet().at(-1)!;
    expect(komplett.body).toMatch(/^Danke! Soll Herr Kannapinn im Termin auch kurz schauen/);
    expect(komplett.buttons?.map((b) => b.id)).toEqual(["komplettcheck:ja", "komplettcheck:nein"]);
    // „Nein, danke“ mit Payload: kein „Kein Interesse“, sondern Abschluss
    waSend.mockClear();
    await knopf(phone, "komplettcheck:nein", "Nein, danke");
    const l = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(l?.status).not.toBe("Kein Interesse");
    const appt = await prisma.appointment.findFirst({ where: { leadId: lead.id, status: "booked" } });
    expect(appt?.komplettcheck).toBe(false);
    expect(gesendet()[0].body).toMatch(/^Alles klar, damit ist alles Wichtige für Herrn Kannapinn notiert\.\n\nBitte legen Sie zum Termin bereit:\n• Ihre bisherigen Policen, falls vorhanden\n/);
    void conv;
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

  it("Komplettcheck ohne Antwort: nach einer Stunde trotzdem Abschluss (nicht nachhaken), nur im Fenster", async () => {
    // Di 17.11.2026, 12 Uhr deutscher Zeit; die letzte Nachricht des Leads liegt davor
    const now = new Date("2026-11-17T11:00:00Z");
    const { conv, lead } = await leadMitChat({ now: new Date(now.getTime() - 3 * HOUR) });
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, conversationId: conv.id, startsAt: new Date(Math.max(now.getTime(), Date.now()) + 2 * 24 * HOUR), mode: "video", status: "booked" } });
    await prisma.conversation.update({ where: { id: conv.id }, data: { windowExpiresAt: new Date(Math.max(now.getTime(), Date.now()) + 10 * HOUR) } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "internal", kind: STRECKE.komplettFrage, body: JSON.stringify({ appointmentId: appt.id }), sentBy: "bot", createdAt: new Date(now.getTime() - 30 * 60_000) } });
    expect((await runStreckeAbschliessen(now)).gesendet).toBe(0); // erst 30 Minuten
    await prisma.message.updateMany({ where: { conversationId: conv.id, kind: STRECKE.komplettFrage }, data: { createdAt: new Date(now.getTime() - 2 * HOUR) } });
    expect((await runStreckeAbschliessen(new Date("2026-11-17T20:00:00Z"))).gesendet).toBe(0); // 21 Uhr: nicht
    expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
    expect(gesendet().at(-1)!.body).toMatch(/^Damit ist alles Wichtige für Herrn Kannapinn notiert\.[\s\S]*\*Haben Sie sich den Termin schon im Kalender eingetragen\?\*$/);
    expect((await runStreckeAbschliessen(now)).gesendet).toBe(0); // nur einmal
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
    cal.base = NOW.getTime();
    cal.busy.clear();
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });
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
