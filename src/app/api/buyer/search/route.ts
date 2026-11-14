import { getBuyerContext } from "@/lib/buyer-context";
import { searchBuyer } from "@/lib/buyer-search";
import { isNewUi } from "@/lib/new-ui";

// Schnellsuche im Kundenbereich (Strg+K): Kontakte, Bestandskunden, Chats.
// Sichtbarkeit wie überall im Kundenbereich (Berater: nur eigene Kontakte).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx) return Response.json({ error: "Bitte neu anmelden." }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const team = { customerId: ctx.customerId, userId: ctx.userId, teamRole: ctx.teamRole };
  const hits = await searchBuyer(team, q, { newUi: await isNewUi(ctx.customerId) });
  return Response.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}
