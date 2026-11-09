// Gemeinsame Logik der OAuth-Routen (Google/Microsoft): Admin-Prüfung,
// Weiterleitung zur Zustimmung, Callback mit Rückleitung in die Inbox.

import { getCurrentSession } from "@/lib/auth";

/** Öffentliche Origin (hinter dem Railway-Proxy liefert req.url teils localhost). */
function publicOrigin(req: Request): string {
  const fromEnv = process.env.APP_URL ?? process.env.GOOGLE_REDIRECT_URI;
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* Fallback unten */
    }
  }
  return new URL(req.url).origin;
}

export async function connectRoute(
  req: Request,
  authUrl: (customerId: string) => string,
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || (session.role !== "ADMIN" && !(session.role === "BUYER" && session.customerId))) {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  // Kunden verbinden nur ihren eigenen Kalender (Einrichtung im Kundenbereich).
  const customerId =
    session.role === "BUYER" ? session.customerId! : (new URL(req.url).searchParams.get("customerId") ?? "");
  if (!customerId) return Response.json({ error: "customerId fehlt." }, { status: 400 });
  try {
    return Response.redirect(authUrl(customerId), 302);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Fehler" },
      { status: 500 },
    );
  }
}

export async function callbackRoute(
  req: Request,
  exchange: (code: string, customerId: string) => Promise<void>,
  label: string,
): Promise<Response> {
  const session = await getCurrentSession();
  const isBuyer = session?.role === "BUYER" && !!session.customerId;
  if (!session || (session.role !== "ADMIN" && !isBuyer)) {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const customerId = url.searchParams.get("state"); // state = customerId
  const oauthError = url.searchParams.get("error");
  // Kunden dürfen nur ihr eigenes Konto verbinden.
  if (isBuyer && customerId !== session.customerId) {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  const back = (status: string) => {
    const dest = new URL(isBuyer ? "/buyer/einrichtung" : "/admin/whatsapp", publicOrigin(req));
    dest.searchParams.set("gcal", status);
    return Response.redirect(dest.toString(), 302);
  };
  if (oauthError) {
    // z. B. Microsoft „admin consent required" bei Firmen-Tenants
    console.error(`[${label} callback]`, oauthError, url.searchParams.get("error_description"));
    return back(oauthError.includes("consent") ? "consent" : "denied");
  }
  if (!code || !customerId) return back("error");
  try {
    await exchange(code, customerId);
    return back("connected");
  } catch (err) {
    console.error(`[${label} callback]`, err);
    return back("error");
  }
}
