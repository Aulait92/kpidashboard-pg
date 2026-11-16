import { getBuyerContext } from "@/lib/buyer-context";
import { loadFingerprint } from "@/lib/live";

// Live-Aktualisierung im Kundenbereich: JSON { v } mit einem kleinen Änderungs-Marker
// (nur Zähler und Zeitstempel, keine Inhalte) im Sichtbereich des Logins (Kunde, Berater
// nur eigene Leads/Chats). Der Browser fragt ihn alle 5 s ab (components/use-live-poll.ts).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const v = await loadFingerprint({ customerId: ctx.customerId, userId: ctx.userId, teamRole: ctx.teamRole });
  return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
