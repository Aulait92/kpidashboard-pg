import { prisma } from "@/lib/prisma";
import { HEARTBEAT_MAX_AGE_MIN, type HeartbeatKey } from "@/lib/heartbeat";

// Status für die externe Überwachung (z. B. cron-job.org alle 5 Minuten):
// 200 = alles gut, 503 = Problem (Datenbank weg oder ein Hintergrund-Job läuft
// nicht mehr). Bewusst getrennt von /api/health, das Railway beim Deploy
// prüft – ein hängender Cron soll keinen Deploy blockieren.
// Ohne Token nur ok/Fehler; mit ?token=<WHATSAPP_WEBHOOK_SECRET> die Details.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const details = !!process.env.WHATSAPP_WEBHOOK_SECRET && token === process.env.WHATSAPP_WEBHOOK_SECRET;
  const problems: string[] = [];
  try {
    await prisma.$queryRaw`SELECT 1`;
    const beats = await prisma.systemHeartbeat.findMany();
    const now = Date.now();
    for (const key of Object.keys(HEARTBEAT_MAX_AGE_MIN) as HeartbeatKey[]) {
      const b = beats.find((x) => x.key === key);
      // Job noch nie gelaufen (z. B. Sync nicht eingerichtet) → kein Alarm.
      if (!b) continue;
      const ageMin = Math.round((now - b.at.getTime()) / 60000);
      if (ageMin > HEARTBEAT_MAX_AGE_MIN[key]) problems.push(`${key}: seit ${ageMin} Min. kein Lauf`);
      // Fehler im letzten Lauf nur beim Cron melden (Sync-Teilfehler sind oft harmlos).
      else if (!b.ok && key === "cron") problems.push(`${key}: letzter Lauf mit Fehler${b.note ? ` (${b.note})` : ""}`);
    }
  } catch {
    problems.push("datenbank: nicht erreichbar");
  }
  const ok = problems.length === 0;
  return Response.json(details ? { ok, problems } : { ok }, { status: ok ? 200 : 503, headers });
}
