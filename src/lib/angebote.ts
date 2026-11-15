// Angebote auslesen (Ole, 15.11.2026): Der Vermittler lädt seine Angebote (PDF bzw. Foto) im Kontakt hoch, die KI liest
// je Angebot Sparte, Gesellschaft, Tarif, Beitrag, Selbstbeteiligung, wichtigste Leistungen und Ausschlüsse aus. Der
// Vermittler prüft, markiert die Empfehlung und bestätigt; erst dann fließen die Daten in die Präsentation.
//
// Datenschutz: Die Angebote enthalten Kundendaten und gehen zum Auslesen an Anthropic. Bis AVV und
// Datenschutzerklärung ergänzt sind (docs/datenschutz.md, Offene Punkte), nur für Testkunden freigeschaltet.

import Anthropic from "@anthropic-ai/sdk";
import { reportError } from "@/lib/monitoring";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
const MAX_ITEMS = 9;

/**
 * Zusatzbaustein mit eigenem Monatsbeitrag aus dem Tarifrechner (Ole, 15.11.2026): Im Termin schaltet der Berater
 * Bausteine per Klick an oder ab, der Beitrag rechnet sich neu. Negativer Beitrag = Ersparnis (z. B. höhere SB).
 */
export type Baustein = { name: string; beitrag: number; aktiv: boolean };

export type AngebotItem = {
  sparte: string;
  gesellschaft: string | null;
  tarif: string | null;
  beitragMonat: number | null;
  selbstbeteiligung: string | null;
  leistungen: string[];
  ausschluesse: string[];
  empfohlen: boolean;
  /** Beitrag pro Monat = beitragMonat (ohne Bausteine) + aktive Bausteine */
  bausteine: Baustein[];
};

export type AngeboteDaten = { items: AngebotItem[]; quelle: string[] };

const str = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const list = (v: unknown, n: number): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, 160)).filter((x): x is string => !!x).slice(0, n) : [];
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
};

const signed = (v: unknown): number | null => {
  if (typeof v === "string" && /^\s*[-−]/.test(v)) {
    const n = num(v.replace(/^\s*[-−]/, ""));
    return n == null ? null : -n;
  }
  const n = typeof v === "number" && v < 0 ? num(-v) : null;
  return n != null ? -n : num(v);
};

const MAX_BAUSTEINE = 6;

function cleanBausteine(v: unknown): Baustein[] {
  return (Array.isArray(v) ? v : []).slice(0, MAX_BAUSTEINE).flatMap((x): Baustein[] => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    const name = str(r.name, 60);
    const beitrag = signed(r.beitrag);
    return name && beitrag != null && Math.abs(beitrag) < 10000 ? [{ name, beitrag, aktiv: r.aktiv !== false }] : [];
  });
}

/** Beitrag pro Monat mit den aktiven Bausteinen; null ohne Grundbeitrag. */
export function beitragEffektiv(i: Pick<AngebotItem, "beitragMonat" | "bausteine">): number | null {
  if (i.beitragMonat == null) return null;
  const n = i.beitragMonat + i.bausteine.filter((b) => b.aktiv).reduce((s, b) => s + b.beitrag, 0);
  return Math.max(0, Math.round(n * 100) / 100);
}

/** Gespeicherte bzw. eingegebene Angebote defensiv lesen. Genau eine Empfehlung je Sparte höchstens. */
export function cleanAngebote(raw: unknown): AngeboteDaten {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, MAX_ITEMS).flatMap((x): AngebotItem[] => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    const sparte = str(r.sparte, 60);
    if (!sparte) return [];
    return [
      {
        sparte,
        gesellschaft: str(r.gesellschaft, 60),
        tarif: str(r.tarif, 80),
        beitragMonat: num(r.beitragMonat),
        selbstbeteiligung: str(r.selbstbeteiligung, 60),
        leistungen: list(r.leistungen, 6),
        ausschluesse: list(r.ausschluesse, 4),
        empfohlen: r.empfohlen === true,
        bausteine: cleanBausteine(r.bausteine),
      },
    ];
  });
  const quelle = Array.isArray(o.quelle) ? o.quelle.map((q) => str(q, 120)).filter((q): q is string => !!q).slice(0, 10) : [];
  return { items, quelle };
}

/** Summe der empfohlenen Angebote je Monat (für die Präsentation); null ohne Beiträge. */
export function summeEmpfohlen(d: AngeboteDaten): number | null {
  const rec = d.items.filter((i) => i.empfohlen && i.beitragMonat != null);
  return rec.length ? Math.round(rec.reduce((s, i) => s + (beitragEffektiv(i) ?? 0), 0) * 100) / 100 : null;
}

/** Baustein an- bzw. abschalten (Index im Angebot und im Baustein); null, wenn es ihn nicht gibt. */
export function bausteinSchalten(d: AngeboteDaten, item: number, baustein: number, aktiv: boolean): AngeboteDaten | null {
  const it = d.items[item];
  if (!it?.bausteine[baustein]) return null;
  return {
    ...d,
    items: d.items.map((x, i) => (i === item ? { ...x, bausteine: x.bausteine.map((b, j) => (j === baustein ? { ...b, aktiv } : b)) } : x)),
  };
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
  const usable = files.filter((f) => f.contentType === "application/pdf" || f.contentType === "image/png" || f.contentType === "image/jpeg").slice(0, 5);
  if (!usable.length) return { error: "Kein Angebot als PDF oder Foto gefunden. Laden Sie es im Kontakt unter Dokumente hoch (Art „Angebot“)." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Auslesen ist gerade nicht verfügbar." };
  const blocks: Anthropic.ContentBlockParam[] = usable.map((f) =>
    f.contentType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(f.data).toString("base64") }, title: f.fileName }
      : { type: "image", source: { type: "base64", media_type: f.contentType as "image/png" | "image/jpeg", data: Buffer.from(f.data).toString("base64") } },
  );
  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system:
        "Du liest Versicherungsangebote für einen Vermittler aus. Übernimm Werte nur aus den Dokumenten, erfinde nichts. Fehlt eine Angabe, setze null bzw. eine leere Liste. Je Tarifstufe bzw. Angebot ein Eintrag. Kurz und sachlich, keine Wertung.",
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
