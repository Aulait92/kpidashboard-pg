// Rechnung/Beleg per KI auslesen (eigene Ablage statt GetMyInvoices, Ole, 22.11.2026). Nur Geschäftsbelege der eigenen
// Firma (keine Kundendaten, keine Gesundheitsangaben): OpenAI mit OPENAI_API_KEY, Antwort nicht gespeichert (store: false),
// festes Schema. Fehlt der Schlüssel oder scheitert die Anfrage: null (Beleg wird trotzdem abgelegt, ausgelesen = fehler).

import OpenAI from "openai";
import { strengesSchema } from "@/lib/ki-json";
import { ersteSeiten } from "@/lib/policen/auslesen/anbieter/seiten";
import { OPENAI_EU_STANDARD_MODELL } from "@/lib/policen/auslesen/konfig";

export const BELEG_TYPEN = ["INCOMING_INVOICE", "RECEIPT", "CREDIT_NOTE", "SALES_INVOICE", "STATEMENT", "MISC"] as const;
export type BelegTyp = (typeof BELEG_TYPEN)[number];

export type BelegDaten = {
  typ: BelegTyp;
  firma: string | null;
  nummer: string | null;
  datum: string | null; // YYYY-MM-DD
  netto: number | null;
  ustSatz: number | null;
  brutto: number | null;
  waehrung: string;
};

const schema = {
  type: "object",
  properties: {
    typ: { type: "string", enum: [...BELEG_TYPEN] },
    firma: { type: ["string", "null"] },
    nummer: { type: ["string", "null"] },
    datum: { type: ["string", "null"] },
    netto: { type: ["number", "null"] },
    ustSatz: { type: ["number", "null"] },
    brutto: { type: ["number", "null"] },
    waehrung: { type: "string" },
  },
  required: ["typ", "firma", "nummer", "datum", "netto", "ustSatz", "brutto", "waehrung"],
  additionalProperties: false,
};

const SYSTEM = `Du liest Belege der Firma Ole Kannapinn UG (haftungsbeschränkt), Lorenzstraße 58, 12209 Berlin, aus.
Gib nur zurück, was auf dem Dokument steht. Unsicher oder nicht vorhanden: null.
typ: INCOMING_INVOICE = Rechnung an die Ole Kannapinn UG; RECEIPT = Quittung/Zahlungsbeleg an sie; CREDIT_NOTE = Gutschrift
(auch Gutschrift an die UG, z. B. Provisionsabrechnung); SALES_INVOICE = Rechnung, die die Ole Kannapinn UG selbst ausgestellt
hat; STATEMENT = Kontoauszug oder Kreditkartenabrechnung; MISC = sonstiges.
firma: der Aussteller (bei SALES_INVOICE der Empfänger), ohne Adresse. nummer: Rechnungs- bzw. Belegnummer.
datum: Rechnungs- bzw. Belegdatum als YYYY-MM-DD (nicht Fälligkeit, nicht Leistungszeitraum).
brutto: Gesamtbetrag inkl. Steuer (bei Bezahlt-Belegen der gezahlte Betrag), netto: ohne Steuer, ustSatz: Steuersatz in Prozent
(0 bei Reverse Charge). waehrung: ISO-Code wie EUR oder USD.`;

const zahl = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

/** Rohantwort bereinigen (getestet). */
export function bereinige(roh: unknown): BelegDaten | null {
  if (!roh || typeof roh !== "object") return null;
  const r = roh as Record<string, unknown>;
  const typ = (BELEG_TYPEN as readonly string[]).includes(String(r.typ)) ? (r.typ as BelegTyp) : "MISC";
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const datum = typeof r.datum === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.datum) && r.datum >= "2000-01-01" && r.datum <= "2100-01-01" ? r.datum : null;
  const waehrung = typeof r.waehrung === "string" && /^[A-Za-z]{3}$/.test(r.waehrung.trim()) ? r.waehrung.trim().toUpperCase() : "EUR";
  const brutto = zahl(r.brutto);
  return {
    typ,
    firma: text(r.firma, 200),
    nummer: text(r.nummer, 100),
    datum,
    netto: zahl(r.netto),
    ustSatz: zahl(r.ustSatz),
    brutto: brutto == null ? null : Math.abs(brutto),
    waehrung,
  };
}

export function belegKiKonfiguriert(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.OPENAI_API_KEY?.trim();
}

export async function liesBelegAus(data: Uint8Array, mimeType: string): Promise<BelegDaten | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.BELEGE_OPENAI_MODEL?.trim() || OPENAI_EU_STANDARD_MODELL;
  let teil: OpenAI.Responses.ResponseInputContent;
  if (mimeType === "application/pdf") {
    const pdf = await ersteSeiten(data, 3);
    if (!pdf) return null;
    teil = { type: "input_file", filename: "beleg.pdf", file_data: `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}` };
  } else if (/^image\/(jpeg|png|webp)$/.test(mimeType)) {
    teil = { type: "input_image", detail: "high", image_url: `data:${mimeType};base64,${Buffer.from(data).toString("base64")}` };
  } else return null;
  try {
    const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 120_000 });
    const resp = await client.responses.create({
      model,
      store: false,
      instructions: SYSTEM,
      input: [{ role: "user", content: [teil, { type: "input_text", text: "Lies diesen Beleg aus." }] }],
      text: { format: { type: "json_schema", name: "beleg", schema: strengesSchema(schema), strict: true } },
      max_output_tokens: 2000,
    });
    const text = (resp.output_text ?? "").trim();
    return text ? bereinige(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}
