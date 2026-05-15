"use server";

import { revalidatePath } from "next/cache";
import { syncAirtable, type SyncResult } from "@/lib/airtable";
import { syncMeta, type MetaSyncResult } from "@/lib/meta";

export type SyncActionResult =
  | {
      ok: true;
      result: SyncResult;
      meta:
        | { ok: true; result: MetaSyncResult }
        | { ok: false; error: string };
    }
  | { ok: false; error: string };

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

    revalidatePath("/");
    return { ok: true, result: airtableResult, meta };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
