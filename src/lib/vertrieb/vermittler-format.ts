// Öffentlich gesammelte Vermittlerliste (Ole, 19.11.2026): Format erkennen und Beschriftungen der Vorschau.
// Ohne Abhängigkeiten, damit auch das Import-Formular im Browser das Format schon bei der Dateiauswahl erkennt.
// Zuordnung, Prüfungen und Anlegen in lib/vertrieb/import-contacts.ts (importVermittlerListe).
//
// Kopfzeile (Semikolon, UTF-8):
// quelle;gesellschaft;typ;firma;ansprechpartner;strasse;plz;ort;telefon;website;email;email_quelle;
// email_muster_vermutet;quelle_url;abgerufen_am

export const VERMITTLER_SPALTEN = [
  "quelle", "gesellschaft", "typ", "firma", "ansprechpartner", "strasse", "plz", "ort", "telefon", "website", "email",
  "email_quelle", "email_muster_vermutet", "quelle_url", "abgerufen_am",
] as const;

/** Spalten, an denen das Format erkannt wird (die übrigen dürfen fehlen). */
const PFLICHT = ["quelle", "gesellschaft", "email", "email_muster_vermutet", "quelle_url"] as const;

/** Spaltennamen der ersten Zeile (klein, ohne BOM und Anführungszeichen). */
export function kopfSpalten(text: string): string[] {
  const erste = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  return erste.split(";").map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim().toLowerCase());
}

/** Ist das die Vermittlerliste (Semikolon, Spalten quelle, gesellschaft, email, email_muster_vermutet, quelle_url)? */
export function istVermittlerListe(text: string): boolean {
  const spalten = kopfSpalten(text);
  return spalten.length > 1 && PFLICHT.every((p) => spalten.includes(p));
}

/** Gründe, aus denen eine Zeile nicht angelegt wird, in der Reihenfolge der Prüfung. */
export const LISTEN_GRUENDE = ["ohne_email", "vermutet", "doppelt", "sperrliste", "kunde", "nie_kontaktieren", "vorhanden"] as const;
export type ListenGrund = (typeof LISTEN_GRUENDE)[number];

export const LISTEN_GRUND_LABEL: Record<ListenGrund, string> = {
  ohne_email: "ohne gültige E-Mail",
  vermutet: "E-Mail nur vermutet",
  doppelt: "doppelt in der Datei",
  sperrliste: "auf der Sperrliste",
  kunde: "bestehende Kunden",
  nie_kontaktieren: "nie kontaktieren, abgemeldet oder unzustellbar",
  vorhanden: "schon im Vertrieb",
};

export type ListenErgebnis = {
  /** false = Trockenlauf (Vorschau), nichts geschrieben */
  angewendet: boolean;
  zeilen: number;
  neu: number;
  /** davon schon im Vertrieb, leere Felder ergänzt (Stufe und Status bleiben) */
  ergaenzt: number;
  uebersprungen: Record<ListenGrund, number>;
  /** je Gesellschaft (Merkmal „Versicherer“ am Kontakt): Zeilen und neue Kontakte, die meisten zuerst */
  jeGesellschaft: { name: string; zeilen: number; neu: number }[];
  dauerMs: number;
};

export const summeUebersprungen = (r: Pick<ListenErgebnis, "uebersprungen">) =>
  Object.values(r.uebersprungen).reduce((a, b) => a + b, 0);
