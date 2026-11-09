import { syncAirtable, type SyncResult } from "@/lib/airtable";
import {
  syncCustomerAdSpend,
  syncMeta,
  type CustomerAdSpendSyncResult,
  type MetaSyncResult,
} from "@/lib/meta";
import { syncOutbrain, type OutbrainSyncResult } from "@/lib/outbrain";
import { syncTikTok, type TikTokSyncResult } from "@/lib/tiktok";
import { syncGoogleAds, type GoogleSyncResult } from "@/lib/google";
import { sendToAdmins, sendToBuyersOfCustomer, sendToUser } from "@/lib/push";
import { assignLead } from "@/lib/team";
import { prisma } from "@/lib/prisma";

export type FullSyncResult = {
  airtable: SyncResult;
  meta: { ok: true; result: MetaSyncResult } | { ok: false; error: string };
  customerAdSpend:
    | { ok: true; result: CustomerAdSpendSyncResult }
    | { ok: false; error: string };
  outbrain:
    | { ok: true; result: OutbrainSyncResult }
    | { ok: false; error: string };
  tiktok:
    | { ok: true; result: TikTokSyncResult }
    | { ok: false; error: string };
  google:
    | { ok: true; result: GoogleSyncResult }
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

  // Eigene Werbekonten der Retainer-Kunden (Spend nur für deren Dashboard).
  // Vor dem (langen) Agentur-Meta-Sync, damit er nicht davon blockiert wird.
  let customerAdSpend: FullSyncResult["customerAdSpend"];
  try {
    const r = await syncCustomerAdSpend();
    console.log(
      `[sync] Kunden-Werbekonten: ${r.customers} Kunden, ${r.days} Tage` +
        (r.errors.length ? ` · Fehler: ${r.errors.join(" | ")}` : ""),
    );
    customerAdSpend = { ok: true, result: r };
  } catch (err) {
    customerAdSpend = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

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

  let tiktok: FullSyncResult["tiktok"];
  try {
    const tiktokResult = await syncTikTok();
    tiktok = { ok: true, result: tiktokResult };
  } catch (err) {
    tiktok = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let google: FullSyncResult["google"];
  try {
    const googleResult = await syncGoogleAds();
    google = { ok: true, result: googleResult };
  } catch (err) {
    google = {
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

  // Stornos aus externen Airtable-Änderungen → Admin-Push. Dashboard-
  // getriebene Stornos triggern direkt aus cancelLeadAction und tauchen
  // hier nicht auf.
  for (const storno of airtable.newStornos) {
    const r = await sendToAdmins({
      title: `🚫 Storno: ${storno.name ?? "Lead"}`,
      body: `${storno.buyer} · ${storno.product}`,
      tag: `storno:${storno.airtableId}`,
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
    const payload = {
      title: `🆕 Neuer Lead: ${leadName}`,
      body: lead.product,
      tag: `lead-buyer:${lead.airtableId}`,
      url: "/buyer",
    };
    // Team (Großkunden): gleichmäßig zuteilen, Push nur an den Zuständigen.
    const row = await prisma.lead.findUnique({ where: { airtableId: lead.airtableId }, select: { id: true } }).catch(() => null);
    const assignee = row ? await assignLead(row.id).catch(() => null) : null;
    const buyerRes = assignee ? await sendToUser(assignee, payload) : await sendToBuyersOfCustomer(lead.customerId, payload);
    pushSent += buyerRes.sent;
    pushRemoved += buyerRes.removed;
  }

  return {
    airtable,
    meta,
    customerAdSpend,
    outbrain,
    tiktok,
    google,
    push: { sent: pushSent, removed: pushRemoved },
  };
}
