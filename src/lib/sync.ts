import { syncAirtable, type SyncResult } from "@/lib/airtable";
import { syncMeta, type MetaSyncResult } from "@/lib/meta";
import { syncOutbrain, type OutbrainSyncResult } from "@/lib/outbrain";
import { sendToAdmins, sendToBuyersOfCustomer } from "@/lib/push";

export type FullSyncResult = {
  airtable: SyncResult;
  meta: { ok: true; result: MetaSyncResult } | { ok: false; error: string };
  outbrain:
    | { ok: true; result: OutbrainSyncResult }
    | { ok: false; error: string };
  push: { sent: number; removed: number };
};

const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

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

  let outbrain: FullSyncResult["outbrain"];
  try {
    const outbrainResult = await syncOutbrain();
    outbrain = { ok: true, result: outbrainResult };
  } catch (err) {
    outbrain = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let pushSent = 0;
  let pushRemoved = 0;

  // Neue Sales: nur Admin (Buyer kauft den Lead, weiß also schon Bescheid).
  for (const sale of airtable.newSales) {
    const r = await sendToAdmins({
      title: `💰 Lead verkauft: ${eur.format(sale.amount)}`,
      body: `${sale.buyer} · ${sale.product}`,
      tag: `sale:${sale.airtableId}`,
      url: "/",
    });
    pushSent += r.sent;
    pushRemoved += r.removed;
  }

  // Neue Leads: nur an den jeweiligen Kunden. Der Admin bekommt schon
  // den Sale-Push und braucht für jeden eingehenden Lead keine Extra-
  // Notification.
  for (const lead of airtable.newLeads) {
    const leadName = lead.name ?? "ohne Name";
    const buyerRes = await sendToBuyersOfCustomer(lead.customerId, {
      title: `🆕 Neuer Lead: ${leadName}`,
      body: lead.product,
      tag: `lead-buyer:${lead.airtableId}`,
      url: "/buyer",
    });
    pushSent += buyerRes.sent;
    pushRemoved += buyerRes.removed;
  }

  return {
    airtable,
    meta,
    outbrain,
    push: { sent: pushSent, removed: pushRemoved },
  };
}
