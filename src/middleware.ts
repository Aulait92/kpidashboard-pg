import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "kpi_session";

// Pfade, die ohne Login erreichbar bleiben müssen.
const PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth", // login/logout server actions tunneln über server actions, hier sind direkte API-Routen nur Logout
  "/api/sync", // cron-job.org braucht Zugriff (per Token gesichert)
  "/api/push", // service worker registriert Subscriptions
  "/api/telegram", // Telegram Bot webhook (Whitelist intern via TELEGRAM_ADMIN_USER_ID + Secret-Token-Header)
  "/api/whatsapp", // 360dialog-Webhook + Dev-Seed (per WHATSAPP_WEBHOOK_SECRET-Token gesichert)
  "/book", // öffentliche Terminbuchung für Leads (lesbarer Slug je Kunde)
  "/angebot", // Angebote/Auftragsbestätigungen per geheimem Link (Token)
  "/rechtliches", // AGB und Auftragsverarbeitungsvertrag (öffentlich)
  "/api/ops", // Betriebs-API (Buyer-Accounts anlegen), per ADMIN_API_TOKEN (Bearer) gesichert
  "/api/health", // Healthcheck für Railway/Uptime (gibt nur ok true/false zurück)
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
  "/sw.js",
  "/favicon.ico",
];

function isPublic(path: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"),
  );
}

function getSecret(): Uint8Array | null {
  const raw = process.env.AUTH_SECRET;
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Lead-Seiten ohne Dashboard-Header rendern (SiteHeader liest das Flag).
  if (
    pathname === "/book" ||
    pathname.startsWith("/book/") ||
    pathname.startsWith("/angebot/") ||
    pathname.startsWith("/rechtliches/")
  ) {
    const headers = new Headers(req.headers);
    headers.set("x-bare-layout", "1");
    return NextResponse.next({ request: { headers } });
  }
  if (isPublic(pathname)) return NextResponse.next();

  const secret = getSecret();
  if (!secret) {
    // Wenn der Owner noch keinen AUTH_SECRET gesetzt hat, leite zum Login
    // damit dort die Setup-Hinweise sichtbar sind. Alternativ: 500-Seite.
    if (pathname !== "/login") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  let role: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secret);
    role = payload.role as string | undefined;
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    const res = NextResponse.redirect(url);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  // Buyer dürfen nur den eigenen Bereich + Filter-/Datei-Endpunkte sehen.
  if (role === "BUYER") {
    if (
      !pathname.startsWith("/buyer") &&
      !pathname.startsWith("/api/") &&
      pathname !== "/logout"
    ) {
      const url = req.nextUrl.clone();
      url.pathname = "/buyer";
      return NextResponse.redirect(url);
    }
  }

  // Admins landen auf /, /buyer ist für sie zwar erreichbar (Preview),
  // aber /admin ist nur Admin.
  if (role !== "ADMIN" && pathname.startsWith("/admin")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Kundenbereich hat eine eigene App-Shell (BuyerShell) — globalen
  // Header/Footer dort ausblenden.
  if (pathname === "/buyer" || pathname.startsWith("/buyer/")) {
    const headers = new Headers(req.headers);
    headers.set("x-app-area", "buyer");
    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  // _next, statische Assets und Favicon ausnehmen.
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico).*)"],
};
