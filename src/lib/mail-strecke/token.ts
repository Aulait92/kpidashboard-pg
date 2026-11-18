// Link der Antwortseite der Mail-Strecke (Ole, 18.11.2026, E1): /t/<token>, Token = Strecken-ID + HMAC (AUTH_SECRET),
// nichts Geheimes in der Datenbank. Rein, getestet (tests/unit/mail-strecke.test.ts).

import crypto from "node:crypto";
import { publicBaseOrNull } from "@/lib/public-url";

const secret = () => process.env.AUTH_SECRET ?? "dev-secret";
const sig = (id: string) => crypto.createHmac("sha256", secret()).update(`mail-strecke:${id}`).digest("base64url").slice(0, 22);

export function streckenToken(streckeId: string): string {
  return `${streckeId}.${sig(streckeId)}`;
}

/** Token prüfen; null bei falscher Form oder Signatur. */
export function pruefeStreckenToken(token: string | null | undefined): string | null {
  const m = /^([A-Za-z0-9_-]{8,40})\.([A-Za-z0-9_-]{22})$/.exec(token ?? "");
  if (!m) return null;
  const a = Buffer.from(sig(m[1]));
  const b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

/** Basis der Links (eigene Buchungsadresse, sonst App-Adresse). */
export function streckenBasis(): string {
  return publicBaseOrNull() ?? "https://app.performancegrowth.de";
}

/** Adresse der Antwortseite, optional mit vorgewählter Antwort (a=Index der Öffnungsfrage) bzw. Zeit (z=Index). */
export function streckenUrl(streckeId: string, o: { a?: number; z?: number } = {}): string {
  const q = o.a != null ? `?a=${o.a}` : o.z != null ? `?z=${o.z}` : "";
  return `${streckenBasis()}/t/${streckenToken(streckeId)}${q}`;
}
