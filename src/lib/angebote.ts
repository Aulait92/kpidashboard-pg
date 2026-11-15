// Angebote auslesen (Ole, 15.11.2026): Der Vermittler lädt seine Angebote (PDF bzw. Foto) im Kontakt hoch, die KI liest
// je Angebot Sparte, Gesellschaft, Tarif, Beitrag, Selbstbeteiligung, wichtigste Leistungen und Ausschlüsse aus. Der
// Vermittler prüft, markiert die Empfehlung und bestätigt; erst dann fließen die Daten in die Präsentation.
//
// Datenschutz (Ole, 15.11.2026: freigeschaltet nach Prüfung, docs/datenschutz.md): Die Angebote enthalten Kundendaten
// und gehen zum Auslesen an Anthropic (AVV „Art, Zweck und Umfang“, Anlage 2). Nur Sach-, Haftpflicht-, Rechtsschutz-,
// Unfall- und Tierversicherungen: Angebote mit Gesundheitsangaben (Kranken, BU, Leben, Pflege) gehen nie an die KI,
// wie im AVV zugesagt (angebotOhneGesundheitsdaten). Notschalter: ANGEBOTE_AUSLESEN=0.

import Anthropic from "@anthropic-ai/sdk";
import { reportError } from "@/lib/monitoring";
import { cleanAngebote, type AngeboteDaten } from "@/lib/angebote-daten";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

// Typen und reine Funktionen liegen in angebote-daten.ts (auch im Browser nutzbar); hier weiter exportiert.
export {
  beitragEffektiv,
  bausteinSchalten,
  cleanAngebote,
  gewaehlte,
  sparteSchalten,
  summeEmpfohlen,
  tarifWaehlen,
  type AngebotItem,
  type AngeboteDaten,
  type Baustein,
} from "@/lib/angebote-daten";

const OHNE_GESUNDHEIT = /privatschutz|haftpflicht|hausrat|rechtsschutz|wohngeb|geb(ä|ae)ude|unfall|tier|hund|katze|pferd|kfz|auto|glas|fahrrad/i;
const GESUNDHEIT = /pkv|kranken(voll|zusatz|versicherung(?!.*tier))|krankenhaus|zahn(?!behandlung)|berufsunf|\bbu\b|dienstunf|grundf(ä|ae)hig|leben|pflege|rente|dread|§\s*204|tarifoptimierung/i;

/**
 * Darf ein Angebot zu diesem Produkt an die KI? Nur Produkte ohne Gesundheitsangaben einer Person (Art. 9 DSGVO).
 * Tierkranken ist erlaubt: Gesundheitsdaten von Tieren sind keine personenbezogenen Gesundheitsdaten.
 */
export function angebotOhneGesundheitsdaten(produkt: string | null | undefined): boolean {
  const p = produkt ?? "";
  if (!OHNE_GESUNDHEIT.test(p)) return false;
  const ohneTier = p.replace(/tier\s*-?\s*(op|kranken)[\w-]*|(hunde|katzen|pferde)\s*-?\s*(op|kranken)[\w-]*/gi, "");
  return !GESUNDHEIT.test(ohneTier);
}


const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "Je Angebot bzw. je Tarifstufe ein Eintrag.",
      items: {
        type: "object",
        properties: {
          sparte: { type: "string", description: "z. B. Privathaftpflicht, Hausrat, Rechtsschutz, Wohngebäude, Unfall, Tierkranken, Tierhalterhaftpflicht" },
          gesellschaft: { type: ["string", "null"], description: "Versicherer, z. B. Allianz" },
          tarif: { type: ["string", "null"], description: "Tarif bzw. Stufe, z. B. Komfort, OP-Schutz Plus" },
          beitragMonat: { type: ["number", "null"], description: "Gesamtbeitrag pro Monat in Euro inkl. Versicherungsteuer, wie angeboten. Steht nur ein Jahresbeitrag da, durch 12 teilen." },
          bausteine: {
            type: "array",
            description: "Zusatzbausteine bzw. Optionen mit eigenem Beitrag, z. B. Zahnbehandlung, Fahrraddiebstahl, Glasbruch. Nur wenn das Angebot einen eigenen Beitrag dafür nennt.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                beitrag: { type: "number", description: "Beitrag pro Monat in Euro; negativ bei einer Ersparnis" },
                aktiv: { type: "boolean", description: "true, wenn im Gesamtbeitrag enthalten" },
              },
              required: ["name", "beitrag", "aktiv"],
            },
          },
          selbstbeteiligung: { type: ["string", "null"], description: "z. B. 150 € je Schaden" },
          leistungen: { type: "array", items: { type: "string" }, description: "Die 3 bis 5 wichtigsten Leistungen, kurz, wörtlich aus dem Angebot." },
          empfohlen: { type: "boolean", description: "true, wenn das Angebot diese Stufe als Empfehlung bzw. ausgewählt markiert" },
          merkmale: {
            type: "array",
            description: "Vergleichstabelle mehrerer Stufen: je Zeile Merkmal und Wert dieser Stufe (z. B. Versicherungssumme: 75 Mio. €; ja, wenn ein Haken, nein, wenn ein Strich). Höchstens 14, die mit Unterschieden zuerst. Bei nur einer Stufe leer.",
            items: { type: "object", properties: { name: { type: "string" }, wert: { type: "string" } }, required: ["name", "wert"] },
          },
          ausschluesse: { type: "array", items: { type: "string" }, description: "Ausdrücklich genannte Ausschlüsse oder Wartezeiten, kurz; leer, wenn keine genannt." },
        },
        required: ["sparte", "gesellschaft", "tarif", "beitragMonat", "selbstbeteiligung", "leistungen", "ausschluesse"],
      },
    },
  },
  required: ["items"],
} as const;

export type AngebotDatei = { fileName: string; contentType: string; data: Uint8Array };

/** Angebote (PDF oder Foto) auslesen. Fehler → { error }. */
export async function angeboteAuslesen(files: AngebotDatei[]): Promise<AngeboteDaten | { error: string }> {
  const usable = files.filter((f) => ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(f.contentType)).slice(0, 5);
  if (!usable.length) return { error: "Kein Angebot als PDF oder Foto gefunden. Laden Sie es im Kontakt unter Dokumente hoch (Art „Angebot“)." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Auslesen ist gerade nicht verfügbar." };
  const blocks: Anthropic.ContentBlockParam[] = usable.map((f) =>
    f.contentType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(f.data).toString("base64") }, title: f.fileName }
      : { type: "image", source: { type: "base64", media_type: f.contentType as "image/png" | "image/jpeg" | "image/webp", data: Buffer.from(f.data).toString("base64") } },
  );
  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system:
        "Du liest Versicherungsangebote für einen Vermittler aus. Übernimm Werte nur aus den Dokumenten, erfinde nichts. Fehlt eine Angabe, setze null bzw. eine leere Liste. Je Tarifstufe bzw. Angebot ein Eintrag. Kurz und sachlich, keine Wertung. Übernimm nur Tarif- und Leistungsdaten: keine Namen, Anschriften, Geburtsdaten, Vertrags- oder Kundennummern und keine Angaben zur Gesundheit von Personen.",
      tools: [{ name: "save_angebote", description: "Speichert die ausgelesenen Angebote.", input_schema: SCHEMA as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: "save_angebote" },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: "Lies diese Angebote aus." }] }],
    });
    const tool = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const out = cleanAngebote({ ...(tool?.input as object), quelle: usable.map((f) => f.fileName) });
    // Gespeichert wird der Grundbeitrag ohne Bausteine: Gesamtbeitrag minus enthaltene Bausteine
    out.items = out.items.map((i) => {
      const drin = i.bausteine.filter((b) => b.aktiv).reduce((s, b) => s + b.beitrag, 0);
      return i.beitragMonat != null && drin ? { ...i, beitragMonat: Math.max(0, Math.round((i.beitragMonat - drin) * 100) / 100) } : i;
    });
    if (!out.items.length) return { error: "In den Dokumenten wurde kein Angebot erkannt. Bitte von Hand eintragen." };
    return out;
  } catch (err) {
    reportError(err, "angebote-auslesen");
    return { error: "Auslesen fehlgeschlagen. Bitte noch einmal versuchen oder von Hand eintragen." };
  }
}
