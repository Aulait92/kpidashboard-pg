// Terminlink in Bestandskampagnen (Paket 2, 20.11.2026): persönlicher Link auf die Buchungsseite des Vermittlers
// (/book/<slug>). Die Zuordnung zur Kampagne läuft über einen signierten Parameter bk = Empfänger-ID + HMAC
// (AUTH_SECRET), ohne Schemaänderung und ohne Daten des Kunden in der Adresse. Ohne Buchungslink entfällt der Satz.
// Rein bis auf die Adressbasis, getestet (tests/unit/bestand-texte.test.ts).

import crypto from "node:crypto";
import { bookingPageUrl, publicUrlOr } from "@/lib/public-url";

const secret = () => process.env.AUTH_SECRET ?? "dev-secret";
const sig = (id: string) => crypto.createHmac("sha256", secret()).update(`bestand-termin:${id}`).digest("base64url").slice(0, 22);

/** Signierter Wert für den Parameter bk (Empfänger einer Kampagne). */
export function terminToken(recipientId: string): string {
  return `${recipientId}.${sig(recipientId)}`;
}

/** bk prüfen: Empfänger-ID oder null bei falscher Form bzw. Signatur. */
export function pruefeTerminToken(token: string | null | undefined): string | null {
  const m = /^([A-Za-z0-9_-]{8,40})\.([A-Za-z0-9_-]{22})$/.exec(token ?? "");
  if (!m) return null;
  const a = Buffer.from(sig(m[1]));
  const b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

/**
 * Terminlink für eine Nachricht. Ohne Buchungsseite (Kalender nicht verbunden) null: Dann entfällt der Satz und die
 * Nachricht endet mit „einfach mit Ja antworten“. Ohne Empfänger (Vorschau) der Link ohne Zuordnung.
 */
export function terminlinkFuer(slug: string | null | undefined, recipientId?: string | null): string | null {
  if (!slug) return null;
  // Ohne eingerichtete Adresse (lokal) wie die anderen Kundenlinks über die App-Adresse
  const base = bookingPageUrl(slug) ?? publicUrlOr(`/book/${slug}`);
  return recipientId ? `${base}?bk=${terminToken(recipientId)}` : base;
}
