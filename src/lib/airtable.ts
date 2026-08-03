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
  "In Beratung",
  "Angebot gesendet",
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

// Liest Keyword-Aliase aus dem erstbesten der angegebenen Felder und liefert
// sie als kommagetrennten, normalisierten String (oder null). Akzeptiert
// kommagetrennten Freitext ("STB, Sterbe-Geld") ebenso wie ein Airtable-
// Multi-Select-Array (["STB","Sterbe-Geld"]).
function readKeywordList(
  fields: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const v = fields[key];
    let parts: string[] = [];
    if (typeof v === "string") {
      parts = v.split(",");
    } else if (Array.isArray(v)) {
      parts = v.filter((x): x is string => typeof x === "string");
    } else {
      continue;
    }
    const cleaned = parts.map((s) => s.trim()).filter((s) => s.length > 0);
    if (cleaned.length > 0) return cleaned.join(",");
  }
  return null;
}

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
    // Match-Aliase fürs Cost-Matching: die „Name"-Spalte (separater
    // Kampagnen-/Marketing-Name, der oft im Kampagnen-Namen steckt) PLUS eine
    // optionale Keyword-Spalte. So lässt sich eine Kampagne über den Wert in
    // „Name" zuordnen, ohne eine eigene Keyword-Spalte pflegen zu müssen. Der
    // kanonische Produktname (oben) bleibt „Zielgruppe Bezeichnung" — Pools,
    // Lead-Zuordnung und Anzeige ändern sich dadurch nicht.
    const nameAlias = readString(rec.fields, "Name");
    const explicitKeywords = readKeywordList(rec.fields, [
      "Keywords",
      "Keyword",
      "Aliase",
      "Alias",
      "Cost-Keywords",
      "Kampagnen-Keywords",
    ]);
    const aliasParts = [
      explicitKeywords,
      nameAlias && nameAlias !== name ? nameAlias : null,
    ].filter((s): s is string => !!s);
    const keywords = aliasParts.length > 0 ? aliasParts.join(",") : null;
    try {
      const dbProduct = await prisma.product.upsert({
        where: { airtableId: rec.id },
        create: {
          airtableId: rec.id,
          name,
          slug,
          keywords,
          poolKind,
          active: true,
        },
        update: { name, slug, keywords, poolKind, active: true },
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

// Rohzeile aus der Bezug-Tabelle. Eine pro (Kunde × Produkt). Wird nach dem
// Customer-Upsert in syncAirtable zu einer CustomerProduct-Zeile persistiert.
// productDbId = direkt aufgelöste Produkt-rec-ID (sofern der Bezug auf ein
// Produkt der Produkte-Tabelle verweist); ansonsten null → der Sync löst über
// den Produktnamen + die Legacy-Product-IDs nach.
type BezugRow = {
  buyerAirtableId: string;
  productDbId: string | null;
  productName: string;
  // Anzeige-Label aus der Bezug-„Name"-Spalte (Produktbezeichnung, wie sie im
  // Media Buyer erscheinen soll). null = nicht gesetzt → Default-Label.
  productLabel: string | null;
  leadGoal: number | null;
  leadPrice: number | null;
  startDate: Date | null;
  // Test-Bezug + Test-Dauer (Tage). Test ⇒ volles Ziel (keine Mid-Month-
  // Kürzung); Live ⇒ anteilig.
  testMode: boolean;
  testDurationDays: number | null;
  region: string | null;
};

// Liest die Join-Tabelle „Kunden-Produkt-Bezug" und liefert pro Zeile die
// Lead-Ziele, Preise und Startdaten je (Kunde × Produkt). Produkt-agnostisch —
// neue Produkte erfordern keine Code-Änderung.
async function fetchKundenProduktBezug(
  produkteMap: Map<string, ProductRef>,
): Promise<BezugRow[]> {
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
    // Produktbezeichnung fürs Media-Buyer-Label aus der „Name"-Spalte der
    // Bezug-Tabelle.
    const productLabel = readString(rec.fields, "Name");
    // Test-Bezug: Test-Dauer in Tagen (mehrere Schreibweisen) + optionales
    // Test-Flag (Checkbox). Gesetzte Test-Dauer gilt selbst als Testmodus.
    const testDurationDays = readIntFromFields(rec.fields, [
      "test_dauer_tage",
      "Test-Dauer (Tage)",
      "Testdauer (Tage)",
      "Testdauer",
      "Test-Tage",
      "Testlaufzeit (Tage)",
      "Testlaufzeit",
    ]);
    const testMode =
      readChecked(rec.fields, "Test") ||
      readChecked(rec.fields, "Testmodus") ||
      readChecked(rec.fields, "Testlauf") ||
      (testDurationDays ?? 0) > 0;

    for (const id of ids) {
      rows.push({
        buyerAirtableId: id,
        productDbId: produktDbId,
        productName: produkt,
        productLabel,
        leadGoal: leadziel,
        leadPrice: preis,
        startDate: startdatum,
        testMode,
        testDurationDays,
        region,
      });
    }
  }
  return rows;
}

// Stellt sicher, dass die drei Legacy-Sparten als Product-Zeilen existieren
// (auch wenn die Airtable-Produkte-Tabelle sie nicht explizit listet) und
// liefert canonicalKey → Product-DB-Id. Dadurch können Bezüge/Buyer-Felder,
// die nur per Freitext auf eine Altsparte zeigen, trotzdem zu CustomerProduct
// aufgelöst werden.
async function ensureLegacyProductDbIds(
  produkteMap: Map<string, ProductRef>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const ref of produkteMap.values()) {
    const key = canonicalProductKey(ref.name);
    if (
      (key === "Wechsel" || key === "Neugeschäft" || key === "Kinderwunsch") &&
      !out.has(key)
    ) {
      out.set(key, ref.dbId);
    }
  }
  const defs: { key: string; poolKind: "product" | "region" }[] = [
    { key: "Wechsel", poolKind: "product" },
    { key: "Neugeschäft", poolKind: "product" },
    { key: "Kinderwunsch", poolKind: "region" },
  ];
  for (const d of defs) {
    if (out.has(d.key)) continue;
    try {
      const p = await prisma.product.upsert({
        where: { name: d.key },
        create: {
          name: d.key,
          slug: slugify(d.key),
          poolKind: d.poolKind,
          active: true,
        },
        update: {},
        select: { id: true },
      });
      out.set(d.key, p.id);
    } catch (err) {
      console.warn(
        `[airtable] Legacy-Product "${d.key}" konnte nicht angelegt werden:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return out;
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

  // Legacy-Sparten als Product-Zeilen sicherstellen → canonicalKey → DB-Id.
  // Nötig, damit Bezüge/Buyer-Felder, die nur per Freitext auf eine Altsparte
  // zeigen, dennoch zu CustomerProduct aufgelöst werden können.
  const legacyProductDbIds = await ensureLegacyProductDbIds(produkteMap);

  // Join-Tabelle „Kunden-Produkt-Bezug" lesen — Quelle der Ziele/Preise/
  // Startdaten je (Kunde × Produkt). Bei Fehler (Tabelle fehlt o.ä.) fallen
  // wir still auf die per-Produkt-Felder am Buyer-Record zurück.
  let bezugRows: BezugRow[] = [];
  let bezugFetched = false;
  try {
    bezugRows = await fetchKundenProduktBezug(produkteMap);
    bezugFetched = true;
    console.log(
      `[airtable] Kunden-Produkt-Bezug "${BEZUG_TABLE}": ${bezugRows.length} Bezug-Zeilen.`,
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

  // Region auf den Customer übernehmen (Ziele/Preise/Startdaten liegen seit
  // Option B in CustomerProduct, nicht mehr am Kunden). Für JEDEN Datensatz der
  // Kunden-Tabelle wird eine Customer-Zeile angelegt, damit ein frisch in
  // Airtable angelegter Kunde sofort im Buyer-Dropdown (/admin/buyers) auswählbar
  // ist. Die Namen werden gesammelt und in der Aufräum-Logik (Schritt 5) per
  // `name notIn` ausgenommen — so wird ein aktiver Kunde NIE gelöscht, auch ohne
  // Leads/Produkte/Region; entfernt werden nur echte Altlasten.
  const syncedCustomerNames = new Set<string>();
  for (const info of buyerMap.values()) {
    const key = info.name.trim();
    if (!key) continue;
    syncedCustomerNames.add(key);
    const customer = await prisma.customer.upsert({
      where: { name: key },
      create: { name: key, region: info.region },
      update: { region: info.region },
      select: { id: true },
    });
    customerCache.set(key, customer.id);
  }

  // CustomerProduct schreiben — produkt-agnostisch. Primärquelle ist die
  // Bezug-Tabelle; pro (Kunde × Produkt) genau eine Zeile (idempotent).
  // productDbId kommt direkt aus dem Bezug oder — bei reinen Freitext-Bezügen
  // auf eine Altsparte — aus den Legacy-Product-IDs.
  const coveredCp = new Set<string>(); // "customerId|productId" (für Stale-Sweep)
  // "customerId|canonicalKey" — verhindert doppelte Ziele, wenn zwei Airtable-
  // Produkte auf denselben kanonischen Key zeigen (z. B. PKV-Wechsel +
  // PKV-Tarifoptimierung → beide "Wechsel").
  const coveredCanonical = new Set<string>();
  async function upsertCustomerProduct(
    customerId: string,
    productId: string,
    canonicalKey: string,
    data: {
      leadGoal: number | null;
      leadPrice: number | null;
      startDate: Date | null;
      testMode: boolean;
      testDurationDays: number | null;
      region: string | null;
    },
  ): Promise<void> {
    const canonKey = `${customerId}|${canonicalKey}`;
    if (coveredCanonical.has(canonKey)) return; // erste Quelle gewinnt (Bezug vor Buyer-Feld)
    coveredCanonical.add(canonKey);
    coveredCp.add(`${customerId}|${productId}`);
    try {
      await prisma.customerProduct.upsert({
        where: { customerId_productId: { customerId, productId } },
        create: { customerId, productId, ...data },
        update: data,
      });
    } catch (err) {
      result.errors.push(
        `CustomerProduct ${customerId} × ${productId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Produktbezeichnung fürs Media-Buyer-Label aus der Bezug-„Name"-Spalte →
  // Product.displayName. Pro Produkt last-write-wins (Annahme: je Produkt
  // konsistent).
  const displayNameByProductId = new Map<string, string>();
  for (const row of bezugRows) {
    const buyerInfo = buyerMap.get(row.buyerAirtableId);
    if (!buyerInfo) continue;
    const customerId = customerCache.get(buyerInfo.name.trim());
    if (!customerId) continue;
    const canonicalKey = canonicalProductKey(row.productName);
    const productId =
      row.productDbId ?? legacyProductDbIds.get(canonicalKey) ?? null;
    if (!productId) continue; // unauflösbares Produkt → übersprungen
    if (row.productLabel) displayNameByProductId.set(productId, row.productLabel);
    await upsertCustomerProduct(customerId, productId, canonicalKey, {
      leadGoal: row.leadGoal,
      leadPrice: row.leadPrice,
      startDate: row.startDate,
      testMode: row.testMode,
      testDurationDays: row.testDurationDays,
      region: row.region,
    });
  }
  for (const [productId, label] of displayNameByProductId) {
    try {
      await prisma.product.update({
        where: { id: productId },
        data: { displayName: label },
      });
    } catch {
      // Produkt evtl. zwischenzeitlich entfernt — Label ist unkritisch.
    }
  }

  // Fallback: per-Produkt-Felder am Buyer-Record (Altschema) in CustomerProduct
  // routen, soweit der Bezug-Sweep diese (Kunde × Sparte) nicht schon abgedeckt
  // hat. So geht beim Wegfall der alten Customer-Spalten kein Ziel verloren.
  for (const info of buyerMap.values()) {
    const customerId = customerCache.get(info.name.trim());
    if (!customerId) continue;
    const legacy: {
      key: string;
      goal: number | null;
      price: number | null;
      start: Date | null;
      region: string | null;
    }[] = [
      {
        key: "Wechsel",
        goal: info.goalWechsel,
        price: info.priceWechsel,
        start: info.startWechsel,
        region: null,
      },
      {
        key: "Neugeschäft",
        goal: info.goalNeugeschaeft,
        price: info.priceNeugeschaeft,
        start: info.startNeugeschaeft,
        region: null,
      },
      {
        key: "Kinderwunsch",
        goal: info.goalKinderwunsch,
        price: info.priceKinderwunsch,
        start: info.startKinderwunsch,
        region: info.region,
      },
    ];
    for (const l of legacy) {
      if (l.goal == null && l.price == null && l.start == null) continue;
      const productId = legacyProductDbIds.get(l.key);
      if (!productId) continue;
      await upsertCustomerProduct(customerId, productId, l.key, {
        leadGoal: l.goal,
        leadPrice: l.price,
        startDate: l.start,
        testMode: false,
        testDurationDays: null,
        region: l.region,
      });
    }
  }

  // Stale-Sweep: in Airtable gelöschte Bezüge auch in CustomerProduct
  // entfernen. NUR wenn die Bezug-Tabelle erfolgreich gelesen wurde UND
  // mindestens eine Zeile abgedeckt ist — sonst würde ein temporärer
  // API-Fehler legitime Ziel-Zeilen wegräumen.
  if (bezugFetched && coveredCp.size > 0) {
    const existing = await prisma.customerProduct.findMany({
      select: { id: true, customerId: true, productId: true },
    });
    const staleIds = existing
      .filter((cp) => !coveredCp.has(`${cp.customerId}|${cp.productId}`))
      .map((cp) => cp.id);
    if (staleIds.length > 0) {
      await prisma.customerProduct.deleteMany({ where: { id: { in: staleIds } } });
      console.log(
        `[airtable] CustomerProduct stale-sweep: ${staleIds.length} verwaiste Bezüge entfernt.`,
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
  // Grundsätzlich ist ein Customer ohne Leads, Umsätze, Kosten, ohne
  // CustomerProduct-Zeilen UND ohne Region entfernbar — ABER alle Kunden, die
  // AKTUELL in der Kunden-Tabelle stehen, werden per Namen ausgenommen. Sie
  // sollen dauerhaft als auswählbare Customer bestehen bleiben (auch ganz ohne
  // Leads/Produkte/Region), damit neu angelegte Kunden sofort im Buyer-Dropdown
  // erscheinen. Gelöscht werden dadurch nur echte Altlasten (in Airtable
  // umbenannt/entfernt), nie ein aktiver Kunde.
  await prisma.customer.deleteMany({
    where: {
      ...(syncedCustomerNames.size > 0
        ? { name: { notIn: Array.from(syncedCustomerNames) } }
        : {}),
      leads: { none: {} },
      revenues: { none: {} },
      costs: { none: {} },
      customerProducts: { none: {} },
      region: null,
    },
  });

  result.customers = customerCache.size;
  return result;
}
