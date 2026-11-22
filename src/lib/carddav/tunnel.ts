// CardDAV-Methoden durch die Middleware tunneln (Adressbuch fürs iPhone, lib/carddav/dav.ts). Läuft in der
// Middleware (Edge-Laufzeit): keine Node-Module hier.
//
// Warum: Route Handler in Next.js 16 nehmen nur GET, POST, PUT, PATCH, DELETE, HEAD und OPTIONS an und beantworten
// PROPFIND/REPORT selbst mit 405 (node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md).
// API-Routen des Pages Routers kennen jede Methode, aber schon ein einziges src/pages schaltet für die ganze App die
// Typen von useSearchParams/useParams auf „kann null sein“ (next-env.d.ts: navigation-types/compat), und der Build
// bricht an vielen Stellen ab. Deshalb: Die Middleware nimmt PROPFIND, REPORT usw. an und schickt sie als POST mit
// dem Kopf `x-carddav-methode` an den eigenen Route Handler (gleicher Server, 127.0.0.1:PORT), dessen Antwort sie
// unverändert zurückgibt. GET, HEAD, OPTIONS, PUT, DELETE erreichen den Route Handler direkt.

export const CARDDAV_PFAD = "/api/carddav";
export const METHODE_HEADER = "x-carddav-methode";

/** Methoden, die der Route Handler selbst bekommt (alles andere wird getunnelt). */
const DIREKT = new Set(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]);

export function istCarddavPfad(pathname: string): boolean {
  return pathname === CARDDAV_PFAD || pathname.startsWith(`${CARDDAV_PFAD}/`);
}

/** Muss diese Anfrage getunnelt werden? (nur gültige HTTP-Methoden-Namen) */
export function mussTunneln(pathname: string, method: string): boolean {
  return istCarddavPfad(pathname) && !DIREKT.has(method.toUpperCase()) && /^[A-Z][A-Z-]{1,19}$/.test(method.toUpperCase());
}

/** Kopfzeilen, die nicht weitergereicht werden (Verbindung, Länge, Komprimierung, eigener Tunnel-Kopf). */
const OHNE = new Set(["host", "connection", "content-length", "transfer-encoding", "accept-encoding", "keep-alive", "upgrade", METHODE_HEADER]);

/** Anfrage an den eigenen Route Handler (POST + Methode im Kopf). */
export function tunnelAnfrage(
  req: { method: string; headers: Headers; nextUrl: { pathname: string; search: string } },
  body: string,
  port: string | undefined,
): { url: string; init: RequestInit } {
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!OHNE.has(k.toLowerCase())) headers.set(k, v);
  });
  headers.set(METHODE_HEADER, req.method.toUpperCase());
  return {
    url: `http://127.0.0.1:${port || "3000"}${req.nextUrl.pathname}${req.nextUrl.search}`,
    init: { method: "POST", headers, body, redirect: "manual", cache: "no-store" },
  };
}

/** Antwort-Kopfzeilen ohne die, die beim Weiterreichen nicht mehr stimmen. */
export function antwortHeader(h: Headers): Headers {
  const out = new Headers();
  h.forEach((v, k) => {
    if (!["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"].includes(k.toLowerCase())) out.set(k, v);
  });
  return out;
}
