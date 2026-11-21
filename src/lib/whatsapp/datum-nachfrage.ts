// Antwort auf eine Datumsfrage der App prüfen und genau einmal nachfragen (Ole, 21.11.2026: Der Lead antwortete auf
// „Wie lautet Ihr Geburtsdatum?“ mit „220.8.92“, das wurde ungeprüft übernommen). Gilt für die Angebotsfrage nach dem
// Geburtsdatum (termin-strecke.ts angebotDatumAntwort) und die Tierfragen mit Datum (Geburt des Tieres, Ablauf der
// bestehenden Versicherung, Geburtsdatum des Halters; termin-strecke.ts tierAntwort). Rein, ohne Datenbank.
//   - gültig und plausibel: normalisiert übernehmen (TT.MM.JJJJ)
//   - Tippfehler mit eindeutiger Korrektur: „Da hat sich vielleicht ein Tippfehler eingeschlichen. Meinen Sie den
//     22.08.1992?“ [Ja, genau] [Anderes Datum]; bei zwei Möglichkeiten beide Daten als Knöpfe und [Anderes Datum]
//   - sonst: „Das Datum habe ich nicht erkannt. Bitte so: TT.MM.JJJJ, zum Beispiel 22.08.1992.“
//   - zweite unklare Antwort: wörtlich mit Vermerk „(bitte im Termin prüfen)“ übernehmen und weiter, damit niemand hängen bleibt
// Antworten ohne Zahl („weiß nicht“), Rückfragen und Altersangaben bleiben beim bisherigen Ablauf (null).

import { a, type Ansprache } from "@/lib/ansprache";
import { ablaufBeispiel, datumBefund, type DatumArt } from "@/lib/datum-antwort";
import type { Knopf } from "@/lib/whatsapp/gespraech";

/** Vermerk an einer Antwort, die auch nach der Nachfrage kein gültiges Datum ist. */
export const DATUM_VERMERK = "(bitte im Termin prüfen)";

export const DATUM_KNOPF = { ja: "Ja, genau", andere: "Anderes Datum" } as const;

/** Was zur Nachfrage gemerkt wird (interne Nachricht): Vorschläge, ursprüngliche Antwort, schon „Anderes Datum“ gewählt. */
export type DatumMerker = { vorschlaege: string[]; roh: string; andere?: boolean };

export type DatumSchritt =
  /** übernehmen (normalisiert) */
  | { art: "ok"; wert: string }
  /** genau diese Nachricht senden und den Merker setzen */
  | { art: "fragen"; text: string; buttons: Knopf[] | null; merker: DatumMerker }
  /** zweite unklare Antwort: wörtlich mit Vermerk übernehmen */
  | { art: "vermerk"; wert: string };

const JA_RE = /^(ja|jap|jo|jep|jup|yes|genau|richtig|stimmt|korrekt|exakt|passt)\b/i;
const ANDERS_RE = /^(nein|nee|ne|nö|noe|no|anderes datum|anderes|falsch|stimmt nicht|nicht richtig)\b/i;

/** Datum als Wort im Satz: „den 22.08.1992“ bzw. nur das Jahr „2019“. */
const alsWort = (v: string) => (v.includes(".") ? `den ${v}` : v);

/** Beispiel und Form je Frage. */
function form(art: DatumArt, jetzt: Date): string {
  if (art === "geburtTier") return "Das Jahr reicht, zum Beispiel 2019.";
  if (art === "ablauf") return `Monat und Jahr reichen, zum Beispiel ${ablaufBeispiel(jetzt)}.`;
  return "Bitte so: TT.MM.JJJJ, zum Beispiel 22.08.1992.";
}

/** Rückfrage mit Vorschlag (ein oder zwei Daten). */
export function vorschlagText(an: Ansprache, vorschlaege: string[]): string {
  const liste = vorschlaege.map(alsWort).join(" oder ");
  return a(an, `Da hat sich vielleicht ein Tippfehler eingeschlichen. Meinst du ${liste}?`, `Da hat sich vielleicht ein Tippfehler eingeschlichen. Meinen Sie ${liste}?`);
}

/** Knöpfe zum Vorschlag: [Ja, genau] [Anderes Datum] bzw. beide Daten und [Anderes Datum]. Payload datum:<feld>:… */
export function vorschlagKnoepfe(feld: string, vorschlaege: string[]): Knopf[] {
  const andere = { id: `datum:${feld}:andere`, title: DATUM_KNOPF.andere };
  if (vorschlaege.length === 1) return [{ id: `datum:${feld}:ja`, title: DATUM_KNOPF.ja }, andere];
  return [...vorschlaege.slice(0, 2).map((v, i) => ({ id: `datum:${feld}:${i + 1}`, title: v })), andere];
}

/** Nachfrage ohne Vorschlag: nicht erkannt bzw. passt nicht (Zukunft, zu alt). */
export function nachfrageText(art: DatumArt, befund: "unlesbar" | "unplausibel", jetzt: Date = new Date()): string {
  const satz = befund === "unplausibel" ? "Das Datum scheint nicht zu passen." : "Das Datum habe ich nicht erkannt.";
  return `${satz} ${form(art, jetzt)}`;
}

/** Nach „Anderes Datum“: noch einmal fragen. */
export function nochmalText(art: DatumArt, an: Ansprache, jetzt: Date = new Date()): string {
  if (art === "geburtTier") return a(an, "Gern. Wann ist dein Tier ungefähr geboren? Das Jahr reicht.", "Gern. Wann ist Ihr Tier ungefähr geboren? Das Jahr reicht.");
  if (art === "ablauf") return `Gern. Bis wann läuft die Versicherung ungefähr? ${form(art, jetzt)}`;
  return a(an, "Gern. Wie lautet dein Geburtsdatum? Bitte so: TT.MM.JJJJ.", "Gern. Wie lautet Ihr Geburtsdatum? Bitte so: TT.MM.JJJJ.");
}

/** Erkennt unsere Nachfragen (für die Zuordnung der nächsten Antwort). */
export const DATUM_NACHFRAGE_RE = /^Da hat sich vielleicht ein Tippfehler eingeschlichen\.|^Das Datum (habe ich nicht erkannt|scheint nicht zu passen)\.|^Gern\. (Wie lautet (dein|Ihr) Geburtsdatum|Wann ist (dein|Ihr) Tier|Bis wann läuft)/;

const mitVermerk = (roh: string) => `${roh.slice(0, 80)} ${DATUM_VERMERK}`;

/**
 * Antwort auf eine Datumsfrage auswerten. merker = schon einmal nachgefragt (dann nie wieder). feld = Kennung für die
 * Knöpfe („geburt“, „geburtTier“ …). null = nicht zuständig (keine Zahl, Rückfrage, Altersangabe, unter 18): bisheriger
 * Ablauf.
 */
export function datumSchritt(o: { art: DatumArt; feld: string; text: string | null | undefined; an: Ansprache; merker: DatumMerker | null; jetzt?: Date }): DatumSchritt | null {
  const jetzt = o.jetzt ?? new Date();
  const roh = (o.text ?? "").replace(/\s+/g, " ").trim();
  if (!roh || roh.includes("?")) return null;
  const m = o.merker;
  const ohneZahl = !/\d/.test(roh);
  if (m && ohneZahl) {
    // „Ja, genau“ auf einen Vorschlag; bei zwei Vorschlägen ist „ja“ nicht eindeutig
    if (JA_RE.test(roh) && !ANDERS_RE.test(roh) && m.vorschlaege.length) return m.vorschlaege.length === 1 ? { art: "ok", wert: m.vorschlaege[0] } : { art: "vermerk", wert: mitVermerk(m.roh) };
    if (ANDERS_RE.test(roh)) {
      if (!m.andere) return { art: "fragen", text: nochmalText(o.art, o.an, jetzt), buttons: null, merker: { ...m, andere: true } };
      return { art: "vermerk", wert: mitVermerk(m.roh) };
    }
  }
  const b = datumBefund(roh, o.art, jetzt);
  if (b.art === "ok") return { art: "ok", wert: b.wert };
  if (b.art === "frei" || b.art === "jung") return null;
  if (m) return { art: "vermerk", wert: mitVermerk(roh) };
  if (b.art === "vorschlag") return { art: "fragen", text: vorschlagText(o.an, b.vorschlaege), buttons: vorschlagKnoepfe(o.feld, b.vorschlaege), merker: { vorschlaege: b.vorschlaege, roh } };
  return { art: "fragen", text: nachfrageText(o.art, b.art, jetzt), buttons: null, merker: { vorschlaege: [], roh } };
}

/** Merker aus einer internen Nachricht lesen (null = keiner bzw. kaputt). */
export function datumMerkerAus(body: string | null | undefined): DatumMerker | null {
  try {
    const x = JSON.parse(body ?? "") as Partial<DatumMerker>;
    if (!x || typeof x.roh !== "string") return null;
    return { vorschlaege: Array.isArray(x.vorschlaege) ? x.vorschlaege.filter((v): v is string => typeof v === "string") : [], roh: x.roh, ...(x.andere ? { andere: true } : {}) };
  } catch {
    return null;
  }
}
