// Einstellungen der eigenen Funnels aus der Umgebung (nur Server).
import { PROVIDER } from "@/lib/legal-texts";

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

/**
 * Adresse für Widerruf und Datenschutz im Funnel (Einwilligung, Partnerliste, E-Mail „Dein Experte“).
 * FUNNEL_DATENSCHUTZ_EMAIL, sonst die Adresse des Anbieters (PROVIDER.email). Eine eigene Adresse für pkv-tarife.com
 * gibt es noch nicht (20.11.2026).
 */
export function funnelDatenschutzEmail(env: Record<string, string | undefined> = process.env): string {
  const v = env.FUNNEL_DATENSCHUTZ_EMAIL?.trim();
  return v && EMAIL_RE.test(v) ? v : PROVIDER.email;
}

/** E-Mail „Dein Experte“ an den Lead nach dem Absenden (L9). Standard an; FUNNEL_EXPERTE_MAIL=0 schaltet sie ab. */
export function experteMailAn(env: Record<string, string | undefined> = process.env): boolean {
  return !["0", "false", "aus", "off"].includes((env.FUNNEL_EXPERTE_MAIL ?? "").trim().toLowerCase());
}
