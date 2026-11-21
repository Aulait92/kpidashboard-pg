// Gemeinsame Logik der OAuth-Routen (Google/Microsoft): Admin-Prüfung,
// Weiterleitung zur Zustimmung, Callback mit Rückleitung in die Inbox.

import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCalendarKey } from "@/lib/calendar/tokens";
import { neuPfadAusReferer, neuRuecksprungCookie, ruecksprungZiel } from "@/lib/admin-neu/ruecksprung";

/** Rolle im Team (Agentur-Kalender verbindet nur der Inhaber). */
async function teamRoleOf(userId: string): Promise<"owner" | "advisor"> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { teamRole: true } });
  return u?.teamRole === "advisor" ? "advisor" : "owner";
}

/** Öffentliche Origin (hinter dem Railway-Proxy liefert req.url teils localhost). */
export function publicOrigin(req: Request): string {
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

// Wohin nach dem Verbinden zurück (Kundenbereich): per kurzlebigem Cookie,
// weil „state“ schon die Kalender-Zuordnung trägt. Nur feste Ziele erlaubt.
const BACK_COOKIE = "pg_cal_back";
const BACK_TARGETS: Record<string, string> = { kalender: "/buyer/kalender", einrichtung: "/buyer/einrichtung" };
/** Admins: Vertriebskalender der Buchungsseite /termin (lib/vertrieb/buchung.ts). Kam der Start aus dem neuen Admin
 *  (/admin/neu/…), geht der Rücksprung auf genau diese Seite (lib/admin-neu/ruecksprung.ts). */
const ADMIN_BACK_TARGETS: Record<string, string> = { buchungsseite: "/admin/neu/vertrieb/termine" };

function cookieValue(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
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
  // ?fuer=mich → eigener Kalender des Logins (Team: jeder Berater seinen).
  const own = new URL(req.url).searchParams.get("fuer") === "mich";
  let customerId: string;
  if (session.role === "BUYER") {
    if (!own && (await teamRoleOf(session.userId)) === "advisor") {
      return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
    }
    customerId = own ? userCalendarKey(session.userId) : session.customerId!;
  } else {
    customerId = new URL(req.url).searchParams.get("customerId") ?? "";
  }
  if (!customerId) return Response.json({ error: "customerId fehlt." }, { status: 400 });
  try {
    const back = new URL(req.url).searchParams.get("zurueck");
    const headers = new Headers({ Location: authUrl(customerId) });
    if (back && (session.role === "ADMIN" ? ADMIN_BACK_TARGETS : BACK_TARGETS)[back]) {
      headers.append("Set-Cookie", `${BACK_COOKIE}=${back}; Path=/api; Max-Age=900; HttpOnly; Secure; SameSite=Lax`);
    }
    if (session.role === "ADMIN") headers.append("Set-Cookie", neuRuecksprungCookie(neuPfadAusReferer(req.headers.get("referer"))));
    return new Response(null, { status: 302, headers });
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
  // Kunden dürfen nur ihr eigenes Konto verbinden: den Agentur-Kalender
  // (nur Inhaber) oder den eigenen Kalender des Logins.
  const ownKey = isBuyer ? userCalendarKey(session.userId) : null;
  if (isBuyer && customerId !== ownKey && (customerId !== session.customerId || (await teamRoleOf(session.userId)) === "advisor")) {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  const wanted = (isBuyer ? BACK_TARGETS : ADMIN_BACK_TARGETS)[cookieValue(req, BACK_COOKIE) ?? ""];
  const back = (status: string) => {
    const dest = new URL(
      isBuyer
        ? (wanted ?? (customerId === ownKey ? "/buyer/kalender" : "/buyer/einrichtung"))
        : ruecksprungZiel(wanted ?? "/admin/neu/leads/chats", req.headers.get("cookie")),
      publicOrigin(req),
    );
    dest.searchParams.set("gcal", status);
    const headers = new Headers({ Location: dest.toString() });
    headers.append("Set-Cookie", `${BACK_COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    if (!isBuyer) headers.append("Set-Cookie", neuRuecksprungCookie(null));
    return new Response(null, { status: 302, headers });
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
