// Vorbereitung nach der Buchung (Ole, 26.11.2026, Kundenfall Schwarzkopf): Lead bucht online, bevor er im Chat geschrieben
// hat. Bisher kam nur die Bestätigungsvorlage ohne Frage, das 24-h-Fenster blieb zu, die Vorbereitung begann nie.
//   1. Bestätigung ab v5: „Ihr Termin bei Herrn Testkopf“, am Ende die Frage mit [Ja, gern] [Lieber im Termin];
//      bis zur Freigabe die alte v4 (Rückfall). Anrede des Leads aus dem Formular, sonst nur bei eindeutigem Vornamen.
//   2. „Ja, gern“ startet die Strecke (Fragen-Engine, sonst Komplettcheck), „Lieber im Termin“ → „Alles klar, bis Montag!“
//   3. Keine Antwort: einmal am Folgetag die Nachfrage (eigene Vorlage), dann Ruhe
//   4. Fragen-Engine (vorläufige Privatschutz-Definition): Liste/Knöpfe, Fortschritt, Bekanntes überspringen, einmal
//      nachfragen, „Rest im Termin“, Speicherung in den Angaben und am Lead
//   5. Ops-Aktion buchung_vorbereitung_nachsenden mit Vorschau
// Nachgebaut mit Anids Einstellungen: Sie, Anrede Herr in den Anbieterangaben, Telefon freigegeben, Allianz (Vertreter),
// Assistent aktiv (Komplettcheck nach der Buchung). 360dialog nachgebildet, echte Test-Datenbank.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: async () => ({ content: [{ type: "text", text: "Gern." }] }) };
  },
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { sendBookingConfirmation } from "@/lib/whatsapp/reminders";
import { templateBodyFor, templateNamesOf } from "@/lib/whatsapp/template-plan";
import type { NoticePurpose } from "@/lib/whatsapp/templates";
import { runVorbereitungNachfassen, STRECKE, bisWann, nachfassTag } from "@/lib/whatsapp/termin-strecke";
import { fuehreAktionAus } from "@/lib/ops-aktionen";
import { cleanupCustomer, makeCustomer, ohneSplittest, requireTestDb } from "./db";

const ENV = { ...process.env };
const KUNDE = "Allianz Anid Testkopf";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Gesendet = {
  to: string;
  type: string;
  text?: { body: string };
  interactive?: { type: string; body: { text: string }; action: { buttons?: { reply: { id: string; title: string } }[]; sections?: { rows: { id: string; title: string }[] }[] } };
  template?: { name: string; components?: { type: string; sub_type?: string; parameters: { type: string; text?: string; payload?: string }[] }[] };
};
const sent: Gesendet[] = [];
function fake360(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/messages")) {
    sent.push(JSON.parse(String(init?.body)));
    return Promise.resolve(new Response(JSON.stringify({ messages: [{ id: `wamid.vb${sent.length}.${Math.random()}` }] }), { status: 200 }));
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

let customerId = "";
let phoneNumberId = "";
let n = 0;
const uid = () => Math.random().toString(36).slice(2, 10);
const telefon = () => `49176${String(Date.now()).slice(-5)}${String(++n).padStart(3, "0")}`;
const an = (to: string) => sent.filter((s) => s.to === to);
const letzte = (to: string) => an(to).at(-1);
const textVon = (m: Gesendet | undefined) => m?.text?.body ?? m?.interactive?.body.text ?? "";
const params = (m: Gesendet | undefined) => m?.template?.components?.find((c) => c.type === "body")?.parameters.map((p) => p.text) ?? [];
const payloads = (m: Gesendet | undefined) => m?.template?.components?.filter((c) => c.type === "button").map((c) => c.parameters[0].payload) ?? [];

/** Nächster Montag mindestens 3 Tage ab jetzt, 16 Uhr deutscher Zeit (Winterzeit). */
function naechsterMontag(): Date {
  const d = new Date(Date.now() + 3 * DAY);
  while (new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short" }).format(d) !== "Mon") d.setTime(d.getTime() + DAY);
  const tag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
  return new Date(`${tag}T15:00:00.000Z`);
}

async function freigeben(purpose: NoticePurpose, name: string, form: "du" | "sie" | "sie_ohne_name", body?: string) {
  const names = templateNamesOf(KUNDE, undefined, "Anid Testkopf", "Herr");
  await prisma.messageTemplate.create({
    data: { customerId, name, language: "de", purpose, category: "utility", status: "approved", auto: true, body: body ?? templateBodyFor(purpose, names, form), buttons: ["Ja, gern", "Lieber im Termin"] },
  });
}
const V4_SIE = "Guten Tag {{1}}, Ihr Termin bei Anid Testkopf ist bestätigt: {{2}} ({{3}}). {{4}} Zur Vorbereitung: Legen Sie sich gern Ihre bisherigen Unterlagen zum Thema bereit, falls vorhanden.";

/** Lead (Privatschutz) mit Chat ohne offenes Fenster und Termin am Montag. */
async function lead(o: { formData?: unknown[]; name?: string; fensterOffen?: boolean; source?: string } = {}) {
  const phone = telefon();
  const l = await prisma.lead.create({
    data: { customerId, name: o.name ?? "Peter Kranert", phone, source: o.source ?? "Privatschutz", status: "Neuer Lead", formData: (o.formData ?? []) as never },
  });
  const c = await prisma.conversation.create({
    data: { customerId, contactPhone: phone, contactName: l.name, leadId: l.id, botActive: true, windowExpiresAt: o.fensterOffen ? new Date(Date.now() + 20 * HOUR) : null, lastMessageAt: new Date() },
  });
  const startsAt = naechsterMontag();
  const t = await prisma.appointment.create({ data: { customerId, leadId: l.id, conversationId: c.id, mode: "video", startsAt, endsAt: new Date(startsAt.getTime() + HOUR), status: "booked" } });
  return { lead: l, phone, conversationId: c.id, termin: t };
}

const bestaetigen = (x: Awaited<ReturnType<typeof lead>>) =>
  sendBookingConfirmation({ customerId, to: x.phone, name: x.lead.name, leadId: x.lead.id, startsAt: x.termin.startsAt, mode: "video", meetUrl: "https://meet.example/abc", appointmentId: x.termin.id });

async function knopf(from: string, text: string, payload: string | null, art: "button" | "interactive" = "button") {
  const m =
    art === "button"
      ? { from, id: `wamid.in${++n}.${uid()}`, type: "button", button: { text, ...(payload ? { payload } : {}) } }
      : { from, id: `wamid.in${++n}.${uid()}`, type: "interactive", interactive: { type: "list_reply", list_reply: { id: payload, title: text } } };
  await handleInboundPayload({ entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, contacts: [{ profile: { name: "Peter" } }], messages: [m] } }] }] });
}
async function schreibt(from: string, body: string) {
  await handleInboundPayload({
    entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, contacts: [{ profile: { name: "Peter" } }], messages: [{ from, id: `wamid.in${++n}.${uid()}`, type: "text", text: { body } }] } }] }],
  });
}
const merker = (conversationId: string, kind: string) => prisma.message.findMany({ where: { conversationId, direction: "internal", kind }, select: { body: true, createdAt: true } });

beforeAll(() => requireTestDb());
ohneSplittest("komplettcheck_text", "komplettcheck_ja");
ohneSplittest("termin_zusage");
beforeEach(async () => {
  process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  process.env.APP_URL = "https://app.example.de";
  delete process.env.VORBEREITUNG_FRAGEN_VORLAEUFIG;
  sent.length = 0;
  vi.stubGlobal("fetch", vi.fn(fake360));
  await prisma.customer.deleteMany({ where: { name: KUNDE } });
  customerId = (await makeCustomer({ name: KUNDE, leadAddress: "sie" })).id;
  phoneNumberId = `pn-vb-${uid()}`;
  await prisma.whatsAppAccount.create({ data: { customerId, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret("d360-vb"), phoneNumberId } });
  // wie bei Anid: Assistent aktiv, Telefon als Terminart freigegeben
  await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, allowPhone: true } });
  await prisma.erstinformation.create({ data: { customerId, token: `tok-${uid()}`, name: "Anid Testkopf", anrede: "Herr", versicherer: ["Allianz"] } });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.lead.deleteMany({ where: { customerId } });
  await cleanupCustomer(customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

describe("Bestätigung mit Frage nach der Vorbereitung (Vorlage v5)", () => {
  it("bis zur Freigabe der v5: die alte v4 ohne Frage (Rückfall), kein Merker", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v4_sie", "sie", V4_SIE);
    const x = await lead({ formData: [{ label: "Anrede", value: "Herr" }] });
    await bestaetigen(x);
    expect(letzte(x.phone)?.template?.name).toBe("pg_booking_confirmation_v4_sie");
    expect(await merker(x.conversationId, STRECKE.vorbereitungFrage)).toHaveLength(0);
  });

  it("v5 freigegeben: „Ihr Termin bei Herrn Testkopf“, Frage am Ende, Knöpfe mit Payload, Merker; Anrede aus dem Formular", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v4_sie", "sie", V4_SIE);
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead({ formData: [{ label: "Anrede", value: "Herr" }] });
    await bestaetigen(x);
    const m = letzte(x.phone);
    expect(m?.template?.name).toBe("pg_booking_confirmation_v6_sie");
    expect(params(m)[0]).toBe("Herr Kranert");
    expect(payloads(m)).toEqual(["vorbereitung:ja", "vorbereitung:termin"]);
    const body = (await prisma.message.findFirst({ where: { conversationId: x.conversationId, direction: "outbound" }, orderBy: { createdAt: "desc" } }))!.body!;
    expect(body).toContain("Guten Tag Herr Kranert, Ihr Termin bei Herrn Testkopf ist bestätigt:");
    expect(body).toContain("Wenn Sie mir vorab ein paar kurze Fragen beantworten, kann Herr Testkopf Ihr Angebot schon vorbereiten und Sie bekommen es schneller. Dauert etwa eine Minute. Wollen wir kurz starten?");
    expect(body).not.toMatch(/Anid Testkopf|[–—]/);
    expect(await merker(x.conversationId, STRECKE.vorbereitungFrage)).toHaveLength(1);
  });

  it("Anrede ohne Formularangabe nur bei eindeutigem Vornamen (Peter → Herr Kranert, Andrea → voller Name)", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead();
    await bestaetigen(x);
    expect(params(letzte(x.phone))[0]).toBe("Herr Kranert");
    const z = await lead({ name: "Andrea Beckmann" });
    await bestaetigen(z);
    expect(params(letzte(z.phone))[0]).toBe("Andrea Beckmann");
    const y = await lead({ formData: [{ label: "Anrede", value: "Frau" }], name: "Andrea Becker" });
    await bestaetigen(y);
    expect(params(letzte(y.phone))[0]).toBe("Frau Becker");
  });

  it("offenes Fenster: Freitext wie bisher mit „Termin verschieben“, Vermittler im Dativ", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead({ fensterOffen: true, formData: [{ label: "Anrede", value: "Herr" }] });
    await bestaetigen(x);
    const m = letzte(x.phone);
    expect(m?.type).toBe("interactive");
    expect(textVon(m)).toContain("Guten Tag Herr Kranert, Ihr Videocall mit Herrn Testkopf ist bestätigt");
    expect(m?.interactive?.action.buttons?.map((b) => [b.reply.id, b.reply.title])).toEqual([["Termin verschieben", "Termin verschieben"]]);
  });
});

describe("Antwort auf die Frage", () => {
  it("„Lieber im Termin“: „Alles klar, bis Montag!“, keine weiteren Fragen, auch nicht durch den Cron", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead();
    await bestaetigen(x);
    sent.length = 0;
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin");
    expect(an(x.phone)).toHaveLength(1);
    expect(textVon(an(x.phone)[0])).toBe("Alles klar, bis Montag!");
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin");
    expect(an(x.phone)).toHaveLength(1);
    const { runBuchungsseiteNachholen } = await import("@/lib/whatsapp/termin-strecke");
    const mittag = new Date(Date.now() + 20 * 60_000);
    await runBuchungsseiteNachholen(mittag);
    expect(an(x.phone)).toHaveLength(1);
  });

  it("„Ja, gern“ (ohne vorläufige Fragen): die Strecke startet mit dem Komplettcheck", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead();
    await bestaetigen(x);
    sent.length = 0;
    await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
    const m = letzte(x.phone);
    expect(m?.type).toBe("interactive");
    expect(textVon(m)).toMatch(/^Super, danke!/);
    expect(m?.interactive?.action.buttons?.map((b) => b.reply.id)).toContain("komplettcheck:ja");
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(1);
    expect(JSON.parse((await merker(x.conversationId, STRECKE.vorbereitungAntwort))[0].body!)).toMatchObject({ art: "ja" });
  });

  it("„Ja, gern“ ohne Payload (Knopftext) bzw. getippt „Ja gerne“ zählt nur direkt nach der Frage", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead();
    await bestaetigen(x);
    sent.length = 0;
    await schreibt(x.phone, "Ja gerne");
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(1);
    const y = await lead();
    await bestaetigen(y);
    await knopf(y.phone, "Ja, gern", null);
    expect(await merker(y.conversationId, STRECKE.vorbereitungAntwort)).toHaveLength(1);
  });
});

describe("Nachfrage am Folgetag", () => {
  it("einmal am Folgetag (Geschäftszeit) mit eigener Vorlage und denselben Knöpfen, dann Ruhe", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    await freigeben("booking_prep_nudge", "pg_booking_prep_nudge_v2_sie", "sie");
    const x = await lead({ formData: [{ label: "Anrede", value: "Herr" }] });
    await bestaetigen(x);
    const frage = (await merker(x.conversationId, STRECKE.vorbereitungFrage))[0].createdAt;
    // Folgetag 10 Uhr (Sonntag zählt nicht)
    let folgetag = new Date(frage.getTime() + DAY);
    if (new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short" }).format(folgetag) === "Sun") folgetag = new Date(folgetag.getTime() + DAY);
    const zehn = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(folgetag)}T09:00:00.000Z`);
    sent.length = 0;
    // am selben Tag nichts
    expect((await runVorbereitungNachfassen(new Date(frage.getTime() + 7 * HOUR))).gesendet).toBe(0);
    expect(nachfassTag(frage, zehn)).toBe(true);
    if (zehn.getTime() > x.termin.startsAt.getTime() - 2 * HOUR) return; // Termin zu nah (Wochentag des Testlaufs)
    expect(await runVorbereitungNachfassen(zehn)).toMatchObject({ gesendet: 1 });
    const m = letzte(x.phone);
    expect(m?.template?.name).toBe("pg_booking_prep_nudge_v2_sie");
    expect(params(m)).toEqual(["Herr Kranert", expect.stringMatching(/^Montag, /)]);
    expect(payloads(m)).toEqual(["vorbereitung:ja", "vorbereitung:termin"]);
    // kein zweites Mal, auch nicht am Tag danach
    expect((await runVorbereitungNachfassen(new Date(zehn.getTime() + HOUR))).gesendet).toBe(0);
    expect((await runVorbereitungNachfassen(new Date(zehn.getTime() + DAY))).gesendet).toBe(0);
  });

  it("nicht, wenn der Lead geantwortet hat; ohne freigegebene Vorlage nichts", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead();
    await bestaetigen(x);
    const frage = (await merker(x.conversationId, STRECKE.vorbereitungFrage))[0].createdAt;
    const spaeter = new Date(frage.getTime() + DAY);
    const r = await runVorbereitungNachfassen(new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(spaeter)}T09:00:00.000Z`));
    expect(r.gesendet).toBe(0);
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin");
    expect(await merker(x.conversationId, STRECKE.vorbereitungNachfrage)).toHaveLength(0);
  });

  it("„bis Montag“: heute, morgen bzw. Wochentag", () => {
    const jetzt = new Date("2026-11-26T08:00:00.000Z");
    expect(bisWann(new Date("2026-11-30T15:00:00.000Z"), jetzt)).toBe("Montag");
    expect(bisWann(new Date("2026-11-27T15:00:00.000Z"), jetzt)).toBe("morgen");
    expect(bisWann(new Date("2026-11-26T15:00:00.000Z"), jetzt)).toBe("heute");
  });
});

describe("Fragen-Engine (vorläufige Privatschutz-Definition)", () => {
  beforeEach(() => {
    process.env.VORBEREITUNG_FRAGEN_VORLAEUFIG = "1";
  });

  it("Liste, Fortschritt, Bekanntes überspringen, Zusammengesetztes, einmal nachfragen, dann Komplettcheck", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    // Beruf ist aus dem Formular bekannt, Hausrat und Haftpflicht gebucht
    const x = await lead({ formData: [{ label: "Welche Versicherungen interessieren Sie?", value: "Haftpflicht, Hausrat" }, { label: "Beruf", value: "Angestellt" }] });
    await bestaetigen(x);
    sent.length = 0;
    await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
    let m = letzte(x.phone);
    // 1. Mitversicherte: 3 Antworten + „Rest im Termin“ passen nicht auf Knöpfe → Liste
    expect(m?.interactive?.type).toBe("list");
    expect(textVon(m)).toMatch(/^Super, danke! Noch \d kurze Fragen\. Wer soll mitversichert sein\?$/);
    expect(m?.interactive?.action.sections?.[0].rows.map((r) => r.title)).toEqual(["Nur ich", "Mit Partner", "Familie mit Kindern", "Rest im Termin"]);
    expect(textVon(m)).not.toMatch(/beruflich/);
    await knopf(x.phone, "Mit Partner", "vf:haftpflicht.mitversicherte:paar", "interactive");
    m = letzte(x.phone);
    // 2. Wohnfläche und Baujahr (Pflicht Hausrat), Beruf übersprungen (Formular)
    expect(textVon(m)).toMatch(/^Danke! Noch \d kurze Fragen\. Wie groß ist Ihre Wohnung/);
    expect(m?.interactive?.action.buttons?.map((b) => b.reply.title)).toEqual(["Rest im Termin"]);
    await schreibt(x.phone, "ziemlich groß");
    expect(textVon(letzte(x.phone))).toMatch(/^Das habe ich nicht ganz verstanden\. Können Sie mir kurz Wohnfläche und Baujahr schreiben\?/);
    await schreibt(x.phone, "75 qm, Baujahr 1990");
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: x.conversationId } });
    expect(conv.qualificationData).toMatchObject({ versichern: "Paar", wohnflaeche: "75 m², Baujahr 1990" });
    // 3. optionale Bausteine: bisheriger Vertrag Haftpflicht (Versicherer + Ablauf), Vorschäden (geteilt), Hausrat
    expect(textVon(letzte(x.phone))).toContain("Sind Sie bei Haftpflicht schon versichert?");
    await schreibt(x.phone, "Ja bei der HUK bis 03/2027");
    // Vorschäden (Knöpfe: 2 Antworten + Rest)
    m = letzte(x.phone);
    expect(textVon(m)).toMatch(/^Danke! Noch 2 kurze Fragen\. Gab es in den letzten 5 Jahren Schäden\?$/);
    expect(m?.interactive?.action.buttons?.map((b) => b.reply.title)).toEqual(["Keine Schäden", "Ja, gab es", "Rest im Termin"]);
    await knopf(x.phone, "Keine Schäden", "vf:haftpflicht.vorschaeden:keine", "interactive");
    expect(textVon(letzte(x.phone))).toMatch(/^Danke! Letzte kurze Frage: Sind Sie bei Hausrat schon versichert\?/);
    await schreibt(x.phone, "nein");
    // danach der Komplettcheck
    m = letzte(x.phone);
    expect(m?.interactive?.action.buttons?.map((b) => b.reply.id)).toContain("komplettcheck:ja");
    const fertig = await prisma.conversation.findUniqueOrThrow({ where: { id: x.conversationId } });
    expect((fertig.qualificationData as Record<string, string>).vorhanden).toBe("Haftpflicht: HUK-Coburg, Ablauf 03/2027; Hausrat: noch nicht versichert");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: x.lead.id } });
    expect((l.vorbereitungsAngaben as { werte: Record<string, { wert: string }> }).werte["hausrat.wohnung"].wert).toBe("75 m², Baujahr 1990");
  });

  it("„Rest im Termin“: freundlich stoppen, offene Punkte am Lead und im Verlauf, keine weiteren Fragen", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead({ formData: [{ label: "Welche Versicherungen interessieren Sie?", value: "Hausrat" }] });
    await bestaetigen(x);
    await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
    sent.length = 0;
    await knopf(x.phone, "Rest im Termin", "vf:rest", "interactive");
    expect(an(x.phone)).toHaveLength(1);
    expect(textVon(an(x.phone)[0])).toBe("Alles klar, den Rest klärt Herr Testkopf mit Ihnen im Termin. Bis Montag!");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: x.lead.id } });
    expect((l.vorbereitungsAngaben as { offen: string[]; rest: boolean })).toMatchObject({ rest: true, offen: expect.arrayContaining(["Wer wird mitversichert?", "Wohnfläche und Baujahr"]) });
    const h = await prisma.leadHistory.findFirst({ where: { leadId: x.lead.id, text: { startsWith: "Im Termin klären" } } });
    expect(h?.text).toContain("Wohnfläche und Baujahr");
    await schreibt(x.phone, "Danke!");
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(0);
  });
});

describe("Ops-Aktion buchung_vorbereitung_nachsenden", () => {
  it("ohne freigegebene v5: melden, nichts senden; mit v5: Vorschau, dann einmalig senden", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v4_sie", "sie", V4_SIE);
    const x = await lead({ formData: [{ label: "Anrede", value: "Herr" }], name: "Peter Kranertneu" });
    const ohne = await fuehreAktionAus("buchung_vorbereitung_nachsenden", { customerId, name: "Kranertneu" });
    expect(ohne).toMatchObject({ ok: false });
    expect((ohne as { error: string }).error).toContain("freigegeben");
    expect(an(x.phone)).toHaveLength(0);
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const vorschau = await fuehreAktionAus("buchung_vorbereitung_nachsenden", { customerId, name: "Kranertneu", vorschau: "true" });
    expect(vorschau).toMatchObject({ ok: true });
    expect((vorschau as { info: string }).info).toMatch(/^Vorschau: Bestätigung pg_booking_confirmation_v6_sie/);
    expect(an(x.phone)).toHaveLength(0);
    const los = await fuehreAktionAus("buchung_vorbereitung_nachsenden", { customerId, leadId: x.lead.id });
    expect(los).toMatchObject({ ok: true });
    expect(letzte(x.phone)?.template?.name).toBe("pg_booking_confirmation_v6_sie");
    expect(await merker(x.conversationId, STRECKE.vorbereitungFrage)).toHaveLength(1);
    const nochmal = await fuehreAktionAus("buchung_vorbereitung_nachsenden", { customerId, leadId: x.lead.id });
    expect(nochmal).toMatchObject({ ok: false });
    expect(an(x.phone)).toHaveLength(1);
  });

  it("Bestätigung schon da: bevorzugt die kurze Nachfrage (booking_prep_nudge), danach keine zweite Nachfrage", async () => {
    await freigeben("booking_prep_nudge", "pg_booking_prep_nudge_v2_sie", "sie");
    const x = await lead({ name: "Rachid El Oufy" });
    const vorschau = await fuehreAktionAus("buchung_vorbereitung_nachsenden", { customerId, leadId: x.lead.id, vorschau: "true" });
    expect((vorschau as { info: string }).info).toMatch(/^Vorschau: Nachfrage pg_booking_prep_nudge_v2_sie/);
    const los = await fuehreAktionAus("buchung_vorbereitung_nachsenden", { customerId, leadId: x.lead.id });
    expect(los).toMatchObject({ ok: true });
    expect(letzte(x.phone)?.template?.name).toBe("pg_booking_prep_nudge_v2_sie");
    expect(params(letzte(x.phone))[0]).toBe("Rachid El Oufy");
    expect(await merker(x.conversationId, STRECKE.vorbereitungNachfrage)).toHaveLength(1);
  });
});
