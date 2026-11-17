// KI für Unterlagen vom Lead (Ole, 17.11.2026). Getrennte Aufrufe:
//   1. klassifiziere: nur Sparte und ob Gesundheitsangaben enthalten sein können (keine Inhalte zurück).
//   2. liesAus: Vertragsdaten, ausschließlich bei Sachversicherungen (nie bei Gesundheitsbezug, regeln.ts).
//   3. widerrufKi: ist eine Chatnachricht sinngemäß ein Widerruf der Einwilligung bzw. der Wunsch, die Unterlagen zu
//      löschen? (Rückfall ohne KI: Regeln in regeln.ts istWiderruf)
// Unterlagen mit möglichem Gesundheitsbezug gehen nur über einen EU-Endpunkt an die KI (regeln.ts policenKiEu); der
// Aufrufer übergibt ihn als endpunkt. Ohne API-Schlüssel oder bei Fehlern: null (dann gilt die vorsichtige Regel).
// Strukturierte Ausgabe (output_config.format) statt erzwungenem Werkzeug: Claude Opus 5.5 lehnt tool_choice „tool“ ab.

import Anthropic from "@anthropic-ai/sdk";
import { reportError } from "@/lib/monitoring";
import { redactHealthText } from "@/lib/gesundheitsdaten";
import { cleanAuszug, isSparte, SPARTE_KEYS, ZAHLWEISEN, type Auszug, type KiEndpunkt, type Klassifikation, type PolicenTyp } from "@/lib/policen/regeln";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

function block(data: Uint8Array, typ: PolicenTyp): Anthropic.ContentBlockParam {
  const b64 = Buffer.from(data).toString("base64");
  // Neutraler Titel: kein Dateiname (kann den Namen des Leads enthalten)
  return typ === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 }, title: "Unterlage" }
    : { type: "image", source: { type: "base64", media_type: typ, data: b64 } };
}

/** Ein Aufruf mit JSON-Ausgabe. endpunkt = EU-Endpunkt (nur dieser bei möglichem Gesundheitsbezug). */
async function fragJson(o: {
  endpunkt?: KiEndpunkt | null;
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: Record<string, unknown>;
  maxTokens: number;
  wozu: string;
}): Promise<Record<string, unknown> | null> {
  if (!o.endpunkt && !process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = o.endpunkt ? new Anthropic({ baseURL: o.endpunkt.baseURL, apiKey: o.endpunkt.apiKey }) : new Anthropic();
    const resp = await client.messages.create({
      model: o.endpunkt?.model ?? MODEL,
      max_tokens: o.maxTokens,
      system: o.system,
      output_config: { effort: "low", format: { type: "json_schema", schema: o.schema } },
      messages: [{ role: "user", content: o.content }],
    });
    if (resp.stop_reason === "refusal") return null;
    const text = resp.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch (err) {
    reportError(err, o.wozu);
    return null;
  }
}

export const KLASSIFIKATION_SCHEMA = {
  type: "object",
  properties: {
    police: { type: "boolean", description: "true, wenn es eine Police, ein Versicherungsschein, eine Beitragsrechnung oder ein Nachtrag ist" },
    sparte: { type: "string", enum: SPARTE_KEYS, description: "Sparte; sonstig, wenn keine passt" },
    gesundheit: { type: "boolean", description: "Gesundheitsbezug einer Person möglich" },
  },
  required: ["police", "sparte", "gesundheit"],
  additionalProperties: false,
};

export async function klassifiziere(data: Uint8Array, typ: PolicenTyp, opts: { endpunkt?: KiEndpunkt | null } = {}): Promise<Klassifikation | null> {
  const x = await fragJson({
    endpunkt: opts.endpunkt,
    maxTokens: 1000,
    wozu: "policen-klassifizieren",
    system:
      "Du ordnest ein Dokument, das ein Interessent einem Versicherungsvermittler geschickt hat, einer Versicherungssparte zu. Lies nur so viel, wie dafür nötig ist. Gib keine Inhalte, Namen oder Zahlen wieder, nur die Zuordnung. Werte keine Gesundheitsangaben aus. gesundheit=true, wenn es um Kranken-, Zahn-, Berufsunfähigkeits-, Lebens-, Renten-, Pflege- oder Unfallversicherung geht oder das Dokument Gesundheitsangaben einer Person enthalten kann; im Zweifel true. Tierversicherungen (auch Tier-OP oder Tierkranken) sind keine Gesundheitsangaben einer Person.",
    content: [block(data, typ), { type: "text", text: "Ordne dieses Dokument zu." }],
    schema: KLASSIFIKATION_SCHEMA,
  });
  if (!x || typeof x.gesundheit !== "boolean") return null;
  return { sparte: isSparte(x.sparte) ? x.sparte : null, gesundheit: x.gesundheit, police: x.police !== false };
}

export const AUSZUG_SCHEMA = {
  type: "object",
  properties: {
    gesellschaft: { type: ["string", "null"], description: "Versicherer, z. B. HUK-Coburg" },
    sparte: { type: "string", enum: SPARTE_KEYS },
    beitrag: { type: ["number", "null"], description: "Beitrag in Euro je Zahlweise, inkl. Versicherungsteuer" },
    zahlweise: { type: ["string", "null"], enum: [...ZAHLWEISEN, null] },
    versicherungssumme: { type: ["string", "null"], description: "z. B. 10 Mio. €" },
    selbstbeteiligung: { type: ["string", "null"], description: "z. B. 150 € je Schaden, oder keine" },
    ablauf: { type: ["string", "null"], description: "Vertragsablauf TT.MM.JJJJ" },
    hauptfaelligkeit: { type: ["string", "null"], description: "Hauptfälligkeit TT.MM." },
  },
  required: ["gesellschaft", "sparte", "beitrag", "zahlweise", "versicherungssumme", "selbstbeteiligung", "ablauf", "hauptfaelligkeit"],
  additionalProperties: false,
};

/** Vertragsdaten einer Sachversicherung auslesen. Nie für Unterlagen mit Gesundheitsbezug aufrufen. */
export async function liesAus(data: Uint8Array, typ: PolicenTyp, opts: { endpunkt?: KiEndpunkt | null } = {}): Promise<Auszug | null> {
  const x = await fragJson({
    endpunkt: opts.endpunkt,
    maxTokens: 1500,
    wozu: "policen-auslesen",
    system:
      "Du liest eine Police einer Sachversicherung für einen Versicherungsvermittler aus. Übernimm Werte nur aus dem Dokument, erfinde nichts, fehlt etwas: null. Übernimm nur Vertragsdaten: keine Namen, Anschriften, Geburtsdaten, Vertrags-, Kunden- oder Kennzeichennummern, keine Bankdaten und keine Angaben zur Gesundheit von Personen.",
    content: [block(data, typ), { type: "text", text: "Lies diese Police aus." }],
    schema: AUSZUG_SCHEMA,
  });
  return cleanAuszug(x);
}

export const WIDERRUF_SCHEMA = {
  type: "object",
  properties: { widerruf: { type: "boolean", description: "true, wenn die Nachricht die Einwilligung widerruft oder verlangt, die geschickten Unterlagen zu löschen" } },
  required: ["widerruf"],
  additionalProperties: false,
};

/**
 * Sinngemäßer Widerruf? Nur die eine Nachricht (Gesundheitsangaben vorher ausgeblendet), keine Namen. null = keine KI
 * bzw. Fehler (dann gilt die Regel).
 */
export async function widerrufKi(text: string): Promise<boolean | null> {
  const x = await fragJson({
    maxTokens: 1000,
    wozu: "policen-widerruf",
    system:
      "Ein Interessent hat einem Versicherungsvermittler per WhatsApp Unterlagen zu seinen Versicherungen geschickt bzw. eingewilligt, dass sie gespeichert werden. Entscheide, ob seine Nachricht diese Einwilligung widerruft oder verlangt, die Unterlagen bzw. seine Daten zu löschen, auch wenn er es umgangssprachlich sagt (z. B. „ich will das doch nicht“, „bitte nehmt meine Sachen wieder raus“). Kein Widerruf: Fragen, Terminwünsche oder Terminabsagen, der Widerruf oder die Kündigung eines Versicherungsvertrags, Ablehnung eines Angebots.",
    content: [{ type: "text", text: redactHealthText(text).slice(0, 600) }],
    schema: WIDERRUF_SCHEMA,
  });
  return typeof x?.widerruf === "boolean" ? x.widerruf : null;
}
