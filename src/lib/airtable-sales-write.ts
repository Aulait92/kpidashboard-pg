// Schreibender Airtable-Helper für die Sales-Base ("Deal-Pipeline").
// Aktuell unterstützt: Deal-Edit aus der CRM-Detail-Page (Wert, Owner,
// Close-Datum, Notizen, Status). Field-Namen sind ENV-overridable —
// Defaults matchen die ersten Einträge der Read-Fallback-Listen in
// lib/sales.ts.
//
// Voraussetzung: dasselbe AIRTABLE_TOKEN-PAT mit Write-Scope auf die
// Sales-Base. Wenn keine Sales-Base konfiguriert ist (oder das PAT
// kein write hat), wird der Update silent geskippt und ein Warn
// geloggt — der DB-Spiegel bleibt das aktuellste, was wir haben.

const SALES_TABLE =
  process.env.AIRTABLE_TABLE_DEAL_PIPELINE ?? "Deal-Pipeline";

const FIELD_NAME = process.env.AIRTABLE_SALES_FIELD_NAME ?? "Name";
const FIELD_COMPANY = process.env.AIRTABLE_SALES_FIELD_COMPANY ?? "Unternehmen";
const FIELD_VALUE =
  process.env.AIRTABLE_SALES_FIELD_VALUE ?? "Abschluss-Volumen";
const FIELD_STATUS = process.env.AIRTABLE_SALES_FIELD_STATUS ?? "Status";
const FIELD_CLOSE_DATE =
  process.env.AIRTABLE_SALES_FIELD_CLOSE_DATE ?? "Abschluss-Datum";
const FIELD_NOTES = process.env.AIRTABLE_SALES_FIELD_NOTES ?? "Notizen";
const FIELD_LOST_REASON =
  process.env.AIRTABLE_SALES_FIELD_LOST_REASON ?? "Verlustgrund";

function getEnv(): { token: string; baseId: string } | null {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_SALES_BASE_ID;
  if (!token || !baseId) return null;
  return { token, baseId };
}

// PATCH der editierbaren Felder. undefined heißt "nicht ändern",
// null heißt "leeren". Wirft bei API-Fehler; der Caller (Server Action)
// loggt warn aber lässt die DB-Schreibung trotzdem durch — sonst gäbe
// es DB-Drift zwischen Airtable und Dashboard.
export async function updateSalesDeal(opts: {
  airtableId: string;
  name?: string | null;
  company?: string | null;
  value?: number | null;
  status?: string | null;
  closeDate?: string | null; // ISO YYYY-MM-DD
  notes?: string | null;
  lostReason?: string | null;
}): Promise<void> {
  const env = getEnv();
  if (!env) {
    console.warn(
      "[sales-write] AIRTABLE_SALES_BASE_ID nicht gesetzt — Skip Airtable-Update, nur DB.",
    );
    return;
  }
  const fields: Record<string, unknown> = {};
  if (opts.name !== undefined) fields[FIELD_NAME] = opts.name;
  if (opts.company !== undefined) fields[FIELD_COMPANY] = opts.company;
  if (opts.value !== undefined) fields[FIELD_VALUE] = opts.value;
  if (opts.status !== undefined) fields[FIELD_STATUS] = opts.status;
  if (opts.closeDate !== undefined) fields[FIELD_CLOSE_DATE] = opts.closeDate;
  if (opts.notes !== undefined) fields[FIELD_NOTES] = opts.notes;
  if (opts.lostReason !== undefined) fields[FIELD_LOST_REASON] = opts.lostReason;
  if (Object.keys(fields).length === 0) return;

  const url = `https://api.airtable.com/v0/${env.baseId}/${encodeURIComponent(SALES_TABLE)}/${opts.airtableId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields, typecast: true }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable Sales PATCH ${res.status}: ${body}`);
  }
}

// Löscht den Deal-Record in Airtable. Wirft bei Fehler — der Caller
// (Server Action) entscheidet, ob er trotzdem die DB-Zeile entfernt.
// 404 ist OK (Record gibt's in Airtable schon nicht mehr).
export async function deleteSalesDeal(opts: {
  airtableId: string;
}): Promise<void> {
  const env = getEnv();
  if (!env) {
    console.warn(
      "[sales-write] AIRTABLE_SALES_BASE_ID nicht gesetzt — Skip Airtable-Delete, nur DB.",
    );
    return;
  }
  const url = `https://api.airtable.com/v0/${env.baseId}/${encodeURIComponent(SALES_TABLE)}/${opts.airtableId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${env.token}` },
    cache: "no-store",
  });
  if (res.status === 404) return; // schon weg, alles gut
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable Sales DELETE ${res.status}: ${body}`);
  }
}
