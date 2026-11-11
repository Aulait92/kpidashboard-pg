// CSV-Import von Kontoumsätzen (ohne Datenbank, getestet).
//
// Commerzbank (Umsätze → Export CSV): „Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;Währung;…“,
//   Ausgaben negativ, deutsches Zahlenformat (1.234,56), Datum TT.MM.JJJJ.
// American Express (Umsätze → Herunterladen → CSV): „Datum,Beschreibung,Betrag,…,Referenz,…“,
//   Belastungen POSITIV, Gutschriften/Zahlungen negativ → Vorzeichen wird umgedreht.
// Spalten werden über ihre Überschrift erkannt (Reihenfolge egal).

import { createHash } from "node:crypto";

export type CsvSource = "commerzbank" | "amex" | "auto";
export type ParsedTx = { externalId: string; bookingDate: string; amount: number; currency: string; counterparty: string | null; purpose: string | null };
export type CsvResult = { source: "commerzbank" | "amex" | "allgemein"; rows: ParsedTx[]; skipped: number; error?: string };

/** Eine CSV-Zeile mit Anführungszeichen korrekt zerlegen. */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Zeilen trennen, ohne Zeilenumbrüche in Anführungszeichen zu zerschneiden. */
function splitRecords(text: string): string[] {
  const rec: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of text.replace(/^﻿/, "")) {
    if (ch === '"') q = !q;
    if ((ch === "\n" || ch === "\r") && !q) {
      if (cur.trim()) rec.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) rec.push(cur);
  return rec;
}

/** „1.234,56“, „-12,34“, „12.34“, „1,234.56“, „12,34 €“ → Zahl. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[€\s ]|EUR/gi, "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    neg = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, "");
  else if (lastComma < 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** „31.10.2026“, „31/10/2026“, „31.10.26“, „2026-10-31“ → „2026-10-31“. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

const H = (s: string) => s.toLowerCase().replace(/[^a-zäöüß]/g, "");
const ALIASES = {
  date: ["buchungstag", "datum", "buchungsdatum", "date", "transaktionsdatum"],
  amount: ["betrag", "betrageur", "amount", "betragineur", "umsatz"],
  currency: ["währung", "waehrung", "currency"],
  counterparty: ["erscheintaufihrerabrechnungals", "beguenstigterzahlungspflichtiger", "begünstigterzahlungspflichtiger", "empfänger", "empfaenger", "auftraggeber", "nameauftraggeberempfänger", "name"],
  purpose: ["buchungstext", "beschreibung", "verwendungszweck", "description", "erweitertedetails"],
  reference: ["referenz", "reference", "transaktionsid"],
};

function findCol(headers: string[], keys: string[]): number {
  for (const k of keys) {
    const i = headers.indexOf(k);
    if (i >= 0) return i;
  }
  return -1;
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 24);

export function parseBankCsv(text: string, source: CsvSource = "auto"): CsvResult {
  const records = splitRecords(text);
  // Kopfzeile: erste Zeile mit Datums- und Betragsspalte (Banken setzen manchmal Infozeilen davor)
  let headerIdx = -1;
  let sep = ";";
  let headers: string[] = [];
  for (let i = 0; i < Math.min(records.length, 15); i++) {
    for (const s of [";", ",", "\t"]) {
      const h = splitCsvLine(records[i], s).map(H);
      if (findCol(h, ALIASES.date) >= 0 && findCol(h, ALIASES.amount) >= 0) {
        headerIdx = i;
        sep = s;
        headers = h;
        break;
      }
    }
    if (headerIdx >= 0) break;
  }
  if (headerIdx < 0) return { source: "allgemein", rows: [], skipped: 0, error: "Keine Spalten „Datum“/„Buchungstag“ und „Betrag“ gefunden. Bitte den CSV-Export der Bank verwenden." };

  const isAmex =
    source === "amex" ||
    (source === "auto" && (headers.includes("erscheintaufihrerabrechnungals") || headers.includes("karteninhaber") || (headers.includes("beschreibung") && headers.includes("referenz") && !headers.includes("buchungstag"))));
  const isCommerz = !isAmex && (source === "commerzbank" || headers.includes("umsatzart") || headers.includes("buchungstag"));
  const col = {
    date: findCol(headers, ALIASES.date),
    amount: findCol(headers, ALIASES.amount),
    currency: findCol(headers, ALIASES.currency),
    counterparty: findCol(headers, isAmex ? ALIASES.counterparty : ALIASES.counterparty.filter((k) => k !== "name")),
    purpose: findCol(headers, ALIASES.purpose),
    reference: findCol(headers, ALIASES.reference),
  };

  const rows: ParsedTx[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  for (const rec of records.slice(headerIdx + 1)) {
    const c = splitCsvLine(rec, sep);
    const date = parseDate(c[col.date] ?? "");
    const amt = parseAmount(c[col.amount] ?? "");
    if (!date || amt == null) {
      skipped++;
      continue;
    }
    const amount = isAmex ? -amt : amt;
    const purpose = col.purpose >= 0 ? c[col.purpose]?.replace(/\s+/g, " ").trim() || null : null;
    let counterparty = col.counterparty >= 0 ? c[col.counterparty]?.replace(/\s+/g, " ").trim() || null : null;
    // Commerzbank: Gegenpartei steht vorn im Buchungstext („NAME Verwendungszweck …“)
    if (!counterparty && isCommerz && purpose) counterparty = purpose.split(/\s{1,}(?=\S*\d)|\s+(End-to-End|Kartenzahlung|Lastschrift|Mandat|SEPA)/i)[0]?.slice(0, 80) || null;
    if (!counterparty && isAmex && purpose) counterparty = purpose.slice(0, 80);
    const currency = (col.currency >= 0 ? c[col.currency] : "") || "EUR";
    const ref = col.reference >= 0 ? c[col.reference]?.replace(/'/g, "").trim() : "";
    // Gleiche Buchung mehrfach am selben Tag: laufende Nummer in der ID
    const base = `${date}|${amount.toFixed(2)}|${counterparty ?? ""}|${purpose ?? ""}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    rows.push({ externalId: ref ? `ref:${ref}` : `h:${hash(`${base}|${n}`)}`, bookingDate: date, amount: Math.round(amount * 100) / 100, currency: currency.toUpperCase(), counterparty, purpose });
  }
  return { source: isAmex ? "amex" : isCommerz ? "commerzbank" : "allgemein", rows, skipped };
}
