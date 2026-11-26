// KI-Hinweis nur in der ERSTEN Nachricht (Ole, 24.11.2026; KI-VO Art. 50 Abs. 1 und 5) und die Erinnerung an Leads, die
// nicht antworten (followup_nudge v5): neuer Wortlaut ohne „digitaler KI-Assistent“, mit der Sparte des Leads.
//   1. Jede erste Nachricht an einen Lead trägt den Hinweis, auf jedem Weg (Erstanschreiben in allen freigegebenen
//      Fassungen, Freitext, Antwort des Assistenten, Terminbestätigung nach einer Online-Buchung, Erinnerung als erste
//      Nachricht, Mail- und SMS-Strecke).
//   2. Die Erinnerung wiederholt ihn nicht (Vorlage und offenes Fenster), neue Fassung v5, alte v4 bis zur Freigabe.
//   3. Fragt der Lead, ob er mit einem Menschen schreibt, antwortet der Assistent immer ehrlich.
// Abläufe gegen die echte Test-Datenbank, 360dialog und Claude nachgebildet.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  script: [] as Array<{ content: unknown[] }>,
  calls: [] as Array<{ system: string; messages: unknown[] }>,
}));

vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (req: { system: string; messages: unknown[] }) => {
        h.calls.push(req);
        return h.script.shift() ?? { content: [{ type: "text", text: "Gern, wann passt es Ihnen?" }] };
      },
    };
  },
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { NoTemplateError, sendWhatsAppNotice, kiKennzeichnungOffen, type NoticePurpose } from "@/lib/whatsapp/templates";
import { templateBodyFor, templateNamesOf } from "@/lib/whatsapp/template-plan";
import { hasKiHinweis, kiHinweisNoetig } from "@/lib/whatsapp/ki-hinweis";
import { sendBookingConfirmation } from "@/lib/whatsapp/reminders";
import { sendOutreach } from "@/lib/whatsapp/outreach";
import { ERSTANSCHREIBEN_V6, ERSTANSCHREIBEN_V7, erstanschreibenV8, erstanschreibenV9 } from "@/lib/whatsapp/erstanschreiben";
import { runSequences, startSequence } from "@/lib/lead-sequences";
import { chooseFollowup } from "@/lib/whatsapp/followup";
import { erstmailInhalt, smsText } from "@/lib/mail-strecke/texte";
import { GESCHAEFTSZEITEN_STANDARD, nurSmsText } from "@/lib/mail-strecke/nur-sms";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };
const API_KEY = "d360-erst-key";
const KUNDE = "Allianz Versicherung Henrik Lohmann Generalvertretung";
/** [Firma] nach der bestehenden Firmen-Logik (lib/advisor-name.ts firmDisplayName) */
const FIRMA = "Versicherungsagentur Henrik Lohmann";
const HOUR = 3_600_000;

type Gesendet = {
  to: string;
  type: string;
  text?: { body: string };
  interactive?: { body: { text: string }; action: { buttons: { reply: { title: string } }[] } };
  template?: { name: string; components?: { type: string; parameters: { type: string; text?: string }[] }[] };
};
const sent: Gesendet[] = [];

function fake360(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/messages")) {
    sent.push(JSON.parse(String(init?.body)));
    return Promise.resolve(new Response(JSON.stringify({ messages: [{ id: `wamid.erst${sent.length}.${Math.random()}` }] }), { status: 200 }));
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

let customerId = "";
let phoneNumberId = "";
let n = 0;
const uid = () => Math.random().toString(36).slice(2, 10);
const telefon = () => `49176${String(Date.now()).slice(-5)}${String(++n).padStart(3, "0")}`;

const an = (to: string) => sent.filter((s) => s.to === to);
const vorlage = (to: string, i = -1) => an(to).filter((s) => s.type === "template").at(i)?.template;
const parameter = (to: string, i = -1) => vorlage(to, i)?.components?.find((c) => c.type === "body")?.parameters.map((p) => p.text) ?? [];
const freitext = (to: string, i = -1) => {
  const m = an(to)
    .filter((s) => s.type === "text" || s.type === "interactive")
    .at(i);
  return m?.text?.body ?? m?.interactive?.body.text ?? "";
};
const knoepfe = (to: string) =>
  an(to)
    .filter((s) => s.type === "interactive")
    .at(-1)
    ?.interactive?.action.buttons.map((b) => b.reply.title) ?? [];
/** Gespeicherte ausgehende Nachrichten eines Chats (älteste zuerst), wie Verlauf und Assistent sie sehen. */
const ausgehend = (phone: string) =>
  prisma.message.findMany({ where: { conversation: { customerId, contactPhone: phone }, direction: "outbound" }, orderBy: { createdAt: "asc" }, select: { body: true, kind: true, purpose: true } });

/** Freigegebene Vorlage des Kunden, Text wie eingereicht ([Firma] eingesetzt). */
async function freigeben(purpose: NoticePurpose, name: string, form: "du" | "sie" | "sie_ohne_name", extra: { body?: string; headerFormat?: string } = {}) {
  const body = extra.body ?? templateBodyFor(purpose, templateNamesOf(KUNDE), form);
  await prisma.messageTemplate.upsert({
    where: { customerId_name_language: { customerId, name, language: "de" } },
    create: { customerId, name, language: "de", purpose, category: "marketing", status: "approved", auto: true, body, headerFormat: extra.headerFormat ?? null },
    update: { status: "approved", body },
  });
}
const V4_SIE = `Guten Tag {{1}}, hier ist nochmal der digitale KI-Assistent von ${FIRMA}. Sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten.`;
const V4_OHNE = `Guten Tag, hier ist nochmal der digitale KI-Assistent von ${FIRMA}. Sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten.`;

/** Lead (Herr Kranert, Kfz) mit Chat; mit `erst` steht das Erstanschreiben samt KI-Fußzeile schon im Chat. */
async function lead(o: { source?: string | null; formData?: unknown[]; fensterOffen?: boolean; erst?: boolean; erstFehlgeschlagen?: boolean; name?: string; ohneChat?: boolean } = {}) {
  const phone = telefon();
  const l = await prisma.lead.create({
    data: {
      customerId,
      name: o.name ?? "Peter Kranert",
      phone,
      source: o.source === undefined ? "Kfz-Versicherung" : o.source,
      status: "Neuer Lead",
      formData: [{ label: "Anrede", value: "Herr" }, ...(o.formData ?? [])] as never,
      outreachAt: new Date(),
      outreachStatus: "sent",
    },
  });
  if (o.ohneChat) return { lead: l, phone, conversationId: "" };
  const c = await prisma.conversation.create({
    data: { customerId, contactPhone: phone, contactName: l.name, leadId: l.id, botActive: true, windowExpiresAt: o.fensterOffen ? new Date(Date.now() + 20 * HOUR) : null, lastMessageAt: new Date(Date.now() - 9 * HOUR) },
  });
  if (o.erst || o.erstFehlgeschlagen) {
    await prisma.message.create({
      data: {
        conversationId: c.id,
        direction: "outbound",
        kind: "template",
        sentBy: "system",
        purpose: "outreach_kfz",
        status: o.erstFehlgeschlagen ? "failed" : "delivered",
        body: "[Erstinformation als PDF]\nHallo Herr Kranert, danke für Ihre Anfrage zur Kfz-Versicherung! *Für Ihr jetziges Auto oder ein neues?*\n\nDigitaler KI-Assistent",
        createdAt: new Date(Date.now() - 9 * HOUR),
      },
    });
  }
  return { lead: l, phone, conversationId: c.id };
}

/** Schritt „Erinnerung“ (8 Std.) der Abfolge „Chat ruht“ jetzt senden (wie „Jetzt senden“ am Kontakt). */
async function erinnerungSenden(leadId: string) {
  const seq = await prisma.leadSequence.create({ data: { leadId, customerId, kind: "silent", step: 1, startedAt: new Date(Date.now() - 8 * HOUR), nextAt: new Date(Date.now() - 60_000) } });
  await runSequences(new Date(), { nurId: seq.id, sofort: true });
  return prisma.leadSequence.findUniqueOrThrow({ where: { id: seq.id } });
}

async function inbound(from: string, body: string) {
  await handleInboundPayload({
    entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, contacts: [{ profile: { name: "Peter Kranert" } }], messages: [{ from, id: `wamid.in${++n}.${uid()}`, type: "text", text: { body } }] } }] }],
  });
}

beforeAll(() => requireTestDb());
beforeEach(async () => {
  process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  process.env.APP_URL = "https://app.example.de";
  sent.length = 0;
  h.script.length = 0;
  h.calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(fake360));
  await prisma.customer.deleteMany({ where: { name: KUNDE } });
  customerId = (await makeCustomer({ name: KUNDE, leadAddress: "sie" })).id;
  phoneNumberId = `pn-erst-${uid()}`;
  await prisma.whatsAppAccount.create({ data: { customerId, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret(API_KEY), phoneNumberId } });
  await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, outreachDelayMin: 0, followUpSequencesEnabled: true } });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.lead.deleteMany({ where: { customerId } });
  await cleanupCustomer(customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

describe("Erinnerung (followup_nudge): neuer Wortlaut, ohne KI-Hinweis", () => {
  const SIE = `Guten Tag Herr Kranert, hier ist noch einmal ${FIRMA}. Sollen wir mit Ihrer Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.`;

  it("offenes 24-h-Fenster: Freitext im neuen Wortlaut mit Sparte und Knöpfen, kein KI-Hinweis (stand schon im Erstanschreiben)", async () => {
    const { lead: l, phone } = await lead({ fensterOffen: true, erst: true });
    const seq = await erinnerungSenden(l.id);
    expect((seq.log as { result: string; purpose?: string }[]).at(-1)).toMatchObject({ result: "sent", purpose: "followup_nudge" });
    expect(an(phone)).toHaveLength(1);
    expect(an(phone)[0].type).toBe("interactive");
    expect(freitext(phone)).toBe(SIE);
    expect(knoepfe(phone)).toEqual(["Ja, weitermachen", "Kein Bedarf mehr"]);
    const out = await ausgehend(phone);
    expect(out.at(-1)).toMatchObject({ body: SIE, kind: "text", purpose: "followup_nudge" });
    expect(hasKiHinweis(out.at(-1)!.body)).toBe(false);
    // der Hinweis aus der ersten Nachricht gilt weiter: die nächste Antwort des Assistenten bekommt keinen neuen Vorspann
    expect(kiHinweisNoetig({ outbound: out.map((m) => m.body), previousAt: new Date(), now: new Date() })).toBeNull();
  });

  it("ohne Sparte „mit Ihrer Anfrage“, mit Tiername „zur Tierkrankenversicherung für Minka“", async () => {
    const ohne = await lead({ fensterOffen: true, erst: true, source: null });
    await erinnerungSenden(ohne.lead.id);
    expect(freitext(ohne.phone)).toBe(`Guten Tag Herr Kranert, hier ist noch einmal ${FIRMA}. Sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten.`);
    const tier = await lead({ fensterOffen: true, erst: true, source: "TKV Katze", formData: [{ label: "Tierart", value: "Katze" }, { label: "Tiername", value: "Minka" }] });
    await erinnerungSenden(tier.lead.id);
    expect(freitext(tier.phone)).toBe(`Guten Tag Herr Kranert, hier ist noch einmal ${FIRMA}. Sollen wir mit Ihrer Anfrage zur Tierkrankenversicherung für Minka weitermachen? Es dauert nur ein paar Minuten.`);
    const hausrat = await lead({ fensterOffen: true, erst: true, source: "Privatschutz", formData: [{ label: "Welche Versicherungen interessieren Sie?", value: "Hausrat" }] });
    await erinnerungSenden(hausrat.lead.id);
    expect(freitext(hausrat.phone)).toContain("Sollen wir mit Ihrer Anfrage zur Hausratversicherung weitermachen?");
  });

  it("Fenster zu: bis zur Freigabe der neuen Fassung die alte v4 (nur der Name), danach v5 mit der Anfrage samt Sparte; nie die Fassung mit KI-Fußzeile", async () => {
    await freigeben("followup_nudge", "pg_followup_nudge_v4_sie", "sie", { body: V4_SIE });
    await freigeben("followup_nudge", "pg_followup_nudge_v4_sie_ohne_name", "sie_ohne_name", { body: V4_OHNE });
    // die Fassung mit KI-Fußzeile ist schon freigegeben, die normale v5 noch nicht
    await freigeben("followup_nudge", "pg_followup_nudge_v5_ki_sie", "sie");
    const a = await lead({ erst: true });
    const seqA = await erinnerungSenden(a.lead.id);
    expect((seqA.log as { result: string }[]).at(-1)).toMatchObject({ result: "template" });
    expect(vorlage(a.phone)?.name).toBe("pg_followup_nudge_v4_sie");
    expect(parameter(a.phone)).toEqual(["Herr Kranert"]);

    // Meta gibt die neue Fassung frei: ab jetzt v5, Platzhalter Name und Anfrage samt Sparte
    await freigeben("followup_nudge", "pg_followup_nudge_v5_sie", "sie");
    await freigeben("followup_nudge", "pg_followup_nudge_v5_sie_ohne_name", "sie_ohne_name");
    const b = await lead({ erst: true });
    await erinnerungSenden(b.lead.id);
    expect(vorlage(b.phone)?.name).toBe("pg_followup_nudge_v5_sie");
    expect(parameter(b.phone)).toEqual(["Herr Kranert", "Ihrer Anfrage zur Kfz-Versicherung"]);
    const out = await ausgehend(b.phone);
    expect(out.at(-1)).toMatchObject({ body: SIE, kind: "template", purpose: "followup_nudge" });
    expect(hasKiHinweis(out.at(-1)!.body)).toBe(false);
    // ohne Nachnamen: Fassung ohne Namen, der einzige Platzhalter ist die Anfrage
    const c = await lead({ erst: true, name: "Peter", source: "Zahnzusatz" });
    await erinnerungSenden(c.lead.id);
    expect(vorlage(c.phone)?.name).toBe("pg_followup_nudge_v5_sie_ohne_name");
    expect(parameter(c.phone)).toEqual(["Ihrer Anfrage zur Zahnzusatzversicherung"]);
    expect((await ausgehend(c.phone)).at(-1)!.body).toBe(`Guten Tag, hier ist noch einmal ${FIRMA}. Sollen wir mit Ihrer Anfrage zur Zahnzusatzversicherung weitermachen? Es dauert nur ein paar Minuten.`);
  });

  it("Du-Kunde: „Hallo Julia, … mit deiner Anfrage zur …“ im offenen Fenster und als Vorlage", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { leadAddress: "du" } });
    await freigeben("followup_nudge", "pg_followup_nudge_v5", "du");
    const offen = await lead({ fensterOffen: true, erst: true, name: "Julia Schneider", source: "TKV Katze", formData: [{ label: "Tiername", value: "Minka" }] });
    await erinnerungSenden(offen.lead.id);
    expect(freitext(offen.phone)).toBe(`Hallo Julia, hier ist noch einmal ${FIRMA}. Sollen wir mit deiner Anfrage zur Tierkrankenversicherung für Minka weitermachen? Es dauert nur ein paar Minuten.`);
    const zu = await lead({ erst: true, name: "Julia Schneider" });
    await erinnerungSenden(zu.lead.id);
    expect(vorlage(zu.phone)?.name).toBe("pg_followup_nudge_v5");
    expect(parameter(zu.phone)).toEqual(["Julia", "deiner Anfrage zur Kfz-Versicherung"]);
    expect((await ausgehend(zu.phone)).at(-1)!.body).toBe(`Hallo Julia, hier ist noch einmal ${FIRMA}. Sollen wir mit deiner Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.`);
    // Ausnahme: nur die Sie-Fassung ist freigegeben. Dann folgt die Anfrage der Vorlage, der Satz bleibt stimmig
    await prisma.messageTemplate.deleteMany({ where: { customerId } });
    await freigeben("followup_nudge", "pg_followup_nudge_v5_sie", "sie");
    const nurSie = await lead({ erst: true, name: "Julia Schneider" });
    await erinnerungSenden(nurSie.lead.id);
    expect(vorlage(nurSie.phone)?.name).toBe("pg_followup_nudge_v5_sie");
    expect(parameter(nurSie.phone).at(-1)).toBe("Ihrer Anfrage zur Kfz-Versicherung");
    expect((await ausgehend(nurSie.phone)).at(-1)!.body).toMatch(/^Guten Tag [^,]+, hier ist noch einmal .+\. Sollen wir mit Ihrer Anfrage zur Kfz-Versicherung weitermachen\?/);
  });

  it("Nachfassen von Hand (Chat länger still, kein Kalender): Vorschau und Versand im neuen Wortlaut", async () => {
    await freigeben("followup_nudge", "pg_followup_nudge_v5_sie", "sie");
    const { phone, conversationId } = await lead({ erst: true });
    const wahl = await chooseFollowup(conversationId);
    expect(wahl).toMatchObject({ kind: "ok", purpose: "followup_nudge", approved: true, params: ["Peter", "Ihrer Anfrage zur Kfz-Versicherung"], legacyParams: ["Peter"] });
    if (wahl.kind !== "ok") throw new Error("Nachfassen gesperrt");
    expect(wahl.preview).toBe(SIE);
    await sendWhatsAppNotice({ customerId, to: phone, purpose: wahl.purpose, params: wahl.params, legacyParams: wahl.legacyParams, text: wahl.preview, anrede: wahl.anrede, contactName: "Peter Kranert", manuell: true });
    expect(vorlage(phone)?.name).toBe("pg_followup_nudge_v5_sie");
    expect(parameter(phone)).toEqual(["Herr Kranert", "Ihrer Anfrage zur Kfz-Versicherung"]);
  });
});

describe("Jede erste Nachricht an einen Lead trägt den KI-Hinweis", () => {
  it("Erstanschreiben als Vorlage: jede freigegebene Fassung, auf die die App zurückfällt (v4 bis v12), und der Freitext", async () => {
    const names = templateNamesOf(KUNDE);
    const aktuell = templateBodyFor("outreach_tkv", names, "sie");
    const fassungen: [string, string][] = [
      ["pg_outreach_tkv_v4_sie", "Guten Tag {{1}}, vielen Dank für Ihre Anfrage zur {{2}}! Ich bin der digitale KI-Assistent von Henrik Lohmann, kein Mensch, und stelle Ihnen zwei kurze Fragen, damit Sie ein passendes Angebot bekommen. Für welches Tier suchen Sie den Schutz?"],
      ["pg_outreach_tkv_v5_sie", "Hallo {{1}}, danke für Ihre Anfrage zur {{2}}!\nIch bin der digitale KI-Assistent von Henrik und kläre kurz zwei, drei Fragen, damit Henrik Ihnen ein passendes Angebot machen kann.\n\n*Wie alt ist {{3}}?*"],
      ["pg_outreach_tkv_v6_sie", `Hallo {{1}}, ${ERSTANSCHREIBEN_V6.sie}`],
      ["pg_outreach_tkv_v7_sie", `Hallo {{1}}, ${ERSTANSCHREIBEN_V7.sie}`],
      ["pg_outreach_tkv_v8_sie", `Hallo {{1}}, ${erstanschreibenV8("outreach_tkv").sie}`],
      ["pg_outreach_tkv_v9_sie", `Hallo {{1}}, ${erstanschreibenV9("outreach_tkv").sie}`],
      ["pg_outreach_tkv_v10_sie", aktuell],
      ["pg_outreach_tkv_v12_sie", aktuell],
    ];
    for (const [name, body] of fassungen) {
      // immer nur diese eine Fassung freigegeben (Rückfall, bis die nächste freigegeben ist)
      await prisma.messageTemplate.deleteMany({ where: { customerId } });
      await freigeben("outreach_tkv", name, "sie", { body, headerFormat: "DOCUMENT" });
      const { lead: l, phone } = await lead({ ohneChat: true, source: "Katzenversicherung (TKV)", formData: [{ label: "Tiername", value: "Minka" }] });
      const r = await sendOutreach({ customerId, leadId: l.id, phone, name: l.name, an: "sie", source: l.source });
      expect(r.mode, name).toBe("template");
      expect(vorlage(phone)?.name, name).toBe(name);
      const out = await ausgehend(phone);
      expect(out, name).toHaveLength(1);
      // gespeicherter Text der ersten Nachricht: Hinweis im Text (bis v7) bzw. in der Fußzeile (ab v8)
      expect(hasKiHinweis(out[0].body), `${name}: ${out[0].body}`).toBe(true);
      expect(await kiKennzeichnungOffen({ customerId, conversationId: r.conversationId, purpose: "followup_nudge" }), name).toBe(false);
    }
    // offenes Fenster (Lead hat noch nicht geschrieben): Freitext mit der kursiven Zeile, danach das PDF
    const offen = await lead({ fensterOffen: true, source: "Katzenversicherung (TKV)" });
    const r = await sendOutreach({ customerId, leadId: offen.lead.id, phone: offen.phone, name: offen.lead.name, an: "sie", source: offen.lead.source });
    expect(r.mode).toBe("text");
    expect(freitext(offen.phone)).toMatch(/\n\n_Digitaler KI-Assistent_$/);
    // genau eine Zeile, nicht doppelt
    expect(freitext(offen.phone).match(/KI-Assistent/g)).toHaveLength(1);
  });

  it("Lead schreibt zuerst: die erste Antwort des Assistenten beginnt mit dem Hinweis", async () => {
    const { phone } = await lead({ ohneChat: true, source: "Zahnzusatz" });
    h.script.push({ content: [{ type: "text", text: "Für wen soll die Zahnzusatzversicherung sein?" }] });
    await inbound(phone, "Hallo, ich habe eine Frage");
    expect(freitext(phone, 0)).toMatch(/^Hallo Herr Kranert, danke für Ihre Nachricht zur Zahnzusatzversicherung! Hier schreibt der digitale KI-Assistent von [^.\n]+\./);
    // zweite Antwort ohne erneuten Hinweis
    h.script.push({ content: [{ type: "text", text: "Alles klar, danke." }] });
    await inbound(phone, "Für mich");
    expect(freitext(phone)).toBe("Alles klar, danke.");

    // Erstanschreiben nicht zugestellt („failed“), der Lead schreibt später selbst: Er hat den Hinweis nie gesehen,
    // also beginnt die erste Antwort des Assistenten damit
    const b = await lead({ erstFehlgeschlagen: true });
    h.script.push({ content: [{ type: "text", text: "Gern. Wann passt es Ihnen?" }] });
    await inbound(b.phone, "Hallo, ich hatte eine Anfrage gestellt");
    expect(freitext(b.phone, 0)).toMatch(/^Hallo Herr Kranert, danke für Ihre Nachricht[^!\n]*! Hier schreibt der digitale KI-Assistent von [^.\n]+\./);
  });

  it("Lead hat schon gebucht: die Terminbestätigung als erste Nachricht geht mit KI-Fußzeile raus, spätere ohne", async () => {
    const start = new Date(Date.now() + 3 * 24 * HOUR);
    await freigeben("booking_confirmation", "pg_booking_confirmation_v4_sie", "sie");
    await freigeben("booking_confirmation", "pg_booking_confirmation_v4_ki_sie", "sie");
    const { lead: l, phone } = await lead({ ohneChat: true });
    await sendBookingConfirmation({ customerId, to: phone, name: l.name, leadId: l.id, startsAt: start, mode: "video", meetUrl: "https://meet.example.de/abc" });
    expect(vorlage(phone)?.name).toBe("pg_booking_confirmation_v4_ki_sie");
    const erst = (await ausgehend(phone))[0];
    expect(erst.purpose).toBe("booking_confirmation");
    // Bestätigung ab v5 (26.11.2026): der Vermittler als Person statt der Firma
    expect(erst.body).toMatch(/^Guten Tag Herr Kranert, Ihr Termin bei Henrik Lohmann ist bestätigt: /);
    expect(erst.body).toMatch(/\n\nDigitaler KI-Assistent$/);
    // derselbe Chat, zweite Bestätigung (z. B. neuer Termin): Hinweis steht schon da, normale Fassung ohne Fußzeile
    await sendBookingConfirmation({ customerId, to: phone, name: l.name, leadId: l.id, startsAt: new Date(start.getTime() + 24 * HOUR), mode: "video", meetUrl: "https://meet.example.de/abc" });
    expect(vorlage(phone)?.name).toBe("pg_booking_confirmation_v4_sie");
    expect(hasKiHinweis((await ausgehend(phone))[1].body)).toBe(false);
    // die Erinnerung danach ebenfalls ohne Hinweis
    await freigeben("followup_nudge", "pg_followup_nudge_v5_sie", "sie");
    await freigeben("followup_nudge", "pg_followup_nudge_v5_ki_sie", "sie");
    await erinnerungSenden(l.id);
    expect(vorlage(phone)?.name).toBe("pg_followup_nudge_v5_sie");
  });

  it("Terminbestätigung: bis Meta die Fassung mit Fußzeile freigibt, die bisherige; im offenen Fenster die kursive Zeile, nur beim ersten Mal", async () => {
    const start = new Date(Date.now() + 3 * 24 * HOUR);
    await freigeben("booking_confirmation", "pg_booking_confirmation_v4_sie", "sie");
    const zu = await lead({ ohneChat: true });
    await sendBookingConfirmation({ customerId, to: zu.phone, name: zu.lead.name, leadId: zu.lead.id, startsAt: start, mode: "video", meetUrl: "https://meet.example.de/abc" });
    expect(vorlage(zu.phone)?.name).toBe("pg_booking_confirmation_v4_sie");

    const offen = await lead({ fensterOffen: true });
    await sendBookingConfirmation({ customerId, to: offen.phone, name: offen.lead.name, leadId: offen.lead.id, startsAt: start, mode: "video", meetUrl: "https://meet.example.de/abc" });
    expect(freitext(offen.phone)).toMatch(/^Guten Tag Herr Kranert, Ihr Videocall mit .+ ist bestätigt: /);
    expect(freitext(offen.phone)).toMatch(/Bis dann! 🙂\n\n_Digitaler KI-Assistent_$/);
    await sendBookingConfirmation({ customerId, to: offen.phone, name: offen.lead.name, leadId: offen.lead.id, startsAt: start, mode: "video", meetUrl: "https://meet.example.de/abc" });
    expect(freitext(offen.phone)).toMatch(/Bis dann! 🙂$/);
    expect(an(offen.phone)).toHaveLength(2);
  });

  it("Erinnerung als erste Nachricht („Nicht erreicht“, kein Erstanschreiben, kein Kalender): Fassung mit Fußzeile, sonst die alte v4, sonst Anruf-Aufgabe", async () => {
    const start = async () => {
      const x = await lead({ ohneChat: true });
      const seq = (await startSequence(x.lead.id, "not_reached"))!;
      await runSequences(new Date(), { nurId: seq.id, sofort: true });
      return { ...x, seq: await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq.id } }) };
    };
    // nur die neue Fassung ohne Hinweis freigegeben: als erste Nachricht nicht senden
    await freigeben("followup_nudge", "pg_followup_nudge_v5_sie", "sie");
    const a = await start();
    expect(an(a.phone)).toHaveLength(0);
    expect((a.seq.log as { result: string; detail?: string }[])[0]).toMatchObject({ result: "call_task", detail: "Keine freigegebene Vorlage, Anruf-Aufgabe statt WhatsApp" });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.lead.id } })).followUpNote).toBe("Nicht erreicht: nochmal anrufen");
    await expect(sendWhatsAppNotice({ customerId, to: a.phone, purpose: "followup_nudge", params: ["Peter", "Ihrer Anfrage"], text: "x", leadId: a.lead.id })).rejects.toBeInstanceOf(NoTemplateError);

    // alte v4 freigegeben (Bestandskunden bis zur Freigabe): sie trägt den Hinweis im Text
    await freigeben("followup_nudge", "pg_followup_nudge_v4_sie", "sie", { body: V4_SIE });
    const b = await start();
    expect(vorlage(b.phone)?.name).toBe("pg_followup_nudge_v4_sie");
    expect(parameter(b.phone)).toEqual(["Herr Kranert"]);
    expect(hasKiHinweis((await ausgehend(b.phone))[0].body)).toBe(true);

    // Fassung mit KI-Fußzeile freigegeben: neuer Wortlaut, Hinweis in der Fußzeile
    await freigeben("followup_nudge", "pg_followup_nudge_v5_ki_sie", "sie");
    const c = await start();
    expect(vorlage(c.phone)?.name).toBe("pg_followup_nudge_v5_ki_sie");
    expect(parameter(c.phone)).toEqual(["Herr Kranert", "Ihrer Anfrage zur Kfz-Versicherung"]);
    expect((await ausgehend(c.phone))[0].body).toBe(
      `Guten Tag Herr Kranert, hier ist noch einmal ${FIRMA}. Sollen wir mit Ihrer Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.\n\nDigitaler KI-Assistent`,
    );
    // die zweite Erinnerung im selben Chat wiederholt ihn nicht
    await erinnerungSenden(c.lead.id);
    expect(vorlage(c.phone)?.name).toBe("pg_followup_nudge_v5_sie");
    expect(hasKiHinweis((await ausgehend(c.phone))[1].body)).toBe(false);
  });

  it("nicht zugestelltes Erstanschreiben zählt nicht; ohne aktiven Assistenten kein Hinweis", async () => {
    await freigeben("followup_nudge", "pg_followup_nudge_v5_sie", "sie");
    await freigeben("followup_nudge", "pg_followup_nudge_v5_ki_sie", "sie");
    // Erstanschreiben „failed“ (z. B. Limit bei Meta): der Lead hat den Hinweis nie gesehen
    const a = await lead({ erstFehlgeschlagen: true });
    expect(await kiKennzeichnungOffen({ customerId, conversationId: a.conversationId, purpose: "followup_nudge" })).toBe(true);
    await erinnerungSenden(a.lead.id);
    expect(vorlage(a.phone)?.name).toBe("pg_followup_nudge_v5_ki_sie");
    // Bestandskampagnen und Empfehlungen (im Namen des Vermittlers persönlich) sind keine Nachrichten des Assistenten
    expect(await kiKennzeichnungOffen({ customerId, conversationId: null, purpose: "campaign_review" })).toBe(false);
    expect(await kiKennzeichnungOffen({ customerId, conversationId: null, purpose: "booking_confirmation" })).toBe(true);
    // Der Assistent hat im Chat schon selbst geantwortet (hier ein Chat von vor dem 15.11.2026 ohne Hinweis): Die
    // Systemnachricht ist nicht mehr die erste, den Hinweis stellt der Assistent seiner nächsten Antwort voran (bot.ts)
    const alt = await lead({ fensterOffen: true });
    await prisma.message.create({ data: { conversationId: alt.conversationId, direction: "outbound", kind: "text", sentBy: "bot", status: "read", body: "Gern, wann passt es Ihnen?" } });
    expect(await kiKennzeichnungOffen({ customerId, conversationId: alt.conversationId, purpose: "booking_confirmation" })).toBe(false);
    await sendBookingConfirmation({ customerId, to: alt.phone, name: alt.lead.name, leadId: alt.lead.id, startsAt: new Date(Date.now() + 48 * HOUR), mode: "video", meetUrl: "https://meet.example.de/abc" });
    expect(freitext(alt.phone)).toMatch(/Bis dann! 🙂$/);
    // Der Vermittler hat den Chat übernommen (Assistent im Chat pausiert): dort schreibt ein Mensch, kein Hinweis
    const mensch = await lead({ fensterOffen: true });
    await prisma.conversation.update({ where: { id: mensch.conversationId }, data: { botActive: false } });
    expect(await kiKennzeichnungOffen({ customerId, conversationId: mensch.conversationId, purpose: "booking_confirmation" })).toBe(false);
    await sendBookingConfirmation({ customerId, to: mensch.phone, name: mensch.lead.name, leadId: mensch.lead.id, startsAt: new Date(Date.now() + 48 * HOUR), mode: "video", meetUrl: "https://meet.example.de/abc" });
    expect(freitext(mensch.phone)).toMatch(/Bis dann! 🙂$/);
    // Assistent aus: im Chat antwortet keine KI, also weder Fußzeile noch Zeile
    await prisma.agentConfig.update({ where: { customerId }, data: { active: false } });
    expect(await kiKennzeichnungOffen({ customerId, conversationId: null, purpose: "booking_confirmation" })).toBe(false);
    const b = await lead({ fensterOffen: true });
    await sendBookingConfirmation({ customerId, to: b.phone, name: b.lead.name, leadId: b.lead.id, startsAt: new Date(Date.now() + 48 * HOUR), mode: "video", meetUrl: "https://meet.example.de/abc" });
    expect(freitext(b.phone)).toMatch(/Bis dann! 🙂$/);
  });

  it("Leads ohne WhatsApp: Erstmail und erste SMS der Strecke tragen den Hinweis; die Nur-SMS (E-Mail-Funktionen aus) bewusst nicht", () => {
    const person = { nom: "Herr Lohmann", dat: "Herrn Lohmann" };
    const mail = erstmailInhalt({
      an: "sie",
      anrede: "Guten Tag Herr Kranert",
      betreffName: "Herr Kranert",
      person,
      source: "Kfz-Versicherung",
      ausloeser: "kein_whatsapp",
      frage: null,
      antwortLinks: [],
      zeiten: [],
      andereZeit: null,
      seite: "https://app.example.de/t/abc",
      erstinfoPdf: true,
      erstinfoUrl: null,
      impressumUrl: null,
      datenschutzUrl: null,
      abmeldeUrl: "https://app.example.de/t/abc/abmelden",
      signatur: { text: "Henrik Lohmann", html: "<p>Henrik Lohmann</p>" },
    });
    expect(mail.text).toContain("Hier schreibt der digitale KI-Assistent von Herrn Lohmann.");
    expect(hasKiHinweis(mail.html)).toBe(true);
    for (const an of ["sie", "du"] as const) {
      const sms = smsText({ an, anredeName: "Herr Kranert", person, source: "Kfz-Versicherung", link: "https://app.example.de/t/abc", abmelden: "https://app.example.de/t/abc/x", art: "erst" });
      expect(sms).toContain("Hier ist der KI-Assistent von Herrn Lohmann.");
    }
    // Nur-SMS (Ole, 22.11.2026: „ohne KI-Satz“, feste Nachricht mit Link zur Terminwahl, kein KI-Gespräch): bewusste
    // Ausnahme, in docs/recht/2026-11-24-ki-hinweis-erste-nachricht.md beschrieben und Ole zur Entscheidung vorgelegt
    const nur = nurSmsText({ an: "sie", anredeName: "Herr Kranert", person, source: "Kfz-Versicherung", link: "https://app.example.de/t/abc", art: "erst", telefon: "0451 1234567", zeiten: GESCHAEFTSZEITEN_STANDARD });
    expect(hasKiHinweis(nur)).toBe(false);
  });
});

describe("Fragt der Lead, ob er mit einem Menschen schreibt, antwortet der Assistent ehrlich", () => {
  it("nach der Erinnerung (ohne KI-Hinweis): „Schreibe ich hier mit einem Menschen?“ → ehrlich, ohne KI beantwortet, Übergabe", async () => {
    for (const frage of ["Schreibe ich hier mit einem Menschen?", "Schreibt hier ein Mensch?", "Antwortet da eine KI oder ein Mensch?"]) {
      const { lead: l, phone, conversationId } = await lead({ fensterOffen: true, erst: true });
      await erinnerungSenden(l.id);
      const vorher = h.calls.length;
      await inbound(phone, frage);
      expect(h.calls.length, frage).toBe(vorher);
      expect(freitext(phone), frage).toMatch(new RegExp(`^Ich bin der digitale KI-Assistent von ${FIRMA}, kein Mensch\\. Ich habe .+ Bescheid gegeben, .+ meldet sich persönlich bei Ihnen\\.$`));
      const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { messages: true } });
      expect(c.botActive, frage).toBe(false);
      expect(c.messages.some((m) => m.kind === "ki_handover"), frage).toBe(true);
    }
  });

  it("Sicherheitsnetz: Behauptet eine Antwort der KI, ein Mensch zu sein, geht stattdessen die ehrliche Antwort raus", async () => {
    const { lead: l, phone, conversationId } = await lead({ fensterOffen: true, erst: true });
    await erinnerungSenden(l.id);
    h.script.push({ content: [{ type: "text", text: "Ja, ich bin ein Mensch aus dem Team und helfe Ihnen gern weiter." }] });
    await inbound(phone, "Wer schreibt hier eigentlich?");
    // Regel im System-Prompt
    const prompt = h.calls.find((c) => c.system.includes("Gib dich nie als Mensch aus"))?.system ?? "";
    expect(prompt).toMatch(new RegExp(`oder wer hier schreibt: antworte immer wahrheitsgemäß, dass du der digitale KI-Assistent von ${FIRMA} bist, kein Mensch`));
    expect(freitext(phone)).toMatch(new RegExp(`^Ich bin der digitale KI-Assistent von ${FIRMA}, kein Mensch\\. Wenn Sie direkt mit .+ sprechen möchten, schreiben Sie ‚Mensch‘\\.$`));
    expect(freitext(phone)).not.toContain("ich bin ein Mensch");
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { messages: true } });
    const ersetzt = c.messages.find((m) => m.kind === "ki_ehrlich");
    expect(ersetzt?.direction).toBe("internal");
    expect(JSON.parse(ersetzt!.body!).original).toContain("ich bin ein Mensch");
    // ehrliche Antworten der KI bleiben unverändert
    h.script.push({ content: [{ type: "text", text: `Ich bin der digitale KI-Assistent von ${FIRMA}, kein Mensch. Wann passt es Ihnen?` }] });
    await inbound(phone, "Aha, und jetzt?");
    expect(freitext(phone)).toBe(`Ich bin der digitale KI-Assistent von ${FIRMA}, kein Mensch. Wann passt es Ihnen?`);
  });
});
