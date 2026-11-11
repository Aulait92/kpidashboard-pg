import { isCronAuthorized } from "@/lib/cron-auth";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { runMediaBuyer } from "@/lib/media-buyer";

const LABEL = "media-buyer";
function isAuthorized(req: Request): boolean {
  return isCronAuthorized(req, process.env.SYNC_TOKEN, { label: LABEL });
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Media Buyer ist abgeschaltet (wird ggf. später reaktiviert): ohne
  // MEDIA_BUYER_ENABLED=1 steuert er nichts mehr an Meta.
  if (process.env.MEDIA_BUYER_ENABLED !== "1") {
    return NextResponse.json({ ok: true, skipped: "Media Buyer ist abgeschaltet (MEDIA_BUYER_ENABLED=1 zum Reaktivieren)." });
  }

  // ?dryRun=1 simuliert nur (loggt + zeigt Entscheidungen, schreibt aber
  // nichts an Meta und schickt keine Push-Benachrichtigungen).
  // ?force=1 überspringt die Normalbetrieb-Drosselung (sofort nachsteuern).
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";

  try {
    const result = await runMediaBuyer({ dryRun, force });
    revalidatePath("/admin/media-buyer");
    return NextResponse.json({
      ok: true,
      dryRun,
      force,
      ranAt: result.ranAt.toISOString(),
      pools: result.pools.map((p) => ({
        pool: p.poolLabel,
        action: p.action,
        leadsMtd: p.leadsMtd,
        goal: p.goal,
        projected: p.projected,
        prevBudget: p.prevBudget,
        newBudget: p.newBudget,
        reason: p.reason,
        error: p.error,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
