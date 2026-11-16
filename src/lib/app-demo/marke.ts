// Öffentliche App-Demo (/app-demo, Ole 16.11.2026): Kennzeichen „diese Anfrage ist die Demo“.
//
// Es gibt bewusst KEIN Cookie und keine Sitzung. Die Middleware schreibt GET /app-demo/… intern auf /buyer/… um und
// hängt nur dabei einen signierten Header an (HMAC mit AUTH_SECRET, kurz gültig). Kommt eine Anfrage von außen schon mit
// diesem Header an, lehnt die Middleware sie ab. Der Header verlässt den Server nie (nur Anfrage-Header, nicht Antwort).
//
// Diese Datei ist ohne Node-Importe, damit die Middleware (ggf. Edge) sie laden kann: Signieren per Web Crypto.
// Die synchrone Prüfung (Prisma-Weiche) liegt in ./marke-pruefen.ts (node:crypto, gleiches Verfahren).

export const APP_DEMO_HEADER = "x-pg-app-demo";
/** Öffentlicher Pfad der Demo. */
export const APP_DEMO_PREFIX = "/app-demo";
/** Gültigkeit einer Signatur: eine Anfrage samt Streaming und after() dauert nie so lange. */
export const APP_DEMO_MAX_AGE_MS = 10 * 60 * 1000;

export const markeText = (ts: number) => `app-demo:v1:${ts}`;

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Wert für den Header: "<ms>.<hmac-hex>". Null ohne Geheimnis (dann gibt es keine Demo). */
export async function signiereDemoMarke(secret: string | undefined, now = Date.now()): Promise<string | null> {
  if (!secret || secret.length < 16) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(markeText(now)));
  return `${now}.${hex(sig)}`;
}
