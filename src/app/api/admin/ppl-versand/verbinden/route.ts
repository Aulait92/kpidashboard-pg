import { getCurrentSession } from "@/lib/auth";
import { versandAuthUrl } from "@/lib/ppl/versand-postfach";
import { neuPfadAusReferer, neuRuecksprungCookie } from "@/lib/admin-neu/ruecksprung";

// Pay-per-Lead: Versand-Postfach (Microsoft 365, Mail.Send) für Pivacom verbinden. Weiter zur Microsoft-Anmeldung; nur Admins.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  try {
    // Aus dem neuen Admin (Leads › Pay-per-Lead › HvK-Abrechnungen): Rücksprung dorthin (lib/admin-neu/ruecksprung.ts)
    const headers = new Headers({ Location: versandAuthUrl(session.userId) });
    headers.append("Set-Cookie", neuRuecksprungCookie(neuPfadAusReferer(req.headers.get("referer"))));
    return new Response(null, { status: 302, headers });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Fehler", { status: 500 });
  }
}
