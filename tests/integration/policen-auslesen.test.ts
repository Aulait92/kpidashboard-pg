// Policen auslesen (Ole, 18.11.2026, lib/policen/auslesen): Vorbedingungen (Schlüssel, Einwilligung mit KI, Sparte
// vorab, Nachweis für PKV), OpenAI-EU-Adapter (gemockt, keine echten Aufrufe), Nachfilter mit „böser“ PKV-Antwort
// (nichts davon in Ausgabe, DB oder Logs), Bremse, 401-Pause, Löschung mit der Unterlage, Bestand, Tageshinweise und die
// Trennung vom Chat-Assistenten zur Laufzeit.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

type Req = { model: string; store?: boolean; instructions?: string; input: { role: string; content: { type: string; file_data?: string; image_url?: string; filename?: string; text?: string }[] }[]; text?: { format?: { type: string; strict?: boolean; schema?: unknown } } };
const oa: { antwort: unknown; status401: boolean; calls: Req[]; clients: Record<string, unknown>[] } = { antwort: {}, status401: false, calls: [], clients: [] };

vi.mock("openai", () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class OpenAI {
    static APIError = APIError;
    responses = {
      create: async (req: Req) => {
        oa.calls.push(req);
        if (oa.status401) throw new APIError(401, "Incorrect API key provided: sk-test (Inhalt der Anfrage)");
        return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(oa.antwort) }] }], output_text: JSON.stringify(oa.antwort) };
      },
    };
    constructor(opts: Record<string, unknown>) {
      oa.clients.push(opts);
    }
  }
  return { default: OpenAI, OpenAI };
});

const chat: { requests: unknown[] } = { requests: [] };
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (req: unknown) => {
        chat.requests.push(req);
        return { content: [{ type: "text", text: "Danke! Passt Ihnen morgen um 10 Uhr?" }], stop_reason: "end_turn" };
      },
    };
  },
}));
const push = vi.fn(async () => ({ sent: 1, removed: 0, errors: [] }));
vi.mock("@/lib/push", () => ({ sendToAdmins: (...a: unknown[]) => push(...(a as [])), sendToBuyersOfCustomer: async () => ({ sent: 0, removed: 0, errors: [] }), sendToUser: async () => ({ sent: 0, removed: 0, errors: [] }) }));
const waSend = vi.fn(async () => ({ messageId: `wamid.out-${Math.random()}`, raw: {} }));
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return { ...real, sendText: (...a: unknown[]) => waSend(...(a as [])), sendTemplate: (...a: unknown[]) => waSend(...(a as [])), sendButtons: (...a: unknown[]) => waSend(...(a as [])), sendDocument: (...a: unknown[]) => waSend(...(a as [])) };
});
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));

import { prisma } from "@/lib/prisma";
import { encryptBytes, encryptSecret } from "@/lib/encryption";
import { legeAb, setzeSpeicherFuerTests, type Speicher } from "@/lib/policen/ablage";
import {
  auslesenStatus,
  auslesenTaeglich,
  bestaetigeAuszug,
  korrigiereAuszug,
  ladeVergleich,
  liesUnterlageAus,
  nachEingang,
  setzeZdrNachweis,
  uebernimmInBestand,
  vergleichKurz,
  waehleSparte,
} from "@/lib/policen/auslesen/server";
import { runBotTurn } from "@/lib/whatsapp/bot";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
// Privater Policen-Bucket (lib/policen/ablage.ts) im Speicher
const ABLAGE_ENV = {
  POLICEN_S3_ENDPOINT: "https://test123.eu.r2.cloudflarestorage.com",
  POLICEN_S3_BUCKET: "pg-policen-eu",
  POLICEN_S3_ACCESS_KEY_ID: "id",
  POLICEN_S3_SECRET_ACCESS_KEY: "secret",
  POLICEN_SCHLUESSEL: Buffer.alloc(32, 11).toString("base64"),
};
const objekte = new Map<string, Buffer>();
const memory: Speicher = {
  put: async (k, b) => void objekte.set(k, b),
  get: async (k) => objekte.get(k) ?? null,
  del: async (ks) => ks.forEach((k) => objekte.delete(k)),
  list: async () => [],
};
let seq = 0;
const newPhone = () => `4916${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;

async function pdf(zeilen: string[]): Promise<Buffer> {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([595, 842]);
  zeilen.forEach((z, i) => p.drawText(z, { x: 50, y: 780 - i * 20, size: 12, font }));
  return Buffer.from(await d.save());
}

const HAUSRAT_ANTWORT = {
  sparte: "hausrat",
  felder: {
    versicherer: "Teststadt Versicherung AG",
    tarifname: "Hausrat Top",
    versicherungsnummer: "HR-998877-4711",
    beitrag: 120,
    zahlweise: "jaehrlich",
    beginn: "2021-03-01",
    ablauf: "2027-03-01",
    kuendigungsfrist_monate: 3,
    naechster_kuendigungstermin: null,
    selbstbeteiligung: 0,
    versicherungssumme: 65000,
    wohnflaeche: 80,
    unterversicherungsverzicht: true,
    elementar: false,
    fahrrad: true,
  },
  unsicher: ["wohnflaeche"],
};

// Synthetische PKV-Police mit Zuschlag und Ausschluss; die „böse“ KI-Antwort gibt beides zurück
const PKV_TEXT = ["Versicherungsschein Krankenversicherung", "Tarif Komfort 600", "Risikozuschlag 30 % wegen Rueckenleiden", "Leistungsausschluss: Wirbelsaeule"];
const PKV_BOESE = {
  sparte: "pkv",
  felder: {
    versicherer: "Musterkasse Kranken AG",
    tarifname: "Komfort 600 mit Risikozuschlag",
    versicherungsnummer: "KV-123456",
    beitrag: 612.4,
    zahlweise: "monatlich",
    selbstbehalt: 600,
    krankentagegeld: 100,
    risikozuschlag: 45.5,
    leistungsausschluss: "Wirbelsäule",
  },
  unsicher: [],
  diagnosen: ["Rückenleiden"],
};
const VERBOTEN = ["zuschlag", "Zuschlag", "Rücken", "Ruecken", "Wirbelsäule", "Wirbelsaeule", "ausschluss", "Ausschluss", "Rückenleiden", "123456", "998877"];

describe("Policen auslesen", () => {
  let customerId = "";
  let ownerId = "";
  const logs: string[] = [];
  const env = { ...process.env };

  async function leadMitUnterlage(o: { data: Buffer; sparte?: string | null; mime?: string; nachweis?: { ki: boolean | null; version: string; art?: string } | null; leadExtra?: Record<string, unknown> }) {
    const phone = newPhone();
    const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, source: "Privatschutz", status: "Termin", reached: true, assignedUserId: ownerId, ...o.leadExtra } });
    const { storageKey, dateiSchluessel } = await legeAb(customerId, lead.id, o.data);
    const doc = await prisma.leadDocument.create({
      data: { customerId, leadId: lead.id, status: "gespeichert", mimeType: o.mime ?? "application/pdf", fileName: "Julia Schneider Police.pdf", size: o.data.length, storageKey, dateiSchluessel, sparte: o.sparte ?? null },
    });
    if (o.nachweis !== null) await nachweis(lead.id, phone, o.nachweis ?? { ki: true, version: "2026-11-18.g2" });
    return { lead, doc, phone };
  }
  async function nachweis(leadId: string, phone: string, n: { ki: boolean | null; version: string; art?: string }) {
    await prisma.$executeRaw`INSERT INTO "PolicenNachweis" ("id","customerId","leadId","phone","art","ki","textVersion","quelle","createdAt") VALUES (${`pn-${uid()}`}, ${customerId}, ${leadId}, ${phone}, ${n.art ?? "einwilligung"}, ${n.ki}, ${n.version}, 'whatsapp', ${new Date(Date.now() + ++seq)})`;
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.ANTHROPIC_API_KEY ||= "test";
    const c = await makeCustomer({ name: `Agentur Kannapinn ${uid()}`, leadAddress: "sie" });
    customerId = c.id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
    await prisma.policenAuslesenEinstellung.deleteMany({});
    await prisma.policenAuslesenTag.deleteMany({});
  });
  afterAll(async () => {
    setzeSpeicherFuerTests(null);
    await prisma.policenAuslesenEinstellung.deleteMany({});
    await prisma.policenAuslesenTag.deleteMany({});
    await cleanupCustomer(customerId);
  });
  beforeEach(async () => {
    for (const k of Object.keys(process.env)) if (/^POLICEN_/.test(k)) delete process.env[k];
    Object.assign(process.env, { POLICEN_OPENAI_API_KEY: "sk-test-geheim", ...ABLAGE_ENV });
    setzeSpeicherFuerTests(memory);
    oa.antwort = HAUSRAT_ANTWORT;
    oa.status401 = false;
    oa.calls = [];
    oa.clients = [];
    chat.requests = [];
    push.mockClear();
    logs.length = 0;
    for (const m of ["log", "info", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
    await prisma.policenAuslesenEinstellung.deleteMany({});
    await prisma.policenAuslesenTag.deleteMany({});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(process.env)) if (/^POLICEN_/.test(k) && !(k in env)) delete process.env[k];
  });

  it("ohne Schlüssel, ohne Einwilligung mit KI oder mit alter Version: kein Aufruf, nichts gespeichert", async () => {
    const data = await pdf(["Ihre Hausratversicherung"]);
    delete process.env.POLICEN_OPENAI_API_KEY;
    const a = await leadMitUnterlage({ data, sparte: "hausrat" });
    expect(await nachEingang(a.lead.id)).toBe(0);
    expect(await liesUnterlageAus(a.doc.id)).toEqual({ status: "gesperrt:aus" });
    process.env.POLICEN_OPENAI_API_KEY = "sk-test-geheim";
    // Ohne Policen-Bucket: aus
    delete process.env.POLICEN_S3_BUCKET;
    expect(await liesUnterlageAus(a.doc.id)).toEqual({ status: "gesperrt:aus" });
    process.env.POLICEN_S3_BUCKET = ABLAGE_ENV.POLICEN_S3_BUCKET;
    process.env.POLICEN_AUSLESEN_AN = "0";
    expect(await liesUnterlageAus(a.doc.id)).toEqual({ status: "gesperrt:aus" });
    delete process.env.POLICEN_AUSLESEN_AN;

    const ohneEinwilligung = await leadMitUnterlage({ data, sparte: "hausrat", nachweis: null });
    const ohneKi = await leadMitUnterlage({ data, sparte: "hausrat", nachweis: { ki: false, version: "a-2026-11-18" } });
    const alt = await leadMitUnterlage({ data, sparte: "hausrat", nachweis: { ki: true, version: "2026-11-17.3" } });
    // Auflage A9: Fassung ohne den Satz zu „ohne KI“ deckt das Auslesen nicht
    const ohneA9 = await leadMitUnterlage({ data, sparte: "hausrat", nachweis: { ki: true, version: "2026-11-18.g1" } });
    const widerrufen = await leadMitUnterlage({ data, sparte: "hausrat" });
    await nachweis(widerrufen.lead.id, widerrufen.phone, { ki: null, version: "a-2026-11-18", art: "widerruf" });
    for (const x of [ohneEinwilligung, alt, ohneA9, widerrufen]) {
      expect(await liesUnterlageAus(x.doc.id)).toEqual({ status: "gesperrt:einwilligung" });
      expect(await nachEingang(x.lead.id)).toBe(0);
    }
    // Einwilligung nur zum Speichern („ohne KI“) bzw. Stichwort nach einer Einwilligung mit KI
    const stichwort = await leadMitUnterlage({ data, sparte: "hausrat" });
    await nachweis(stichwort.lead.id, stichwort.phone, { ki: false, version: "2026-11-18.g2", art: "ohne_ki" });
    for (const x of [ohneKi, stichwort]) {
      expect(await liesUnterlageAus(x.doc.id)).toEqual({ status: "gesperrt:ohne_ki" });
      expect(await nachEingang(x.lead.id)).toBe(0);
    }
    expect(oa.calls).toHaveLength(0);
    expect(await prisma.policenAuszug.count({ where: { customerId } })).toBe(0);
  });

  it("Hausrat: OpenAI EU (fest, store false, strikt, Datei inline), Felder bereinigt, Nummer maskiert, Logs ohne Inhalt", async () => {
    const data = await pdf(["Versicherungsschein Hausratversicherung", "Julia Schneider, Musterweg 1"]);
    const a = await leadMitUnterlage({ data, sparte: null });
    expect(await nachEingang(a.lead.id)).toBe(1);
    expect(oa.clients[0]).toMatchObject({ baseURL: "https://eu.api.openai.com/v1", apiKey: "sk-test-geheim" });
    expect(oa.calls).toHaveLength(1);
    const req = oa.calls[0];
    expect(req.model).toBe("gpt-6.1-terra");
    expect(req.store).toBe(false);
    expect(req.text?.format).toMatchObject({ type: "json_schema", strict: true });
    const datei = req.input[0].content.find((c) => c.type === "input_file");
    expect(datei?.filename).toBe("police.pdf"); // nicht der echte Dateiname
    expect(datei?.file_data?.startsWith("data:application/pdf;base64,")).toBe(true);
    expect(req.input[0].content.find((c) => c.type === "input_text")?.text).toContain("Hausrat");

    const z = await prisma.policenAuszug.findUniqueOrThrow({ where: { documentId: a.doc.id } });
    expect(z).toMatchObject({ status: "ausgelesen", sparte: "hausrat", sparteQuelle: "text", anbieter: "openai-eu", modell: "gpt-6.1-terra", versuche: 1 });
    const f = z.felder as Record<string, { w: unknown; s: string }>;
    expect(f.versicherungsnummer.w).toBe("…4711");
    expect(f.wohnflaeche.s).toBe("pruefen");
    expect(f.naechster_kuendigungstermin).toBeUndefined();
    expect(JSON.stringify(z)).not.toContain("998877");
    // Logs: keine Inhalte, kein Dateiname, kein Schlüssel
    const alle = logs.join("\n");
    for (const w of ["Teststadt", "Julia", "Police.pdf", "sk-test-geheim", "998877", "Musterweg"]) expect(alle).not.toContain(w);
    expect(alle).toContain("[policen-auslesen] ok anbieter=openai-eu felder=");

    // Zweites Mal: nichts mehr (schon ausgelesen)
    expect(await nachEingang(a.lead.id)).toBe(0);
    expect(oa.calls).toHaveLength(1);

    const v = await ladeVergleich(a.lead.id, customerId, new Date("2026-11-20T09:00:00Z"));
    expect(v.vertraege).toHaveLength(1);
    expect(v.vertraege[0]).toMatchObject({ sparte: "hausrat", monat: 10, geprueft: false });
    expect(v.zusammenfassung).toMatchObject({ monatSumme: 10, vertraege: 1, ungeprueft: 1 });
    expect(v.zusammenfassung.kuendigungen).toMatchObject([{ id: z.id, sparte: "hausrat", versicherer: "Teststadt Versicherung AG", zum: "2027-03-01", bis: "2026-11-30", tageBis: 10, verpasst: null }]);
    expect(v.zusammenfassung.bausteine.map((b) => b.text)).toEqual(["Hausrat ohne Elementarschäden"]);
    expect(await vergleichKurz(a.lead.id, customerId)).toMatchObject({ vertraege: 1, monat: 10 });
  });

  it("PKV mit Zuschlag und Ausschluss: ohne Nachweis gesperrt (kein Aufruf); mit Nachweis nichts davon in Ausgabe, DB oder Logs", async () => {
    const data = await pdf(PKV_TEXT);
    const a = await leadMitUnterlage({ data, sparte: null });
    oa.antwort = PKV_BOESE;
    expect(await liesUnterlageAus(a.doc.id)).toEqual({ status: "gesperrt" });
    expect(oa.calls).toHaveLength(0);

    await setzeZdrNachweis({ am: new Date("2026-11-18T00:00:00Z"), referenz: "OpenAI ZDR Test", userId: null });
    // Einwilligung nur in der Fassung ohne Gesundheitsangaben („.s2“): PKV trotzdem nicht
    const nurSach = await leadMitUnterlage({ data, sparte: null, nachweis: { ki: true, version: "2026-11-18.s2" } });
    expect(await liesUnterlageAus(nurSach.doc.id)).toEqual({ status: "gesperrt" });
    expect(oa.calls).toHaveLength(0);
    expect(await liesUnterlageAus(a.doc.id)).toEqual({ status: "ausgelesen" });
    expect(oa.calls).toHaveLength(1);
    const z = await prisma.policenAuszug.findUniqueOrThrow({ where: { documentId: a.doc.id } });
    expect(z.sparte).toBe("pkv");
    expect(Object.keys(z.felder as object).sort()).toEqual(["beitrag", "krankentagegeld", "selbstbehalt", "versicherer", "versicherungsnummer", "zahlweise"]);
    const v = await ladeVergleich(a.lead.id, customerId);
    const roh = await prisma.$queryRaw<unknown[]>`SELECT * FROM "PolicenAuszug" WHERE "leadId" = ${a.lead.id}`;
    for (const text of [JSON.stringify(v), JSON.stringify(roh), logs.join("\n")]) {
      for (const w of VERBOTEN) expect(text).not.toContain(w);
    }
    // Keine Hinweise zu PKV (kein Risiko-Scoring)
    expect(v.zusammenfassung.bausteine).toEqual([]);
  });

  it("Sparte unklar: nicht auslesen, Vermittler wählt; abweichende Sparte: nichts übernommen", async () => {
    const bild = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const a = await leadMitUnterlage({ data: bild, mime: "image/jpeg", sparte: null });
    expect(await liesUnterlageAus(a.doc.id)).toEqual({ status: "sparte_offen" });
    expect(oa.calls).toHaveLength(0);
    const w = { customerId, userId: ownerId, leadId: a.lead.id };
    oa.antwort = { ...HAUSRAT_ANTWORT, sparte: "kfz" };
    expect(await waehleSparte(w, a.doc.id, "hausrat")).toEqual({ status: "sparte_abweichend" });
    expect(oa.calls[0].input[0].content[0]).toMatchObject({ type: "input_image" });
    const z = await prisma.policenAuszug.findUniqueOrThrow({ where: { documentId: a.doc.id } });
    expect(z.felder).toBeNull();
    oa.antwort = HAUSRAT_ANTWORT;
    expect(await waehleSparte(w, a.doc.id, "hausrat")).toEqual({ status: "ausgelesen" });
    expect((await prisma.policenAuszug.findUniqueOrThrow({ where: { documentId: a.doc.id } })).sparteQuelle).toBe("vermittler");
  });

  it("Bremse: Tageslimit (Admin einmal benachrichtigt) und höchstens 15 Unterlagen je Lead", async () => {
    process.env.POLICEN_AUSLESEN_MAX_PRO_TAG = "1";
    const data = await pdf(["Ihre Hausratversicherung"]);
    const a = await leadMitUnterlage({ data, sparte: "hausrat" });
    const b = await leadMitUnterlage({ data, sparte: "hausrat" });
    const c = await leadMitUnterlage({ data, sparte: "hausrat" });
    expect(await liesUnterlageAus(a.doc.id)).toEqual({ status: "ausgelesen" });
    expect(await liesUnterlageAus(b.doc.id)).toEqual({ status: "limit" });
    expect(await liesUnterlageAus(c.doc.id)).toEqual({ status: "limit" });
    expect(oa.calls).toHaveLength(1);
    expect(push.mock.calls.filter((x) => /Tageslimit/.test(JSON.stringify(x)))).toHaveLength(1);
    expect((await auslesenStatus()).heute.anzahl).toBeGreaterThanOrEqual(1);
    const v = await ladeVergleich(b.lead.id, customerId);
    expect(v.offen).toEqual([expect.objectContaining({ status: "limit", documentId: b.doc.id })]);

    delete process.env.POLICEN_AUSLESEN_MAX_PRO_TAG;
    await prisma.policenAuslesenTag.deleteMany({});
    // Lead mit 15 schon ausgelesenen Unterlagen: die 16. nicht
    const d = await leadMitUnterlage({ data, sparte: "hausrat" });
    for (let i = 0; i < 15; i++) {
      const x = await prisma.leadDocument.create({ data: { customerId, leadId: d.lead.id, status: "gespeichert", mimeType: "application/pdf", fileName: "x.pdf", size: 1, data: encryptBytes(data), sparte: "hausrat" } });
      await prisma.policenAuszug.create({ data: { customerId, leadId: d.lead.id, documentId: x.id, status: "ausgelesen", sparte: "hausrat", versuche: 1 } });
    }
    oa.calls = [];
    expect(await liesUnterlageAus(d.doc.id)).toEqual({ status: "limit" });
    expect(oa.calls).toHaveLength(0);
  });

  it("401: Auslesen pausiert, Admin einmal am Tag benachrichtigt, neuer Schlüssel hebt die Pause auf", async () => {
    const data = await pdf(["Ihre Hausratversicherung"]);
    const a = await leadMitUnterlage({ data, sparte: "hausrat" });
    oa.status401 = true;
    expect(await liesUnterlageAus(a.doc.id)).toEqual({ status: "fehler" });
    expect(logs.join("\n")).toContain("[policen-auslesen] fehler anbieter=openai-eu grund=schluessel status=401");
    expect(logs.join("\n")).not.toContain("Incorrect API key");
    expect(push.mock.calls.filter((x) => /Schlüssel ungültig/.test(JSON.stringify(x)))).toHaveLength(1);
    oa.calls = [];
    expect(await liesUnterlageAus(a.doc.id)).toEqual({ status: "gesperrt:pause" });
    expect(oa.calls).toHaveLength(0);
    // Täglicher Lauf am selben Tag: keine zweite Meldung
    await auslesenTaeglich(new Date());
    expect(push.mock.calls.filter((x) => /Schlüssel ungültig/.test(JSON.stringify(x)))).toHaveLength(1);
    expect((await auslesenStatus()).pausiert).toBe(true);
    // Neuer Schlüssel in Railway: weiter
    process.env.POLICEN_OPENAI_API_KEY = "sk-test-neu";
    oa.status401 = false;
    expect(await liesUnterlageAus(a.doc.id)).toEqual({ status: "ausgelesen" });
  });

  it("Löschung wie die Unterlage (Löschfrist, Widerruf, Art. 17); „In Bestand übernehmen“ bleibt", async () => {
    const data = await pdf(["Ihre Hausratversicherung"]);
    const a = await leadMitUnterlage({ data, sparte: "hausrat", leadExtra: { email: `j-${uid()}@test.local` } });
    await liesUnterlageAus(a.doc.id);
    const z = await prisma.policenAuszug.findUniqueOrThrow({ where: { documentId: a.doc.id } });
    const w = { customerId, userId: ownerId, leadId: a.lead.id };
    expect(await korrigiereAuszug(w, z.id, { beitrag: "132", risikozuschlag: 10, tarifname: "Hausrat Top Plus" })).toBe(true);
    const k = await prisma.policenAuszug.findUniqueOrThrow({ where: { id: z.id } });
    expect(k.geprueftAt).toBeTruthy();
    expect((k.felder as Record<string, { w: unknown; s: string }>).beitrag).toEqual({ w: 132, s: "korrigiert" });
    expect(k.felder).not.toHaveProperty("risikozuschlag");
    expect(await bestaetigeAuszug(w, z.id, true)).toBe(true);
    // Bestandskunden-Modul nicht sichtbar: kein Knopf, keine Übernahme
    expect((await ladeVergleich(a.lead.id, customerId)).bestand).toBe(false);
    expect(await uebernimmInBestand(w, z.id)).toBeNull();
    await prisma.customer.update({ where: { id: customerId }, data: { bestandSichtbar: true } });
    expect((await ladeVergleich(a.lead.id, customerId)).bestand).toBe(true);
    const r = await uebernimmInBestand(w, z.id);
    expect(r).toBeTruthy();
    const vertrag = await prisma.existingContract.findUniqueOrThrow({ where: { id: r!.existingContractId }, include: { existingCustomer: true } });
    expect(vertrag).toMatchObject({ line: "Hausrat", insurer: "Teststadt Versicherung AG", product: "Hausrat Top Plus", contractNo: "…4711", status: "aktiv" });
    expect(Number(vertrag.annualPremium)).toBe(132);
    expect(vertrag.existingCustomer).toMatchObject({ leadId: a.lead.id, customerId });

    // Löschfrist bzw. Widerruf löschen die Unterlage: der Auszug geht mit, der übernommene Vertrag bleibt
    await prisma.leadDocument.delete({ where: { id: a.doc.id } });
    expect(await prisma.policenAuszug.count({ where: { id: z.id } })).toBe(0);
    expect(await prisma.existingContract.count({ where: { id: vertrag.id } })).toBe(1);

    // Art. 17: Lead gelöscht ⇒ Auszüge weg
    const b = await leadMitUnterlage({ data, sparte: "hausrat" });
    await liesUnterlageAus(b.doc.id);
    await prisma.lead.delete({ where: { id: b.lead.id } });
    expect(await prisma.policenAuszug.count({ where: { leadId: b.lead.id } })).toBe(0);
  });

  it("Schlüssel läuft ab: Hinweis 28 Tage vorher, einmal", async () => {
    process.env.POLICEN_OPENAI_KEY_ABLAUF = "2026-12-01";
    const r1 = await auslesenTaeglich(new Date("2026-11-02T03:00:00Z"));
    expect(r1.ablaufHinweis).toBe(false);
    const r2 = await auslesenTaeglich(new Date("2026-11-04T03:00:00Z"));
    expect(r2.ablaufHinweis).toBe(true);
    expect(JSON.stringify(push.mock.calls)).toContain("läuft am 01.12.2026 ab");
    const r3 = await auslesenTaeglich(new Date("2026-11-05T03:00:00Z"));
    expect(r3.ablaufHinweis).toBe(false);
    const st = await auslesenStatus(new Date("2026-11-05T03:00:00Z"));
    expect(st).toMatchObject({ schluessel: "ja", endpunkt: "https://eu.api.openai.com/v1", schluesselAblauf: "2026-12-01", tageBisAblauf: 26 });
    expect(JSON.stringify(st)).not.toContain("sk-test");
  });

  it("Trennung zur Laufzeit: Auslesen nutzt nie den Chat-Client, der Assistent bekommt keine Dokumente und keine Auszüge", async () => {
    const data = await pdf(["Versicherungsschein Hausratversicherung"]);
    const a = await leadMitUnterlage({ data, sparte: "hausrat" });
    await prisma.agentConfig.upsert({ where: { customerId }, create: { customerId, active: true, outreachEnabled: false, systemPrompt: "Test" }, update: {} });
    await prisma.whatsAppAccount.upsert({ where: { customerId }, create: { customerId, status: "connected", phoneNumberId: `pnid-${uid()}`, apiKeyEnc: encryptSecret("k") }, update: {} });
    const conv = await prisma.conversation.create({
      data: {
        customerId,
        leadId: a.lead.id,
        contactPhone: a.phone,
        contactName: "Julia",
        botActive: true,
        windowExpiresAt: new Date(Date.now() + 86_400_000),
        lastMessageAt: new Date(),
        messages: { create: [{ direction: "outbound", body: "Guten Tag, hier ist der digitale KI-Assistent.", sentBy: "bot" }, { direction: "inbound", body: "Dokument empfangen: Police.pdf", sentBy: null }] },
      },
    });
    await prisma.leadDocument.update({ where: { id: a.doc.id }, data: { conversationId: conv.id } });

    await nachEingang(a.lead.id);
    expect(oa.calls).toHaveLength(1);
    expect(chat.requests).toHaveLength(0); // Auslesen ohne Chat-Client

    oa.calls = [];
    await runBotTurn(conv.id);
    expect(chat.requests.length).toBeGreaterThan(0);
    expect(oa.calls).toHaveLength(0); // Chat ohne Dokument-Zugang
    const b64 = data.toString("base64").slice(0, 40);
    for (const r of chat.requests) {
      const s = JSON.stringify(r);
      expect(s).not.toMatch(/"type":"(document|image|input_file|input_image)"/);
      expect(s).not.toContain(b64);
      for (const w of ["Teststadt", "4711", "Hausrat Top", "65000", "65.000"]) expect(s).not.toContain(w);
    }
  });
});
