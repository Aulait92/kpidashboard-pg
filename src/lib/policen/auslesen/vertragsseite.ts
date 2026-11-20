// Vertragsseite (Policen auslesen, Paket 2 „Champions League“, 19.11.2026): reine Logik für die Seite
// /buyer/termine/[id]/vorbereitung/vertraege, ohne Datenbank, testbar.
// - Welche Karte gehört zu welcher Frage für den Termin (Nummer an Frage und Karte, Sprung per Anker).
// - Reihenfolge der Karten: zuerst mit Frage, dann „bitte prüfen“, dann der Rest.
// - Zeilen einer Karte: Gesprächsfelder und alle unsicheren Felder sichtbar, der Rest unter „Alle Angaben“.
// - Genau eine Hauptaktion je Zustand: „Alle als geprüft markieren“, danach (nur mit Bestandsmodul) „In Bestand
//   übernehmen“. Übernommen wird nur, was der Vermittler geprüft hat (K7, keine stille Prüfungsfiktion).
// Kündigungsangaben nur für Sach (K8), wie in zusammenfassung.ts.

import { felderFuer, zeigeWert, type AuslesenSparte, type Felder } from "@/lib/policen/auslesen/felder";
import { KUENDIGUNG_SPARTEN, kuendigungsfenster, type Frage } from "@/lib/policen/auslesen/zusammenfassung";

/** So viele Fragen stehen sichtbar oben, der Rest unter „Mehr“. */
export const SICHTBARE_FRAGEN = 3;

export type KarteDaten = {
  id: string;
  sparte: AuslesenSparte;
  felder: Felder;
  /** ausgelesen = mit Werten; leer = nichts gefunden */
  status: "ausgelesen" | "leer";
  geprueft: boolean;
  uebernommen: boolean;
};

/** Nummern der Fragen (ab 1) je Karte, in der Reihenfolge der Fragen. */
export function fragenJeKarte(fragen: readonly Frage[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  fragen.forEach((f, i) => {
    for (const id of f.ids) m.set(id, [...(m.get(id) ?? []), i + 1]);
  });
  return m;
}

/** Hat die Karte Felder, die der Vermittler noch prüfen soll? */
export const hatUnsichere = (k: KarteDaten) => !k.geprueft && Object.values(k.felder).some((f) => f.s === "pruefen");

/** Karten sortiert: mit Frage (nach erster Frage), dann ungeprüft mit unsicheren Feldern, dann ungeprüft, dann Rest. */
export function sortiereKarten<T extends KarteDaten>(karten: readonly T[], fragen: readonly Frage[]): T[] {
  const nr = fragenJeKarte(fragen);
  const rang = (k: T) => {
    const n = nr.get(k.id);
    if (n?.length) return n[0];
    if (hatUnsichere(k)) return 1000;
    if (!k.geprueft && !k.uebernommen) return 2000;
    return 3000;
  };
  return karten
    .map((k, i) => ({ k, i }))
    .sort((a, b) => rang(a.k) - rang(b.k) || a.i - b.i)
    .map((x) => x.k);
}

export type Zeile = { key: string; label: string; wert: string; pruefen: boolean };

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const tag = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Felder, die im Termin zählen und darum sichtbar sind (neben Beitrag, Kündigung bzw. Laufzeit). */
const GESPRAECH = new Set(["deckungssumme", "versicherungssumme", "umfang", "sf_haftpflicht", "sf_kasko", "kasko", "bausteine", "monatsrente", "rente_monatlich"]);
/** Ja/Nein-Bausteine: sichtbar nur bei ausdrücklichem „nein“ (wie die Fragen). */
const BAUSTEINE = new Set(["elementar", "unterversicherungsverzicht", "forderungsausfall", "schluesselverlust", "fahrrad"]);

/**
 * Zeilen einer Karte. sichtbar: Beitrag (mit Monatsbetrag), Kündigung (Sach) bzw. Laufzeit, Gesprächsfelder, Bausteine
 * mit „nein“ und immer alle unsicheren Felder (solange nicht geprüft). mehr: alles Übrige („Alle Angaben“).
 */
export function kartenZeilen(k: KarteDaten, heute: string, monat: number | null): { sichtbar: Zeile[]; mehr: Zeile[] } {
  const f = k.felder;
  const unsicher = (...keys: string[]) => !k.geprueft && keys.some((x) => f[x]?.s === "pruefen");
  const sichtbar: Zeile[] = [];
  const mehr: Zeile[] = [];
  const felder = felderFuer(k.sparte);
  const def = (key: string) => felder.find((x) => x.key === key);

  const zw = f.zahlweise && def("zahlweise") ? zeigeWert(def("zahlweise")!, f.zahlweise.w) : null;
  if (typeof f.beitrag?.w === "number") {
    // Sichtbar kurz der Monatsbetrag; Beitrag laut Unterlage mit Zahlweise unter „Alle Angaben“
    const laut = `${euro(f.beitrag.w)}${zw ? ` ${zw}` : ""}`;
    const pr = unsicher("beitrag", "zahlweise");
    if (monat != null) {
      sichtbar.push({ key: "beitrag", label: "Beitrag", wert: `${euro(monat)} im Monat`, pruefen: pr });
      if (f.zahlweise?.w !== "monatlich") mehr.push({ key: "beitrag_laut", label: "Beitrag laut Unterlage", wert: laut, pruefen: pr });
    } else sichtbar.push({ key: "beitrag", label: "Beitrag", wert: laut, pruefen: pr });
  } else if (zw) sichtbar.push({ key: "zahlweise", label: "Zahlweise", wert: zw, pruefen: unsicher("zahlweise") });

  const von = typeof f.beginn?.w === "string" ? tag(f.beginn.w) : null;
  const bis = typeof f.ablauf?.w === "string" ? tag(f.ablauf.w) : null;
  const laufzeit: Zeile | null =
    von || bis ? { key: "laufzeit", label: "Laufzeit", wert: von && bis ? `${von} bis ${bis}` : von ? `ab ${von}` : `bis ${bis}`, pruefen: unsicher("beginn", "ablauf") } : null;
  const fenster = KUENDIGUNG_SPARTEN.includes(k.sparte) ? kuendigungsfenster(f, heute) : null;
  const fristUnsicher = unsicher("ablauf", "kuendigungsfrist_monate", "naechster_kuendigungstermin");
  if (fenster?.bis) {
    sichtbar.push({ key: "kuendigung", label: "Kündigung bis", wert: tag(fenster.bis), pruefen: fristUnsicher });
    mehr.push({ key: "kuendigung_zum", label: "Kündigung zum", wert: tag(fenster.zum), pruefen: false });
    if (laufzeit) mehr.push(laufzeit);
  } else if (fenster) {
    sichtbar.push({ key: "kuendigung", label: "Kündbar zum", wert: `${tag(fenster.zum)}, Frist im Original prüfen`, pruefen: fristUnsicher });
    if (laufzeit) mehr.push(laufzeit);
  } else if (laufzeit) sichtbar.push(laufzeit);

  const schonGezeigt = new Set(["versicherer", "beitrag", "zahlweise", "beginn", "ablauf"]);
  for (const x of felder) {
    const v = f[x.key];
    if (!v || schonGezeigt.has(x.key)) continue;
    const wert = x.key === "kuendigungsfrist_monate" && v.w === 1 ? "1 Monat" : zeigeWert(x, v.w);
    const z: Zeile = { key: x.key, label: x.label, wert, pruefen: unsicher(x.key) };
    const zeigen = z.pruefen || GESPRAECH.has(x.key) || (BAUSTEINE.has(x.key) && v.w === false);
    (zeigen ? sichtbar : mehr).push(z);
  }
  return { sichtbar, mehr };
}

export type Hauptaktion =
  | { art: "pruefen"; ids: string[] }
  | { art: "uebernehmen"; ids: string[] }
  | { art: "fertig"; text: string }
  | null;

/** Ausgelesene Karten, die der Vermittler noch nicht geprüft hat (für „Alle als geprüft markieren“). */
export const pruefbar = (karten: readonly KarteDaten[]) => karten.filter((k) => k.status === "ausgelesen" && !k.geprueft && !k.uebernommen).map((k) => k.id);
/** Geprüfte, noch nicht übernommene Karten (für „In Bestand übernehmen“); nie ungeprüfte. */
export const uebernehmbar = (karten: readonly KarteDaten[]) => karten.filter((k) => k.status === "ausgelesen" && k.geprueft && !k.uebernommen).map((k) => k.id);

/** Die eine Hauptaktion der Seite. Ohne Bestandsmodul nie „übernehmen“. null: nichts anzubieten. */
export function hauptaktion(karten: readonly KarteDaten[], o: { bestand: boolean; readOnly: boolean }): Hauptaktion {
  if (o.readOnly) return null;
  const ausgelesen = karten.filter((k) => k.status === "ausgelesen");
  if (!ausgelesen.length) return null;
  const p = pruefbar(karten);
  if (p.length) return { art: "pruefen", ids: p };
  const u = uebernehmbar(karten);
  if (o.bestand && u.length) return { art: "uebernehmen", ids: u };
  return { art: "fertig", text: ausgelesen.every((k) => k.uebernommen) ? "Alle im Bestand" : "Alle geprüft" };
}

export const vertraegeText = (n: number) => (n === 1 ? "1 Vertrag" : `${n} Verträge`);
export const hauptaktionText = (a: Exclude<Hauptaktion, null | { art: "fertig" }>) =>
  a.art === "pruefen" ? `Alle als geprüft markieren (${a.ids.length})` : `${vertraegeText(a.ids.length)} in Bestand übernehmen`;

// ─── Texte aus einer Quelle (Vertragsseite und Spickzettel in der Terminvorbereitung, Paket 3) ───────────────

/** K6 (Rechtsprüfung): ein Satz, gleich auf Vertragsseite und Spickzettel; dazu „Bitte prüfen“ an ungeprüften Karten. */
export const K6_SATZ = "Maschinell ausgelesen: bitte vor dem Termin mit dem Original prüfen.";

/** Warum eine Unterlage nicht ausgelesen ist (Status des Auszugs). */
export const GRUND_TEXT: Record<string, string> = {
  sparte_offen: "Welche Sparte ist das?",
  sparte_abweichend: "Die Unterlage passt nicht zur Sparte. Welche ist es?",
  gesperrt: "Diese Sparte wird nicht automatisch ausgelesen.",
  limit: "Nicht automatisch ausgelesen.",
  fehler: "Konnte nicht ausgelesen werden.",
  laeuft: "Wird ausgelesen …",
  neu: "Wird ausgelesen …",
};

/** Warum für diesen Kunden gar nicht ausgelesen wird (Sperre des Leads). */
export const SPERRE_TEXT: Record<string, string> = {
  einwilligung: "Ohne Zustimmung des Kunden zum Auslesen. Bitte im Original nachsehen.",
  ohne_ki: "Nicht ausgelesen auf Wunsch des Kunden.",
  aus: "Automatisches Auslesen ist gerade nicht verfügbar.",
  pause: "Automatisches Auslesen ist gerade nicht verfügbar.",
  kunde: "Automatisches Auslesen ist für Ihr Konto noch nicht freigeschaltet.",
};

const euroKopf = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

/** Kopf über allen Verträgen: groß die Beiträge im Monat, darunter Jahr, Anzahl und wie viele noch zu prüfen sind. */
export function kopfZeile(z: { monatSumme: number | null; jahrSumme: number | null; vertraege: number; ungeprueft: number }): { monat: string | null; zeile: string } {
  return {
    monat: z.monatSumme != null ? euroKopf(z.monatSumme) : null,
    zeile: [z.jahrSumme != null ? `${euroKopf(z.jahrSumme)} im Jahr` : null, vertraegeText(z.vertraege), z.ungeprueft ? `${z.ungeprueft} bitte prüfen` : "alle geprüft"]
      .filter(Boolean)
      .join(" · "),
  };
}
export const MONAT_UNBEKANNT = "Beiträge nicht bekannt";
