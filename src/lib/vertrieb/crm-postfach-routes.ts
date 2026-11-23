// Anmelde-Routen für das Postfach eines Admins (E-Mails aus der Kontaktakte, lib/vertrieb/crm-postfach.ts).
// Start: /api/admin/crm-postfach/verbinden?anbieter=microsoft|google. Rücksprung über die Callbacks von Microsoft bzw.
// Google (state „crmmail:…“) zur Seite, von der der Start kam (Kontaktakte oder Anbindungen), mit ?postfach=<stand>.

import { getCurrentSession } from "@/lib/auth";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { neuPfadAusReferer, neuRuecksprungCookie, ruecksprungZiel } from "@/lib/admin-neu/ruecksprung";
import { crmAuthUrl, crmExchange, userFromCrmState, type CrmAnbieter } from "@/lib/vertrieb/crm-postfach";

export const CRM_POSTFACH_STANDARD_ZIEL = "/admin/neu/einstellungen/anbindungen";

/** Meldung je Rücksprung-Stand (?postfach=…), für Anbindungen und Kontaktakte. */
export const CRM_POSTFACH_MELDUNG: Record<string, { ok: boolean; text: string }> = {
  verbunden: { ok: true, text: "Postfach verbunden. E-Mails aus dem Kontakt gehen jetzt über Ihr Postfach." },
  freigabe: { ok: false, text: "Microsoft verlangt eine Freigabe durch die IT. Bitte die Microsoft-Freigabe öffnen und danach erneut verbinden." },
  abgelehnt: { ok: false, text: "Anmeldung abgebrochen. Das Postfach ist nicht verbunden." },
  recht: { ok: false, text: "Bitte beim Anmelden das Senden von E-Mails erlauben." },
  fehler: { ok: false, text: "Verbinden hat nicht geklappt. Bitte noch einmal versuchen." },
};

export async function crmPostfachVerbinden(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const anbieter: CrmAnbieter = new URL(req.url).searchParams.get("anbieter") === "google" ? "google" : "microsoft";
  try {
    const headers = new Headers({ Location: crmAuthUrl(anbieter, session.userId, session.email) });
    headers.append("Set-Cookie", neuRuecksprungCookie(neuPfadAusReferer(req.headers.get("referer"))));
    return new Response(null, { status: 302, headers });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Fehler", { status: 500 });
  }
}

export async function crmPostfachCallback(req: Request, anbieter: CrmAnbieter): Promise<Response> {
  const url = new URL(req.url);
  const back = (status: string) => {
    const dest = new URL(ruecksprungZiel(`${CRM_POSTFACH_STANDARD_ZIEL}?postfach=${status}`, req.headers.get("cookie")), publicOrigin(req));
    const headers = new Headers({ Location: dest.toString() });
    headers.append("Set-Cookie", neuRuecksprungCookie(null));
    return new Response(null, { status: 302, headers });
  };
  const session = await getCurrentSession();
  const userId = userFromCrmState(url.searchParams.get("state") ?? "");
  // Nur der Admin-Login, der die Anmeldung gestartet hat
  if (!session || session.role !== "ADMIN" || !userId || session.userId !== userId) return back("fehler");
  const error = url.searchParams.get("error");
  if (error) return back(/consent|AADSTS65001|AADSTS90094/i.test(`${error} ${url.searchParams.get("error_description") ?? ""}`) ? "freigabe" : "abgelehnt");
  const code = url.searchParams.get("code");
  if (!code) return back("fehler");
  try {
    await crmExchange(anbieter, code, userId);
    return back("verbunden");
  } catch (err) {
    // Keine Tokens oder Inhalte ins Log, nur die Meldung
    console.error(`[crm-postfach ${anbieter} callback]`, err instanceof Error ? err.message.slice(0, 200) : "Fehler");
    return back(err instanceof Error && err.message.includes("erlauben") ? "recht" : "fehler");
  }
}
