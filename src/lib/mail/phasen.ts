// Vorlagen nach Phase des Kontakts (Ole, 14.11.2026): Im Dialog „E-Mail schreiben“ stehen die passenden
// Vorlagen vorn und hervorgehoben, die übrigen unter „Weitere“. Rein, auch im Browser nutzbar.

import type { VorlageKey } from "@/lib/mail/vorlagen";

export type PhasenKontext = {
  /** Lead.status (z. B. „Nicht erreicht“, „Angebot gesendet“) */
  status: string | null | undefined;
  /** Kontaktversuche (Neuer Lead mit Versuch zählt wie „Nicht erreicht“) */
  contactAttempts?: number | null;
  /** Ein gebuchter Termin liegt noch vor uns */
  naechsterTermin?: boolean;
  /** Status des letzten vergangenen Termins (ohne abgesagte); null = keiner */
  letzterTermin?: "booked" | "completed" | "no_show" | null;
  /** „Police fertig gemacht“ ist gesetzt */
  policeFertig?: boolean;
  /** Eine selbst gesetzte Wiedervorlage liegt in der Zukunft („Später“) */
  spaeter?: boolean;
};

const ANGEBOT = /^angebot (gesendet|verschickt|raus)/;

/**
 * Passende Standardvorlagen in Reihenfolge:
 * - Kein Interesse → Tür offen
 * - Abschluss → Kündigung alte Versicherung, Nach dem Abschluss; mit fertiger Police → Willkommen, Kündigung
 * - Später (eigene Wiedervorlage in der Zukunft) → Wie besprochen
 * - Termin gebucht → Vorbereitung; letzter Termin nicht erschienen → Nicht erschienen
 * - Angebot offen → Nachfassen Angebot
 * - Termin vorbei ohne Ergebnis → Gesprächszusammenfassung, Unterlagen fehlen, Angebot
 * - Nicht erreicht (oder Neuer Lead mit Anrufversuch) → Nicht erreicht
 * Disqualifiziert und Storno: keine Empfehlung.
 */
export function passendeVorlagen(k: PhasenKontext): VorlageKey[] {
  const s = (k.status ?? "").trim().toLowerCase();
  if (s.startsWith("storno") || s === "disqualifiziert" || s === "disqualified" || s === "nicht qualifiziert") return [];
  if (s === "kein interesse") return ["tuer_offen"];
  if (s === "abschluss") return k.policeFertig ? ["willkommen", "kuendigung"] : ["kuendigung", "nach_abschluss"];
  const out: VorlageKey[] = [];
  if (k.spaeter) out.push("wie_besprochen");
  if (k.naechsterTermin) out.push("termin_vorbereitung");
  else if (k.letzterTermin === "no_show") out.push("nicht_erschienen");
  if (ANGEBOT.test(s)) out.push("nachfassen_angebot");
  else if (!k.naechsterTermin && (k.letzterTermin === "booked" || k.letzterTermin === "completed")) out.push("beratungsdoku", "unterlagen_fehlen", "angebot");
  const nichtErreicht = s === "nicht erreicht" || ((s === "" || s === "neuer lead") && (k.contactAttempts ?? 0) > 0);
  if (nichtErreicht && !k.naechsterTermin) out.push("nicht_erreicht");
  return [...new Set(out)];
}

/** Vorlagen aufteilen: passende (in Empfehlungs-Reihenfolge) und weitere (in bisheriger Reihenfolge). */
export function sortiereVorlagen<T extends { standardKey?: string | null }>(vorlagen: readonly T[], keys: readonly string[]): { passend: T[]; weitere: T[] } {
  const passend: T[] = [];
  for (const k of keys) {
    const v = vorlagen.find((x) => x.standardKey === k && !passend.includes(x));
    if (v) passend.push(v);
  }
  return { passend, weitere: vorlagen.filter((v) => !passend.includes(v)) };
}

// Nachfass-Aufgabe nach dem Senden, je Vorlage (Ausführung in lib/mail/termin-erinnerung.ts).
export type Nachfassen = { art: "terminlink" | "nicht_erschienen" | "unterlagen"; tage: number } | { art: "melden"; tag: string } | { art: "beenden" };

/** Was nach dem Senden passiert, je Vorlage (rein, für Dialog und Server gleich). */
export function nachfassenFuer(key: string | null | undefined, o: { erinnern: boolean; tage: number; mitLink: boolean; meldeTag?: string | null }): Nachfassen | null {
  if (key === "tuer_offen") return { art: "beenden" };
  if (o.meldeTag) return { art: "melden", tag: o.meldeTag };
  if (key === "wie_besprochen") return null;
  if (!o.erinnern) return null;
  if (key === "nicht_erschienen") return { art: "nicht_erschienen", tage: o.tage };
  if (key === "unterlagen_fehlen") return { art: "unterlagen", tage: 3 };
  return o.mitLink ? { art: "terminlink", tage: o.tage } : null;
}
