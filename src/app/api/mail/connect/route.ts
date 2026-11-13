import { getBuyerContext } from "@/lib/buyer-context";
import { googleMailAuthUrl, microsoftMailAuthUrl } from "@/lib/mail/postfach";

// Eigenes Postfach verbinden (Kundenbereich): weiter zur Anmeldung bei Google bzw. Microsoft.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const anbieter = new URL(req.url).searchParams.get("anbieter");
  try {
    const url = anbieter === "microsoft" ? microsoftMailAuthUrl(ctx.userId, ctx.email) : anbieter === "google" ? googleMailAuthUrl(ctx.userId, ctx.email) : null;
    if (!url) return Response.json({ error: "Unbekannter Anbieter." }, { status: 400 });
    return new Response(null, { status: 302, headers: { Location: url } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Fehler" }, { status: 500 });
  }
}
