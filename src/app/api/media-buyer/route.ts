import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { runMediaBuyer } from "@/lib/media-buyer";

// Token-Auth identisch zu /api/sync — konstante Zeit gegen Timing-Angriffe.
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

  // ?dryRun=1 simuliert nur (loggt + zeigt Entscheidungen, schreibt aber
  // nichts an Meta und schickt keine Push-Benachrichtigungen).
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  try {
    const result = await runMediaBuyer({ dryRun });
    revalidatePath("/admin/media-buyer");
    return NextResponse.json({
      ok: true,
      dryRun,
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
