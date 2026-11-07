import { getCurrentSession } from "@/lib/auth";
import { authUrl } from "@/lib/whatsapp/google-calendar";

// Admin startet hier die Google-Kalender-Verbindung für einen Kunden:
// /api/google/connect?customerId=<id> leitet zur Google-Consent-Seite weiter.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  const customerId = new URL(req.url).searchParams.get("customerId") ?? "";
  if (!customerId) {
    return Response.json({ error: "customerId fehlt." }, { status: 400 });
  }
  try {
    return Response.redirect(authUrl(customerId), 302);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Fehler" },
      { status: 500 },
    );
  }
}
