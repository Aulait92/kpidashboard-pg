import { syncAirtable, type SyncResult } from "@/lib/airtable";
import { syncMeta, type MetaSyncResult } from "@/lib/meta";
import { sendToAll } from "@/lib/push";

export type FullSyncResult = {
  airtable: SyncResult;
  meta: { ok: true; result: MetaSyncResult } | { ok: false; error: string };
  push: { sent: number; removed: number };
};

const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// Orchestriert Airtable-Sync + Meta-Sync + Push für frische Sales.
// Wird sowohl vom manuellen Sync-Button (server action) als auch vom
// Webhook-/Cron-Endpoint aufgerufen.
export async function runFullSync(): Promise<FullSyncResult> {
  const airtable = await syncAirtable();

  let meta: FullSyncResult["meta"];
  try {
    const metaResult = await syncMeta();
    meta = { ok: true, result: metaResult };
  } catch (err) {
    meta = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let pushSent = 0;
  let pushRemoved = 0;
  for (const sale of airtable.newSales) {
    const r = await sendToAll({
      title: `💰 Lead verkauft: ${eur.format(sale.amount)}`,
      body: `${sale.buyer} · ${sale.product}`,
      tag: `sale:${sale.airtableId}`,
      url: "/",
    });
    pushSent += r.sent;
    pushRemoved += r.removed;
  }

  return { airtable, meta, push: { sent: pushSent, removed: pushRemoved } };
}
