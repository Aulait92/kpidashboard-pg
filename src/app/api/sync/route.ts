import { isCronAuthorized } from "@/lib/cron-auth";
import { reportError } from "@/lib/monitoring";
import { beat } from "@/lib/heartbeat";
import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";
import { startFullSync, type FullSyncResult } from "@/lib/sync";
import { listProductMatchers } from "@/lib/product-catalog";
import { listProductGoalBreakdown } from "@/lib/media-buyer";

const LABEL = "sync";
function isAuthorized(req: Request): boolean {
  return isCronAuthorized(req, process.env.SYNC_TOKEN, { label: LABEL });
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { started, promise } = startFullSync();

  // Standard (Cron): sofort antworten, Sync läuft im Hintergrund weiter.
  // Sonst bricht cron-job.org nach 30 s ab (499) und stößt jede Minute einen
  // weiteren Lauf an. ?wait=1 wartet wie früher und liefert die Diagnose.
  const wait = new URL(req.url).searchParams.get("wait") === "1";
  if (!wait) {
    if (started) {
      after(async () => {
        try {
          const result = await promise;
          revalidatePath("/");
          await beat("sync", result.airtable.errors.length === 0, result.airtable.errors.join("; ") || null);
        } catch (err) {
          reportError(err, "sync");
          await beat("sync", false, err instanceof Error ? err.message : String(err));
        }
      });
    }
    return NextResponse.json(
      {
        ok: true,
        started,
        message: started
          ? "Sync gestartet, läuft im Hintergrund."
          : "Es läuft bereits ein Sync, kein zweiter gestartet.",
      },
      { status: 202 },
    );
  }

  try {
    const result: FullSyncResult = await promise;
    await beat("sync", result.airtable.errors.length === 0, result.airtable.errors.join("; ") || null);
    // Diagnose: welche Produkte + Match-Needles kennt der Matcher nach dem Sync?
    // Fehlt hier ein frisch angelegtes Produkt, ist es nicht in die DB gekommen
    // (Name-Feld leer/anders benannt, falsche Tabelle, o. ä.).
    const productMatchers = await listProductMatchers();
    // Diagnose: rohes vs. effektives Lead-Ziel je Produkt (+ pro Kunde).
    const productGoals = await listProductGoalBreakdown();
    revalidatePath("/");
    return NextResponse.json({
      ok: true,
      productMatchers,
      productGoals,
      airtable: {
        leads: result.airtable.leads,
        revenues: result.airtable.revenues,
        deletedLeads: result.airtable.deletedLeads,
        customers: result.airtable.customers,
        newSales: result.airtable.newSales.length,
        tables: result.airtable.tables,
        errors: result.airtable.errors,
      },
      meta: result.meta.ok
        ? {
            ok: true,
            costs: result.meta.result.costs,
            // Pro Account: wie viele Insights-Zeilen kamen zurück. Accounts,
            // die NICHT hier auftauchen, sind beim Fetch gescheitert (siehe
            // errors) und wurden übersprungen.
            accounts: result.meta.result.accounts,
            errors: result.meta.result.errors,
            // Volle Liste der nicht zugeordneten Kampagnen (Name + Spend) —
            // hier muss z. B. eine neue „Katzenversicherung" auftauchen, solange
            // sie Spend hat und der Account gefetcht wurde.
            unmatched: result.meta.result.unmatched,
          }
        : { ok: false, error: result.meta.error },
      outbrain: result.outbrain.ok
        ? {
            ok: true,
            costs: result.outbrain.result.costs,
            marketers: result.outbrain.result.marketers,
            errors: result.outbrain.result.errors,
            unmatched: result.outbrain.result.unmatched,
            debug: result.outbrain.result.debug,
          }
        : { ok: false, error: result.outbrain.error },
      tiktok: result.tiktok.ok
        ? {
            ok: true,
            costs: result.tiktok.result.costs,
            advertisers: result.tiktok.result.advertisers,
            errors: result.tiktok.result.errors,
            unmatched: result.tiktok.result.unmatched,
            debug: result.tiktok.result.debug,
          }
        : { ok: false, error: result.tiktok.error },
      google: result.google.ok
        ? {
            ok: true,
            costs: result.google.result.costs,
            rows: result.google.result.customers.rows,
            errors: result.google.result.errors,
            unmatched: result.google.result.unmatched,
          }
        : { ok: false, error: result.google.error },
      push: result.push,
    });
  } catch (err) {
    reportError(err, "sync");
    await beat("sync", false, err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// POST für Airtable-Webhooks und alle anständigen Cron-Tools.
export async function POST(req: Request) {
  return handle(req);
}

// GET zugelassen, damit du den Endpoint mit einem simplen
//   curl -H "Authorization: Bearer $SYNC_TOKEN" https://.../api/sync
// testen kannst. Bei produktiver Nutzung POST bevorzugen.
export async function GET(req: Request) {
  return handle(req);
}
