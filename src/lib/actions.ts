"use server";

import { revalidatePath } from "next/cache";
import type { SyncResult } from "@/lib/airtable";
import type { MetaSyncResult } from "@/lib/meta";
import type { OutbrainSyncResult } from "@/lib/outbrain";
import type { TikTokSyncResult } from "@/lib/tiktok";
import type { GoogleSyncResult } from "@/lib/google";
import { runFullSync } from "@/lib/sync";
import { getCurrentSession } from "@/lib/auth";

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
      tiktok:
        | { ok: true; result: TikTokSyncResult }
        | { ok: false; error: string };
      google:
        | { ok: true; result: GoogleSyncResult }
        | { ok: false; error: string };
      push?: { sent: number; removed: number };
    }
  | { ok: false; error: string };

export async function runAirtableSync(): Promise<SyncActionResult> {
  // Nur mit Login (Prüfung App-Demo 16.11.2026: die Action war ohne Anmeldung aufrufbar). Auch nicht in der App-Demo.
  if (!(await getCurrentSession())) return { ok: false, error: "Bitte neu anmelden." };
  try {
    const { airtable, meta, outbrain, tiktok, google, push } =
      await runFullSync();
    revalidatePath("/");
    return {
      ok: true,
      result: airtable,
      meta,
      outbrain,
      tiktok,
      google,
      push,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
