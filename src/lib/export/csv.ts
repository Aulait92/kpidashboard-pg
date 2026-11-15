// CSV für Excel (Semikolon, UTF-8 mit BOM, CRLF). Rein, ohne Datenbank, getestet.
// Zellen, die Excel als Formel lesen würde (=, @, + oder - vor Nicht-Ziffern), bekommen ein Hochkomma davor.

export type CsvValue = string | number | boolean | Date | null | undefined;

const dateDe = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

export function csvCell(v: CsvValue): string {
  let s = v == null ? "" : v instanceof Date ? dateDe(v) : typeof v === "boolean" ? (v ? "ja" : "nein") : String(v);
  if (/^[=@]/.test(s) || /^[+-][^\d\s]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return "﻿" + [header.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\r\n") + "\r\n";
}
