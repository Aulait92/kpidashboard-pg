import crypto from "node:crypto";
import { computeUsageReport } from "@/lib/usage-report";

// Betriebs-API: Nutzungs-Auswertung des Kunden-CRMs (für die UX-Analyse).
// Absicherung wie /api/ops/buyers: Bearer-Token = ADMIN_API_TOKEN.
//   GET /api/ops/usage?days=14
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const expected = (process.env.ADMIN_API_TOKEN ?? "").trim();
  if (expected.length < 32) return false;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 14) || 14));
  return Response.json(await computeUsageReport(days));
}
