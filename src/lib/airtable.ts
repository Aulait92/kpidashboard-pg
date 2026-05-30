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
  // Kinderwunsch nur einlesen, wenn die Tabelle konfiguriert ist — sonst
  // würde jeder Sync einen Fehler für eine nicht existierende Tabelle melden.
  ...(process.env.AIRTABLE_TABLE_KINDERWUNSCH
    ? [
        {
          name: process.env.AIRTABLE_TABLE_KINDERWUNSCH,
          source: "Kinderwunsch",
        },
      ]
    : []),
];

const BUYERS_TABLE = process.env.AIRTABLE_TABLE_BUYERS ?? "Buyer";
const BUYER_NAME_FIELDS = ["Name", "Buyer", "Firma", "Company"];
// Monatliche Lead-Ziele pro Produkt auf dem Buyer-Datensatz. Mehrere
// Schreibweisen werden akzeptiert (Reihenfolge = Priorität).
const BUYER_GOAL_WECHSEL_FIELDS = [
  "PKV-Wechsel Leadziel pro Monat",
  "PKV-Wechsel Leadziel/Monat",
  "Wechsel Leadziel pro Monat",
];
const BUYER_GOAL_NEUGESCHAEFT_FIELDS = [
  "PKV-Neugeschäft Leadziel pro Monat",
  "PKV-Neugeschaeft Leadziel pro Monat",
  "PKV-Neugeschäft Leadziel/Monat",
  "Neugeschäft Leadziel pro Monat",
];
const BUYER_GOAL_KINDERWUNSCH_FIELDS = [
  "Kinderwunsch Leadziel pro Monat",
  "Kinderwunsch Leadziel/Monat",
  "KiWu Leadziel pro Monat",
];
// Preis pro Lead je Produkt (für das automatische Umsatzziel).
const BUYER_PRICE_WECHSEL_FIELDS = [
  "Preis pro Lead (PKV-Wechsel)",
  "Preis pro Lead (Wechsel)",
];
const BUYER_PRICE_NEUGESCHAEFT_FIELDS = [
  "Preis pro Lead (PKV-Neugeschäft)",
  "Preis pro Lead (PKV-Neugeschaeft)",
  "Preis pro Lead (Neugeschäft)",
];
const BUYER_PRICE_KINDERWUNSCH_FIELDS = [
  "Preis pro Lead (Kinderwunschl)",
  "Preis pro Lead (Kinderwunsch)",
  "Preis pro Lead (KiWu)",
];
// Region des Kunden (für die Kinderwunsch-Regions-Pools).
const BUYER_REGION_FIELDS = ["Region", "Standort", "Stadt", "Markt"];
// Startdatum je Sparte. Für anteilige Berechnung des Monatsziels bei
// Mid-Month-Onboarding (analog zum Airtable-Feld „Effektives Leadziel").
const BUYER_START_WECHSEL_FIELDS = [
  "Startdatum PKV-Wechsel",
  "Startdatum Wechsel",
  "Start PKV-Wechsel",
];
const BUYER_START_NEUGESCHAEFT_FIELDS = [
  "Startdatum PKV-Neugeschäft",
  "Startdatum PKV-Neugeschaeft",
  "Startdatum Neugeschäft",
  "Start PKV-Neugeschäft",
];
const BUYER_START_KINDERWUNSCH_FIELDS = [
  "Startdatum Kinderwunsch",
  "Start Kinderwunsch",
  "Startdatum KiWu",
];
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

type BuyerInfo = {
  name: string;
  goalWechsel: number | null;
  goalNeugeschaeft: number | null;
  goalKinderwunsch: number | null;
  priceWechsel: number | null;
  priceNeugeschaeft: number | null;
  priceKinderwunsch: number | null;
  region: string | null;
  startWechsel: Date | null;
  startNeugeschaeft: Date | null;
  startKinderwunsch: Date | null;
};

// Liest ein Datum aus dem erstbesten der angegebenen Felder. Airtable liefert
// Datum als ISO-String ("YYYY-MM-DD") oder ISO-Datetime.
function readDateFromFields(
  fields: Record<string, unknown>,
  keys: string[],
): Date | null {
  for (const key of keys) {
    const v = fields[key];
    if (typeof v !== "string" || v.trim() === "") continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

async function fetchBuyers(): Promise<Map<string, BuyerInfo>> {
  const map = new Map<string, BuyerInfo>();

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
      let region: string | null = null;
      for (const key of BUYER_REGION_FIELDS) {
        region = readString(rec.fields, key);
        if (region) break;
      }
      map.set(rec.id, {
        name,
        goalWechsel: readIntFromFields(rec.fields, BUYER_GOAL_WECHSEL_FIELDS),
        goalNeugeschaeft: readIntFromFields(
          rec.fields,
          BUYER_GOAL_NEUGESCHAEFT_FIELDS,
        ),
        goalKinderwunsch: readIntFromFields(
          rec.fields,
          BUYER_GOAL_KINDERWUNSCH_FIELDS,
        ),
        priceWechsel: readFloatFromFields(rec.fields, BUYER_PRICE_WECHSEL_FIELDS),
        priceNeugeschaeft: readFloatFromFields(
          rec.fields,
          BUYER_PRICE_NEUGESCHAEFT_FIELDS,
        ),
        priceKinderwunsch: readFloatFromFields(
          rec.fields,
          BUYER_PRICE_KINDERWUNSCH_FIELDS,
        ),
        region,
        startWechsel: readDateFromFields(rec.fields, BUYER_START_WECHSEL_FIELDS),
        startNeugeschaeft: readDateFromFields(
          rec.fields,
          BUYER_START_NEUGESCHAEFT_FIELDS,
        ),
        startKinderwunsch: readDateFromFields(
          rec.fields,
          BUYER_START_KINDERWUNSCH_FIELDS,
        ),
      });
    }
  }

  return map;
}

// Liest eine ganze Zahl ≥ 0 aus dem erstbesten der angegebenen Felder.
// null wenn keines gesetzt/parsbar ist.
function readIntFromFields(
  fields: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const v = fields[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number.parseInt(v.trim(), 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

// Liest eine Dezimalzahl ≥ 0 aus dem erstbesten der angegebenen Felder.
function readFloatFromFields(
  fields: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const v = fields[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number.parseFloat(v.trim().replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
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

export type NewLead = {
  buyer: string;
  customerId: string;
  product: string;
  name: string | null;
  airtableId: string;
};

export type SyncResult = {
  tables: { name: string; source: string; records: number }[];
  customers: number;
  leads: number;
  revenues: number;
  costs: number;
  deletedLeads: number;
  newSales: NewSale[];
  newLeads: NewLead[];
  errors: string[];
};

export async function syncAirtable(): Promise<SyncResult> {
  const result: SyncResult = {
    tables: [],
    customers: 0,
    leads: 0,
    revenues: 0,
    costs: 0,
    deletedLeads: 0,
    newSales: [],
    newLeads: [],
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

  // 2. Buyer/Kunden-Tabelle IMMER fetchen — die enthält Lead-Ziele, Preise und
  // Region, die unabhängig von Lead-Records auf den Customer übertragen
  // werden müssen (sonst weiß der Media Buyer nichts von Zielen, wenn keine
  // Leads vorhanden sind).
  let buyerMap = new Map<string, BuyerInfo>();
  try {
    buyerMap = await fetchBuyers();
    console.log(
      `[airtable] Kunden-Tabelle "${BUYERS_TABLE}": ${buyerMap.size} Datensätze gelesen.`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[airtable] Kunden-Tabelle nicht lesbar: ${msg}`);
    result.errors.push(msg);
  }

  function resolveBuyer(fields: Record<string, unknown>): string | null {
    // Fall 1: Buyer ist Linked Record → IDs zu Namen auflösen
    const ids = readLinkedIds(fields, "Buyer");
    if (ids.length > 0) {
      const names = ids
        .map((id) => buyerMap.get(id)?.name)
        .filter((n): n is string => !!n);
      if (names.length > 0) return names.join(", ");
    }
    // Fall 2: Buyer ist Single-Line-Text
    return readString(fields, "Buyer");
  }

  // Lead-Ziele und Region aus der Buyer-Tabelle auf den Customer übernehmen.
  // Steuer-Einstellungen liegen am DeliveryPool, nicht am Kunden.
  for (const info of buyerMap.values()) {
    const key = info.name.trim();
    if (!key) continue;
    const hasData =
      info.goalWechsel != null ||
      info.goalNeugeschaeft != null ||
      info.goalKinderwunsch != null ||
      info.priceWechsel != null ||
      info.priceNeugeschaeft != null ||
      info.priceKinderwunsch != null ||
      info.region != null ||
      info.startWechsel != null ||
      info.startNeugeschaeft != null ||
      info.startKinderwunsch != null;
    if (!hasData) continue;
    const data = {
      leadGoalWechsel: info.goalWechsel,
      leadGoalNeugeschaeft: info.goalNeugeschaeft,
      leadGoalKinderwunsch: info.goalKinderwunsch,
      leadPriceWechsel: info.priceWechsel,
      leadPriceNeugeschaeft: info.priceNeugeschaeft,
      leadPriceKinderwunsch: info.priceKinderwunsch,
      region: info.region,
      startWechsel: info.startWechsel,
      startNeugeschaeft: info.startNeugeschaeft,
      startKinderwunsch: info.startKinderwunsch,
    };
    const customer = await prisma.customer.upsert({
      where: { name: key },
      create: { name: key, ...data },
      update: data,
      select: { id: true },
    });
    customerCache.set(key, customer.id);
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

        // Vor dem Upsert prüfen, ob der Lead schon existiert — nur dann
        // weiß die Sync-Pipeline, dass der Lead neu ist und einen Push
        // auslösen muss.
        const existingLead = await prisma.lead.findUnique({
          where: { airtableId: rec.id },
          select: { id: true },
        });
        const isNewLead = !existingLead;

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
        if (isNewLead) {
          result.newLeads.push({
            buyer,
            customerId,
            product: table.source,
            name,
            airtableId: rec.id,
          });
        }
        // billed-Flag derzeit nicht gesondert gespeichert; Umsatz wird laut
        // Vereinbarung bereits bei Lead-Übergabe gezählt.
        void billed;
      } catch (err) {
        result.errors.push(
          `Record ${rec.id} (${table.name}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Sweep: Leads, die in Airtable gelöscht wurden, auch lokal entfernen.
    // Sicher: ein gescheiterter Fetch hat records=undefined → schon oben per
    // `continue` ausgeschlossen. Hier ist records also garantiert das echte
    // Ergebnis (auch leeres Array = legitime leere Tabelle, dann löschen wir
    // alle alten Leads dieser source).
    const seenIds = records.map((r) => r.id);
    const stale = await prisma.lead.findMany({
      where: {
        source: table.source,
        airtableId: { not: null, notIn: seenIds },
      },
      select: { id: true },
    });
    let staleCount = 0;
    if (stale.length > 0) {
      const staleIds = stale.map((s) => s.id);
      // Zugehörige Umsätze zuerst löschen — sonst bleiben sie als verwaiste
      // Revenue-Zeilen mit leadId=null und verfälschen die Umsatzsumme.
      await prisma.revenue.deleteMany({ where: { leadId: { in: staleIds } } });
      await prisma.lead.deleteMany({ where: { id: { in: staleIds } } });
      staleCount = stale.length;
      result.deletedLeads += stale.length;
    }
    console.log(
      `[airtable] ${table.source}: seen=${records.length}, deleted=${staleCount}`,
    );
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
  // Ein Customer ohne Leads, Umsätze, Kosten UND ohne Buyer-Daten
  // (Lead-Ziele, Preise, Region) ist sicher entfernbar. Kunden mit
  // Lead-Zielen oder anderen Buyer-Daten dürfen NICHT gelöscht werden, auch
  // wenn (noch) keine Leads existieren — sonst wischt der Sync legitime
  // Buyer-Datensätze direkt nach dem Upsert wieder weg.
  await prisma.customer.deleteMany({
    where: {
      leads: { none: {} },
      revenues: { none: {} },
      costs: { none: {} },
      leadGoalWechsel: null,
      leadGoalNeugeschaeft: null,
      leadGoalKinderwunsch: null,
      leadPriceWechsel: null,
      leadPriceNeugeschaeft: null,
      leadPriceKinderwunsch: null,
      region: null,
      startWechsel: null,
      startNeugeschaeft: null,
      startKinderwunsch: null,
    },
  });

  result.customers = customerCache.size;
  return result;
}
