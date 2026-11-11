// CSP-Berichte (Browser) in eine knappe, datensparsame Form bringen.

export type Violation = { directive: string; blocked: string; page: string };

/** Nur Schema + Host (+ Pfad bei eigener Seite), ohne Query/Fragment. */
function strip(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  if (!s) return "";
  if (!s.includes("://")) return s.slice(0, 40); // z. B. "inline", "eval", "data"
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "?";
  }
}

function pagePath(raw: unknown): string {
  try {
    // IDs/Tokens in Pfaden kürzen (/angebot/abc… → /angebot/:id)
    return new URL(String(raw)).pathname.replace(/\/[A-Za-z0-9_-]{16,}/g, "/:id").slice(0, 80);
  } catch {
    return "?";
  }
}

export function parseCspReport(body: unknown): Violation[] {
  const out: Violation[] = [];
  const push = (r: Record<string, unknown> | undefined) => {
    if (!r) return;
    out.push({
      directive: String(r["effective-directive"] ?? r["effectiveDirective"] ?? r["violated-directive"] ?? "?").split(" ")[0].slice(0, 40),
      blocked: strip(r["blocked-uri"] ?? r["blockedURL"]),
      page: pagePath(r["document-uri"] ?? r["documentURL"]),
    });
  };
  if (Array.isArray(body)) {
    // Reporting API (application/reports+json): [{ type: "csp-violation", body: {...} }]
    for (const r of body.slice(0, 20)) if (r && typeof r === "object" && (r as { type?: string }).type === "csp-violation") push((r as { body?: Record<string, unknown> }).body);
  } else if (body && typeof body === "object") {
    // Klassisch (application/csp-report): { "csp-report": {...} }
    push((body as { "csp-report"?: Record<string, unknown> })["csp-report"]);
  }
  return out;
}
