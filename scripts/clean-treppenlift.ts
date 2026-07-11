/**
 * Cleanup für data/treppenlift-anbieter.csv:
 *   - Parst CSV korrekt (respektiert Quotes + Multi-Line-Felder)
 *   - Wirft Junk-Zeilen weg (name = Straße / "TREPPENLIFTE" / "E-Mail" / leer)
 *   - Bereinigt street-Feld von Multi-Line-Werbetext
 *   - Schreibt sauberes data/treppenlift-final.csv
 *
 * Run: node --experimental-strip-types scripts/clean-treppenlift.ts
 */

import { readFile, writeFile } from "node:fs/promises";

const INPUT = "data/treppenlift-anbieter.csv";
const OUTPUT = "data/treppenlift-final.csv";

function parseCSV(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else if (c === '"') {
        inQuotes = false;
        i++;
      } else {
        field += c;
        i++;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
      } else if (c === ",") {
        record.push(field);
        field = "";
        i++;
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        record.push(field);
        records.push(record);
        record = [];
        field = "";
        i++;
      } else {
        field += c;
        i++;
      }
    }
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function toCSV(records: string[][]): string {
  return records
    .map((r) =>
      r
        .map((f) => {
          if (f.includes('"') || f.includes(",") || f.includes("\n")) {
            return '"' + f.replace(/"/g, '""') + '"';
          }
          return f;
        })
        .join(","),
    )
    .join("\n");
}

const STREET_SUFFIX_RE =
  /^[A-ZÄÖÜa-zäöü][\wäöüß.\- ]+\s+(?:Str\.|Straße|Strasse|Weg|Platz|Damm|Allee|Ring|Gasse|Chaussee|Ufer|Markt|Hof|Park|Berg|Tal|Feld|Brücke|Stiege)\s+\d+/i;

const JUNK_NAMES = new Set([
  "TREPPENLIFTE",
  "E-MAIL",
  "BEWERTUNG",
  "ANFRAGE",
  "IMPRESSUM",
  "KONTAKT",
  "AUS DER REGION",
  "TOP PARTNER",
  "BRONZE PARTNER",
  "SILBER PARTNER",
  "GOLD PARTNER",
  "COMFORT PARTNER",
  "ECONOMY",
  "PREMIUM PARTNER",
]);

async function main() {
  const raw = await readFile(INPUT, "utf8");
  const records = parseCSV(raw);
  const [header, ...data] = records;
  console.log(`Roh: ${data.length} Records`);

  const cleaned: string[][] = [header];
  let dropped = 0;
  let streetCleaned = 0;

  for (const rec of data) {
    // Fülle auf falls zu wenige Spalten
    while (rec.length < 12) rec.push("");
    const [name, street, ...rest] = rec;

    const nameTrim = name.trim();
    const nameIsStreet = STREET_SUFFIX_RE.test(nameTrim);
    const nameIsJunk = JUNK_NAMES.has(nameTrim.toUpperCase());

    if (!nameTrim || nameIsStreet || nameIsJunk) {
      dropped++;
      continue;
    }

    // Bereinige street: bei Multi-Line-Text nur die Zeile mit Hausnummer nehmen
    let cleanStreet = street;
    if (street.includes("\n") || street.length > 80) {
      const parts = street.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const streetLine =
        parts.filter((p) => /\d+[a-zA-Z]?$/.test(p)).pop() ||
        parts[parts.length - 1] ||
        "";
      cleanStreet = streetLine.slice(0, 80);
      streetCleaned++;
    }

    cleaned.push([name, cleanStreet, ...rest]);
  }

  console.log(`Bereinigt: ${cleaned.length - 1} · verworfen: ${dropped} · street-cleaned: ${streetCleaned}`);
  await writeFile(OUTPUT, toCSV(cleaned) + "\n", "utf8");
  console.log(`→ ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
