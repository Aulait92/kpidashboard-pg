// Rücksprung nach einer Anmeldung bei einem Fremddienst (Google/Microsoft-Kalender, LinkedIn, Bank, 360dialog)
// in den neuen Admin. Der Start merkt sich die Seite, von der er kam (Referer /admin/neu/…), für 15 Minuten in einem
// Cookie; der Rücksprung führt dann dorthin statt auf die alte Seite. Ohne Cookie bleibt alles wie bisher.
// Nur Pfade unter /admin/neu (ohne Anfrageteil) sind erlaubt, damit der Rücksprung nirgendwo sonst hinführen kann.
// Reine Funktionen ohne Next-Importe: nutzbar in Route Handlern und Server Actions.

export const NEU_RUECKSPRUNG_COOKIE = "pg_neu_back";

const PFAD = /^\/admin\/neu(?:\/[A-Za-z0-9_-]+)*$/;
const ATTRIBUTE = "Path=/api; HttpOnly; Secure; SameSite=Lax";
export const NEU_RUECKSPRUNG_MAX_AGE = 900;

/** Seite des neuen Admins, von der eine Anfrage kam (Referer), sonst null. */
export function neuPfadAusReferer(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    const p = new URL(referer).pathname;
    return PFAD.test(p) ? p : null;
  } catch {
    return null;
  }
}

/** Set-Cookie-Wert beim Start: Seite merken (aus dem neuen Admin) oder alten Rest löschen (aus dem alten Admin). */
export function neuRuecksprungCookie(pfad: string | null): string {
  return pfad
    ? `${NEU_RUECKSPRUNG_COOKIE}=${encodeURIComponent(pfad)}; ${ATTRIBUTE}; Max-Age=${NEU_RUECKSPRUNG_MAX_AGE}`
    : `${NEU_RUECKSPRUNG_COOKIE}=; ${ATTRIBUTE}; Max-Age=0`;
}

/** Gemerkte Seite aus dem Cookie-Header (nur gültige /admin/neu-Pfade). */
export function neuRuecksprungAusCookie(cookieHeader: string | null | undefined): string | null {
  for (const part of (cookieHeader ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i <= 0 || part.slice(0, i) !== NEU_RUECKSPRUNG_COOKIE) continue;
    try {
      const p = decodeURIComponent(part.slice(i + 1));
      return PFAD.test(p) ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Ziel des Rücksprungs: `alt` (z. B. „/admin/einstellungen/bank?verbunden=1“) oder, wenn der Start aus dem neuen
 * Admin kam, die gemerkte Seite mit demselben Anfrageteil und Anker.
 */
export function ruecksprungZiel(alt: string, cookieHeader: string | null | undefined): string {
  const neu = neuRuecksprungAusCookie(cookieHeader);
  if (!neu) return alt;
  return neu + (/^[^?#]*(.*)$/.exec(alt)?.[1] ?? "");
}
