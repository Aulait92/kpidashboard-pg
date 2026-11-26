// Vorbereitung nach der Buchung (Ole, 26.11.2026, Kundenfall Schwarzkopf): Lead bucht online, bevor er im Chat geschrieben
// hat. Bisher kam nur die Bestätigungsvorlage ohne Frage, das 24-h-Fenster blieb zu, die Vorbereitung begann nie.
//   1. Bestätigung ab v5: „Ihr Termin bei Herrn Testkopf“, am Ende die Frage mit [Ja, gern] [Lieber im Termin];
//      bis zur Freigabe die alte v4 (Rückfall). Anrede des Leads aus dem Formular, sonst nur bei eindeutigem Vornamen.
//   2. „Ja, gern“ startet die Strecke (Fragen-Engine, sonst Komplettcheck), „Lieber im Termin“ → „Alles klar, bis Montag!“
//   3. Keine Antwort: einmal etwa 3 Std. später (Mo bis Sa 8 bis 20 Uhr) die Nachfrage (eigene Vorlage), dann Ruhe
//   6. „Weiter auf WhatsApp“ der Buchungsseite: vorbefüllte Nachricht startet die Vorbereitung sofort, nie doppelt
//   4. Fragen-Engine (Allianz-Sparten, Bündel ohne Dubletten): Liste/Knöpfe, Fortschritt, Folgefragen, Mehrfachauswahl,
//      gemeinsame Vorvertragsfrage, Bekanntes überspringen, einmal
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
import { runVorbereitungNachfassen, STRECKE, bisWann, nachfassAb } from "@/lib/whatsapp/termin-strecke";
import { VORAB_TEXT } from "@/lib/whatsapp/vorab";
import { waWeiterKlick, waWeiterMoeglich } from "@/lib/whatsapp/buchung-whatsapp";
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
  process.env.VORBEREITUNG_FRAGEN = "0";
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

  it("„Ja, gern“ (Fragen-Engine aus): die Strecke startet mit dem Komplettcheck", async () => {
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

  it("Komplettcheck schon auf der Buchungsseite gewählt: „Ja, gern“ fragt ihn nicht noch einmal", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead();
    await prisma.appointment.update({ where: { id: x.termin.id }, data: { komplettcheck: true } });
    await bestaetigen(x);
    sent.length = 0;
    await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
    const m = letzte(x.phone);
    expect(m?.interactive?.action.buttons?.map((b) => b.reply.id) ?? []).not.toContain("komplettcheck:ja");
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(0);
    expect(an(x.phone).length).toBeGreaterThan(0);
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

describe("Nachfrage nach etwa 3 Stunden", () => {
  /** Merker der Frage auf eine feste Zeit (Samstag vor dem Termin, Berliner Zeit hh:mm, Winterzeit) legen. */
  async function frageAm(conversationId: string, startsAt: Date, uhrzeitUtc: string): Promise<Date> {
    const samstag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(startsAt.getTime() - 2 * DAY));
    const at = new Date(`${samstag}T${uhrzeitUtc}:00.000Z`);
    await prisma.message.updateMany({ where: { conversationId, direction: "internal", kind: STRECKE.vorbereitungFrage }, data: { createdAt: at } });
    return at;
  }

  it("einmal etwa 3 Std. nach der Frage (Geschäftszeit) mit eigener Vorlage und denselben Knöpfen, dann Ruhe", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    await freigeben("booking_prep_nudge", "pg_booking_prep_nudge_v2_sie", "sie");
    const x = await lead({ formData: [{ label: "Anrede", value: "Herr" }] });
    await bestaetigen(x);
    // Samstag 10 Uhr gefragt → Samstag 13 Uhr nachgefragt
    const frage = await frageAm(x.conversationId, x.termin.startsAt, "09:00");
    sent.length = 0;
    expect((await runVorbereitungNachfassen(new Date(frage.getTime() + 2 * HOUR))).gesendet).toBe(0);
    expect(nachfassAb(frage)).toEqual(new Date(frage.getTime() + 3 * HOUR));
    expect(await runVorbereitungNachfassen(new Date(frage.getTime() + 3 * HOUR + 60_000))).toMatchObject({ gesendet: 1 });
    const m = letzte(x.phone);
    expect(m?.template?.name).toBe("pg_booking_prep_nudge_v2_sie");
    expect(params(m)).toEqual(["Herr Kranert", expect.stringMatching(/^Montag, /)]);
    expect(payloads(m)).toEqual(["vorbereitung:ja", "vorbereitung:termin"]);
    // kein zweites Mal, auch nicht später
    expect((await runVorbereitungNachfassen(new Date(frage.getTime() + 4 * HOUR))).gesendet).toBe(0);
    expect((await runVorbereitungNachfassen(new Date(frage.getTime() + DAY))).gesendet).toBe(0);
  });

  it("Frage am Samstagabend: nicht nachts und nicht sonntags, sondern Montag ab 8 Uhr (Termin noch mindestens 2 Std. entfernt)", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    await freigeben("booking_prep_nudge", "pg_booking_prep_nudge_v2_sie", "sie");
    const x = await lead();
    await bestaetigen(x);
    // Samstag 18:30 Uhr gefragt
    const frage = await frageAm(x.conversationId, x.termin.startsAt, "17:30");
    const montagAcht = new Date(frage.getTime() + 37.5 * HOUR);
    expect(nachfassAb(frage)).toEqual(montagAcht);
    sent.length = 0;
    expect((await runVorbereitungNachfassen(new Date(frage.getTime() + 3.5 * HOUR))).gesendet).toBe(0);
    expect((await runVorbereitungNachfassen(new Date(frage.getTime() + 16 * HOUR))).gesendet).toBe(0);
    expect((await runVorbereitungNachfassen(new Date(montagAcht.getTime() - 60_000))).gesendet).toBe(0);
    expect((await runVorbereitungNachfassen(new Date(montagAcht.getTime() + 5 * 60_000))).gesendet).toBe(1);
  });

  it("nicht, wenn der Lead geantwortet hat; ohne freigegebene Vorlage nichts", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead();
    await bestaetigen(x);
    const frage = await frageAm(x.conversationId, x.termin.startsAt, "09:00");
    const r = await runVorbereitungNachfassen(new Date(frage.getTime() + 4 * HOUR));
    expect(r.gesendet).toBe(0);
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin");
    expect(await merker(x.conversationId, STRECKE.vorbereitungNachfrage)).toHaveLength(0);
    // mit Vorlage, aber der Lead hat geschrieben: keine Nachfrage
    await freigeben("booking_prep_nudge", "pg_booking_prep_nudge_v2_sie", "sie");
    const y = await lead();
    await bestaetigen(y);
    const f2 = await frageAm(y.conversationId, y.termin.startsAt, "09:00");
    await prisma.message.create({ data: { conversationId: y.conversationId, direction: "inbound", kind: "text", body: "Hallo", createdAt: new Date(f2.getTime() + HOUR) } });
    expect((await runVorbereitungNachfassen(new Date(f2.getTime() + 4 * HOUR))).gesendet).toBe(0);
  });

  it("„bis Montag“: heute, morgen bzw. Wochentag", () => {
    const jetzt = new Date("2026-11-26T08:00:00.000Z");
    expect(bisWann(new Date("2026-11-30T15:00:00.000Z"), jetzt)).toBe("Montag");
    expect(bisWann(new Date("2026-11-27T15:00:00.000Z"), jetzt)).toBe("morgen");
    expect(bisWann(new Date("2026-11-26T15:00:00.000Z"), jetzt)).toBe("heute");
  });
});

describe("„Weiter auf WhatsApp“ von der Buchungsseite", () => {
  it("vorbefüllte Nachricht nach dem Komplettcheck auf der Seite: Strecke startet sofort, ohne Komplettcheck-Frage, nie doppelt", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    await freigeben("booking_prep_nudge", "pg_booking_prep_nudge_v2_sie", "sie");
    const x = await lead();
    await prisma.appointment.update({ where: { id: x.termin.id }, data: { komplettcheck: true } });
    await bestaetigen(x);
    sent.length = 0;
    await schreibt(x.phone, VORAB_TEXT);
    expect(an(x.phone).length).toBeGreaterThan(0);
    expect(textVon(an(x.phone)[0])).toMatch(/^Super, danke!/);
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(0);
    const antworten = await merker(x.conversationId, STRECKE.vorbereitungAntwort);
    expect(antworten).toHaveLength(1);
    expect(JSON.parse(antworten[0].body!)).toMatchObject({ art: "ja", via: "buchungsseite", appointmentId: x.termin.id });
    expect((await prisma.leadHistory.findFirst({ where: { leadId: x.lead.id, text: { contains: "über die Buchungsseite gestartet" } } }))?.text).toBeTruthy();
    // „Ja, gern“ unter der Bestätigung danach: nichts Neues
    const vorher = an(x.phone).length;
    await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
    expect(an(x.phone)).toHaveLength(vorher);
    expect(await merker(x.conversationId, STRECKE.vorbereitungAntwort)).toHaveLength(1);
    // keine Nachfrage mehr
    const frage = (await merker(x.conversationId, STRECKE.vorbereitungFrage))[0].createdAt;
    expect((await runVorbereitungNachfassen(new Date(Math.max(nachfassAb(frage).getTime(), Date.now()) + 60_000))).gesendet).toBe(0);
  });

  it("auch ohne gestellte Frage (Bestätigung noch nicht raus): startet mit dem Komplettcheck; Bestätigung danach geht raus, Strecke nicht zweimal", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead();
    await schreibt(x.phone, "Ja gerne beantworte ich die Fragen vorab");
    const m = letzte(x.phone);
    expect(textVon(m)).toMatch(/^Super, danke!/);
    expect(m?.interactive?.action.buttons?.map((b) => b.reply.id)).toContain("komplettcheck:ja");
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(1);
    await bestaetigen(x);
    expect(an(x.phone).length).toBe(2);
    await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(1);
    expect(await merker(x.conversationId, STRECKE.vorbereitungAntwort)).toHaveLength(1);
  });

  it("zweites Mal bzw. Termin nur am Lead (Chat nicht verknüpft): Termin über den Lead, Strecke nur einmal", async () => {
    const x = await lead();
    await prisma.appointment.update({ where: { id: x.termin.id }, data: { conversationId: null } });
    await schreibt(x.phone, VORAB_TEXT);
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(1);
    await schreibt(x.phone, VORAB_TEXT);
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(1);
    expect(await merker(x.conversationId, STRECKE.vorbereitungAntwort)).toHaveLength(1);
  });

  it("ohne kommenden Termin bzw. andere Texte: nichts gestartet", async () => {
    const x = await lead();
    await prisma.appointment.update({ where: { id: x.termin.id }, data: { status: "cancelled" } });
    await schreibt(x.phone, VORAB_TEXT);
    expect(await merker(x.conversationId, STRECKE.vorbereitungAntwort)).toHaveLength(0);
    const y = await lead();
    await schreibt(y.phone, "Ich beantworte die Fragen nicht vorab");
    expect(await merker(y.conversationId, STRECKE.vorbereitungAntwort)).toHaveLength(0);
  });

  it("ohne Chat (Buchung schneller als das Erstanschreiben): Knopf trotzdem, die Nachricht legt den Chat an und startet die Vorbereitung", async () => {
    await prisma.whatsAppAccount.update({ where: { customerId }, data: { phoneNumber: "+49 151 2345678" } });
    const phone = telefon();
    const l = await prisma.lead.create({ data: { customerId, name: "Paula Ohnechat", phone, source: "Privatschutz", status: "Neuer Lead", formData: [] as never } });
    const startsAt = naechsterMontag();
    const t = await prisma.appointment.create({ data: { customerId, leadId: l.id, mode: "video", startsAt, endsAt: new Date(startsAt.getTime() + HOUR), status: "booked" } });
    expect(await waWeiterMoeglich({ id: t.id, customerId, conversationId: null, leadId: l.id })).toBe(true);
    await schreibt(phone, VORAB_TEXT);
    const conv = await prisma.conversation.findFirst({ where: { customerId, contactPhone: phone } });
    expect(conv).not.toBeNull();
    expect(await merker(conv!.id, STRECKE.vorbereitungAntwort)).toHaveLength(1);
  });

  it("Knopf auf der Seite: nur mit Nummer des Vermittlers; Klick einmal gemessen, Link zu wa.me mit Text; nach der Antwort weg", async () => {
    const x = await lead();
    const token = `mt-${uid()}`;
    await prisma.appointment.update({ where: { id: x.termin.id }, data: { manageToken: token } });
    const t = { id: x.termin.id, customerId, conversationId: x.conversationId, leadId: x.lead.id };
    expect(await waWeiterMoeglich(t)).toBe(false);
    expect(await waWeiterKlick(token)).toBeNull();
    await prisma.whatsAppAccount.update({ where: { customerId }, data: { phoneNumber: "+49 151 2345678" } });
    expect(await waWeiterMoeglich(t)).toBe(true);
    const link = await waWeiterKlick(token);
    expect(link).toBe(`https://wa.me/491512345678?text=${encodeURIComponent("Ja, gern beantworte ich die Fragen vorab.")}`);
    await waWeiterKlick(token);
    expect(await merker(x.conversationId, STRECKE.waWeiterKlick)).toHaveLength(1);
    expect(await waWeiterKlick("falsch")).toBeNull();
    await schreibt(x.phone, VORAB_TEXT);
    expect(await waWeiterMoeglich(t)).toBe(false);
    // Assistent im Chat aus: kein Knopf
    const y = await lead();
    await prisma.conversation.update({ where: { id: y.conversationId }, data: { botActive: false } });
    expect(await waWeiterMoeglich({ id: y.termin.id, customerId, conversationId: y.conversationId, leadId: y.lead.id })).toBe(false);
  });

  it("Splittest wa_weiter_knopf: Zuteilung je Lead, der Klick zählt als Ziel (einmal), in beiden Fassungen", async () => {
    const { variante, experimentStats, zuteilen, experimenteCacheLeeren } = await import("@/lib/experimente");
    experimenteCacheLeeren();
    await prisma.whatsAppAccount.update({ where: { customerId }, data: { phoneNumber: "+49 151 2345678" } });
    const vorher = await experimentStats("wa_weiter_knopf");
    const gesehen = { a: 0, b: 0 };
    for (let i = 0; i < 6; i++) {
      const x = await lead();
      const token = `mt-${uid()}`;
      await prisma.appointment.update({ where: { id: x.termin.id }, data: { manageToken: token } });
      const v = await variante("wa_weiter_knopf", x.lead.id);
      expect(v).toBe(zuteilen("wa_weiter_knopf", x.lead.id));
      gesehen[v]++;
      if (i < 3) {
        expect(await waWeiterKlick(token)).toMatch(/^https:\/\/wa\.me\//);
        await waWeiterKlick(token);
      }
    }
    const nachher = await experimentStats("wa_weiter_knopf");
    expect(nachher.a.n + nachher.b.n - vorher.a.n - vorher.b.n).toBe(6);
    expect(nachher.a.ziel + nachher.b.ziel - vorher.a.ziel - vorher.b.ziel).toBe(3);
    expect(gesehen.a + gesehen.b).toBe(6);
  });
});

describe("Fragen-Engine (Allianz-Sparten, Privatschutz als Bündel)", () => {
  beforeEach(() => {
    process.env.VORBEREITUNG_FRAGEN = "1";
  });
  afterEach(() => {
    process.env.VORBEREITUNG_FRAGEN = "0";
  });
  const zeilen = (m: Gesendet | undefined) => m?.interactive?.action.sections?.[0].rows.map((r) => r.title) ?? [];
  const knoepfe = (m: Gesendet | undefined) => m?.interactive?.action.buttons?.map((b) => b.reply.title) ?? [];

  it("Bündel ohne Dubletten: Liste, Fortschritt, Folgefragen, Mehrfachauswahl, gemeinsame Vorvertragsfrage, Adresse, dann Komplettcheck", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    // Geburtsdatum und PLZ aus dem Formular (nicht gefragt)
    const x = await lead({
      formData: [
        { label: "Welche Versicherungen interessieren Sie?", value: "Haftpflicht, Hausrat, Rechtsschutz" },
        { label: "Geburtsdatum", value: "01.01.1985" },
        { label: "Postleitzahl", value: "10115" },
      ],
    });
    await bestaetigen(x);
    sent.length = 0;
    await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
    let m = letzte(x.phone);
    expect(m?.interactive?.type).toBe("list");
    expect(textVon(m)).toBe("Super, danke! Wer soll versichert sein?");
    expect(zeilen(m)).toEqual(["Nur mich", "Mich und Partner:in", "Mich und Kind(er)", "Mich, Partner:in, Kinder", "Rest im Termin"]);
    expect((m?.interactive?.action.sections?.[0].rows[1] as { description?: string }).description).toBe("mich und meine:n Partner:in");
    // Privatschutz als Bündel am Lead vermerkt
    const h = await prisma.leadHistory.findFirst({ where: { leadId: x.lead.id, text: { startsWith: "Bündel gewünscht" } } });
    expect(h?.text).toBe("Bündel gewünscht: Hausrat, Haftpflicht, Rechtsschutz");
    await knopf(x.phone, "Mich und Partner:in", "vf:gemeinsam.versicherte:partner", "interactive");
    expect(textVon(letzte(x.phone))).toBe("Danke! Wie sind Sie beruflich tätig?");
    await schreibt(x.phone, "Beamter");
    // eine Schadenfrage für alle drei Sparten, bei „Ja“ je Sparte die Anzahl (ohne Fortschritt)
    m = letzte(x.phone);
    expect(textVon(m)).toBe("Danke! Gab es in den letzten 5 Jahren einen Schaden bei der Haftpflicht oder beim Hausrat, oder einen Rechtsstreit bzw. eine Rechtsberatung?");
    expect(knoepfe(m)).toEqual(["Nein, nichts", "Ja", "Rest im Termin"]);
    await knopf(x.phone, "Ja", "vf:gemeinsam.schaeden:ja", "interactive");
    expect(textVon(letzte(x.phone))).toBe("Danke! Wie viele Haftpflichtschäden waren es? 0, wenn keiner.");
    await schreibt(x.phone, "1");
    expect(textVon(letzte(x.phone))).toBe("Danke! Wie viele Hausratschäden waren es? 0, wenn keiner.");
    await schreibt(x.phone, "keiner");
    expect(textVon(letzte(x.phone))).toBe("Danke! Wie viele Rechtsstreitigkeiten oder Rechtsberatungen waren es? 0, wenn keine.");
    await schreibt(x.phone, "0");
    expect(textVon(letzte(x.phone))).toBe("Danke! Wie wohnen Sie?");
    await knopf(x.phone, "Wohnung ab 1. Stock", "vf:hausrat.lage:wohnung-og", "interactive");
    expect(textVon(letzte(x.phone))).toBe("Danke! Wie groß ist Ihre Wohnung ungefähr? Zum Beispiel 75 qm.");
    await schreibt(x.phone, "ziemlich groß");
    expect(textVon(letzte(x.phone))).toBe("Das habe ich nicht ganz verstanden. Können Sie mir kurz eine Zahl schreiben?");
    await schreibt(x.phone, "75 qm");
    await knopf(x.phone, "Alle vier Bereiche", "vf:rechtsschutz.bereiche:alle", "interactive");
    // gemeinsame Vorvertragsfrage: Teilantwort, nichts nachgefragt
    m = letzte(x.phone);
    expect(textVon(m)).toBe(
      "Danke! Wo sind Sie für Haftpflicht, Hausrat und Rechtsschutz aktuell versichert und bis wann laufen die Verträge? Ungefähr reicht, zum Beispiel: Haftpflicht HUK bis 03/2027, Hausrat noch nicht.",
    );
    expect(knoepfe(m)).toEqual(["Nicht versichert", "Weiß ich nicht", "Rest im Termin"]);
    await schreibt(x.phone, "Haftpflicht bei der HUK, den Rest weiß ich gerade nicht");
    // Zusatzbausteine werden nicht gefragt (Ole, 26.11.2026: bietet der Vermittler im Termin an)
    expect(textVon(letzte(x.phone))).toBe("Danke! Wie lautet die Adresse Ihrer Wohnung? Straße und Hausnummer reichen.");
    await schreibt(x.phone, "Musterweg 5");
    // danach der Komplettcheck
    m = letzte(x.phone);
    expect(m?.interactive?.action.buttons?.map((b) => b.reply.id)).toContain("komplettcheck:ja");
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: x.conversationId } });
    expect(conv.qualificationData).toMatchObject({
      versichern: "Versichert: Mich und Partner:in",
      beruf: "Öffentlicher Dienst",
      vorschaeden: "ja; Haftpflicht: 1; Hausrat: 0; Rechtsschutz: 0",
      wohnflaeche: "Lage: Wohnung ab 1. Stock; Fläche: 75 m²",
      bereiche: "Privat, Beruf, Verkehr und Wohnen",
      vorhanden: "Vorverträge: Haftpflicht bei der HUK, den Rest weiß ich gerade nicht",
      plz: "Musterweg 5",
    });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: x.lead.id } });
    const va = l.vorbereitungsAngaben as { werte: Record<string, { wert: string }>; offen: string[]; buendel: string[] };
    expect(va.werte["hausrat.flaeche"].wert).toBe("75 m²");
    expect(va.offen).toEqual(["Ablauf der bisherigen Verträge"]);
    expect(va.buendel).toEqual(["Hausrat", "Haftpflicht", "Rechtsschutz"]);
  });

  it("„Rest im Termin“: freundlich stoppen, offene Punkte am Lead und im Verlauf, keine weiteren Fragen", async () => {
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead({ formData: [{ label: "Welche Versicherungen interessieren Sie?", value: "Hausrat" }] });
    await bestaetigen(x);
    await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
    expect(textVon(letzte(x.phone))).toBe("Super, danke! Wann sind Sie geboren? Zum Beispiel 15.03.1985.");
    sent.length = 0;
    await knopf(x.phone, "Rest im Termin", "vf:rest", "interactive");
    expect(an(x.phone)).toHaveLength(1);
    expect(textVon(an(x.phone)[0])).toBe("Alles klar, den Rest klärt Herr Testkopf mit Ihnen im Termin. Bis Montag!");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: x.lead.id } });
    expect(l.vorbereitungsAngaben as { offen: string[]; rest: boolean }).toMatchObject({ rest: true, offen: expect.arrayContaining(["Geburtsdatum", "Wohnfläche"]) });
    expect((l.vorbereitungsAngaben as { buendel?: unknown }).buendel).toBeUndefined();
    const h = await prisma.leadHistory.findFirst({ where: { leadId: x.lead.id, text: { startsWith: "Im Termin klären" } } });
    expect(h?.text).toContain("Wohnfläche");
    await schreibt(x.phone, "Danke!");
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(0);
  });

  it("Schalter aus (VORBEREITUNG_FRAGEN=0): „Ja, gern“ startet direkt mit dem Komplettcheck", async () => {
    process.env.VORBEREITUNG_FRAGEN = "0";
    await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
    const x = await lead({ formData: [{ label: "Welche Versicherungen interessieren Sie?", value: "Hausrat" }] });
    await bestaetigen(x);
    await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
    expect(letzte(x.phone)?.interactive?.action.buttons?.map((b) => b.reply.id)).toContain("komplettcheck:ja");
    expect(await merker(x.conversationId, STRECKE.angabeFrage)).toHaveLength(0);
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
    expect(params(letzte(x.phone))[0]).toBe("Herr El Oufy");
    expect(await merker(x.conversationId, STRECKE.vorbereitungNachfrage)).toHaveLength(1);
  });
});
