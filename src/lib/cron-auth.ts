// Token-Prüfung für Cron-/Sync-Aufrufe (cron-job.org, Railway-Cron, Skripte).
//
// Bevorzugt per Header:  Authorization: Bearer <token>   oder   x-cron-token: <token>
// Übergang: ?token=<token> in der URL geht weiter, wird aber (gedrosselt) als
// Warnung geloggt – Tokens in URLs landen leicht in Logs/Verläufen. Abschalten
// mit Env CRON_TOKEN_IN_QUERY=off, sobald alle Cronjobs umgestellt sind
// (Anleitung: docs/sicherheit-cron.md).

import { createHash, timingSafeEqual } from "node:crypto";

function sameSecret(a: string, b: string): boolean {
  // Hash vorher → gleiche Länge, Vergleich in konstanter Zeit
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const lastWarn = new Map<string, number>();
const WARN_EVERY_MS = 60 * 60_000;

function warnQueryToken(label: string) {
  const now = Date.now();
  if (now - (lastWarn.get(label) ?? 0) < WARN_EVERY_MS) return;
  lastWarn.set(label, now);
  console.warn(
    `[cron-auth] ${label}: Token kam als ?token= in der URL. Bitte auf Header „Authorization: Bearer …“ umstellen (docs/sicherheit-cron.md).`,
  );
}

export function queryTokenAllowed(): boolean {
  return (process.env.CRON_TOKEN_IN_QUERY ?? "").toLowerCase() !== "off";
}

/** Liest das Token aus Header (bevorzugt) oder – im Übergang – aus der URL. */
export function providedCronToken(req: Request, opts: { label: string; legacyHeaders?: string[] }): string | null {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;
  for (const h of ["x-cron-token", ...(opts.legacyHeaders ?? [])]) {
    const v = req.headers.get(h)?.trim();
    if (v) return v;
  }
  const q = new URL(req.url).searchParams.get("token");
  if (q && queryTokenAllowed()) {
    warnQueryToken(opts.label);
    return q;
  }
  return null;
}

/** true, wenn das mitgeschickte Token zum erwarteten Geheimnis passt. */
export function isCronAuthorized(
  req: Request,
  expected: string | undefined,
  opts: { label: string; legacyHeaders?: string[] },
): boolean {
  if (!expected) return false;
  const provided = providedCronToken(req, opts);
  return !!provided && sameSecret(provided, expected);
}
