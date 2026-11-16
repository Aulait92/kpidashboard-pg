// Telefonsuche (Ole, 16.11.2026), ohne Datenbank und testbar.
// Gespeichert wird je Nummernfeld ein Ziffernschlüssel (Spalten "phoneDigits" und "phoneDigitsRev", per DB-Trigger
// aus Migration 20261118705700, SQL-Funktion telefon_ziffern). Der Schlüssel ist derselbe wie phoneKey aus
// lib/vertrieb/dubletten.ts: ohne führende 0 bzw. +49/0049, z. B. „0152-581 42 143“ → 15258142143.
// Gesucht wird
// - mit Vorwahl (+…, 00…, 0…): Anfang des Schlüssels (die ganze Nummer ist ein Sonderfall davon),
// - nur Ziffern („42143“, „15258142143“, „4915258142143“): Ende des Schlüssels, über die umgekehrten Ziffern.
// - kurz mit führender 0 („0152 581“ oder Endziffern „020978“): Anfang und Ende.
// Beides als Bereichsabfrage auf einem normalen B-Tree-Index (funktioniert mit jeder Sortierung der Datenbank, weil
// die Spalten nur Ziffern enthalten), dazu „beginnt mit“ als genaue Bedingung.

import { phoneKey } from "@/lib/vertrieb/dubletten";

/** Mindestens so viele Ziffern im Schlüssel, damit gesucht wird (Teilsuche ab 5 Ziffern). */
export const PHONE_MIN_DIGITS = 5;

/** Schlüssel einer gespeicherten Nummer, genau wie die SQL-Funktion telefon_ziffern (= phoneKey). */
export const phoneDigitsKey = (raw: string | null | undefined): string | null => phoneKey(raw);

const reverse = (s: string) => [...s].reverse().join("");

export type PhoneQuery = {
  /** Ziffernschlüssel der Eingabe (ohne 0 bzw. +49) */
  key: string;
  /** start: Nummer mit Vorwahl, passt auf den Anfang; end: Endziffern */
  mode: "start" | "end";
  /** Kurze Eingabe mit führender 0 („020978“): können auch Endziffern sein, dann zusätzlich so gesucht */
  tail?: string;
};

/**
 * Telefonsuche für eine Eingabe? Nur Ziffern und Zeichen von Rufnummern (Leerzeichen, + ( ) / - . –),
 * mindestens 5 Ziffern im Schlüssel. Sonst null (dann nur Textsuche).
 */
export function phoneQuery(raw: string): PhoneQuery | null {
  const t = raw.trim().replace(/\(\s*0\s*\)/g, " ");
  if (!t || !/^[\d\s+()/\-–.]+$/.test(t)) return null;
  let d = t.replace(/\D/g, "");
  let mode: PhoneQuery["mode"] = "start";
  if (t.startsWith("+")) {
    // international
  } else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `49${d.slice(1)}`;
  else mode = "end";
  if (mode === "start" || d.length >= 11) d = d.startsWith("49") ? d.slice(2) : d;
  const all = t.replace(/\D/g, "");
  const tail = !t.startsWith("+") && /^0[1-9]/.test(all) && all.length >= PHONE_MIN_DIGITS && all.length < 10 ? all : undefined;
  if (d.length >= PHONE_MIN_DIGITS) return { key: d, mode, ...(tail ? { tail } : {}) };
  return tail ? { key: tail, mode: "end" } : null;
}

/** Kleinster Ziffernstring, der nicht mehr mit `prefix` beginnt („1529“ → „153“); null bei lauter 9en. */
export function nextPrefix(prefix: string): string | null {
  const s = prefix.replace(/9+$/, "");
  if (!s) return null;
  return s.slice(0, -1) + String(Number(s.slice(-1)) + 1);
}

type DigitsFilter = { gte: string; lt?: string; startsWith: string };
type DigitsWhere = { phoneDigits: DigitsFilter } | { phoneDigitsRev: DigitsFilter };
export type PhoneDigitsWhere = DigitsWhere | { OR: DigitsWhere[] };

const range = (prefix: string): DigitsFilter => {
  const lt = nextPrefix(prefix);
  return { gte: prefix, ...(lt ? { lt } : {}), startsWith: prefix };
};

/** Prisma-Bedingung für Tabellen mit "phoneDigits"/"phoneDigitsRev" (nutzt deren B-Tree-Index). */
export function phoneDigitsWhere(q: PhoneQuery): PhoneDigitsWhere {
  const main: DigitsWhere = q.mode === "start" ? { phoneDigits: range(q.key) } : { phoneDigitsRev: range(reverse(q.key)) };
  return q.tail ? { OR: [main, { phoneDigitsRev: range(reverse(q.tail)) }] } : main;
}

/** Passt eine gespeicherte Nummer (beliebige Schreibweise) zur Suche? Gleiche Regel wie phoneDigitsWhere. */
export function phoneMatches(q: PhoneQuery, stored: string | null | undefined): boolean {
  const k = phoneDigitsKey(stored);
  if (!k) return false;
  return (q.mode === "start" ? k.startsWith(q.key) : k.endsWith(q.key)) || (!!q.tail && k.endsWith(q.tail));
}
