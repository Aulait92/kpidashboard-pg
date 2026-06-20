// Schreibender Airtable-Helper. Aktuell nur für Lead-Stornos: PATCH auf
// einen einzelnen Record, setzt Bearbeitungsstatus + optional Stornogrund.
//
// Voraussetzung: das im AIRTABLE_TOKEN hinterlegte PAT muss `data.records:write`
// auf die Leads-Tabelle haben. Bei reinem Read-Only-PAT bekommen wir 403 zurück
// und die UI gibt den Fehler im Klartext aus.

const LEADS_TABLE = process.env.AIRTABLE_TABLE_LEADS ?? "Leads";
const STORNO_STATUS = process.env.AIRTABLE_VALUE_STORNO ?? "Storno";
const STORNO_GRUND_FIELD =
  process.env.AIRTABLE_FIELD_STORNO_GRUND ?? "Stornogrund";
const STATUS_FIELD =
  process.env.AIRTABLE_FIELD_BEARBEITUNGSSTATUS ?? "Bearbeitungsstatus";

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

// Setzt den Lead-Record auf Storno. Schreibt zusätzlich den (Pflicht-)Grund
// in eine konfigurierbare Spalte. Wirft bei API-Fehler — der Caller (Server
// Action) wandelt die Message in eine UI-Meldung.
export async function markLeadAsCancelled(opts: {
  airtableId: string;
  reason: string;
}): Promise<void> {
  const { token, baseId } = getEnv();
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(LEADS_TABLE)}/${opts.airtableId}`;
  const fields: Record<string, string> = {
    [STATUS_FIELD]: STORNO_STATUS,
    [STORNO_GRUND_FIELD]: opts.reason,
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
    // unbekannt (z. B. „Stornogrund" existiert in der Base nicht).
    throw new Error(`Airtable PATCH ${res.status}: ${body}`);
  }
}
