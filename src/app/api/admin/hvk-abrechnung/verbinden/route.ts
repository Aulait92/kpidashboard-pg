import { getCurrentSession } from "@/lib/auth";
import { hvkMailAuthUrl } from "@/lib/ppl/hvk-mail";

// HvK-Abrechnung: Postfach (nur lesen, Mail.Read) verbinden. Weiter zur Microsoft-Anmeldung; nur Admins.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  try {
    return new Response(null, { status: 302, headers: { Location: hvkMailAuthUrl(session.userId) } });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Fehler", { status: 500 });
  }
}
