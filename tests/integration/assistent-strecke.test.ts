// Termin-Strecke mit Knöpfen (Ole, 17.11.2026; Reihenfolge P2), gegen die Test-DB, WhatsApp, Kalender und LLM simuliert:
//   Terminvorschlag der App mit Zeit-Knöpfen → Knopf-Klick bucht genau diese Zeit (ohne LLM, auch ohne E-Mail) →
//   Komplettcheck [Ja, gern] → offene Angebotsfragen → bei Ja Vertragsfrage, Policen-Einladung → Abschluss mit
//   Kalender-Knöpfen. Policen-Bitte in jedem Pfad genau einmal. Rückfall ohne Antwort: nächster Schritt, nie Abschluss
//   bei offenen Angebotsfragen.
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
import { KALENDER_FRAGE_RE } from "@/lib/whatsapp/gespraech";
import { EINLADUNG_RE } from "@/lib/policen/regeln";
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

  async function leadMitChat(o: { qualificationData?: Record<string, string>; now?: Date; email?: string | null } = {}) {
    const now = o.now ?? new Date();
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: {
        customerId,
        name: "Julia Schneider",
        phone,
        email: o.email === undefined ? "julia@example.com" : o.email,
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

  // Policen-Bitte (P2, Ole 17.11.2026): jeder Lead genau einmal, ob Ja, Nein oder ohne Antwort
  const policenBitten = (s: Sent[]) => s.filter((x) => EINLADUNG_RE.test(x.body)).length;

  it("Reihenfolge P2, Komplettcheck „Ja, gern“: Buchung, Komplettcheck, Angebotsfrage, Vertragsfrage, Policen-Einladung, Abschluss, Kalender", async () => {
    const { lead, conv, phone } = await leadMitChat({ qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95 m²" } });
    // 1. Der Assistent entscheidet sich für den Vorschlag, die App schreibt ihn mit Knöpfen
    st.queue.push([{ type: "tool_use", id: "t1", name: "termin_vorschlagen", input: {} }], [{ type: "text", text: "(ignoriert)" }]);
    await runBotTurn(conv.id);
    const vorschlag = gesendet().at(-1)!;
    expect(vorschlag.art).toBe("buttons");
    expect(vorschlag.body).toMatch(/^Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten\. Passt Ihnen .+ oder .+\?$/);
    expect(vorschlag.buttons!.map((b) => b.id.split(":")[0])).toEqual(["slot", "slot", "andere_zeit"]);
    for (const b of vorschlag.buttons!) expect(b.title.length).toBeLessThanOrEqual(20);
    const merker = await prisma.message.findFirst({ where: { conversationId: conv.id, kind: STRECKE.vorschlag } });
    const starts = (JSON.parse(merker!.body!) as { starts: string[] }).starts;
    expect(vorschlag.buttons![1].id).toBe(`slot:${starts[1]}`);

    // 2. Klick auf die zweite Zeit: die App bucht genau diese Zeit, ohne LLM; danach gleich der Komplettcheck (nicht die
    //    Angebotsfrage, obwohl eine offen ist)
    const ab = gesendet().length;
    st.ai = 0;
    await knopf(phone, vorschlag.buttons![1].id, vorschlag.buttons![1].title);
    expect(st.ai).toBe(0);
    const appt = await prisma.appointment.findFirst({ where: { leadId: lead.id, status: "booked" } });
    expect(appt?.startsAt.toISOString()).toBe(starts[1]);
    const [buchung, komplett] = gesendet().slice(ab);
    expect(buchung.art).toBe("text");
    expect(buchung.body).toMatch(
      /^Ihr Videotermin ist gebucht: \*.+\*\.\nHier ist Ihr Link: https:\/\/meet\.google\.com\/abc-defg-hij\nDie Einladung mit Kalendereintrag ist an \S+@\S+ unterwegs\. Falls die Adresse nicht stimmt, schreiben Sie mir einfach die richtige\.\n\nHerr Kannapinn reserviert diese Zeit nur für Sie und bereitet Ihre Beiträge vorab vor\./,
    );
    expect(komplett.art).toBe("buttons");
    expect(komplett.body).toBe(
      "Danke! Soll Herr Kannapinn im Termin auch kurz schauen, ob Sie und Ihre Familie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können? Das dauert nur ein paar Minuten länger.",
    );
    expect(komplett.buttons).toEqual([
      { id: "komplettcheck:ja", title: "Ja, gern" },
      { id: "komplettcheck:nein", title: "Nein, danke" },
    ]);

    // 3. „Ja, gern“: Vermerk am Termin, dann zuerst die offene Angebotsfrage (Hauptangebot vor den Verträgen)
    const ab2 = gesendet().length;
    await knopf(phone, "komplettcheck:ja", "Ja, gern");
    expect(st.ai).toBe(0);
    expect((await prisma.appointment.findUnique({ where: { id: appt!.id } }))?.komplettcheck).toBe(true);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.status).not.toBe("Kein Interesse");
    const [frage] = gesendet().slice(ab2);
    expect(frage.body).toBe("Super! Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Sind Sie im öffentlichen Dienst tätig?");
    expect(frage.buttons?.map((b) => b.id)).toEqual(["folge:oeffentlicherDienst:ja", "folge:oeffentlicherDienst:nein"]);

    // 4. Antwort per Knopf: der Assistent hält fest; letzte Frage → die App schickt die Vertragsfrage
    const ab3 = gesendet().length;
    st.queue.push([{ type: "tool_use", id: "q1", name: "record_qualification", input: { zusammenfassung: "x", angaben: { beruf: "nicht im öffentlichen Dienst" } } }], [{ type: "text", text: "Danke, notiert." }]);
    await knopf(phone, "folge:oeffentlicherDienst:nein", "Nein");
    expect(gesendet().slice(ab3).map((s) => s.body)).toEqual([
      "Danke! Welche Versicherungen haben Sie und Ihre Familie heute schon? Zum Beispiel Haftpflicht, Hausrat, Unfall, Berufsunfähigkeit, Rechtsschutz, Kfz, Kranken- oder Lebensversicherung und Altersvorsorge. Gern auch mit Gesellschaft.",
    ]);

    // 5. Antwort frei: ausgewertet (Rückfall per Muster), am Lead gespeichert, Policen-Einladung, Abschluss
    const ab4 = gesendet().length;
    await text(phone, "Haftpflicht bei der HUK, eine BU und Kfz");
    const l = await prisma.lead.findUnique({ where: { id: lead.id }, select: { vorvertraege: true } });
    expect((l?.vorvertraege as { liste: { sparte: string; gesellschaft: string | null }[] }).liste.map((v) => [v.sparte, v.gesellschaft])).toEqual([
      ["Haftpflicht", "HUK"],
      ["Berufsunfähigkeit", null],
      ["Kfz", null],
    ]);
    const [einladung, abschluss] = gesendet().slice(ab4);
    expect(einladung.body).toMatch(EINLADUNG_RE);
    expect(abschluss.body).toBe(
      "Danke, das schaut sich Herr Kannapinn im Termin mit an.\n\nBitte legen Sie zum Termin bereit:\n• Ihre übrigen Policen, falls Sie sie nicht geschickt haben\n• die Geburtsdaten aller Personen, die mitversichert werden sollen\n• Ihre IBAN, falls Sie direkt abschließen möchten\n\n" +
        "Die Einladung mit Kalendereintrag habe ich Ihnen an julia@example.com geschickt. *Haben Sie sich den Termin schon im Kalender eingetragen?*",
    );
    expect(abschluss.buttons).toEqual([
      { id: "kalender:ja", title: "Ja" },
      { id: "kalender:gleich", title: "Mache ich gleich" },
    ]);
    expect(policenBitten(gesendet())).toBe(1);

    // 6. „Mache ich gleich“: zugesagt
    const ab5 = gesendet().length;
    await knopf(phone, "kalender:gleich", "Mache ich gleich");
    expect((await prisma.appointment.findUnique({ where: { id: appt!.id } }))?.confirmedAt).not.toBeNull();
    expect(gesendet()[ab5].body).toMatch(/^Danke! Die Einladung mit Kalendereintrag haben Sie per E-Mail\. Bis .+ um .+ Uhr\.$/);
    // Doppelter Klick schickt nichts doppelt
    waSend.mockClear();
    await knopf(phone, "komplettcheck:ja", "Ja, gern");
    expect(waSend).not.toHaveBeenCalled();
  });

  it("neue E-Mail im Chat: bisherige bleibt als weitere E-Mail; Zusage auf die Kalenderfrage ohne Namen des Leads; Löschung leert alles", async () => {
    const { lead, phone } = await leadMitChat();
    st.queue.push([{ type: "tool_use", id: "e1", name: "update_email", input: { email: "Julia.Neu@Example.com" } }], [{ type: "text", text: "Danke, ist übernommen." }]);
    await text(phone, "Bitte an julia.neu@example.com");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { email: true, weitereEmails: true } });
    expect(l).toEqual({ email: "julia.neu@example.com", weitereEmails: ["julia@example.com"] });
    // Noch einmal zurück: keine Dubletten
    st.queue.push([{ type: "tool_use", id: "e2", name: "update_email", input: { email: "JULIA@example.com" } }], [{ type: "text", text: "Gern." }]);
    await text(phone, "Doch lieber die alte Adresse julia@example.com");
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { email: true, weitereEmails: true } })).toEqual({ email: "julia@example.com", weitereEmails: ["julia.neu@example.com"] });

    // Kalenderfrage mit Text bestätigt: der Assistent bekommt den Dank ohne Namen des Leads vorgegeben
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, startsAt: new Date("2026-12-02T09:00:00.000Z"), mode: "video", status: "booked", conversationId: (await prisma.conversation.findFirstOrThrow({ where: { leadId: lead.id } })).id } });
    st.queue.push([{ type: "tool_use", id: "z1", name: "termin_zugesagt", input: {} }], [{ type: "text", text: "Vielen Dank! Ihr Termin mit Herrn Kannapinn am Mittwoch, 02.12. um 10 Uhr ist vermerkt. Bis dahin!" }]);
    await text(phone, "Ja, hab ich eingetragen");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).confirmedAt).not.toBeNull();
    const toolResult = JSON.stringify(st.reqs.at(-1));
    expect(toolResult).toContain("Vielen Dank! Ihr Termin mit Herrn Kannapinn am Mittwoch, 02.12. um 10 Uhr ist vermerkt. Bis dahin!");
    expect(toolResult).toContain("ohne Namen des Leads");

    const { eraseLead } = await import("@/lib/erasure");
    await eraseLead(lead.id);
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { email: true, weitereEmails: true } })).toEqual({ email: null, weitereEmails: [] });
  });

  it("„Nein, danke“: erst die offene Angebotsfrage, dann der Abschluss mit enger Policen-Bitte (genau einmal)", async () => {
    const { lead, phone } = await leadMitChat({ qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95" } });
    const start = slotsAb(cal.base)[0].start;
    await knopf(phone, `slot:${start}`, "Heute 16 Uhr");
    const [, komplett] = gesendet();
    expect(komplett.buttons?.map((b) => b.id)).toEqual(["komplettcheck:ja", "komplettcheck:nein"]);
    // „Nein, danke“ mit Payload: kein „Kein Interesse“, sondern die Angebotsfrage
    const ab = gesendet().length;
    await knopf(phone, "komplettcheck:nein", "Nein, danke");
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.status).not.toBe("Kein Interesse");
    expect((await prisma.appointment.findFirst({ where: { leadId: lead.id, status: "booked" } }))?.komplettcheck).toBe(false);
    const [frage] = gesendet().slice(ab);
    expect(frage.body).toBe("Alles klar. Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Sind Sie im öffentlichen Dienst tätig?");
    expect(frage.buttons).toEqual([
      { id: "folge:oeffentlicherDienst:ja", title: "Ja" },
      { id: "folge:oeffentlicherDienst:nein", title: "Nein" },
    ]);
    // Letzte Angabe: der Abschluss ohne Vertragsfrage, ohne „bestehende Verträge“, mit der engen Policen-Bitte
    const ab2 = gesendet().length;
    st.queue.push([{ type: "tool_use", id: "q1", name: "record_qualification", input: { zusammenfassung: "x", angaben: { beruf: "nicht im öffentlichen Dienst" } } }], [{ type: "text", text: "Danke, notiert." }]);
    await knopf(phone, "folge:oeffentlicherDienst:nein", "Nein");
    expect(st.ai).toBeGreaterThan(0);
    const abschluss = gesendet().slice(ab2);
    expect(abschluss).toHaveLength(1);
    expect(abschluss[0].body).toBe(
      "Danke, damit sind alle wichtigen Angaben für Herrn Kannapinn notiert.\n\nBitte legen Sie zum Termin bereit:\n• die Geburtsdaten aller Personen, die mitversichert werden sollen\n• Ihre IBAN, falls Sie direkt abschließen möchten\n\n" +
        "Falls Sie schon eine Haftpflicht- und Hausratversicherung haben: Schicken Sie mir gern ein Foto der Police, dann vergleicht Herr Kannapinn direkt und achtet auf die Kündigungsfrist.\n\n" +
        "Die Einladung mit Kalendereintrag habe ich Ihnen an julia@example.com geschickt. *Haben Sie sich den Termin schon im Kalender eingetragen?*",
    );
    expect(abschluss[0].buttons?.map((b) => b.id)).toEqual(["kalender:ja", "kalender:gleich"]);
    expect(policenBitten(gesendet())).toBe(1);
  });

  it("E-Mail unbekannt: Termin sofort reserviert, danach die Frage nach der Adresse; die Adresse bringt Einladung und Komplettcheck", async () => {
    const { lead, conv, phone } = await leadMitChat({ email: null });
    const start = slotsAb(cal.base)[0].start;
    st.ai = 0;
    await knopf(phone, `slot:${start}`, "Heute 16 Uhr");
    expect(st.ai).toBe(0);
    expect(await prisma.appointment.count({ where: { leadId: lead.id, status: "booked" } })).toBe(1);
    const [buchung, frage] = gesendet();
    expect(buchung.body).toMatch(/^Ihr Videotermin ist gebucht: \*.+\*\.\nHier ist Ihr Link: \S+\n\nHerr Kannapinn reserviert diese Zeit nur für Sie/);
    expect(buchung.body).not.toContain("unterwegs");
    expect(frage.body).toBe("Damit ich Ihnen die Einladung mit Kalendereintrag schicken kann: An welche E-Mail-Adresse darf sie gehen?");
    // Adresse kommt: ohne Assistent übernommen, Einladung nach, gleich der Komplettcheck
    const ab = gesendet().length;
    await text(phone, "Klar, julia.becker@example.com");
    expect(st.ai).toBe(0);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).contactEmail).toBe("julia.becker@example.com");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).email).toBe("julia.becker@example.com");
    const [k] = gesendet().slice(ab);
    expect(k.body).toBe(
      "Danke! Die Einladung mit Kalendereintrag ist an julia.becker@example.com unterwegs. Soll Herr Kannapinn im Termin auch kurz schauen, ob Sie und Ihre Familie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können? Das dauert nur ein paar Minuten länger.",
    );
    expect(k.buttons?.map((b) => b.id)).toEqual(["komplettcheck:ja", "komplettcheck:nein"]);
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

  describe("Rückfall ohne Antwort (nach einer Stunde der nächste Schritt, nie Abschluss bei offenen Angebotsfragen)", () => {
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

    it("Komplettcheck ohne Antwort, Angebotsfragen offen: erste Angebotsfrage, kein Abschluss", async () => {
      const t = await terminMitMerker(STRECKE.komplettFrage, { qualificationData: { versichern: "Familie", vorhanden: "neu" } });
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0); // erst 30 Minuten
      await t.alt();
      expect((await runStreckeAbschliessen(new Date("2026-11-17T20:00:00Z"))).gesendet).toBe(0); // 21 Uhr: nicht
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      expect(an(t.phone).at(-1)!.body).toBe("Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Wie lautet Ihr Geburtsdatum?");
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0); // die Angebotsfrage bleibt stehen, kein Abschluss
      expect(an(t.phone).some((s) => KALENDER_FRAGE_RE.test(s.body))).toBe(false);
    });

    it("Pfad „keine Antwort“ komplett: Komplettcheck offen → Angebotsfrage (Rückfall) → Antwort → Abschluss mit enger Policen-Bitte, genau einmal", async () => {
      const t = await terminMitMerker(STRECKE.komplettFrage, { qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95" } });
      await t.alt();
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      expect(an(t.phone).at(-1)!.body).toBe("Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Sind Sie im öffentlichen Dienst tätig?");
      expect(policenBitten(an(t.phone))).toBe(0);
      // Antwort auf die letzte Angebotsfrage: keine Vertragsfrage (Komplettcheck unbeantwortet), sondern der Abschluss
      st.queue.push([{ type: "tool_use", id: "q1", name: "record_qualification", input: { zusammenfassung: "x", angaben: { beruf: "nicht im öffentlichen Dienst" } } }], [{ type: "text", text: "Danke, notiert." }]);
      await knopf(t.phone, "folge:oeffentlicherDienst:nein", "Nein");
      const bodies = an(t.phone).map((s) => s.body);
      expect(bodies.some((b) => /Welche Versicherungen ha(ben|st)/.test(b))).toBe(false);
      const abschluss = bodies.at(-1)!;
      expect(abschluss).toMatch(/^Danke, damit sind alle wichtigen Angaben für Herrn Kannapinn notiert\./);
      expect(abschluss).toContain("Falls Sie schon eine Haftpflicht- und Hausratversicherung haben: Schicken Sie mir gern ein Foto der Police");
      expect(abschluss).not.toContain("bestehenden Verträge");
      expect(KALENDER_FRAGE_RE.test(abschluss)).toBe(true);
      expect(policenBitten(an(t.phone))).toBe(1);
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0);
    });

    it("Komplettcheck ohne Antwort, alles bekannt: Abschluss mit enger Policen-Bitte, genau einmal", async () => {
      const t = await terminMitMerker(STRECKE.komplettFrage, { qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95", beruf: "Angestellt" } });
      await t.alt();
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      const body = an(t.phone).at(-1)!.body;
      expect(body).toMatch(/^Damit ist alles Wichtige für Herrn Kannapinn notiert\.[\s\S]*Falls Sie schon eine Haftpflicht- und Hausratversicherung haben: [\s\S]*\*Haben Sie sich den Termin schon im Kalender eingetragen\?\*$/);
      expect(body).not.toContain("bestehenden Verträge");
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0); // nur einmal
      expect(policenBitten(an(t.phone))).toBe(1);
    });

    it("Vertragsfrage ohne Antwort (Komplettcheck „Ja“): Abschluss, die volle Policen-Bitte kommt mit, genau einmal", async () => {
      const t = await terminMitMerker(STRECKE.vertragsfrage, { komplettcheck: true, qualificationData: { versichern: "Familie", vorhanden: "neu", geburt: "14.05.1985", wohnflaeche: "95", beruf: "Angestellt" } });
      await t.alt();
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      const body = an(t.phone).at(-1)!.body;
      expect(body).toContain("• Ihre bestehenden Verträge und Policen\n");
      expect(body).toContain("Gern können Sie vorab Fotos oder PDFs Ihrer Policen für Sachversicherungen (z. B. Haftpflicht, Hausrat, Kfz) hier in den Chat schicken, dann schaut Herr Kannapinn sie mit an.");
      expect(policenBitten(an(t.phone))).toBe(1);
    });

    it("Vertragsfrage ohne Antwort, Angebotsfragen offen: kein Abschluss", async () => {
      const t = await terminMitMerker(STRECKE.vertragsfrage, { komplettcheck: true, qualificationData: { versichern: "Familie", vorhanden: "neu" } });
      await t.alt();
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(0);
      expect(an(t.phone)).toHaveLength(0);
    });

    it("E-Mail-Frage ohne Antwort: der Komplettcheck folgt", async () => {
      const t = await terminMitMerker(STRECKE.emailFrage, { email: null });
      await t.alt();
      expect((await runStreckeAbschliessen(now)).gesendet).toBe(1);
      const k = an(t.phone).at(-1)!;
      expect(k.body).toMatch(/^Danke! Soll Herr Kannapinn im Termin auch kurz schauen/);
      expect(k.buttons?.map((b) => b.id)).toEqual(["komplettcheck:ja", "komplettcheck:nein"]);
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
