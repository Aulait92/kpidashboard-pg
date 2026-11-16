import { getCurrentSession } from "@/lib/auth";
import { loadAdminChatFingerprint } from "@/lib/live";

// Live-Aktualisierung der Admin-Chats (/admin/whatsapp): JSON { v } mit einem kleinen
// Änderungs-Marker über alle Chats (keine Inhalte). Nur für Admins.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const v = await loadAdminChatFingerprint();
  return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
