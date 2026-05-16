import { prisma } from "@/lib/prisma";

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
};

type AirtableListResponse = {
  records: AirtableRecord[];
  offset?: string;
};

const REACHED_STATUSES = new Set([
  "Erreicht",
  "Qualifiziert",
  "Termin vereinbart",
  "Angebot/Beratung läuft",
  "Abschluss",
  "Kein Interesse",
]);

const CLOSED_STATUS = "Abschluss";

const TABLES = [
  { name: process.env.AIRTABLE_TABLE_WECHSEL ?? "PKV-Wechsel-Leads", source: "Wechsel" },
  {
    name: process.env.AIRTABLE_TABLE_NEUGESCHAEFT ?? "PKV-Neugeschäft-Leads",
    source: "Neugeschäft",
  },
];

const BUYERS_TABLE = process.env.AIRTABLE_TABLE_BUYERS ?? "Buyer";
const BUYER_NAME_FIELDS = ["Name", "Buyer", "Firma", "Company"];
const FINANZEN_TABLE = process.env.AIRTABLE_TABLE_FINANZEN ?? "Finanzen";

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  märz: 3,
  maerz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

// Parst Spaltennamen wie "Kosten Mai 25" oder "Kosten Mai 2025"
// und liefert Jahr/Monat zurück.
function parseKostenColumn(name: string): { year: number; month: number } | null {
  const match = /^Kosten\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{2,4})$/.exec(name.trim());
  if (!match) return null;
  const month = GERMAN_MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  let year = Number.parseInt(match[2], 10);
  if (year < 100) year += 2000;
  return { year, month };
}

function getEnv() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) {
    throw new Error(
      "AIRTABLE_TOKEN und AIRTABLE_BASE_ID müssen gesetzt sein.",
    );
  }
  return { token, baseId };
}

async function fetchAllRecords(tableName: string): Promise<AirtableRecord[]> {
  const { token, baseId } = getEnv();
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  const url = new URL(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
  );
  url.searchParams.set("pageSize", "100");

  do {
    if (offset) {
      url.searchParams.set("offset", offset);
    } else {
      url.searchParams.delete("offset");
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Airtable-API ${res.status} für Tabelle "${tableName}": ${body}`,
      );
    }
    const json = (await res.json()) as AirtableListResponse;
    records.push(...json.records);
    offset = json.offset;
  } while (offset);

  return records;
}

function readString(fields: Record<string, unknown>, key: string): string | null {
  const v = fields[key];
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return null;
}

function readLinkedIds(fields: Record<string, unknown>, key: string): string[] {
  const v = fields[key];
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is string => typeof x === "string" && x.startsWith("rec"),
  );
}

async function fetchBuyersById(
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  let records: AirtableRecord[];
  try {
    records = await fetchAllRecords(BUYERS_TABLE);
  } catch (err) {
    throw new Error(
      `Buyer-Tabelle "${BUYERS_TABLE}" konnte nicht gelesen werden. ` +
        `Setze ggf. AIRTABLE_TABLE_BUYERS auf den richtigen Tabellennamen. ` +
        `Original: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  for (const rec of records) {
    let name: string | null = null;
    for (const candidate of BUYER_NAME_FIELDS) {
      name = readString(rec.fields, candidate);
      if (name) break;
    }
    if (!name) {
      // Fallback: erstes String-Feld nehmen
      for (const value of Object.values(rec.fields)) {
        if (typeof value === "string" && value.trim().length > 0) {
          name = value.trim();
          break;
        }
      }
    }
    if (name) {
      map.set(rec.id, name);
    }
  }

  return map;
}

function readNumber(fields: Record<string, unknown>, key: string): number {
  const v = fields[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function readDate(fields: Record<string, unknown>, key: string): Date | null {
  const v = fields[key];
  if (typeof v !== "string" || v.length === 0) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readChecked(fields: Record<string, unknown>, key: string): boolean {
  return fields[key] === true;
}

// Versucht den Lead-Namen aus mehreren möglichen Airtable-Spalten zu lesen,
// in der Reihenfolge wahrscheinlichster Treffer. Wenn "Vorname" + "Nachname"
// getrennt vorhanden sind, werden sie zusammengesetzt.
function resolveLeadName(fields: Record<string, unknown>): string | null {
  const direct = ["Name", "Lead", "Kontakt", "Kontaktname", "Lead-Name"];
  for (const key of direct) {
    const v = readString(fields, key);
    if (v) return v;
  }
  const vorname = readString(fields, "Vorname");
  const nachname = readString(fields, "Nachname");
  if (vorname && nachname) return `${vorname} ${nachname}`;
  if (vorname) return vorname;
  if (nachname) return nachname;
  return null;
}

export type NewSale = {
  buyer: string;
  product: string;
  amount: number;
  airtableId: string;
};

export type SyncResult = {
  tables: { name: string; source: string; records: number }[];
  customers: number;
  leads: number;
  revenues: number;
  costs: number;
  newSales: NewSale[];
  errors: string[];
};

export async function syncAirtable(): Promise<SyncResult> {
  const result: SyncResult = {
    tables: [],
    customers: 0,
    leads: 0,
    revenues: 0,
    costs: 0,
    newSales: [],
    errors: [],
  };

  const customerCache = new Map<string, string>();

  async function getCustomerId(name: string): Promise<string> {
    const key = name.trim();
    const cached = customerCache.get(key);
    if (cached) return cached;
    const customer = await prisma.customer.upsert({
      where: { name: key },
      create: { name: key },
      update: {},
      select: { id: true },
    });
    customerCache.set(key, customer.id);
    return customer.id;
  }

  // 1. Alle Lead-Tabellen einlesen
  const tableRecords = new Map<string, AirtableRecord[]>();
  for (const table of TABLES) {
    try {
      const records = await fetchAllRecords(table.name);
      tableRecords.set(table.name, records);
      result.tables.push({
        name: table.name,
        source: table.source,
        records: records.length,
      });
    } catch (err) {
      result.errors.push(
        `Tabelle "${table.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2. Alle referenzierten Buyer-IDs sammeln und gegen Buyer-Tabelle auflösen
  const buyerIds = new Set<string>();
  for (const records of tableRecords.values()) {
    for (const rec of records) {
      for (const id of readLinkedIds(rec.fields, "Buyer")) {
        buyerIds.add(id);
      }
    }
  }
  let buyerMap = new Map<string, string>();
  if (buyerIds.size > 0) {
    try {
      buyerMap = await fetchBuyersById([...buyerIds]);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  function resolveBuyer(fields: Record<string, unknown>): string | null {
    // Fall 1: Buyer ist Linked Record → IDs zu Namen auflösen
    const ids = readLinkedIds(fields, "Buyer");
    if (ids.length > 0) {
      const names = ids.map((id) => buyerMap.get(id)).filter((n): n is string => !!n);
      if (names.length > 0) return names.join(", ");
    }
    // Fall 2: Buyer ist Single-Line-Text
    return readString(fields, "Buyer");
  }

  // 3. Records verarbeiten
  for (const table of TABLES) {
    const records = tableRecords.get(table.name);
    if (!records) continue;

    for (const rec of records) {
      try {
        const buyer = resolveBuyer(rec.fields);
        if (!buyer) continue; // ohne Buyer kein Customer

        const createdAt =
          readDate(rec.fields, "Datum") ?? new Date(rec.createdTime);
        const firstContactAt = readDate(rec.fields, "Erster Kontaktversuch");
        const status = readString(rec.fields, "Bearbeitungsstatus");
        const contactAttempts = Math.max(
          0,
          Math.round(readNumber(rec.fields, "Kontaktversuche")),
        );
        const price = readNumber(rec.fields, "Preis");
        const billed = readChecked(rec.fields, "Abgerechnet");
        const name = resolveLeadName(rec.fields);

        const reached = status ? REACHED_STATUSES.has(status) : false;
        const isClosed = status === CLOSED_STATUS;
        const closedAt = isClosed ? createdAt : null;

        const customerId = await getCustomerId(buyer);

        const lead = await prisma.lead.upsert({
          where: { airtableId: rec.id },
          create: {
            airtableId: rec.id,
            source: table.source,
            customerId,
            name,
            createdAt,
            firstContactAt,
            closedAt,
            reached,
            contactAttempts,
            status,
          },
          update: {
            source: table.source,
            customerId,
            name,
            createdAt,
            firstContactAt,
            closedAt,
            reached,
            contactAttempts,
            status,
          },
        });

        if (price > 0) {
          // Lead-Umsatz: pro Lead höchstens eine Revenue-Zeile (idempotent).
          const existing = await prisma.revenue.findFirst({
            where: { leadId: lead.id },
            select: { id: true },
          });
          if (existing) {
            await prisma.revenue.update({
              where: { id: existing.id },
              data: {
                amount: price,
                occurredAt: createdAt,
                customerId,
              },
            });
          } else {
            await prisma.revenue.create({
              data: {
                amount: price,
                occurredAt: createdAt,
                customerId,
                leadId: lead.id,
              },
            });
            // Erst-Insert eines Verkaufs → Push-Trigger merken.
            result.newSales.push({
              buyer,
              product: table.source,
              amount: price,
              airtableId: rec.id,
            });
          }
          result.revenues += 1;
        }

        result.leads += 1;
        // billed-Flag derzeit nicht gesondert gespeichert; Umsatz wird laut
        // Vereinbarung bereits bei Lead-Übergabe gezählt.
        void billed;
      } catch (err) {
        result.errors.push(
          `Record ${rec.id} (${table.name}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // 4. Finanzen-Tabelle (weitere Kosten / Overhead) einlesen.
  try {
    const finanzenRecords = await fetchAllRecords(FINANZEN_TABLE);
    result.tables.push({
      name: FINANZEN_TABLE,
      source: "Finanzen",
      records: finanzenRecords.length,
    });

    // Komplette Neuauffüllung: alte OTHER-Kosten löschen, dann frisch einfügen.
    await prisma.cost.deleteMany({ where: { kind: "OTHER" } });

    for (const rec of finanzenRecords) {
      const vendor = readString(rec.fields, "Name") ?? "Unbekannt";
      for (const [field, raw] of Object.entries(rec.fields)) {
        const parsed = parseKostenColumn(field);
        if (!parsed) continue;
        const amount =
          typeof raw === "number" ? raw : Number.parseFloat(String(raw));
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const occurredAt = new Date(
          Date.UTC(parsed.year, parsed.month - 1, 1, 12),
        );
        await prisma.cost.create({
          data: {
            kind: "OTHER",
            amount,
            occurredAt,
            note: `${vendor} (${field})`,
          },
        });
        result.costs += 1;
      }
    }
  } catch (err) {
    result.errors.push(
      `Tabelle "${FINANZEN_TABLE}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 5. Verwaiste Kunden aus früheren (fehlerhaften) Syncs aufräumen.
  // Ein Customer ohne Leads, Umsätze und Kosten ist sicher entfernbar.
  await prisma.customer.deleteMany({
    where: {
      leads: { none: {} },
      revenues: { none: {} },
      costs: { none: {} },
    },
  });

  result.customers = customerCache.size;
  return result;
}
