"use server";

import { revalidatePath } from "next/cache";
import { syncAirtable, type SyncResult } from "@/lib/airtable";

export type SyncActionResult =
  | { ok: true; result: SyncResult }
  | { ok: false; error: string };

export async function runAirtableSync(): Promise<SyncActionResult> {
  try {
    const result = await syncAirtable();
    revalidatePath("/");
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
