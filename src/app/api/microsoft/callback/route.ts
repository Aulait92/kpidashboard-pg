import { isMailState } from "@/lib/mail/postfach";
import { mailCallback } from "@/lib/mail/oauth-routes";
import { callbackRoute, publicOrigin } from "@/lib/calendar/oauth-routes";
import { microsoftExchangeCode } from "@/lib/calendar/microsoft";
import { getCurrentSession } from "@/lib/auth";
import { hvkMailExchange, isHvkMailState, userFromHvkMailState } from "@/lib/ppl/hvk-mail";
import { isVersandState, userFromVersandState, versandExchange } from "@/lib/ppl/versand-postfach";
import { neuRuecksprungCookie, ruecksprungZiel } from "@/lib/admin-neu/ruecksprung";

// Microsoft-OAuth-Callback: Code gegen Tokens tauschen (verschlüsselt speichern).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const state = new URL(req.url).searchParams.get("state");
  // Eigenes Postfach (state „mail:…“) nutzt dieselbe Rücksprung-Adresse wie der Kalender
  if (isMailState(state)) return mailCallback(req, "microsoft");
  // HvK-Abrechnung (Admin, nur lesen): state „hvkmail:…“
  if (isHvkMailState(state)) return hvkCallback(req);
  // PPL-Versand-Postfach für Pivacom (Admin, Mail.Send): state „pplversand:…“
  if (isVersandState(state)) return versandCallback(req);
  return callbackRoute(req, microsoftExchangeCode, "microsoft");
}

/** Zurück zu Pay-per-Lead › HvK-Abrechnungen mit Meldung (?postfach=… bzw. ?versand=…). */
function zurueckZuHvk(req: Request, param: "postfach" | "versand", status: string): Response {
  // Start aus dem neuen Admin (Cookie): zurück nach Leads › Pay-per-Lead › HvK-Abrechnungen, sonst /admin/ppl
  const dest = new URL(ruecksprungZiel("/admin/neu/leads/ppl", req.headers.get("cookie")), publicOrigin(req));
  dest.searchParams.set("ansicht", "hvk");
  dest.searchParams.set(param, status);
  const headers = new Headers({ Location: dest.toString() });
  headers.append("Set-Cookie", neuRuecksprungCookie(null));
  return new Response(null, { status: 302, headers });
}

async function hvkCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = (status: string) => zurueckZuHvk(req, "postfach", status);
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

async function versandCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = (status: string) => zurueckZuHvk(req, "versand", status);
  const session = await getCurrentSession();
  const userId = userFromVersandState(url.searchParams.get("state") ?? "");
  if (!session || session.role !== "ADMIN" || !userId || session.userId !== userId) return back("fehler");
  if (url.searchParams.get("error")) return back(url.searchParams.get("error")!.includes("consent") ? "freigabe" : "abgelehnt");
  const code = url.searchParams.get("code");
  if (!code) return back("fehler");
  try {
    await versandExchange(code, userId);
    return back("verbunden");
  } catch (err) {
    console.error("[ppl-versand callback]", err);
    const msg = err instanceof Error ? err.message : "";
    return back(msg.includes("Mail.Send") ? "recht" : "fehler");
  }
}
