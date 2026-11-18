// WhatsApp Flows über 360dialog (Messaging API, docs.360dialog.com/docs/messaging-api/api-reference/flows, abgerufen
// 19.11.2026), Header D360-API-KEY (Channel-Schlüssel des Kunden), Basis wie lib/whatsapp/dialog360.ts:
//   POST /flows                  { name, categories, flow_json?, publish? } → { id, success, validation_errors }
//   GET  /flows                  → { data: [{ id, name, status, … }], paging }
//   GET  /flows/{id}             → { id, name, status, validation_errors, … }
//   POST /flows/{id}/assets      multipart: name=flow.json, asset_type=FLOW_JSON, file (höchstens 1 MB)
//   POST /flows/{id}/publish     → { success }
// Veröffentlichte Flows sind fest (Änderung = neuer Flow). Keine Inhalte von Leads gehen hierüber.

const BASE_URL = () => (process.env.DIALOG360_BASE_URL ?? "https://waba-v2.360dialog.io").replace(/\/$/, "");

export type ValidationError = { error?: string; error_type?: string; message?: string };
export type RemoteFlow = { id: string; name: string | null; status: string; validationErrors: ValidationError[] };

async function anfrage(apiKey: string, pfad: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL()}${pfad}`, { ...init, headers: { "D360-API-KEY": apiKey, ...(init.headers ?? {}) } });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* kein JSON */
  }
  if (!res.ok) throw new Error(`360dialog flows ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

const fehlerListe = (v: unknown): ValidationError[] => (Array.isArray(v) ? (v as ValidationError[]) : []);
const remote = (j: Record<string, unknown>): RemoteFlow => ({
  id: String(j.id ?? ""),
  name: typeof j.name === "string" ? j.name : null,
  status: String(j.status ?? "").toUpperCase(),
  validationErrors: fehlerListe(j.validation_errors),
});

/** Flow anlegen; mit flowJson und publish = true in einem Schritt veröffentlichen. */
export async function createFlow(apiKey: string, o: { name: string; flowJson: string; publish: boolean; categories?: string[] }): Promise<{ id: string; validationErrors: ValidationError[] }> {
  const j = await anfrage(apiKey, "/flows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: o.name, categories: o.categories ?? ["OTHER"], flow_json: o.flowJson, publish: o.publish }),
  });
  return { id: String(j.id ?? ""), validationErrors: fehlerListe(j.validation_errors) };
}

export async function getFlow(apiKey: string, id: string): Promise<RemoteFlow> {
  return remote({ id, ...(await anfrage(apiKey, `/flows/${encodeURIComponent(id)}?fields=id,name,status,validation_errors`)) });
}

export async function listFlows(apiKey: string): Promise<RemoteFlow[]> {
  const j = await anfrage(apiKey, "/flows?limit=100");
  return (Array.isArray(j.data) ? (j.data as Record<string, unknown>[]) : []).map(remote);
}

/** Flow JSON eines Entwurfs ersetzen. */
export async function uploadFlowJson(apiKey: string, id: string, flowJson: string): Promise<ValidationError[]> {
  const form = new FormData();
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  form.append("file", new Blob([flowJson], { type: "application/json" }), "flow.json");
  const j = await anfrage(apiKey, `/flows/${encodeURIComponent(id)}/assets`, { method: "POST", body: form });
  return fehlerListe(j.validation_errors);
}

export async function publishFlow(apiKey: string, id: string): Promise<void> {
  await anfrage(apiKey, `/flows/${encodeURIComponent(id)}/publish`, { method: "POST" });
}
