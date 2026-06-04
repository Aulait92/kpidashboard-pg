"use server";

import { revalidatePath } from "next/cache";
import type { SyncResult } from "@/lib/airtable";
import type { MetaSyncResult } from "@/lib/meta";
import type { OutbrainSyncResult } from "@/lib/outbrain";
import { runFullSync } from "@/lib/sync";

export type SyncActionResult =
  | {
      ok: true;
      result: SyncResult;
      meta:
        | { ok: true; result: MetaSyncResult }
        | { ok: false; error: string };
      outbrain:
        | { ok: true; result: OutbrainSyncResult }
        | { ok: false; error: string };
      push?: { sent: number; removed: number };
    }
  | { ok: false; error: string };

export async function runAirtableSync(): Promise<SyncActionResult> {
  try {
    const { airtable, meta, outbrain, push } = await runFullSync();
    revalidatePath("/");
    return { ok: true, result: airtable, meta, outbrain, push };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
