// Schreibender Airtable-Helper. Aktuell nur für Lead-Stornos: PATCH auf
// einen einzelnen Record, setzt Bearbeitungsstatus + Stornogrund (Linked
// Record auf die Stornogründe-Tabelle) + Storno-Bemerkung (Freitext).
//
// Voraussetzung: das im AIRTABLE_TOKEN hinterlegte PAT muss `data.records:write`
// auf die Leads-Tabelle haben. Bei reinem Read-Only-PAT bekommen wir 403 zurück
// und die UI gibt den Fehler im Klartext aus.

const LEADS_TABLE = process.env.AIRTABLE_TABLE_LEADS ?? "Leads";
const BEZUG_TABLE =
  process.env.AIRTABLE_TABLE_KUNDEN_PRODUKT_BEZUG ?? "Kunden-Produkt-Bezug";
const STORNOGRUENDE_TABLE =
  process.env.AIRTABLE_TABLE_STORNOGRUENDE ?? "Stornogründe";
const STORNO_STATUS = process.env.AIRTABLE_VALUE_STORNO ?? "Storno";
const STORNO_GRUND_FIELD =
  process.env.AIRTABLE_FIELD_STORNO_GRUND ?? "Stornogrund";
const STORNO_BEMERKUNG_FIELD =
  process.env.AIRTABLE_FIELD_STORNO_BEMERKUNG ?? "Storno-Bemerkung";
const BEZUG_ERLAUBTE_GRUENDE_FIELD =
  process.env.AIRTABLE_FIELD_ERLAUBTE_STORNOGRUENDE ?? "Erlaubte Stornogründe";
const STATUS_FIELD =
  process.env.AIRTABLE_FIELD_BEARBEITUNGSSTATUS ?? "Bearbeitungsstatus";

export type StornogrundOption = {
  recordId: string;
  grund: string;
  code: string | null;
  beschreibung: string | null;
};

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

async function fetchAllRecords<T = Record<string, unknown>>(
  table: string,
): Promise<{ id: string; fields: T }[]> {
  const { token, baseId } = getEnv();
  const out: { id: string; fields: T }[] = [];
  let offset: string | undefined;
  const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  do {
    const url = new URL(baseUrl);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Airtable LIST ${res.status} (${table}): ${await res.text()}`);
    }
    const json = (await res.json()) as {
      records: { id: string; fields: T }[];
      offset?: string;
    };
    out.push(...json.records);
    offset = json.offset;
  } while (offset);
  return out;
}

// Lädt einmalig die komplette Stornogründe-Tabelle und liefert eine Map
// rec-ID → Option. Die UI filtert davon pro Lead die zugelassenen
// Gründe (über die Bezug-Map, siehe fetchBezugStornogruendeMap).
export async function fetchAllStornogruende(): Promise<
  Map<string, StornogrundOption>
> {
  const map = new Map<string, StornogrundOption>();
  try {
    const records = await fetchAllRecords<Record<string, unknown>>(STORNOGRUENDE_TABLE);
    for (const rec of records) {
      const grund = readStringField(rec.fields, "Grund");
      if (!grund) continue;
      map.set(rec.id, {
        recordId: rec.id,
        grund,
        code: readStringField(rec.fields, "Code"),
        beschreibung: readStringField(rec.fields, "Beschreibung"),
      });
    }
  } catch (err) {
    console.warn(
      `[airtable] Stornogründe-Tabelle "${STORNOGRUENDE_TABLE}" nicht lesbar:`,
      err instanceof Error ? err.message : String(err),
    );
  }
  return map;
}

// Liefert pro Bezug-rec-ID die Liste der erlaubten Stornogrund-rec-IDs.
// Der Buyer-Dashboard ruft das einmal pro Render auf und filtert dann
// pro Lead clientseitig.
export async function fetchBezugStornogruendeMap(): Promise<
  Map<string, string[]>
> {
  const map = new Map<string, string[]>();
  try {
    const records = await fetchAllRecords<Record<string, unknown>>(BEZUG_TABLE);
    for (const rec of records) {
      const raw = rec.fields[BEZUG_ERLAUBTE_GRUENDE_FIELD];
      if (!Array.isArray(raw)) continue;
      const ids = raw.filter(
        (x): x is string => typeof x === "string" && x.startsWith("rec"),
      );
      if (ids.length > 0) map.set(rec.id, ids);
    }
  } catch (err) {
    console.warn(
      `[airtable] Bezug-Tabelle für Stornogründe-Mapping nicht lesbar:`,
      err instanceof Error ? err.message : String(err),
    );
  }
  return map;
}

function readStringField(
  fields: Record<string, unknown>,
  key: string,
): string | null {
  const v = fields[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) {
    return v[0].trim();
  }
  return null;
}

// Holt einen einzelnen Lead-Record direkt aus Airtable (live). Wird vom
// Lead-Detail-Page im Buyer-Dashboard genutzt — schlanker als die volle
// Lead-Tabelle nochmal zu syncen.
export async function fetchLeadRecord(opts: {
  airtableId: string;
}): Promise<Record<string, unknown> | null> {
  const { token, baseId } = getEnv();
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(LEADS_TABLE)}/${opts.airtableId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable GET ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { fields?: Record<string, unknown> };
  return json.fields ?? null;
}

// Setzt den Lead-Record auf Storno. Schreibt:
//   - Bearbeitungsstatus = "Storno"
//   - Stornogrund        = [stornogrundRecordId] (Linked-Record-Array)
//   - Storno-Bemerkung   = bemerkung (Freitext)
// Wirft bei API-Fehler — der Caller (Server Action) wandelt die Message
// in eine UI-Meldung.
export async function markLeadAsCancelled(opts: {
  airtableId: string;
  stornogrundRecordId: string;
  bemerkung: string;
}): Promise<void> {
  const { token, baseId } = getEnv();
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(LEADS_TABLE)}/${opts.airtableId}`;
  const fields: Record<string, unknown> = {
    [STATUS_FIELD]: STORNO_STATUS,
    [STORNO_GRUND_FIELD]: [opts.stornogrundRecordId],
    [STORNO_BEMERKUNG_FIELD]: opts.bemerkung,
  };
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields, typecast: true }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    // Häufige Fälle: 403 = PAT hat kein write-scope; 422 = Spaltenname
    // unbekannt oder rec-ID kein gültiger Stornogründe-Record.
    throw new Error(`Airtable PATCH ${res.status}: ${body}`);
  }
}
