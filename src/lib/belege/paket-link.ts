// Download-Link für ein Belegpaket (Ole, 24.11.2026: Link statt vieler Mails ans Steuerbüro). Signiert mit AUTH_SECRET
// (HMAC über Paket-ID und Ablauf), ohne Login abrufbar unter /belege/paket/<id>?e=<ablauf>&t=<signatur>. Reine Funktionen,
// getestet; Ausliefern: app/belege/paket/[id]/route.ts.
import crypto from "node:crypto";

export const PAKET_LINK_TAGE = 30;

const signatur = (id: string, ablauf: number, secret: string) =>
  crypto.createHmac("sha256", secret).update(`belege-paket:${id}:${ablauf}`).digest("base64url").slice(0, 43);

/** Pfad samt Signatur; ablauf in Sekunden seit 1970. */
export function paketPfad(id: string, ablauf: number, secret = process.env.AUTH_SECRET ?? ""): string {
  if (secret.length < 16) throw new Error("AUTH_SECRET fehlt für Download-Links.");
  return `/belege/paket/${encodeURIComponent(id)}?e=${ablauf}&t=${signatur(id, ablauf, secret)}`;
}

/** Ablauf für einen neuen Link. */
export function paketAblauf(now = new Date(), tage = PAKET_LINK_TAGE): number {
  return Math.floor(now.getTime() / 1000) + tage * 86_400;
}

/** Gültig, wenn die Signatur stimmt und der Link nicht abgelaufen ist. Vergleich in konstanter Zeit. */
export function paketLinkGueltig(id: string, e: string | null, t: string | null, now = new Date(), secret = process.env.AUTH_SECRET ?? ""): boolean {
  if (!e || !t || secret.length < 16 || !/^\d{9,11}$/.test(e)) return false;
  const ablauf = Number(e);
  if (ablauf * 1000 < now.getTime()) return false;
  const soll = Buffer.from(signatur(id, ablauf, secret));
  const ist = Buffer.from(t);
  return soll.length === ist.length && crypto.timingSafeEqual(soll, ist);
}
