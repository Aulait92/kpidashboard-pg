// Einmal nachhaken bei „Rest im Termin“ (Ole, 27.11.2026, Fall Klaus Kiefer, Vermittler Lohmann): „Hier hat sich der
// Assistent zu schnell abwimmeln lassen. Ohne die Dokumente kann Lohmann keinen Preis rechnen.“
//   1. erstes „Rest im Termin“ bzw. „Lieber im Termin“, solange Angaben für den Beitrag fehlen: einmal nachhaken mit
//      [Gut, machen wir] [Lieber im Termin]
//   2. „Gut, machen wir“ (bzw. getippt): weiter, nur noch die Angaben für den Beitrag, dann Schluss
//   3. zweites „im Termin“: stoppen wie bisher; nie zweimal nachhaken je Termin (auch nicht bei zwei Klicks zugleich)
//   4. fehlt nichts für den Beitrag: sofort stoppen
//   5. Kfz: Fahrzeugschein und Rechnung; „Gut, machen wir“ → Bitte um die Fotos, „im Termin“ → Satz mit der Foto-Bitte
// Aufbau wie tests/integration/buchung-vorbereitung.test.ts (360dialog nachgebildet, echte Test-Datenbank).
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
import { STRECKE } from "@/lib/whatsapp/termin-strecke";
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

const knoepfe = (m: Gesendet | undefined) => m?.interactive?.action.buttons?.map((b) => b.reply.title) ?? [];
const ids = (m: Gesendet | undefined) => m?.interactive?.action.buttons?.map((b) => b.reply.id) ?? [];

const POLICEN_ENV = {
  POLICEN_S3_ENDPOINT: "https://test123.eu.r2.cloudflarestorage.com",
  POLICEN_S3_BUCKET: "pg-policen-eu",
  POLICEN_S3_ACCESS_KEY_ID: "id",
  POLICEN_S3_SECRET_ACCESS_KEY: "secret",
  POLICEN_SCHLUESSEL: Buffer.alloc(32, 11).toString("base64"),
};

beforeAll(() => requireTestDb());
ohneSplittest("komplettcheck_text", "komplettcheck_ja");
ohneSplittest("termin_zusage");
beforeEach(async () => {
  process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  process.env.APP_URL = "https://app.example.de";
  process.env.VORBEREITUNG_FRAGEN = "1";
  sent.length = 0;
  vi.stubGlobal("fetch", vi.fn(fake360));
  await prisma.customer.deleteMany({ where: { name: KUNDE } });
  customerId = (await makeCustomer({ name: KUNDE, leadAddress: "sie" })).id;
  phoneNumberId = `pn-nh-${uid()}`;
  await prisma.whatsAppAccount.create({ data: { customerId, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret("d360-nh"), phoneNumberId } });
  await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, allowPhone: true } });
  await prisma.erstinformation.create({ data: { customerId, token: `tok-${uid()}`, name: "Anid Testkopf", anrede: "Herr", versicherer: ["Allianz"] } });
  await freigeben("booking_confirmation", "pg_booking_confirmation_v6_sie", "sie");
});
afterEach(async () => {
  vi.unstubAllGlobals();
  process.env = { ...ENV };
  await prisma.lead.deleteMany({ where: { customerId } });
  await cleanupCustomer(customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

const HAUSRAT = [{ label: "Welche Versicherungen interessieren Sie?", value: "Hausrat" }];

/** Hausrat-Lead, „Ja, gern“: erste Frage der Engine steht offen. */
async function engineGestartet(formData: unknown[] = HAUSRAT) {
  const x = await lead({ formData });
  await bestaetigen(x);
  await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
  sent.length = 0;
  return x;
}

const BEKANNT = [...HAUSRAT, { label: "Geburtsdatum", value: "01.01.1985" }, { label: "Postleitzahl", value: "10115" }];
const NACHHAKEN_HAUSRAT =
  "Verstehe! Nur kurz: Ohne Angaben wie Wohnsituation und Wohnfläche kann Herr Testkopf im Termin noch keinen Beitrag für Sie rechnen, dann wird meist ein zweiter Termin nötig. Es sind nur noch drei kurze Fragen. Wollen wir die noch schnell machen?";
const STOPP = "Alles klar, den Rest klärt Herr Testkopf mit Ihnen im Termin. Bis Montag!";

describe("„Rest im Termin“ in der Fragen-Engine", () => {
  it("erstes Mal: einmal nachhaken mit [Gut, machen wir] [Lieber im Termin]; danach nur die Angaben für den Beitrag, dann Schluss", async () => {
    const x = await engineGestartet(BEKANNT);
    expect(textVon(letzte(x.phone))).toBe("");
    await knopf(x.phone, "Rest im Termin", "vf:rest", "interactive");
    expect(an(x.phone)).toHaveLength(1);
    expect(textVon(letzte(x.phone))).toBe(NACHHAKEN_HAUSRAT);
    expect(knoepfe(letzte(x.phone))).toEqual(["Gut, machen wir", "Lieber im Termin"]);
    expect(ids(letzte(x.phone))).toEqual(["vf:weiter", "vf:rest"]);
    expect(await merker(x.conversationId, STRECKE.angabenRest)).toHaveLength(0);
    await knopf(x.phone, "Gut, machen wir", "vf:weiter", "interactive");
    expect(textVon(letzte(x.phone))).toBe("Super, danke! Hatten Sie in den letzten 5 Jahren einen Hausratschaden?");
    // alter Klick auf „Gut, machen wir“: nichts
    const vorher = an(x.phone).length;
    await knopf(x.phone, "Gut, machen wir", "vf:weiter", "interactive");
    expect(an(x.phone)).toHaveLength(vorher);
    await schreibt(x.phone, "Nein");
    expect(textVon(letzte(x.phone))).toBe("Danke! Wie wohnen Sie?");
    await knopf(x.phone, "Wohnung ab 1. Stock", "vf:hausrat.lage:wohnung-og", "interactive");
    await schreibt(x.phone, "75 qm");
    // Vorvertrag und Adresse (nicht für den Beitrag) bleiben für den Termin, kein Komplettcheck
    expect(textVon(letzte(x.phone))).toBe("Danke, das reicht schon! Den Rest klärt Herr Testkopf mit Ihnen im Termin. Bis Montag!");
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(0);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: x.lead.id } });
    const va = l.vorbereitungsAngaben as { werte: Record<string, { wert: string }>; offen: string[]; rest: boolean };
    expect(va.werte["hausrat.flaeche"].wert).toBe("75 m²");
    expect(va.rest).toBe(true);
    expect(va.offen).toEqual(expect.arrayContaining(["Adresse (Straße, Hausnummer)"]));
    expect(va.offen).not.toContain("Wohnfläche");
    expect(await merker(x.conversationId, STRECKE.restNachhaken)).toHaveLength(1);
  });

  it("zweites „Rest im Termin“ (nach „Gut, machen wir“ bzw. direkt auf das Nachhaken): stoppen wie bisher, nie zweimal nachhaken", async () => {
    const x = await engineGestartet(BEKANNT);
    await knopf(x.phone, "Rest im Termin", "vf:rest", "interactive");
    await knopf(x.phone, "Gut, machen wir", "vf:weiter", "interactive");
    sent.length = 0;
    await knopf(x.phone, "Rest im Termin", "vf:rest", "interactive");
    expect(an(x.phone).map(textVon)).toEqual([STOPP]);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: x.lead.id } });
    expect(l.vorbereitungsAngaben as { offen: string[]; rest: boolean }).toMatchObject({ rest: true, offen: expect.arrayContaining(["Wohnfläche", "Wohnsituation"]) });

    const y = await engineGestartet(BEKANNT);
    await knopf(y.phone, "Rest im Termin", "vf:rest", "interactive");
    await knopf(y.phone, "Lieber im Termin", "vf:rest", "interactive");
    expect(an(y.phone).map(textVon)).toEqual([NACHHAKEN_HAUSRAT, STOPP]);
    expect(await merker(y.conversationId, STRECKE.restNachhaken)).toHaveLength(1);
    await schreibt(y.phone, "Danke!");
    expect(await merker(y.conversationId, STRECKE.komplettFrage)).toHaveLength(0);
  });

  it("getippt: „das klären wir lieber im Termin“ → nachhaken; „ok“ → Frage; „nein“ → stoppen; Antwort statt Ja zählt als Antwort", async () => {
    const x = await engineGestartet(BEKANNT);
    await schreibt(x.phone, "Das klären wir lieber im Termin");
    expect(textVon(letzte(x.phone))).toBe(NACHHAKEN_HAUSRAT);
    await schreibt(x.phone, "Ok");
    expect(textVon(letzte(x.phone))).toBe("Super, danke! Hatten Sie in den letzten 5 Jahren einen Hausratschaden?");

    const y = await engineGestartet(BEKANNT);
    await schreibt(y.phone, "Rest im Termin");
    await schreibt(y.phone, "Nein, lieber nicht");
    expect(an(y.phone).map(textVon)).toEqual([NACHHAKEN_HAUSRAT, STOPP]);

    // erste Frage Geburtsdatum: nach dem Nachhaken gleich die Antwort getippt
    const z = await engineGestartet(HAUSRAT);
    expect(textVon(letzte(z.phone))).toBe("");
    await knopf(z.phone, "Rest im Termin", "vf:rest", "interactive");
    expect(textVon(letzte(z.phone))).toBe(
      "Verstehe! Nur kurz: Ohne Angaben wie Geburtsdatum und Postleitzahl kann Herr Testkopf im Termin noch keinen Beitrag für Sie rechnen, dann wird meist ein zweiter Termin nötig. Es sind nur noch ein paar kurze Fragen. Wollen wir die noch schnell machen?",
    );
    await schreibt(z.phone, "15.03.1985");
    expect(textVon(letzte(z.phone))).toMatch(/^Danke! /);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: z.conversationId } });
    expect(JSON.stringify(conv.qualificationData)).toContain("15.03.1985");
  });

  it("fehlt nichts mehr für den Beitrag: sofort stoppen wie bisher", async () => {
    const x = await engineGestartet(BEKANNT);
    await knopf(x.phone, "Nein, nichts", "vf:gemeinsam.schaeden:nein", "interactive");
    await knopf(x.phone, "Wohnung ab 1. Stock", "vf:hausrat.lage:wohnung-og", "interactive");
    await schreibt(x.phone, "75 qm");
    sent.length = 0;
    await knopf(x.phone, "Rest im Termin", "vf:rest", "interactive");
    expect(an(x.phone).map(textVon)).toEqual([STOPP]);
    expect(await merker(x.conversationId, STRECKE.restNachhaken)).toHaveLength(0);
  });

  it("zwei Klicks fast gleichzeitig: höchstens einmal nachhaken (der zweite zählt als zweites „Rest im Termin“)", async () => {
    const x = await engineGestartet(BEKANNT);
    await Promise.all([knopf(x.phone, "Rest im Termin", "vf:rest", "interactive"), knopf(x.phone, "Rest im Termin", "vf:rest", "interactive")]);
    expect(an(x.phone).filter((m) => textVon(m) === NACHHAKEN_HAUSRAT)).toHaveLength(1);
    expect(an(x.phone).length).toBeLessThanOrEqual(2);
  });
});

describe("„Lieber im Termin“ auf die Frage nach der Vorbereitung", () => {
  it("fehlen Angaben: einmal nachhaken (gleiche Payloads); zweites Mal „Alles klar, bis Montag!“", async () => {
    const x = await lead({ formData: BEKANNT });
    await bestaetigen(x);
    sent.length = 0;
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin");
    expect(textVon(letzte(x.phone))).toBe(NACHHAKEN_HAUSRAT);
    expect(ids(letzte(x.phone))).toEqual(["vorbereitung:ja", "vorbereitung:termin"]);
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin", "interactive");
    expect(an(x.phone).map(textVon)).toEqual([NACHHAKEN_HAUSRAT, "Alles klar, bis Montag!"]);
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin", "interactive");
    expect(an(x.phone)).toHaveLength(2);
  });

  it("„Gut, machen wir“ (Knopf bzw. getippt): nur die Angaben für den Beitrag", async () => {
    const x = await lead({ formData: BEKANNT });
    await bestaetigen(x);
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin");
    await schreibt(x.phone, "Gut, machen wir");
    expect(textVon(letzte(x.phone))).toBe("Super, danke! Hatten Sie in den letzten 5 Jahren einen Hausratschaden?");
    await knopf(x.phone, "Nein, nichts", "vf:gemeinsam.schaeden:nein", "interactive");
    await knopf(x.phone, "Wohnung ab 1. Stock", "vf:hausrat.lage:wohnung-og", "interactive");
    await schreibt(x.phone, "75 qm");
    expect(textVon(letzte(x.phone))).toBe("Danke, das reicht schon! Den Rest klärt Herr Testkopf mit Ihnen im Termin. Bis Montag!");
    expect(await merker(x.conversationId, STRECKE.komplettFrage)).toHaveLength(0);
  });
});

describe("Kfz: Fahrzeugschein und letzte Rechnung", () => {
  beforeEach(() => {
    Object.assign(process.env, POLICEN_ENV);
  });
  const KFZ_NACHHAKEN =
    "Verstehe! Nur kurz: Ohne Ihren Fahrzeugschein und die letzte Rechnung Ihrer Kfz-Versicherung kann Herr Testkopf im Termin noch keinen Beitrag für Sie rechnen, dann wird meist ein zweiter Termin nötig. Es sind nur zwei Fotos, das dauert eine Minute. Wollen wir das noch schnell machen?";

  it("„Lieber im Termin“: nachhaken; bleibt er dabei, Satz mit der Foto-Bitte", async () => {
    const x = await lead({ source: "Kfz-Versicherung" });
    await bestaetigen(x);
    sent.length = 0;
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin");
    expect(textVon(letzte(x.phone))).toBe(KFZ_NACHHAKEN);
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin", "interactive");
    expect(textVon(letzte(x.phone))).toBe(
      "Alles klar! Wenn Sie vorher noch kurz Fahrzeugschein und letzte Rechnung als Foto schicken, kann Herr Testkopf den Beitrag schon vorbereiten. Bis Montag!",
    );
  });

  it("„Gut, machen wir“: gleich die Bitte um die zwei Fotos (mit Einwilligung)", async () => {
    const x = await lead({ source: "Kfz-Versicherung" });
    await bestaetigen(x);
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin");
    sent.length = 0;
    await knopf(x.phone, "Gut, machen wir", "vorbereitung:ja", "interactive");
    expect(textVon(an(x.phone)[0])).toMatch(/^Super, danke! Damit Herr Testkopf Ihren Beitrag vorab rechnen kann: Schicken Sie bitte ein Foto von Ihrem Fahrzeugschein/);
    expect(await merker(x.conversationId, STRECKE.policenBitte)).toHaveLength(1);
  });

  it("in der Engine: „Rest im Termin“ → nachhaken, „Gut, machen wir“ → Foto-Bitte; zweites Mal: Stopp mit Foto-Satz", async () => {
    const x = await lead({ source: "Kfz-Versicherung" });
    await bestaetigen(x);
    await knopf(x.phone, "Ja, gern", "vorbereitung:ja");
    expect(textVon(letzte(x.phone))).toMatch(/Wo ist Ihr Fahrzeug aktuell versichert/);
    await knopf(x.phone, "Rest im Termin", "vf:rest", "interactive");
    expect(textVon(letzte(x.phone))).toBe(KFZ_NACHHAKEN);
    sent.length = 0;
    await knopf(x.phone, "Gut, machen wir", "vf:weiter", "interactive");
    expect(textVon(an(x.phone)[0])).toMatch(/^Super, danke! Damit Herr Testkopf Ihren Beitrag vorab rechnen kann/);

    const y = await lead({ source: "Kfz-Versicherung" });
    await bestaetigen(y);
    await knopf(y.phone, "Ja, gern", "vorbereitung:ja");
    await knopf(y.phone, "Rest im Termin", "vf:rest", "interactive");
    await knopf(y.phone, "Lieber im Termin", "vf:rest", "interactive");
    expect(textVon(letzte(y.phone))).toBe(
      "Alles klar, den Rest klärt Herr Testkopf mit Ihnen im Termin. Wenn Sie vorher noch kurz Fahrzeugschein und letzte Rechnung als Foto schicken, kann Herr Testkopf den Beitrag schon vorbereiten. Bis Montag!",
    );
  });

  it("Unterlagen schon da bzw. Policen-Funktion aus: sofort „Alles klar, bis Montag!“", async () => {
    const x = await lead({ source: "Kfz-Versicherung" });
    for (const art of ["fahrzeugschein", "kfz_police"]) {
      await prisma.leadDocument.create({ data: { customerId, leadId: x.lead.id, mimeType: "image/jpeg", fileName: `${art}.jpg`, size: 100, dokumentArt: art } });
    }
    await bestaetigen(x);
    sent.length = 0;
    await knopf(x.phone, "Lieber im Termin", "vorbereitung:termin");
    expect(an(x.phone).map(textVon)).toEqual(["Alles klar, bis Montag!"]);

    for (const k of Object.keys(POLICEN_ENV)) delete process.env[k];
    const y = await lead({ source: "Kfz-Versicherung" });
    await bestaetigen(y);
    sent.length = 0;
    await knopf(y.phone, "Lieber im Termin", "vorbereitung:termin");
    expect(an(y.phone).map(textVon)).toEqual(["Alles klar, bis Montag!"]);
  });
});
