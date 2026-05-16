import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "kpi_session";

// Pfade, die ohne Login erreichbar bleiben müssen.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth", // login/logout server actions tunneln über server actions, hier sind direkte API-Routen nur Logout
  "/api/sync", // cron-job.org braucht Zugriff (per Token gesichert)
  "/api/push", // service worker registriert Subscriptions
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

  return NextResponse.next();
}

export const config = {
  // _next, statische Assets und Favicon ausnehmen.
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico).*)"],
};
