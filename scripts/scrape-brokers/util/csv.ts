import { writeFile } from "node:fs/promises";
import type { CsvRow } from "../types.ts";

const HEADERS: (keyof CsvRow)[] = [
  "name",
  "street",
  "zip",
  "city",
  "phone",
  "email",
  "website",
  "employeesEstimate",
  "employeesMethod",
  "source",
  "sourceUrl",
];

function escape(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function writeCsv(path: string, rows: CsvRow[]): Promise<void> {
  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    lines.push(HEADERS.map((h) => escape(row[h] ?? "")).join(","));
  }
  await writeFile(path, lines.join("\n") + "\n", "utf8");
}
