// Weiche der öffentlichen App-Demo in der Middleware (rein, ohne Node-Importe, getestet in tests/unit/app-demo-weiche.test.ts).
//
// - Nur GET/HEAD werden zur Seite durchgereicht (intern /app-demo/… → /buyer/…), und nur für die freigegebenen Seiten.
// - Server Actions (POST mit Next-Action) beantwortet die Middleware selbst: Sie erreichen nie App-Code.
// - Alles andere: 405 bzw. Umleitung auf den Demo-Start.

import { APP_DEMO_PREFIX } from "./marke";

const ID = "[A-Za-z0-9_-]{1,64}";

/** Freigegebene Seiten (Pfad unterhalb von /buyer). Bestand, Empfehlungen, Einstellungen, Konto usw. sind NICHT dabei. */
export const DEMO_SEITEN: RegExp[] = [
  /^$/, // Heute
  /^\/kontakte$/,
  new RegExp(`^/kontakte/${ID}$`),
  /^\/kanban$/, // Pipeline
  /^\/leads$/,
  new RegExp(`^/leads/${ID}$`),
  /^\/chats$/,
  new RegExp(`^/termine/${ID}/vorbereitung$`),
  new RegExp(`^/termine/${ID}/praesentation$`),
  /^\/zahlen$/,
  /^\/wachstum$/, // gleiche Seite wie /zahlen (Navigation „Wachstum“)
];

export const DEMO_NICHT_ENTHALTEN = "nicht-in-der-demo";
export const DEMO_NICHTS_GESPEICHERT = "In der Demo wird nichts gespeichert.";

export type DemoEntscheidung =
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; location: string }
  | { kind: "action" }
  | { kind: "method" };

export function istDemoPfad(pathname: string): boolean {
  return pathname === APP_DEMO_PREFIX || pathname.startsWith(APP_DEMO_PREFIX + "/");
}

export function demoWeiche(opts: { pathname: string; method: string; serverAction: boolean }): DemoEntscheidung {
  const method = opts.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return opts.serverAction && method === "POST" ? { kind: "action" } : { kind: "method" };
  let rest = opts.pathname.slice(APP_DEMO_PREFIX.length);
  if (rest.endsWith("/")) rest = rest.replace(/\/+$/, "");
  if (!DEMO_SEITEN.some((re) => re.test(rest))) return { kind: "redirect", location: `${APP_DEMO_PREFIX}?hinweis=${DEMO_NICHT_ENTHALTEN}` };
  return { kind: "rewrite", pathname: `/buyer${rest}` };
}

/** /buyer/… → /app-demo/… (Links der echten Seiten, die in der Demo angeklickt werden). */
export function buyerZuDemo(pathname: string): string | null {
  if (pathname !== "/buyer" && !pathname.startsWith("/buyer/")) return null;
  return APP_DEMO_PREFIX + pathname.slice("/buyer".length);
}

/** Pfad im Browser (/app-demo/…) wie /buyer/… lesen, damit die Navigation den aktiven Bereich erkennt. */
export function demoPfadAlsBuyer(pathname: string): string {
  return istDemoPfad(pathname) ? "/buyer" + pathname.slice(APP_DEMO_PREFIX.length).replace(/\/+$/, "") : pathname;
}

/** Kam die Anfrage von einer Demo-Seite (gleicher Host, Referer-Pfad /app-demo…)? */
export function vonDemoSeite(referer: string | null, host: string | null): boolean {
  if (!referer || !host) return false;
  try {
    const u = new URL(referer);
    return u.host.toLowerCase() === host.toLowerCase() && istDemoPfad(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Antwort auf eine Server Action aus der Demo: gültige RSC-Antwort mit dem Ergebnis { ok: false, error }, wie es die
 * Actions selbst bei „nicht erlaubt“ liefern. Die Oberfläche zeigt den Hinweis an; es wird nichts ausgeführt.
 */
export function demoActionAntwort(): { body: string; headers: Record<string, string> } {
  const ergebnis = { ok: false, error: DEMO_NICHTS_GESPEICHERT };
  return {
    body: `0:${JSON.stringify({ a: ergebnis })}\n`,
    headers: { "content-type": "text/x-component", "cache-control": "no-store" },
  };
}

/** Rate-Limit je IP: großzügig fürs Klicken (Next lädt sichtbare Links vorab, eine Kontaktliste sind schnell 30 Abrufe), eng gegen Abgrasen. */
export const DEMO_LIMIT = { limit: 600, windowMs: 60_000 };
