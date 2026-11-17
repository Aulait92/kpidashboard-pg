// Policen auslesen (Ole, 18.11.2026): Schalter, Sparten, Anbieter, Bremse, Einwilligungsversion. Rein, ohne Datenbank
// und ohne SDK, damit Regeln, Diagnose und Tests es ohne Netz nutzen können.
//
// Vorgaben der Rechtsprüfung (docs/recht/policen-whatsapp-gesundheitsdaten.md, K1 bis K8) und Freigabe Ole 18.11.2026:
//   K1  Auslesen nur mit Einwilligung „Einverstanden“ (ki = true) in der KI-Textversion AUSLESEN_MIN_TEXTVERSION oder
//       neuer (PolicenNachweis, gebaut von Policen per WhatsApp); alte Einwilligungen und „ohne KI“ nie.
//   K2  Sach (Haftpflicht, Hausrat, Kfz, Wohngebäude, Rechtsschutz): an, sobald der Schlüssel gesetzt ist.
//       Kranken (PKV), BU und Leben: erst, wenn der Nachweis „keine Speicherung“ im Admin hinterlegt ist
//       (PolicenAuslesenEinstellung.zdrNachweisAm), dann automatisch.
//   K3  Nur fester EU-Endpunkt, kein Rückfall auf andere Anbieter oder Regionen. Bedrock nur, wenn ausdrücklich gewählt.
//
// Railway-Variablen:
//   POLICEN_OPENAI_API_KEY         eigener Schlüssel nur für Dokumente (EU-Projekt); fehlt er, wird nicht ausgelesen
//   POLICEN_OPENAI_PROJECT         optional: Projekt-ID
//   POLICEN_OPENAI_MODEL           optional, Standard OPENAI_EU_STANDARD_MODELL
//   POLICEN_OPENAI_KEY_ABLAUF      Ablauf des Schlüssels (YYYY-MM-DD), Standard 2027-11-17; Admin-Hinweis 28 Tage vorher
//   POLICEN_AUSLESEN_AN            Notschalter: 0 / aus schaltet alles ab (Standard an, wenn der Schlüssel gesetzt ist)
//   POLICEN_AUSLESEN_SPARTEN       optional: nur diese Sparten (Standard alle; PKV/BU/Leben trotzdem nur mit Nachweis)
//   POLICEN_AUSLESEN_KUNDEN        optional: nur diese Kunden-IDs, leer = alle
//   POLICEN_AUSLESEN_ANBIETER      openai-eu (Standard) | bedrock-eu (KI_EU_* aus lib/ki-eu-konfig.ts)
//   POLICEN_AUSLESEN_MAX_PRO_TAG   Standard 200 Dokumente je Kalendertag (alle Kunden); je Lead höchstens 15

import { createHash } from "node:crypto";
import { bedrockEu } from "@/lib/ki-eu-konfig";
import { AUSLESEN_SPARTEN, GESUNDHEITS_SPARTEN, isAuslesenSparte, type AuslesenSparte } from "@/lib/policen/auslesen/felder";

type Env = Record<string, string | undefined>;
const aus = (v: string | undefined) => /^(0|false|nein|aus|off)$/i.test((v ?? "").trim());

/**
 * Älteste Textversion der Einwilligung, die das KI-Auslesen abdeckt (Text (a) der Rechtsprüfung, lib/policen/bitte.ts
 * EINWILLIGUNG_TEXT_VERSION, Format „a-JJJJ-MM-TT“). Neuere Versionen im selben Format gelten auch.
 */
export const AUSLESEN_MIN_TEXTVERSION = "a-2026-11-17";

/** Deckt diese Textversion das KI-Auslesen ab? Nur Format „a-JJJJ-MM-TT“ ab AUSLESEN_MIN_TEXTVERSION. */
export function textVersionDecktKi(v: string | null | undefined): boolean {
  const x = (v ?? "").trim();
  return /^a-\d{4}-\d{2}-\d{2}(\.\d+)?$/.test(x) && x >= AUSLESEN_MIN_TEXTVERSION;
}

export const STANDARD_MAX_PRO_TAG = 200;
export const MAX_JE_LEAD = 15;
export const STANDARD_KEY_ABLAUF = "2027-11-17";
export const ABLAUF_HINWEIS_TAGE = 28;

/** Fester EU-Endpunkt (kein Env, damit kein Tippfehler die Daten in eine andere Region schickt). */
export const OPENAI_EU_BASE_URL = "https://eu.api.openai.com/v1";
/** Laut OpenAI-Doku (Modelle, Datenresidenz Europa, Stand 18.11.2026): Bild- und PDF-Eingabe, in der EU verfügbar. */
export const OPENAI_EU_STANDARD_MODELL = "gpt-6.1-terra";

export type AnbieterName = "openai-eu" | "bedrock-eu";

export function anbieterName(env: Env = process.env): AnbieterName {
  return (env.POLICEN_AUSLESEN_ANBIETER ?? "").trim().toLowerCase() === "bedrock-eu" ? "bedrock-eu" : "openai-eu";
}

export type OpenAiEuKonfig = { apiKey: string; project: string | null; model: string; baseURL: typeof OPENAI_EU_BASE_URL };

/** OpenAI-Zugang (EU-Projekt). Ohne eigenen Schlüssel: null (dann kein Auslesen, kein Rückfall). */
export function openAiEu(env: Env = process.env): OpenAiEuKonfig | null {
  const apiKey = (env.POLICEN_OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return null;
  return {
    apiKey,
    project: (env.POLICEN_OPENAI_PROJECT ?? "").trim() || null,
    model: (env.POLICEN_OPENAI_MODEL ?? "").trim() || OPENAI_EU_STANDARD_MODELL,
    baseURL: OPENAI_EU_BASE_URL,
  };
}

/** Ist der gewählte Anbieter eingerichtet? */
export function anbieterEingerichtet(env: Env = process.env): boolean {
  return anbieterName(env) === "bedrock-eu" ? !!bedrockEu(env) : !!openAiEu(env);
}

/** Fingerabdruck des aktuellen Schlüssels (für die Pause nach 401; nie der Schlüssel selbst). */
export function schluesselFinger(env: Env = process.env): string | null {
  const k = anbieterName(env) === "bedrock-eu" ? (bedrockEu(env)?.accessKey ?? "") : (openAiEu(env)?.apiKey ?? "");
  return k ? createHash("sha256").update(k).digest("hex").slice(0, 16) : null;
}

/** Auslesen grundsätzlich an? Anbieter eingerichtet und kein Notschalter. */
export function auslesenAn(env: Env = process.env): boolean {
  return !aus(env.POLICEN_AUSLESEN_AN) && anbieterEingerichtet(env);
}

/** Freigegebene Sparten (K2). PKV, BU und Leben nur mit hinterlegtem Nachweis der Null-Speicherung (zdr). */
export function freigegebeneSparten(o: { zdr: boolean }, env: Env = process.env): AuslesenSparte[] {
  const roh = (env.POLICEN_AUSLESEN_SPARTEN ?? "").trim();
  const liste = roh ? roh.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(isAuslesenSparte) : [...AUSLESEN_SPARTEN];
  return AUSLESEN_SPARTEN.filter((s) => liste.includes(s) && (o.zdr || !GESUNDHEITS_SPARTEN.includes(s)));
}

/** Kunde freigeschaltet? Leere Liste = alle. */
export function kundeFreigeschaltet(customerId: string, env: Env = process.env): boolean {
  const roh = (env.POLICEN_AUSLESEN_KUNDEN ?? "").trim();
  if (!roh) return true;
  return roh.split(/[\s,;]+/).includes(customerId);
}

export function maxProTag(env: Env = process.env): number {
  const roh = (env.POLICEN_AUSLESEN_MAX_PRO_TAG ?? "").trim();
  const n = Number(roh);
  return roh !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : STANDARD_MAX_PRO_TAG;
}

/** Ablauf des Schlüssels (Tag, YYYY-MM-DD). */
export function schluesselAblauf(env: Env = process.env): string {
  const v = (env.POLICEN_OPENAI_KEY_ABLAUF ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : STANDARD_KEY_ABLAUF;
}

/** Tage bis zum Ablauf (negativ = abgelaufen). */
export function tageBisAblauf(now: Date, env: Env = process.env): number {
  const ende = Date.parse(`${schluesselAblauf(env)}T00:00:00Z`);
  const heute = Date.parse(`${berlinTag(now)}T00:00:00Z`);
  return Math.round((ende - heute) / 86_400_000);
}

/** Kalendertag in Berlin (YYYY-MM-DD) für die Tagesbremse. */
export const berlinTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);

/** Für /api/ops/diagnose?q=policen-auslesen: nur Zustand, nie Schlüssel oder Inhalte. */
export function auslesenKonfigStatus(o: { zdr: boolean; now: Date }, env: Env = process.env) {
  const name = anbieterName(env);
  const oa = openAiEu(env);
  const br = bedrockEu(env);
  return {
    an: auslesenAn(env),
    notschalterAus: aus(env.POLICEN_AUSLESEN_AN),
    sparten: freigegebeneSparten({ zdr: o.zdr }, env),
    zdrNachweis: o.zdr,
    kunden: (env.POLICEN_AUSLESEN_KUNDEN ?? "").trim() ? (env.POLICEN_AUSLESEN_KUNDEN ?? "").split(/[\s,;]+/).filter(Boolean).length : "alle",
    anbieter: name,
    ...(name === "openai-eu"
      ? {
          schluessel: oa ? "ja" : "nein",
          projekt: oa?.project ? "ja" : "nein",
          endpunkt: OPENAI_EU_BASE_URL,
          modell: oa?.model ?? ((env.POLICEN_OPENAI_MODEL ?? "").trim() || OPENAI_EU_STANDARD_MODELL),
          schluesselAblauf: schluesselAblauf(env),
          tageBisAblauf: tageBisAblauf(o.now, env),
        }
      : { schluessel: br ? "ja" : "nein", endpunkt: br ? `bedrock ${br.region}` : null, modell: br?.model ?? null }),
    maxProTag: maxProTag(env),
    maxJeLead: MAX_JE_LEAD,
    einwilligungAb: AUSLESEN_MIN_TEXTVERSION,
  };
}
