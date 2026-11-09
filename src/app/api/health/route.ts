import { prisma } from "@/lib/prisma";

// Healthcheck für Railway und Uptime-Überwachung: 200, wenn die App läuft und
// die Datenbank antwortet, sonst 503. Gibt bewusst keine Details preis.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
