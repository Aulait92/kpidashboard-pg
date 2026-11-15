// Links, die Endkunden sehen (Buchungsseite, Termin verwalten, Kalenderdatei, Empfehlung, Einwilligung,
// Abmelden, Erstinformation): auf der eigenen Buchungsadresse (PUBLIC_BOOKING_URL, Ole 15.11.2026).
// Ohne die Variable bleibt alles auf der App-Adresse (getAppUrl). Links für Vermittler und Admins
// (Kundenbereich, Login, Chatverlauf) bleiben auf der App.

import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/email";
import { parseBookingUrl, publicPathFor } from "@/lib/public-booking-host";

/** Eigene Buchungsadresse (z. B. https://www.dein-beratungstermin.de) oder null, wenn nicht eingerichtet. */
export function publicBookingOrigin(): string | null {
  return parseBookingUrl(process.env.PUBLIC_BOOKING_URL)?.origin ?? null;
}

/** App-Adresse ohne Fehler: APP_URL, sonst Railway-Domain, sonst null. */
function appOriginOrNull(): string | null {
  try {
    return getAppUrl().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Basis für Endkunden-Links: Buchungsadresse, sonst App-Adresse, sonst null (lokal ohne APP_URL). */
export function publicBaseOrNull(): string | null {
  return publicBookingOrigin() ?? appOriginOrNull();
}

/**
 * Absoluter Link für Endkunden. path beginnt mit "/". Ohne PUBLIC_BOOKING_URL wie bisher über
 * getAppUrl() (wirft, wenn auch APP_URL fehlt). /book/<slug> wird auf der Buchungsadresse zum Kurzlink /<slug>.
 */
export function publicUrl(path: string): string {
  const own = publicBookingOrigin();
  if (own) return `${own}${shortPath(path)}`;
  return `${getAppUrl().replace(/\/$/, "")}${path}`;
}

/** Wie publicUrl, aber mit Rückfall statt Fehler (Tests, lokale Umgebung). */
export function publicUrlOr(path: string, fallbackBase = "https://app.performancegrowth.de"): string {
  try {
    return publicUrl(path);
  } catch {
    return `${fallbackBase.replace(/\/$/, "")}${path}`;
  }
}

/** /book/<slug>?… → /<slug>?… (nur der Pfadteil wird gekürzt). */
function shortPath(path: string): string {
  const i = path.search(/[?#]/);
  return i < 0 ? publicPathFor(path) : `${publicPathFor(path.slice(0, i))}${path.slice(i)}`;
}

/** Buchungsseite eines Kunden; lead = persönlicher Link für einen Kontakt (Vorbelegung nur mit Login). */
export function bookingPageUrl(slug: string, opts: { lead?: string | null } = {}): string | null {
  const q = opts.lead ? `?lead=${encodeURIComponent(opts.lead)}` : "";
  const path = `/book/${slug}${q}`;
  if (publicBookingOrigin()) return publicUrl(path);
  const app = appOriginOrNull();
  return app ? `${app}${path}` : null;
}

/** Link zum Verwalten (verschieben/absagen) eines Termins. */
export function manageUrlFor(token: string): string {
  const base = publicBaseOrNull();
  return `${base ?? ""}/book/manage/${token}`;
}

/** Weiterleitung auf eine Endkunden-Seite (absolute Adresse aus der Umgebung, nie aus req.url hinter Railway). */
export function publicRedirect(path: string, req: Request, status?: number): NextResponse {
  const base = publicBaseOrNull() ?? req.url;
  return NextResponse.redirect(new URL(path, base), status);
}
