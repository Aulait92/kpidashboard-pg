import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { runFullSync } from "@/lib/sync";

// Token-Auth: vergleicht in konstanter Zeit, damit der Endpoint nicht
// per Timing-Angriff probiert werden kann.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorized(req: Request): boolean {
  const expected = process.env.SYNC_TOKEN;
  if (!expected) return false;

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  const headerToken = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  const provided = headerToken ?? queryToken ?? "";
  return timingSafeEqual(provided, expected);
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFullSync();
    revalidatePath("/");
    return NextResponse.json({
      ok: true,
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
        ? { ok: true, costs: result.meta.result.costs }
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
      push: result.push,
    });
  } catch (err) {
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
//   curl https://.../api/sync?token=...
// testen kannst. Bei produktiver Nutzung POST bevorzugen.
export async function GET(req: Request) {
  return handle(req);
}
