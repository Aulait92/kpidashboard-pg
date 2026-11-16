import { isMailState } from "@/lib/mail/postfach";
import { mailCallback } from "@/lib/mail/oauth-routes";
import { callbackRoute, publicOrigin } from "@/lib/calendar/oauth-routes";
import { microsoftExchangeCode } from "@/lib/calendar/microsoft";
import { getCurrentSession } from "@/lib/auth";
import { hvkMailExchange, isHvkMailState, userFromHvkMailState } from "@/lib/ppl/hvk-mail";

// Microsoft-OAuth-Callback: Code gegen Tokens tauschen (verschlüsselt speichern).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const state = new URL(req.url).searchParams.get("state");
  // Eigenes Postfach (state „mail:…“) nutzt dieselbe Rücksprung-Adresse wie der Kalender
  if (isMailState(state)) return mailCallback(req, "microsoft");
  // HvK-Abrechnung (Admin, nur lesen): state „hvkmail:…“
  if (isHvkMailState(state)) return hvkCallback(req);
  return callbackRoute(req, microsoftExchangeCode, "microsoft");
}

async function hvkCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = (status: string) => {
    const dest = new URL("/admin/ppl", publicOrigin(req));
    dest.searchParams.set("ansicht", "hvk");
    dest.searchParams.set("postfach", status);
    return new Response(null, { status: 302, headers: { Location: dest.toString() } });
  };
  const session = await getCurrentSession();
  const userId = userFromHvkMailState(url.searchParams.get("state") ?? "");
  if (!session || session.role !== "ADMIN" || !userId || session.userId !== userId) return back("fehler");
  if (url.searchParams.get("error")) return back(url.searchParams.get("error")!.includes("consent") ? "freigabe" : "abgelehnt");
  const code = url.searchParams.get("code");
  if (!code) return back("fehler");
  try {
    await hvkMailExchange(code, userId);
    return back("verbunden");
  } catch (err) {
    console.error("[hvk-mail callback]", err);
    const msg = err instanceof Error ? err.message : "";
    return back(msg.startsWith("Falsches Postfach") ? "falsches-postfach" : msg.includes("Mail.Read") ? "recht" : "fehler");
  }
}
