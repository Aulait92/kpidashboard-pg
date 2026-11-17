import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_CARD_COOKIE, LOGIN_CARD_HEADER, nextCardCounter, parseCardCounter } from "@/lib/login-karten";
import { ADMIN_NEU_COOKIE, istAn, neuStartFuer } from "@/lib/admin-neu/schalter";
import { pushWeiche } from "@/lib/admin-neu/push-ziel";
import { PUBLIC_NOT_FOUND_HTML, PUBLIC_ROBOTS_TXT, decidePublicHost, requestHost } from "@/lib/public-booking-host";
import { APP_DEMO_HEADER, signiereDemoMarke } from "@/lib/app-demo/marke";
import { DEMO_LIMIT, buyerZuDemo, demoActionAntwort, demoWeiche, istDemoPfad, vonDemoSeite } from "@/lib/app-demo/weiche";
import { demoDatenbankUrl } from "@/lib/app-demo/konfig";
import { clientIp, hit } from "@/lib/rate-limit";

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
  "/rechner", // Break-even-Rechner für Interessenten (öffentlich, keine personenbezogenen Daten)
  "/videos", // Einführungsvideos (nur Demo-Daten); sonst leitet die Rollenweiche Kunden auf /buyer um
  "/sicherheit", // Sicherheit & Datenschutz (öffentlich)
  "/microsoft-freigabe", // Rücksprung nach der Microsoft-Admin-Freigabe durch die IT des Kunden
  "/status", // Statusseite (öffentlich, ohne interne Details)
  "/empfehlen", // „Kollegen empfehlen“: Landingpage je Empfehlungscode (Formular mit Einwilligung)
  "/empfehlung", // Empfehlungsseite + Google-Link (geheimer Token je Kontakt, Modul Empfehlungen & Bewertungen)
  "/abmelden", // Abmeldelink in Kampagnen-Mails (signierter Token, ein Klick ohne Login)
  "/api/abmelden", // List-Unsubscribe One-Click (POST, signierter Token)
  "/einwilligung", // Einwilligungs-Abfrage für Bestandskunden mit Double-Opt-in (signierter Token)
  "/email-bestaetigen", // Bestätigung einer neuen Login-E-Mail (Token aus der Mail, lib/email-aendern.ts)
  "/erstinformation", // Erstinformation des Vermittlers (§ 15 VersVermV), Link in der ersten WhatsApp-Nachricht (Token)
  "/datenschutz", // Datenschutzhinweis zu Unterlagen per WhatsApp (Langfassung der Einwilligung, Token der Erstinformation)
  "/demo", // Live-Demo der Beratungspräsentation (feste Beispieldaten, keine Datenbank)
  "/termin", // Vertriebs-Buchungsseite (eingebettet auf performancegrowth.de/termin), verwalten per Token
  "/praesentation", // Vertriebspräsentation für Interessenten (geheimer Link je Kontakt, 14 Tage)
  "/beratung", // Beratungspräsentation zum Nachlesen für den Kunden des Vermittlers (geheimer Link, 14 Tage)
  "/api/login-info", // Bilder und Klick-Zählung der Infokarten auf der Login-Seite (öffentlich, keine Personendaten)
  "/login-karten", // Bilder der Infokarten auf der Login-Seite (public/login-karten)
  "/api/ops", // Betriebs-API (Buyer-Accounts anlegen), per ADMIN_API_TOKEN (Bearer) gesichert
  "/api/health", // Healthcheck für Railway/Uptime (gibt nur ok true/false zurück)
  "/api/status", // Überwachung (DB + Hintergrund-Jobs), Details nur mit Token
  "/api/stripe/webhook", // Stripe-Webhooks (per Signatur geprüft)
  "/api/resend/webhook", // Resend-Webhooks: Zustellstatus von E-Mails (per Signatur geprüft)
  "/api/meta/leadgen", // Meta-Webhook Lead Ads (Signatur mit META_APP_SECRET)
  "/api/leads/eingang", // Lead-Webhook (Zapier o. ä., per LEAD_WEBHOOK_TOKEN)
  "/api/leads/pool", // Pay-per-Lead-Eingang (Perspective/Funnels, per LEAD_WEBHOOK_TOKEN)
  "/feedback", // Kunden-Feedback per Mail-Link (geheimer Token, ohne Login)
  "/api/vertrieb", // Vertriebs-Webhooks (Instantly, Calendly, Leads, LinkedIn) – per Token gesichert
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
  "/sw.js",
  "/favicon.ico",
  "/api/csp-report", // CSP-Verstöße vom Browser (auch ohne Login)
  "/monitoring", // Sentry-Tunnel (Fehler-Reports vom Login-Screen ebenfalls erfassen)
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

/**
 * Alte Adressen (z. B. kpi.… nach dem Umzug auf app.…): Seitenaufrufe per 308
 * auf APP_URL umleiten. Webhooks/API (/api/…) laufen ohne Umleitung weiter,
 * bis sie bei den Diensten umgestellt sind. LEGACY_HOSTS = "kpi.example.de,…"
 */
function legacyRedirect(req: NextRequest): NextResponse | null {
  const legacy = (process.env.LEGACY_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const appUrl = process.env.APP_URL;
  if (!legacy.length || !appUrl) return null;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  if (!legacy.includes(host) || req.nextUrl.pathname.startsWith("/api/")) return null;
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  try {
    const target = new URL(req.nextUrl.pathname + req.nextUrl.search, appUrl);
    if (target.host.toLowerCase() === host) return null;
    return NextResponse.redirect(target, 308);
  } catch {
    return null;
  }
}

/** Seiten der Endkunden: Kennzeichen für das Layout (ohne performancegrowth-Kopfzeile, Fußzeile des Vermittlers). */
function leadHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  headers.set("x-bare-layout", "lead");
  return headers;
}

const NO_INDEX = "noindex, nofollow";

/**
 * Eigene Buchungsadresse (PUBLIC_BOOKING_URL, Ole 15.11.2026): dort nur die Seiten der Endkunden,
 * alles andere 404; www ↔ ohne www und alte App-Links per 308 auf die Buchungsadresse.
 * Regeln: src/lib/public-booking-host.ts (getestet in tests/unit/public-booking-host.test.ts).
 */
function bookingHost(req: NextRequest): NextResponse | null {
  const d = decidePublicHost({
    host: requestHost(req.headers),
    pathname: req.nextUrl.pathname,
    search: req.nextUrl.search,
    method: req.method,
    bookingUrl: process.env.PUBLIC_BOOKING_URL,
    hasSession: req.cookies.has(SESSION_COOKIE),
  });
  switch (d.kind) {
    case "pass":
      return null;
    case "redirect":
      return NextResponse.redirect(d.location, 308);
    case "robots":
      return new NextResponse(PUBLIC_ROBOTS_TXT, { headers: { "content-type": "text/plain; charset=utf-8", "X-Robots-Tag": NO_INDEX } });
    case "not_found":
      return new NextResponse(PUBLIC_NOT_FOUND_HTML, { status: 404, headers: { "content-type": "text/html; charset=utf-8", "X-Robots-Tag": NO_INDEX } });
    case "rewrite": {
      const url = req.nextUrl.clone();
      url.pathname = d.pathname;
      const res = NextResponse.rewrite(url, { request: { headers: leadHeaders(req) } });
      res.headers.set("X-Robots-Tag", NO_INDEX);
      return res;
    }
    case "serve": {
      const res = NextResponse.next({ request: { headers: leadHeaders(req) } });
      res.headers.set("X-Robots-Tag", NO_INDEX);
      return res;
    }
  }
}

const DEMO_NICHT_VERFUEGBAR_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Demo gerade nicht verfügbar</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;color:#0f172a"><h1 style="font-size:1.4rem">Die Demo ist gerade nicht verfügbar.</h1><p>Bitte versuchen Sie es in ein paar Minuten noch einmal.</p><p><a href="/demo/beratung" style="color:#2563eb">Zur Live-Demo der Beratungspräsentation</a></p></body></html>`;

/**
 * Öffentliche App-Demo (/app-demo, Ole 16.11.2026, src/lib/app-demo): die echten Seiten des Kundenbereichs mit dem
 * Demo-Kunden aus der eigenen Demo-Datenbank, nur lesend. Kein Cookie, keine Sitzung: Die Anfrage wird intern auf
 * /buyer/… umgeschrieben, ohne Cookies des Browsers, mit signiertem Kennzeichen. Server Actions beantwortet diese
 * Funktion selbst (sie erreichen keinen App-Code), andere Methoden 405, Rate-Limit je IP.
 */
async function appDemo(req: NextRequest): Promise<NextResponse> {
  const noindex = (res: NextResponse) => {
    res.headers.set("X-Robots-Tag", NO_INDEX);
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
  if (!hit("appDemo", clientIp(req.headers), DEMO_LIMIT).ok) {
    return noindex(new NextResponse("Zu viele Anfragen in kurzer Zeit. Bitte einen Moment warten.", { status: 429, headers: { "Retry-After": "60", "content-type": "text/plain; charset=utf-8" } }));
  }
  const d = demoWeiche({ pathname: req.nextUrl.pathname, method: req.method, serverAction: req.headers.has("next-action") });
  if (d.kind === "action") {
    const a = demoActionAntwort();
    return noindex(new NextResponse(a.body, { status: 200, headers: a.headers }));
  }
  if (d.kind === "method") return noindex(new NextResponse("In der Demo wird nichts gespeichert.", { status: 405, headers: { Allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" } }));
  if (d.kind === "redirect") {
    const url = req.nextUrl.clone();
    const [p, q] = d.location.split("?");
    url.pathname = p;
    url.search = q ? `?${q}` : "";
    return noindex(NextResponse.redirect(url, 307));
  }
  const marke = demoDatenbankUrl(process.env) ? await signiereDemoMarke(process.env.AUTH_SECRET) : null;
  if (!marke) return noindex(new NextResponse(DEMO_NICHT_VERFUEGBAR_HTML, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "Retry-After": "300" } }));
  const headers = new Headers(req.headers);
  // Kein Login in der Demo: Cookies und Anmeldedaten des Browsers erreichen die Seite nie
  headers.delete("cookie");
  headers.delete("authorization");
  headers.set(APP_DEMO_HEADER, marke);
  headers.set("x-app-area", "buyer");
  const url = req.nextUrl.clone();
  url.pathname = d.pathname;
  return noindex(NextResponse.rewrite(url, { request: { headers } }));
}

export async function middleware(req: NextRequest) {
  // App-Demo-Kennzeichen setzt nur die Middleware selbst (beim Umschreiben). Kommt es von außen, ist es gefälscht.
  if (req.headers.has(APP_DEMO_HEADER)) return new NextResponse("Bad Request", { status: 400, headers: { "X-Robots-Tag": NO_INDEX } });
  const moved = legacyRedirect(req);
  if (moved) return moved;
  const booking = bookingHost(req);
  if (booking) return booking;
  const { pathname } = req.nextUrl;
  if (istDemoPfad(pathname)) return appDemo(req);
  // Aus der Demo heraus keine API (Downloads, Suche, Nutzungsmessung …): die Demo hat keine Sitzung und schreibt nichts
  if (pathname.startsWith("/api/") && vonDemoSeite(req.headers.get("referer"), requestHost(req.headers))) {
    return NextResponse.json({ error: "In der Demo nicht verfügbar." }, { status: 403, headers: { "X-Robots-Tag": NO_INDEX } });
  }
  // Link einer echten Seite, in der Demo angeklickt (/buyer/… ohne Login, kommt von /app-demo): zurück in die Demo
  const demoZiel = buyerZuDemo(pathname);
  if (demoZiel && !req.cookies.has(SESSION_COOKIE) && vonDemoSeite(req.headers.get("referer"), requestHost(req.headers))) {
    const url = req.nextUrl.clone();
    url.pathname = demoZiel;
    return NextResponse.redirect(url, 307);
  }
  // Seiten für Endkunden der Vermittler (Terminbuchung, Empfehlung): ohne performancegrowth-Kopfzeile
  // und mit neutralem Footer – die Seite gehört dem Vermittler (Ole, 14.11.2026).
  if (
    pathname === "/book" ||
    pathname.startsWith("/book/") ||
    pathname.startsWith("/empfehlung/") ||
    pathname.startsWith("/abmelden/") ||
    pathname.startsWith("/einwilligung/") ||
    pathname.startsWith("/erstinformation/") ||
    pathname.startsWith("/datenschutz/") ||
    pathname.startsWith("/beratung/") ||
    pathname === "/demo" ||
    pathname.startsWith("/demo/")
  ) {
    const res = NextResponse.next({ request: { headers: leadHeaders(req) } });
    res.headers.set("X-Robots-Tag", NO_INDEX);
    return res;
  }
  // Vertriebs-Buchungsseite: eigene Marke ohne App-Kopfzeile; eingebettet (?einbetten=1) auch ohne Fußzeile
  if (pathname === "/termin" || pathname.startsWith("/termin/")) {
    const headers = new Headers(req.headers);
    headers.set("x-bare-layout", req.nextUrl.searchParams.get("einbetten") === "1" ? "lead" : "1");
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("X-Robots-Tag", NO_INDEX);
    return res;
  }
  // Vertriebspräsentation für Interessenten (unser eigenes Material): ohne App-Kopfzeile, nicht indexieren
  if (pathname.startsWith("/praesentation/")) {
    const headers = new Headers(req.headers);
    headers.set("x-bare-layout", "1");
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("X-Robots-Tag", NO_INDEX);
    return res;
  }
  // Lead-Seiten ohne Dashboard-Header rendern (SiteHeader liest das Flag).
  if (
    pathname.startsWith("/angebot/") ||
    pathname.startsWith("/rechtliches/") ||
    pathname === "/rechner" ||
    pathname === "/sicherheit" ||
    pathname === "/microsoft-freigabe" ||
    pathname === "/status" ||
    pathname.startsWith("/empfehlen/") ||
    pathname.startsWith("/feedback/")
  ) {
    const headers = new Headers(req.headers);
    headers.set("x-bare-layout", "1");
    return NextResponse.next({ request: { headers } });
  }
  // Login: eigene Seite mit Logo und Footer (ohne Kopfzeile und globalen Footer).
  if (pathname === "/login") {
    const headers = new Headers(req.headers);
    headers.set("x-bare-layout", "login");
    // Infokarten: bei jedem Seitenaufruf die nächste Karte (Zähler im Cookie, ohne Cookie zufällig).
    // Nicht beim Absenden (Server Action = POST), beim Vorabladen oder nach Klick auf eine Karte (?karte=).
    const saved = req.cookies.get(LOGIN_CARD_COOKIE)?.value;
    const dest = req.headers.get("sec-fetch-dest");
    const advance =
      req.method === "GET" &&
      !req.headers.get("next-router-prefetch") &&
      (!dest || dest === "document" || dest === "empty") &&
      !req.nextUrl.searchParams.has("karte");
    const counter = advance ? nextCardCounter(saved) : (parseCardCounter(saved) ?? 0);
    headers.set(LOGIN_CARD_HEADER, String(counter));
    const res = NextResponse.next({ request: { headers } });
    if (advance) {
      res.cookies.set(LOGIN_CARD_COOKIE, String(counter), {
        path: "/login",
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return res;
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

  // Neuer Admin (/admin/neu, src/lib/admin-neu): eigene Shell aus src/app/admin/neu/layout.tsx. Kennzeichen wie beim
  // Kundenbereich, damit SiteHeader die alte Admin-Shell dort nicht zusätzlich rendert. Mit eingeschaltetem
  // Schalter „Neue Oberfläche“ (Cookie je Admin) führen /admin und /admin/heute auf den neuen Start.
  if (role === "ADMIN") {
    if (pathname === "/admin/neu" || pathname.startsWith("/admin/neu/")) {
      const headers = new Headers(req.headers);
      headers.set("x-app-area", "admin-neu");
      return NextResponse.next({ request: { headers } });
    }
    // Push an alle Admins (?von=push, lib/admin-neu/push-ziel.ts): neue Seite bei eingeschaltetem Schalter, sonst die alte
    const pushZiel =
      req.method === "GET" || req.method === "HEAD"
        ? pushWeiche({ pathname, search: req.nextUrl.search, neueOberflaeche: istAn(req.cookies.get(ADMIN_NEU_COOKIE)?.value) })
        : null;
    if (pushZiel) {
      const url = req.nextUrl.clone();
      const [p, q] = pushZiel.split("?");
      url.pathname = p;
      url.search = q ? `?${q}` : "";
      return NextResponse.redirect(url);
    }
    if ((req.method === "GET" || req.method === "HEAD") && neuStartFuer(pathname) && istAn(req.cookies.get(ADMIN_NEU_COOKIE)?.value)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/neu";
      return NextResponse.redirect(url);
    }
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
