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
import { syncSales, type SalesSyncResult } from "@/lib/sales";
import { sendToAdmins, sendToBuyersOfCustomer } from "@/lib/push";

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
  sales: { ok: true; result: SalesSyncResult } | { ok: false; error: string };
  push: { sent: number; removed: number };
};

const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// ─── Sync-Steuerung ──────────────────────────────────────────────────────
// cron-job.org ruft /api/sync jede Minute auf, ein Lauf kann aber länger
// dauern. Damit sich Läufe nicht stapeln, läuft immer nur einer gleichzeitig.
// Der Zustand liegt auf globalThis, weil Route Handler und Server Actions in
// getrennten Bundles laufen können (eigene Modul-Instanzen, gleicher Prozess).
type SyncState = {
  inFlight: Promise<FullSyncResult> | null;
  lastMetaFullSyncAt: number | null;
};
const g = globalThis as typeof globalThis & { __kpiSyncState?: SyncState };
const state: SyncState = (g.__kpiSyncState ??= {
  inFlight: null,
  lastMetaFullSyncAt: null,
});

/**
 * Startet einen vollen Sync, falls gerade keiner läuft. Läuft schon einer,
 * wird dessen Promise zurückgegeben (started: false) statt einen zweiten zu
 * starten.
 */
export function startFullSync(): {
  started: boolean;
  promise: Promise<FullSyncResult>;
} {
  if (state.inFlight) return { started: false, promise: state.inFlight };
  const promise = doFullSync().finally(() => {
    state.inFlight = null;
  });
  state.inFlight = promise;
  return { started: true, promise };
}

/** Voller Sync; wartet ggf. auf einen bereits laufenden statt doppelt zu syncen. */
export async function runFullSync(): Promise<FullSyncResult> {
  return startFullSync().promise;
}

// Meta: jede Minute nur die letzten Tage, die volle Historie einmal nachts
// (ca. 3 Uhr Berlin) sowie beim ersten Lauf nach einem Deploy. Sicherheitsnetz:
// spätestens nach 26 h wieder voll.
function metaFullSyncDue(now: Date): boolean {
  const last = state.lastMetaFullSyncAt;
  if (last === null) return true;
  const hoursSince = (now.getTime() - last) / 3_600_000;
  if (hoursSince >= 26) return true;
  const berlinHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .find((p) => p.type === "hour")?.value,
  );
  return berlinHour === 3 && hoursSince >= 12;
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[sync] ${label}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

async function doFullSync(): Promise<FullSyncResult> {
  const t0 = Date.now();
  const airtable = await timed("Airtable", () => syncAirtable());

  // Eigene Werbekonten der Retainer-Kunden (Spend nur für deren Dashboard).
  // Vor dem (langen) Agentur-Meta-Sync, damit er nicht davon blockiert wird.
  let customerAdSpend: FullSyncResult["customerAdSpend"];
  try {
    const r = await timed("Kunden-Werbekonten", () => syncCustomerAdSpend());
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
    const metaFull = metaFullSyncDue(new Date());
    const metaResult = await timed(
      `Meta (${metaFull ? "voll" : "inkrementell"})`,
      () => syncMeta({ full: metaFull }),
    );
    if (metaFull) state.lastMetaFullSyncAt = Date.now();
    meta = { ok: true, result: metaResult };
  } catch (err) {
    meta = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let outbrain: FullSyncResult["outbrain"];
  try {
    const outbrainResult = await timed("Outbrain", () => syncOutbrain());
    outbrain = { ok: true, result: outbrainResult };
  } catch (err) {
    outbrain = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let tiktok: FullSyncResult["tiktok"];
  try {
    const tiktokResult = await timed("TikTok", () => syncTikTok());
    tiktok = { ok: true, result: tiktokResult };
  } catch (err) {
    tiktok = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let google: FullSyncResult["google"];
  try {
    const googleResult = await timed("Google Ads", () => syncGoogleAds());
    google = { ok: true, result: googleResult };
  } catch (err) {
    google = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let sales: FullSyncResult["sales"];
  try {
    const salesResult = await timed("Sales", () => syncSales());
    sales = { ok: true, result: salesResult };
  } catch (err) {
    sales = {
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
    const buyerRes = await sendToBuyersOfCustomer(lead.customerId, {
      title: `🆕 Neuer Lead: ${leadName}`,
      body: lead.product,
      tag: `lead-buyer:${lead.airtableId}`,
      url: "/buyer",
    });
    pushSent += buyerRes.sent;
    pushRemoved += buyerRes.removed;
  }

  console.log(`[sync] fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return {
    airtable,
    meta,
    customerAdSpend,
    outbrain,
    tiktok,
    google,
    sales,
    push: { sent: pushSent, removed: pushRemoved },
  };
}
