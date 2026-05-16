"use server";

import { revalidatePath } from "next/cache";
import { syncAirtable, type SyncResult } from "@/lib/airtable";
import { syncMeta, type MetaSyncResult } from "@/lib/meta";
import { sendToAll } from "@/lib/push";

export type SyncActionResult =
  | {
      ok: true;
      result: SyncResult;
      meta:
        | { ok: true; result: MetaSyncResult }
        | { ok: false; error: string };
      push?: { sent: number; removed: number };
    }
  | { ok: false; error: string };

const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export async function runAirtableSync(): Promise<SyncActionResult> {
  try {
    const airtableResult = await syncAirtable();

    let meta:
      | { ok: true; result: MetaSyncResult }
      | { ok: false; error: string };
    try {
      const metaResult = await syncMeta();
      meta = { ok: true, result: metaResult };
    } catch (err) {
      meta = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Für jeden frisch hinzugekommenen Verkauf eine Push-Notification senden.
    // Tag pro airtableId verhindert Doppel-Notifications wenn Sync sehr eng
    // hintereinander zweimal läuft (zweiter Insert ist ohnehin idempotent).
    let push: { sent: number; removed: number } | undefined;
    if (airtableResult.newSales.length > 0) {
      let sent = 0;
      let removed = 0;
      for (const sale of airtableResult.newSales) {
        const r = await sendToAll({
          title: `💰 Lead verkauft: ${eur.format(sale.amount)}`,
          body: `${sale.buyer} · ${sale.product}`,
          tag: `sale:${sale.airtableId}`,
          url: "/",
        });
        sent += r.sent;
        removed += r.removed;
      }
      push = { sent, removed };
    }

    revalidatePath("/");
    return { ok: true, result: airtableResult, meta, push };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
