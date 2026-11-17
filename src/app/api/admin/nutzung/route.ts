import { getCurrentSession } from "@/lib/auth";
import { speichereAdminNutzung } from "@/lib/admin-nutzung-server";
import { reportError } from "@/lib/monitoring";
import { checkLimit } from "@/lib/rate-limit";

// Nutzungsmessung im Admin (Ole, 18.11.2026): Seitenaufrufe und Klicks auf data-funktion, gebündelt per sendBeacon
// aus components/admin/nutzung-messung.tsx. Speichert nur für eingeloggte Admins (lib/admin-nutzung-server.ts).
export const dynamic = "force-dynamic";

const MAX_BYTES = 16_000;

export async function POST(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return Response.json({ ok: false }, { status: 403 });
  if (!checkLimit("adminNutzung", session.userId).ok) return Response.json({ ok: false }, { status: 429 });
  // sendBeacon schickt Text (kein Preflight); darum selbst lesen und parsen
  const text = await req.text().catch(() => "");
  if (!text || text.length > MAX_BYTES) return Response.json({ ok: false }, { status: 400 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  try {
    const r = await speichereAdminNutzung(session, body);
    return Response.json({ ok: r.status === 200, gespeichert: r.gespeichert }, { status: r.status });
  } catch (e) {
    reportError(e, "admin-nutzung");
    return Response.json({ ok: false }, { status: 500 });
  }
}
