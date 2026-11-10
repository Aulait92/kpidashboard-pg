// Bestandskunden-Import (Excel/CSV aus dem Versicherer-System).
// Spalten werden erkannt und vom Vertreter bestätigt. Übernommen werden nur
// bekannte Felder – alle anderen Spalten (auch Gesundheitsangaben) verfallen.

import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/whatsapp/phone";

export const FIELDS = {
  externalNo: "Kundennummer",
  firstName: "Vorname",
  lastName: "Nachname",
  fullName: "Name (komplett)",
  phone: "Mobil/Telefon",
  email: "E-Mail",
  birthday: "Geburtsdatum",
  street: "Straße",
  zip: "PLZ",
  city: "Ort",
  line: "Sparte/Produkt",
  startDate: "Vertragsbeginn",
  renewalDate: "Ablauf/Hauptfälligkeit",
} as const;
export type FieldKey = keyof typeof FIELDS;
export type Mapping = Partial<Record<FieldKey, string>>;
export type Row = Record<string, string>;

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

const SYNONYMS: Record<FieldKey, string[]> = {
  externalNo: ["kundennummer", "kundennr", "kdnr", "vnnr", "versicherungsnehmernr", "partnernummer", "partnernr", "kundenid"],
  firstName: ["vorname", "firstname"],
  lastName: ["nachname", "name", "familienname", "lastname", "zuname"],
  fullName: ["vollstandigername", "kunde", "kundenname", "versicherungsnehmer", "vorundnachname"],
  phone: ["mobil", "handy", "mobilnummer", "mobiltelefon", "telefon", "telefonnummer", "tel", "telmobil", "rufnummer", "phone"],
  email: ["email", "emailadresse", "mail"],
  birthday: ["geburtsdatum", "geburtstag", "gebdatum", "gebdat", "birthday"],
  street: ["strasse", "strase", "strassehausnr", "adresse", "anschrift"],
  zip: ["plz", "postleitzahl"],
  city: ["ort", "wohnort", "stadt"],
  line: ["sparte", "produkt", "vertrag", "tarif", "produktname", "sparten", "vertragsart"],
  startDate: ["beginn", "vertragsbeginn", "versicherungsbeginn", "beginndatum"],
  renewalDate: ["ablauf", "hauptfalligkeit", "fallig", "falligkeit", "vertragsende", "ablaufdatum"],
};

// Spalten, die nie übernommen werden (Gesundheitsangaben u. Ä.)
const BLOCKED = /gesund|diagnos|vorerkrank|krankheit|behandl|medikament|bmi|gewicht|grosse|risikozuschlag|leistungsfall/i;

export function isBlockedColumn(header: string): boolean {
  return BLOCKED.test(header);
}

/** Spalten automatisch zuordnen (erste passende Spalte je Feld). */
export function detectMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  const order: FieldKey[] = ["externalNo", "firstName", "fullName", "lastName", "phone", "email", "birthday", "street", "zip", "city", "line", "startDate", "renewalDate"];
  for (const key of order) {
    const hit = headers.find((h) => !used.has(h) && !isBlockedColumn(h) && SYNONYMS[key].some((syn) => norm(h) === syn || (syn.length > 4 && norm(h).includes(syn))));
    if (hit) {
      m[key] = hit;
      used.add(hit);
    }
  }
  // „Name“ ohne Vorname-Spalte ist meist der volle Name
  if (m.lastName && !m.firstName && !m.fullName && norm(m.lastName) === "name") {
    m.fullName = m.lastName;
    delete m.lastName;
  }
  // Mobil hat Vorrang vor Festnetz
  const mobile = headers.find((h) => /mobil|handy/i.test(h));
  if (mobile) m.phone = mobile;
  return m;
}

/** Datei lesen: CSV (Komma/Semikolon) oder Excel (.xlsx). */
export async function parseFile(buf: Buffer, fileName: string): Promise<{ headers: string[]; rows: Row[] }> {
  if (/\.xlsx?$/i.test(fileName)) {
    const { default: readXlsx } = await import("read-excel-file/node");
    const sheet = (await readXlsx(buf)) as unknown[][];
    const headerIdx = sheet.findIndex((r) => r.filter((c) => c != null && String(c).trim()).length >= 2);
    if (headerIdx < 0) return { headers: [], rows: [] };
    const headers = sheet[headerIdx].map((h, i) => String(h ?? "").trim() || `Spalte ${i + 1}`);
    const rows = sheet.slice(headerIdx + 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, cell(r[i])])));
    return { headers, rows: rows.filter((r) => Object.values(r).some(Boolean)) };
  }
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true, delimitersToGuess: [";", ",", "\t"] });
  const headers = (parsed.meta.fields ?? []).map((h) => h.trim());
  return { headers, rows: parsed.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), String(v ?? "").trim()]))) };
}

function cell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function parseDate(raw: string | undefined): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 1900 + +m[3] + (+m[3] < 30 ? 100 : 0) : +m[3];
    return new Date(Date.UTC(y, +m[2] - 1, +m[1]));
  }
  if (/^\d{5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000); // Excel-Seriennummer
  return null;
}

const LINE_RULES: [RegExp, string][] = [
  [/kfz|kraftfahrt|auto|pkw|motorrad|wohnmobil|kraftrad/, "KFZ"],
  [/hausrat/, "Hausrat"],
  [/haftpflicht|phv/, "Haftpflicht"],
  [/geb(ä|a)ude|wohngeb/, "Wohngebäude"],
  [/unfall/, "Unfall"],
  [/rechtsschutz/, "Rechtsschutz"],
  [/berufsunf|\bbu\b/, "BU"],
  [/pflege/, "Pflege"],
  [/kranken|\bpkv\b|zahn|station(ä|a)r|ambulant/, "Kranken"],
  [/risikoleben|leben|rente|riester|r(ü|u)rup|altersvorsorge|pension|fonds/, "Vorsorge"],
  [/tier|hund|pferd|katze/, "Tier"],
  [/reise/, "Reise"],
];

export function normalizeLine(raw: string): string | null {
  const s = raw.toLowerCase();
  if (!s.trim()) return null;
  return LINE_RULES.find(([re]) => re.test(s))?.[1] ?? "Sonstiges";
}

export type ImportResult = { customers: number; created: number; updated: number; contracts: number; skipped: number; withPhone: number };

/** Zeilen übernehmen. Eine Zeile je Kunde oder je Vertrag – Kunden werden zusammengeführt. */
export async function importRows(customerId: string, rows: Row[], m: Mapping, now = new Date()): Promise<ImportResult> {
  const get = (r: Row, k: FieldKey) => (m[k] ? (r[m[k]!] ?? "").trim() : "");
  type Acc = {
    externalNo: string | null; firstName: string | null; lastName: string | null; phone: string | null; email: string | null;
    birthday: Date | null; street: string | null; zip: string | null; city: string | null;
    contracts: { line: string; product: string; startDate: Date | null; renewalDate: Date | null }[];
  };
  const groups = new Map<string, Acc>();
  let skipped = 0;
  for (const r of rows) {
    let first = get(r, "firstName") || null;
    let last = get(r, "lastName") || null;
    const full = get(r, "fullName");
    if (!first && !last && full) {
      const parts = full.includes(",") ? full.split(",").map((x) => x.trim()).reverse() : full.split(/\s+/);
      first = parts.slice(0, -1).join(" ") || null;
      last = parts.at(-1) || null;
    }
    const phone = normalizePhone(get(r, "phone")) || null;
    const email = get(r, "email").toLowerCase() || null;
    const ext = get(r, "externalNo") || null;
    const birthday = parseDate(get(r, "birthday"));
    const key = ext ?? phone ?? email ?? (last && birthday ? `${last}|${birthday.toISOString()}` : null);
    if (!key || (!first && !last)) {
      skipped++;
      continue;
    }
    const acc = groups.get(key) ?? {
      externalNo: ext, firstName: first, lastName: last, phone, email, birthday,
      street: get(r, "street") || null, zip: get(r, "zip").replace(/\D/g, "").slice(0, 5) || null, city: get(r, "city") || null, contracts: [],
    };
    acc.phone ??= phone;
    acc.email ??= email;
    for (const product of get(r, "line").split(/[;,/|]+/).map((x) => x.trim()).filter(Boolean)) {
      const line = normalizeLine(product);
      if (line) acc.contracts.push({ line, product, startDate: parseDate(get(r, "startDate")), renewalDate: parseDate(get(r, "renewalDate")) });
    }
    groups.set(key, acc);
  }

  const res: ImportResult = { customers: groups.size, created: 0, updated: 0, contracts: 0, skipped, withPhone: 0 };
  const consentNote = `Einwilligung laut Versicherer (Import ${now.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })})`;
  for (const a of groups.values()) {
    const lines = [...new Set(a.contracts.map((c) => c.line))].sort();
    const upcoming = a.contracts.map((c) => c.renewalDate).filter((d): d is Date => !!d && d > now).sort((x, y) => +x - +y)[0] ?? null;
    const existing = a.externalNo
      ? await prisma.existingCustomer.findUnique({ where: { customerId_externalNo: { customerId, externalNo: a.externalNo } }, select: { id: true } })
      : await prisma.existingCustomer.findFirst({
          where: { customerId, OR: [...(a.phone ? [{ phone: a.phone }] : []), ...(a.email ? [{ email: a.email }] : [])] },
          select: { id: true },
        });
    const data = {
      externalNo: a.externalNo, firstName: a.firstName, lastName: a.lastName, phone: a.phone, email: a.email, birthday: a.birthday,
      street: a.street, zip: a.zip, city: a.city, lines, nextRenewal: upcoming, consentAt: now, consentNote,
    };
    const saved = existing
      ? await prisma.existingCustomer.update({ where: { id: existing.id }, data })
      : await prisma.existingCustomer.create({ data: { ...data, customerId } });
    if (existing) res.updated++;
    else res.created++;
    if (a.phone) res.withPhone++;
    if (a.contracts.length) {
      await prisma.$transaction([
        prisma.existingContract.deleteMany({ where: { existingCustomerId: saved.id } }),
        prisma.existingContract.createMany({
          data: a.contracts.map((c) => ({ existingCustomerId: saved.id, line: c.line, product: c.product.slice(0, 120), startDate: c.startDate, renewalDate: c.renewalDate })),
        }),
      ]);
      res.contracts += a.contracts.length;
    }
  }
  return res;
}
