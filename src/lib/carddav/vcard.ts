// Visitenkarten (vCard 3.0) für das Adressbuch „Vertrieb performancegrowth“ (CardDAV, Ole 22.11.2026).
// Ohne Datenbank und testbar. vCard 3.0, weil die Kontakte-App auf dem iPhone damit am zuverlässigsten umgeht
// (RFC 2426: Zeilenende CRLF, Zeilen über 75 Byte gefaltet, Komma, Semikolon, Backslash und Zeilenumbruch maskiert).

import { createHash } from "node:crypto";
import { phoneE164, phoneKind } from "@/lib/vertrieb/dubletten";

/** Was eine Karte braucht (Auszug aus SalesContact, Nummern aus phone und SalesContactPhone). */
export type KartenKontakt = {
  id: string;
  /** Firma bzw. Agentur (SalesContact.name) */
  name: string;
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Hauptnummer zuerst, dann weitere (beliebige Schreibweise) */
  phones: (string | null | undefined)[];
  /** Kurzer Stand für die Notiz, z. B. „Termin“ */
  status?: string | null;
  updatedAt: Date;
};

export const PRODID = "-//performancegrowth//Vertrieb CardDAV//DE";
export const KATEGORIE = "Vertrieb performancegrowth";

/** Text maskieren (RFC 2426 5.1, 4.: \\ ; , und Zeilenumbruch). */
export function escapeText(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Steuerzeichen und doppelte Leerzeichen raus, getrimmt. */
const sauber = (v: string | null | undefined) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

/**
 * Zeile falten: höchstens 75 Byte (UTF-8) je Zeile, Fortsetzung beginnt mit einem Leerzeichen.
 * Mehrbyte-Zeichen werden nie zerschnitten.
 */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // Folgezeilen: 1 Byte für das führende Leerzeichen
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** Alle gültigen Nummern als E.164, ohne Dubletten, Reihenfolge wie übergeben. */
export function kartenNummern(phones: KartenKontakt["phones"]): { e164: string; mobil: boolean }[] {
  const seen = new Set<string>();
  const out: { e164: string; mobil: boolean }[] = [];
  for (const raw of phones) {
    const e = phoneE164(raw);
    // Plausibel: mindestens 7 Ziffern nach der Ländervorwahl (wie phoneKey), höchstens 15 Ziffern (E.164)
    if (!e || !/^\+\d{8,15}$/.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push({ e164: e, mobil: phoneKind(e) === "MOBIL" });
  }
  return out;
}

/** Name der Person (Vorname Nachname; nur Nachname mit Anrede), sonst leer. */
export function personName(k: Pick<KartenKontakt, "salutation" | "firstName" | "lastName">): string {
  const first = sauber(k.firstName);
  const last = sauber(k.lastName);
  if (first || last) return [first || sauber(k.salutation), last].filter(Boolean).join(" ");
  return "";
}

const rev = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Eindeutige, stabile UID je Kontakt (auch Dateiname der Karte). */
export const kartenUid = (id: string) => `pg-vertrieb-${id}`;

/**
 * vCard 3.0 einer Karte. FN/N = Person (sonst Firma, dann als Firma angezeigt), ORG = Firma, TEL = alle Nummern
 * (E.164), NOTE kurz, URL zur Kontaktakte im Admin (wenn `kontaktUrl`). Null, wenn der Kontakt keine Nummer hat.
 */
export function buildVCard(k: KartenKontakt, opts: { kontaktUrl?: string | null } = {}): string | null {
  const nummern = kartenNummern(k.phones);
  if (!nummern.length) return null;
  const firma = sauber(k.name);
  const person = personName(k);
  const fn = person || firma || nummern[0].e164;
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0", `PRODID:${PRODID}`, `UID:${kartenUid(k.id)}`, `FN:${escapeText(fn)}`];
  if (person) {
    const first = sauber(k.firstName);
    const last = sauber(k.lastName);
    const prefix = sauber(k.salutation);
    lines.push(`N:${[last, first, "", prefix, ""].map(escapeText).join(";")}`);
  } else {
    // Nur Firma: iPhone zeigt die Karte als Firma an (Name = ORG)
    lines.push("N:;;;;");
    lines.push("X-ABShowAs:COMPANY");
  }
  if (firma) lines.push(`ORG:${escapeText(firma)}`);
  for (const n of nummern) lines.push(`TEL;TYPE=${n.mobil ? "CELL" : "WORK"},VOICE:${n.e164}`);
  const notiz = ["performancegrowth Vertrieb", sauber(k.status)].filter(Boolean).join(" · ");
  lines.push(`NOTE:${escapeText(notiz)}`);
  if (opts.kontaktUrl) lines.push(`URL:${opts.kontaktUrl}`);
  lines.push(`CATEGORIES:${escapeText(KATEGORIE)}`);
  lines.push(`REV:${rev(k.updatedAt)}`);
  lines.push("END:VCARD");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** ETag einer Karte (stark, in Anführungszeichen): aus dem Inhalt, der updatedAt (REV) und alle Nummern enthält. */
export function vcardEtag(vcard: string): string {
  return `"${createHash("sha256").update(vcard).digest("base64url").slice(0, 22)}"`;
}
