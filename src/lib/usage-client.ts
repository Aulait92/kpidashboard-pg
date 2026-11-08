"use client";

// Nutzungsmessung im Browser (Seitenaufrufe, Fehler-Toasts, Feedback).
// Feuert und vergisst – blockiert nie die Oberfläche.
export function sendUsage(payload: { type: "page" | "error" | "feedback"; name?: string; path?: string; text?: string }) {
  try {
    const body = JSON.stringify({ path: typeof window !== "undefined" ? window.location.pathname : undefined, ...payload });
    if (payload.type !== "feedback" && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/usage", new Blob([body], { type: "application/json" }));
      return Promise.resolve(true);
    }
    return fetch("/api/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
      .then((r) => r.ok)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** IDs aus Pfaden entfernen, damit gleiche Seiten zusammengezählt werden. */
export function normalizePath(p: string): string {
  return p.replace(/\/buyer\/leads\/[^/?#]+/, "/buyer/leads/[id]");
}
