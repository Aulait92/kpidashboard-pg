import { getCurrentSession } from "@/lib/auth";
import { suchIndex, type InventarEintrag } from "@/lib/admin-neu/funktionen";
import inventar from "../../../../../docs/ux/admin-neu/funktionsinventar.json";

// Index aller Admin-Funktionen für die Suche ⌘K im neuen Admin (Admin v2, Paket A3): Name, neuer Ort, Link.
// Lädt die Suche einmal beim ersten Öffnen (nicht mit jeder Seite). Nur für Admins.
const INDEX = suchIndex(inventar as InventarEintrag[]).map(({ suchtext: _s, ...f }) => f);

export async function GET(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  return Response.json({ funktionen: INDEX }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
