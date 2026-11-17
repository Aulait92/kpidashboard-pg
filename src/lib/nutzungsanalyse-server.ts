import { createHash } from "node:crypto";

/** Pseudonym je Nutzer als Sentry-Tag (Aufnahmen nach Widerruf auffindbar und löschbar, ohne Name oder E-Mail). */
export function analysePseudonym(userId: string): string {
  return createHash("sha256").update(`pg-analyse:${userId}`).digest("hex").slice(0, 16);
}
