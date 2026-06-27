import { prisma } from "@/lib/prisma";
import { canonicalProductKey } from "@/lib/products";

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

// Werbekanal-Klassifizierung. Airtable-Spalte „Source" enthält freien
// Single-Select-Text — wir normalisieren auf zwei Buckets, die mit den
// Cost-Note-Präfixen aus meta.ts / outbrain.ts übereinstimmen.
function classifyChannel(raw: string | null): string | null {
  if (!raw) return null;
  const n = raw.toLowerCase();
  if (n.includes("tiktok") || n.includes("tik tok") || n.includes("tt"))
    return "TikTok";
  if (n.includes("meta") || n.includes("facebook") || n.includes("instagram") || n.includes("fb") || n.includes("ig"))
    return "Meta";
  if (n.includes("outbrain") || n.includes("amplify")) return "Outbrain";
  // „Google" zuletzt, damit „google" nicht „Google-Tag-Manager"/„GA"-Bezüge
  // versehentlich als Channel klassifiziert (Heuristik: explizites Wort).
  if (
    n.includes("google ads") ||
    n.includes("google-ads") ||
    n.includes("googleads") ||
    n.includes("g-ads") ||
    /\b(google|adwords|ggl)\b/.test(n)
  )
    return "Google";
  return null;
}
// Storno-Status werden vor dem Anruf ausgefiltert — sie zählen also NICHT
// als „erreicht" und NICHT in die Funnel-Raten. Mehrere Schreibweisen
// akzeptieren — Airtable-Single-Select-Werte variieren von Base zu Base
// („Storno", „Storniert", „storniert", …).
const CANCELLED_STATUSES = new Set(["storno", "storniert"]);
function isCancelledStatus(status: string | null): boolean {
  return status != null && CANCELLED_STATUSES.has(status.trim().toLowerCase());
}

// Konsolidierte Leads-Tabelle (löst die früheren per-Produkt-Tabellen
// PKV-Wechsel-Leads / PKV-Neugeschäft-Leads / Kinderwunsch ab). Pro Record
// liegt das Produkt als Lookup-Spalte aus der Kunden-Produkt-Bezug-
// Join-Tabelle vor — siehe classifyLeadProduct() unten.
const LEADS_TABLE = process.env.AIRTABLE_TABLE_LEADS ?? "Leads";

// Spalten-Kandidaten für das Produkt am Lead-Record, sortiert nach
// Bequemlichkeit:
//   1) Lookup-Felder, die DIREKT den Produkt-Klarnamen liefern (User-
//      seitig schon als "Zielgruppe Bezeichnung"-Lookup angelegt).
//   2) Lookup-/Linked-Record-Felder, die rec-IDs liefern — die wir
//      über die Produkte-Map zu Klarnamen auflösen müssen.
//   3) Direkte String-Felder als letzte Rückfalllinie.
const LEAD_PRODUCT_FIELDS = [
  "Zielgruppe Bezeichnung (from Produkt (Eingang))",
  "Zielgruppe Bezeichnung (from Produkt (from Kunden-Produkt-Bezug))",
  "slug (from Produkt (Eingang))",
  "Produkt (from Kunden-Produkt-Bezug)",
  "Produkt (Eingang)",
  "Produkt",
];

// Spalten-Kandidaten für den Kunden am Lead. Linked-Record-Varianten („Buyer"
// oder „Kunde") werden über buyerMap zu Namen aufgelöst; Lookup-Varianten
// liefern den Namen direkt als String.
const LEAD_BUYER_LINKED_FIELDS = ["Buyer", "Kunde"];
const LEAD_BUYER_LOOKUP_FIELDS = [
  "Kunde (from Kunden-Produkt-Bezug)",
  "Buyer (from Kunden-Produkt-Bezug)",
  // Primary-Feld der Bezug-Tabelle ist formatiert als "Kunde – Produkt"
  // (z. B. "Sascha Hopp – PKV-Tarifoptimierung"). Wir extrahieren den
  // Kunden-Teil als Fallback, wenn keine rec-ID-Auflösung gelingt.
  "Bezug (from Kunden-Produkt-Bezug)",
];

// Klassifiziert das Produkt eines Lead-Records anhand der Lookup- bzw.
// Single-Select-Spalte. Akzeptiert sowohl rohe Strings ("PKV-Wechsel") als
// auch Lookup-Arrays (["PKV-Wechsel"]). Liefert den kanonischen Produkt-Key
// (canonicalProductKey): die drei Legacy-Sparten behalten ihre Keys, jedes
// andere Produkt (Sterbegeld, …) behält seinen echten Namen → so wird der
// Lead auch ohne Code-Änderung dem richtigen Pool zugeordnet. null = es ließ
// sich GAR kein Produkt-String auflösen (Lookup leer / nur unaufgelöste
// rec-IDs) → der Lead wird übersprungen.
function classifyLeadProduct(
  fields: Record<string, unknown>,
  produkteMap: Map<string, ProductRef>,
): string | null {
  for (const key of LEAD_PRODUCT_FIELDS) {
    const v = fields[key];
    if (v == null) continue;
    // Wert kann String, Array<string>, oder Array<rec-id> sein.
    const items = Array.isArray(v)
      ? v
      : typeof v === "string"
        ? [v]
        : [];
    for (const item of items) {
      if (typeof item !== "string") continue;
      const raw =
        item.startsWith("rec") && produkteMap.has(item)
          ? produkteMap.get(item)!.name
          : item.startsWith("rec")
            ? null // unaufgelöste rec-ID → keine Klarheit
            : item;
      if (!raw || !raw.trim()) continue;
      return canonicalProductKey(raw);
    }
  }
  return null;
}

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
// Join-Tabelle, die Lead-Ziele/Preise/Startdaten pro (Kunde × Produkt) hält.
// Eine Zeile pro Bezug; Spalten: „Kunde" (Linked), „Produkt" (Single-Select:
// PKV-Wechsel / PKV-Neugeschäft / Kinderwunsch), „Leadziel" (Number),
// „Preis netto" (Currency), „Startdatum" (Date).
const BEZUG_TABLE =
  process.env.AIRTABLE_TABLE_KUNDEN_PRODUKT_BEZUG ?? "Kunden-Produkt-Bezug";

// Produkte-Stammtabelle. Wird benötigt, um die rec-IDs zu Klarnamen
// aufzulösen, die im Lookup-/Linked-Record-Verkehr auftauchen
// (Lead.Produkt, Bezug.Produkt → ["recXYZ"] statt ["PKV-Tarifoptimierung"]).
const PRODUKTE_TABLE = process.env.AIRTABLE_TABLE_PRODUKTE ?? "Produkte";

// Lädt die Produkte-Tabelle und gibt eine Map rec-ID → Produkt-Ref zurück.
// Spiegelt zusätzlich JEDES Produkt in die neue Product-Tabelle, sodass
// auf Phase-B-Pfade (CustomerProduct-basiertes Pool-Routing) zugegriffen
// werden kann ohne Code-Änderung pro neues Produkt.
//
// Bei nicht vorhandener Tabelle / fehlenden Permissions still mit leerer
// Map zurück — der Lead-Sync hat dann zusätzliche Lookup-Fallbacks
// (z. B. "Zielgruppe Bezeichnung (from Produkt …)").
type ProductRef = { name: string; dbId: string; poolKind: "product" | "region" };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchProdukte(): Promise<Map<string, ProductRef>> {
  const map = new Map<string, ProductRef>();
  let records: AirtableRecord[] = [];
  try {
    records = await fetchAllRecords(PRODUKTE_TABLE);
  } catch (err) {
    console.warn(
      `[airtable] Produkte-Tabelle "${PRODUKTE_TABLE}" nicht lesbar:`,
      err instanceof Error ? err.message : String(err),
    );
    return map;
  }
  for (const rec of records) {
    const name =
      readString(rec.fields, "Zielgruppe Bezeichnung") ??
      readString(rec.fields, "Name") ??
      readString(rec.fields, "Bezeichnung") ??
      readString(rec.fields, "Produkt") ??
      readString(rec.fields, "Slug");
    if (!name) continue;
    // Kinderwunsch ist regional gesteuert (Pool pro Region/Stadt), alle
    // anderen Produkte landen jeweils in einem Pool pro Produkt.
    const poolKind: "product" | "region" = name
      .toLowerCase()
      .includes("kinderwunsch")
      ? "region"
      : "product";
    const slug =
      readString(rec.fields, "Slug")?.toLowerCase().replace(/\s+/g, "-") ??
      slugify(name);
    try {
      const dbProduct = await prisma.product.upsert({
        where: { airtableId: rec.id },
        create: {
          airtableId: rec.id,
          name,
          slug,
          poolKind,
          active: true,
        },
        update: { name, slug, poolKind, active: true },
        select: { id: true },
      });
      map.set(rec.id, { name, dbId: dbProduct.id, poolKind });
    } catch (err) {
      console.warn(
        `[airtable] Product-Upsert für "${name}" (${rec.id}) fehlgeschlagen:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return map;
}

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

type ProductGoals = {
  goalWechsel: number | null;
  goalNeugeschaeft: number | null;
  goalKinderwunsch: number | null;
  priceWechsel: number | null;
  priceNeugeschaeft: number | null;
  priceKinderwunsch: number | null;
  startWechsel: Date | null;
  startNeugeschaeft: Date | null;
  startKinderwunsch: Date | null;
};

function emptyGoals(): ProductGoals {
  return {
    goalWechsel: null,
    goalNeugeschaeft: null,
    goalKinderwunsch: null,
    priceWechsel: null,
    priceNeugeschaeft: null,
    priceKinderwunsch: null,
    startWechsel: null,
    startNeugeschaeft: null,
    startKinderwunsch: null,
  };
}

// Rohzeile aus der Bezug-Tabelle für Phase-B-Tabelle CustomerProduct.
// Wird nach dem Customer-Upsert in syncAirtable verwendet, um pro (Kunde ×
// Produkt) eine Zeile in CustomerProduct zu schreiben — produkt-agnostisch.
type BezugRow = {
  buyerAirtableId: string;
  productDbId: string;
  leadGoal: number | null;
  leadPrice: number | null;
  startDate: Date | null;
  region: string | null;
};

type BezugResult = {
  goals: Map<string, ProductGoals>;
  rows: BezugRow[];
};

// Liest die Join-Tabelle „Kunden-Produkt-Bezug" und liefert pro Kunden-Record
// (Buyer-AirtableId) die Lead-Ziele, Preise und Startdaten je Produkt.
// Falls die Tabelle leer ist oder nicht existiert, fallen wir im Sync still auf
// die alten per-Produkt-Spalten der Buyer-Tabelle zurück.
async function fetchKundenProduktBezug(
  produkteMap: Map<string, ProductRef>,
): Promise<BezugResult> {
  const map = new Map<string, ProductGoals>();
  const rows: BezugRow[] = [];
  const records = await fetchAllRecords(BEZUG_TABLE);
  for (const rec of records) {
    const ids = readLinkedIds(rec.fields, "Kunde");
    if (ids.length === 0) continue;
    // Produkt-Feld ist als Linked-Record konfiguriert → liefert rec-IDs.
    // Erst rec-ID via Produkte-Map auflösen, dann String-Fallback. Wenn die
    // Map leer oder die rec-ID unbekannt ist, parsen wir aus dem
    // formatierten Primary-Feld "Bezug" ("Kunde – Produkt") den Produkt-Teil.
    let produkt: string | null = null;
    let produktDbId: string | null = null;
    const produktRaw = rec.fields["Produkt"];
    if (Array.isArray(produktRaw)) {
      for (const item of produktRaw) {
        if (typeof item !== "string") continue;
        if (item.startsWith("rec")) {
          const resolved = produkteMap.get(item);
          if (resolved) {
            produkt = resolved.name;
            produktDbId = resolved.dbId;
            break;
          }
        } else if (item.trim()) {
          produkt = item.trim();
          break;
        }
      }
    } else if (typeof produktRaw === "string" && produktRaw.trim()) {
      produkt = produktRaw.trim();
    }
    if (!produkt) {
      const bezugStr = readString(rec.fields, "Bezug");
      if (bezugStr) {
        const parts = bezugStr.split(" – ");
        if (parts.length >= 2) produkt = parts.slice(1).join(" – ").trim();
      }
    }
    if (!produkt) continue;

    const leadziel = readIntFromFields(rec.fields, ["Leadziel"]);
    const preis = readFloatFromFields(rec.fields, ["Preis netto"]);
    const startdatum = readDateFromFields(rec.fields, ["Startdatum"]);
    const region = readString(rec.fields, "Region");

    // Phase-B-Write: produkt-agnostische CustomerProduct-Zeile. Setzt voraus,
    // dass der Bezug eine rec-ID auf ein Produkt aus der Produkte-Tabelle hat
    // (sonst kein dbId und damit keine FK). Tarifoptimierungs-/etc.-Bezüge,
    // bei denen das Produkt nur als Freitext im Primary-Feld auftaucht,
    // landen NICHT in CustomerProduct — sie bleiben im Legacy-Pfad.
    if (produktDbId) {
      for (const id of ids) {
        rows.push({
          buyerAirtableId: id,
          productDbId: produktDbId,
          leadGoal: leadziel,
          leadPrice: preis,
          startDate: startdatum,
          region,
        });
      }
    }

    // Legacy-Pfad: Bezüge auf eine der drei bekannten Sparten in die
    // ProductGoals-Buckets schreiben, damit die alten Customer-Spalten
    // (leadGoalWechsel etc.) weiter befüllt werden und Display/Pool-Derivation
    // unverändert funktionieren.
    const p = produkt.toLowerCase();
    let productKey: "Wechsel" | "Neugeschaeft" | "Kinderwunsch" | null = null;
    // Tarifoptimierungs-Bezüge laufen in den Wechsel-Pool (Alias) — siehe
    // classifyLeadProduct(), beide Listen müssen synchron bleiben.
    if (p.includes("wechsel") || p.includes("tarifoptim") || p.includes("tarif-optim"))
      productKey = "Wechsel";
    else if (p.includes("neugesch")) productKey = "Neugeschaeft";
    else if (p.includes("kinderwunsch")) productKey = "Kinderwunsch";
    if (!productKey) continue;

    for (const id of ids) {
      const entry = map.get(id) ?? emptyGoals();
      if (productKey === "Wechsel") {
        if (leadziel != null) entry.goalWechsel = leadziel;
        if (preis != null) entry.priceWechsel = preis;
        if (startdatum != null) entry.startWechsel = startdatum;
      } else if (productKey === "Neugeschaeft") {
        if (leadziel != null) entry.goalNeugeschaeft = leadziel;
        if (preis != null) entry.priceNeugeschaeft = preis;
        if (startdatum != null) entry.startNeugeschaeft = startdatum;
      } else {
        if (leadziel != null) entry.goalKinderwunsch = leadziel;
        if (preis != null) entry.priceKinderwunsch = preis;
        if (startdatum != null) entry.startKinderwunsch = startdatum;
      }
      map.set(id, entry);
    }
  }
  return { goals: map, rows };
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

// Storno-Transition: ein Lead, der NICHT storniert war und jetzt
// storniert ist. Wird vom Sync detektiert (für Stornos aus externen
// Airtable-Änderungen). Dashboard-getriebene Stornos kommen NICHT hier
// rein, weil dort der DB-Status bereits beim Storno-Click auf Storno
// gesetzt wird und der Vergleich beim nächsten Sync deshalb keinen
// Übergang mehr sieht. Die Push-Notification für jene Stornos läuft
// direkt aus cancelLeadAction (siehe app/buyer/actions.ts).
export type NewStorno = {
  buyer: string;
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
  newStornos: NewStorno[];
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
    newStornos: [],
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

  // 1. Konsolidierte Leads-Tabelle einlesen. Pro Record ergibt sich das
  //    Produkt (Wechsel / Neugeschäft / Kinderwunsch) aus dem Lookup auf die
  //    Kunden-Produkt-Bezug-Zeile — siehe classifyLeadProduct().
  let leadRecords: AirtableRecord[] = [];
  let leadsFetched = false;
  try {
    leadRecords = await fetchAllRecords(LEADS_TABLE);
    leadsFetched = true;
    result.tables.push({
      name: LEADS_TABLE,
      source: "Leads",
      records: leadRecords.length,
    });
  } catch (err) {
    result.errors.push(
      `Tabelle "${LEADS_TABLE}": ${err instanceof Error ? err.message : String(err)}`,
    );
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

  // Produkte-Stammtabelle vorab laden — daraus bauen wir rec-ID → Name,
  // damit Linked-Record-Verweise auf "Produkt" in Lead- und Bezug-Records
  // zu Klartext aufgelöst werden können.
  const produkteMap = await fetchProdukte();
  if (produkteMap.size > 0) {
    console.log(
      `[airtable] Produkte-Tabelle "${PRODUKTE_TABLE}": ${produkteMap.size} Produkte geladen.`,
    );
  }

  // Join-Tabelle „Kunden-Produkt-Bezug" lesen — sie löst die früheren
  // per-Produkt-Spalten auf der Kunden-Tabelle ab. Bei Fehler (Tabelle fehlt
  // o.ä.) fallen wir still auf die Buyer-Felder zurück.
  let bezugMap = new Map<string, ProductGoals>();
  let bezugRows: BezugRow[] = [];
  try {
    const bezug = await fetchKundenProduktBezug(produkteMap);
    bezugMap = bezug.goals;
    bezugRows = bezug.rows;
    console.log(
      `[airtable] Kunden-Produkt-Bezug "${BEZUG_TABLE}": ${bezugMap.size} Kunden mit Produkt-Daten, ${bezugRows.length} CustomerProduct-Zeilen.`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[airtable] Kunden-Produkt-Bezug nicht lesbar: ${msg}`);
    result.errors.push(`Tabelle "${BEZUG_TABLE}": ${msg}`);
  }

  function resolveBuyer(fields: Record<string, unknown>): string | null {
    // 1) Linked-Record auf die Kunden-Tabelle ("Buyer" oder "Kunde") →
    //    rec-IDs über buyerMap zu Namen auflösen.
    for (const key of LEAD_BUYER_LINKED_FIELDS) {
      const ids = readLinkedIds(fields, key);
      if (ids.length === 0) continue;
      const names = ids
        .map((id) => buyerMap.get(id)?.name)
        .filter((n): n is string => !!n);
      if (names.length > 0) return names.join(", ");
    }
    // 2) Lookup-Felder: können je nach Airtable-Schema rec-IDs (wenn der
    //    Lookup auf ein Linked-Record-Feld zeigt, z. B. "Kunde (from Bezug)")
    //    ODER Klarnamen liefern (wenn der Lookup auf ein Single-Line-/
    //    Primary-Text-Feld zeigt). Beide Fälle abdecken.
    for (const key of LEAD_BUYER_LOOKUP_FIELDS) {
      const v = fields[key];
      if (!Array.isArray(v)) continue;
      for (const item of v) {
        if (typeof item !== "string" || item.trim() === "") continue;
        // 2a) rec-ID → Kunden-Tabelle nachschlagen.
        if (item.startsWith("rec")) {
          const name = buyerMap.get(item)?.name;
          if (name) return name;
          continue; // unaufgelöste rec-ID → nächster Kandidat
        }
        // 2b) Klarname. Bei "Kunde – Produkt"-Format (Bezug-Primary-Feld)
        //     nur den Kunden-Teil zurückgeben.
        const trimmed = item.trim();
        const dashIdx = trimmed.indexOf(" – ");
        return dashIdx > 0 ? trimmed.slice(0, dashIdx).trim() : trimmed;
      }
    }
    // 3) Fallback: direkter Single-Line-Text.
    return readString(fields, "Buyer") ?? readString(fields, "Kunde");
  }

  // Lead-Ziele und Region aus der Buyer-Tabelle (Region) + Join-Tabelle
  // „Kunden-Produkt-Bezug" (Ziele/Preise/Startdaten je Produkt) auf den
  // Customer übernehmen. Steuer-Einstellungen liegen am DeliveryPool, nicht
  // am Kunden.
  for (const [buyerRecId, info] of buyerMap.entries()) {
    const key = info.name.trim();
    if (!key) continue;
    const bezug = bezugMap.get(buyerRecId);
    // Join-Tabelle hat Vorrang; wenn dort kein Eintrag, fallen wir auf die
    // (alten) per-Produkt-Spalten am Buyer-Record zurück.
    const goalWechsel = bezug?.goalWechsel ?? info.goalWechsel;
    const goalNeugeschaeft = bezug?.goalNeugeschaeft ?? info.goalNeugeschaeft;
    const goalKinderwunsch = bezug?.goalKinderwunsch ?? info.goalKinderwunsch;
    const priceWechsel = bezug?.priceWechsel ?? info.priceWechsel;
    const priceNeugeschaeft =
      bezug?.priceNeugeschaeft ?? info.priceNeugeschaeft;
    const priceKinderwunsch =
      bezug?.priceKinderwunsch ?? info.priceKinderwunsch;
    const startWechsel = bezug?.startWechsel ?? info.startWechsel;
    const startNeugeschaeft =
      bezug?.startNeugeschaeft ?? info.startNeugeschaeft;
    const startKinderwunsch =
      bezug?.startKinderwunsch ?? info.startKinderwunsch;

    const hasData =
      goalWechsel != null ||
      goalNeugeschaeft != null ||
      goalKinderwunsch != null ||
      priceWechsel != null ||
      priceNeugeschaeft != null ||
      priceKinderwunsch != null ||
      info.region != null ||
      startWechsel != null ||
      startNeugeschaeft != null ||
      startKinderwunsch != null;
    if (!hasData) continue;
    const data = {
      leadGoalWechsel: goalWechsel,
      leadGoalNeugeschaeft: goalNeugeschaeft,
      leadGoalKinderwunsch: goalKinderwunsch,
      leadPriceWechsel: priceWechsel,
      leadPriceNeugeschaeft: priceNeugeschaeft,
      leadPriceKinderwunsch: priceKinderwunsch,
      region: info.region,
      startWechsel,
      startNeugeschaeft,
      startKinderwunsch,
    };
    const customer = await prisma.customer.upsert({
      where: { name: key },
      create: { name: key, ...data },
      update: data,
      select: { id: true },
    });
    customerCache.set(key, customer.id);
  }

  // Phase-B-Write: CustomerProduct-Zeilen aus dem Bezug-Sweep persistieren.
  // Setzt den oben gefüllten customerCache voraus (Buyer-Name → Customer-Id).
  // Falls ein Bezug auf eine Buyer-rec-ID zeigt, die wir nicht auflösen
  // können, wird die Zeile übersprungen (Legacy-Pfad fängt das auf).
  for (const row of bezugRows) {
    const buyerInfo = buyerMap.get(row.buyerAirtableId);
    if (!buyerInfo) continue;
    const customerId = customerCache.get(buyerInfo.name.trim());
    if (!customerId) continue;
    try {
      await prisma.customerProduct.upsert({
        where: {
          customerId_productId: {
            customerId,
            productId: row.productDbId,
          },
        },
        create: {
          customerId,
          productId: row.productDbId,
          leadGoal: row.leadGoal,
          leadPrice: row.leadPrice,
          startDate: row.startDate,
          region: row.region,
        },
        update: {
          leadGoal: row.leadGoal,
          leadPrice: row.leadPrice,
          startDate: row.startDate,
          region: row.region,
        },
      });
    } catch (err) {
      result.errors.push(
        `CustomerProduct ${customerId} × ${row.productDbId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3. Lead-Records verarbeiten — eine konsolidierte Tabelle, Produkt pro
  //    Record per Lookup auf die Bezug-Zeile.
  if (leadsFetched) {
    for (const rec of leadRecords) {
      try {
        const product = classifyLeadProduct(rec.fields, produkteMap);
        if (!product) {
          // Ohne Produkt-Lookup keine Pool-Zuordnung möglich → skip.
          result.errors.push(
            `Record ${rec.id}: Produkt nicht klassifizierbar (Lookup-Feld leer oder unbekannter Wert).`,
          );
          continue;
        }
        const buyer = resolveBuyer(rec.fields);
        if (!buyer) continue; // ohne Buyer kein Customer

        // rec-ID des verknüpften Kunden-Produkt-Bezug-Records (für Storno-
        // Optionen). Erst-Eintrag genügt — pro Lead gibt es genau einen Bezug.
        const bezugIds = readLinkedIds(rec.fields, "Kunden-Produkt-Bezug");
        const bezugAirtableId = bezugIds[0] ?? null;

        // Eingangsdatum eines Leads: bevorzugt "Zuweisungsdatum" (Zeitpunkt
        // der Lead-Zuweisung an den Kunden, das ist die fachlich relevante
        // Größe für CPL/Pacing/Pipeline-Filter), fällt zurück auf "Datum",
        // dann auf den Airtable-internen Record-CreateTime.
        const createdAt =
          readDate(rec.fields, "Zuweisungsdatum") ??
          readDate(rec.fields, "Datum") ??
          new Date(rec.createdTime);
        const firstContactAt = readDate(rec.fields, "Erster Kontaktversuch");
        const status = readString(rec.fields, "Bearbeitungsstatus");
        const adChannel = classifyChannel(readString(rec.fields, "Source"));
        const contactAttempts = Math.max(
          0,
          Math.round(readNumber(rec.fields, "Kontaktversuche")),
        );
        const price = readNumber(rec.fields, "Preis");
        const billed = readChecked(rec.fields, "Abgerechnet");
        const name = resolveLeadName(rec.fields);

        const isCancelled = isCancelledStatus(status);
        // Storno-Leads werden vor dem Anruf ausgefiltert → nicht erreicht,
        // kein Termin, kein Abschluss, auch wenn der alte Status etwas anderes
        // sagte.
        const reached = !isCancelled && status ? REACHED_STATUSES.has(status) : false;
        const isClosed = status === CLOSED_STATUS && !isCancelled;
        const closedAt = isClosed ? createdAt : null;

        const customerId = await getCustomerId(buyer);

        // Vor dem Upsert prüfen, ob der Lead schon existiert — nur dann
        // weiß die Sync-Pipeline, dass der Lead neu ist und einen Push
        // auslösen muss.
        const existingLead = await prisma.lead.findUnique({
          where: { airtableId: rec.id },
          select: { id: true, status: true },
        });
        const isNewLead = !existingLead;
        const wasAlreadyCancelled =
          existingLead?.status != null &&
          existingLead.status.toLowerCase().startsWith("storno");

        const lead = await prisma.lead.upsert({
          where: { airtableId: rec.id },
          create: {
            airtableId: rec.id,
            source: product,
            customerId,
            name,
            bezugAirtableId,
            createdAt,
            firstContactAt,
            closedAt,
            reached,
            contactAttempts,
            status,
            adChannel,
          },
          update: {
            source: product,
            customerId,
            name,
            bezugAirtableId,
            createdAt,
            firstContactAt,
            closedAt,
            reached,
            contactAttempts,
            status,
            adChannel,
          },
        });

        if (price > 0) {
          // Lead-Umsatz: pro Lead höchstens eine Revenue-Zeile (idempotent).
          // Storno-Leads: Eintrag wird angelegt/aktualisiert, aber mit
          // cancelled=true — Betrag fließt nicht in den Netto-Umsatz, lässt
          // sich aber für die Storno-Kachel auswerten.
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
                cancelled: isCancelled,
              },
            });
          } else {
            await prisma.revenue.create({
              data: {
                amount: price,
                occurredAt: createdAt,
                customerId,
                leadId: lead.id,
                cancelled: isCancelled,
              },
            });
            if (!isCancelled) {
              // Erst-Insert eines Verkaufs → Push-Trigger merken.
              result.newSales.push({
                buyer,
                product,
                amount: price,
                airtableId: rec.id,
              });
            }
          }
          if (!isCancelled) result.revenues += 1;
        } else if (isCancelled) {
          // Storno ohne Preis in Airtable: existierende Revenue (aus früherer
          // Abschluss-Phase) auf cancelled flippen, damit der Storno trotzdem
          // gemessen wird.
          await prisma.revenue.updateMany({
            where: { leadId: lead.id, cancelled: false },
            data: { cancelled: true },
          });
        }

        result.leads += 1;
        if (isNewLead) {
          result.newLeads.push({
            buyer,
            customerId,
            product,
            name,
            airtableId: rec.id,
          });
        }
        // Storno-Transition aus externer Airtable-Quelle. Dashboard-
        // Stornos triggern hier nicht, weil dort cancelLeadAction den
        // DB-Status schon auf "Storno" gesetzt hat (wasAlreadyCancelled
        // wäre true).
        if (isCancelled && !wasAlreadyCancelled) {
          result.newStornos.push({
            buyer,
            product,
            name,
            airtableId: rec.id,
          });
        }
        // billed-Flag derzeit nicht gesondert gespeichert; Umsatz wird laut
        // Vereinbarung bereits bei Lead-Übergabe gezählt.
        void billed;
      } catch (err) {
        result.errors.push(
          `Record ${rec.id} (${LEADS_TABLE}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Sweep: Leads, die in Airtable gelöscht wurden, auch lokal entfernen.
    // Nur ausführen, wenn der Fetch der Leads-Tabelle erfolgreich war —
    // sonst würden bei einem temporären 403/Netzwerk-Fehler ALLE Leads
    // (über alle Produkte) gelöscht.
    const seenIds = leadRecords.map((r) => r.id);
    const stale = await prisma.lead.findMany({
      where: {
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
      `[airtable] Leads: seen=${leadRecords.length}, deleted=${staleCount}`,
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
