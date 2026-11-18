// Öffentliche Links der Bestandskampagnen (ohne Login, signiert, Ole 14.11.2026):
//   /abmelden/<token>        Abmeldelink in jeder Kampagnen-Mail (ein Klick)
//   /einwilligung/<token>    Einwilligungs-Abfrage für einen Bestandskunden
// Token = Art + ID + HMAC (AUTH_SECRET), nichts in der Datenbank. Double-Opt-in-Bestätigung: zufälliges
// Token, nur der Hash liegt im Protokoll (BestandConsentLog.tokenHash).

import crypto from "node:crypto";
import { publicBaseOrNull } from "@/lib/public-url";

const secret = () => process.env.AUTH_SECRET ?? "dev-secret";
const sig = (v: string) => crypto.createHmac("sha256", secret()).update(`bestand-link:${v}`).digest("base64url").slice(0, 22);

/** r = Kampagnen-Empfänger (Abmeldung zählt für die Kampagne), e = Bestandskunde, l = Lead (Vorlagen-Mails, Paket M0). */
export type LinkKind = "r" | "e" | "l";

export function signLink(kind: LinkKind, id: string): string {
  return `${kind}${id}.${sig(`${kind}${id}`)}`;
}

/** Token prüfen; null bei falscher Signatur. */
export function verifyLink(token: string): { kind: LinkKind; id: string } | null {
  const m = /^([rel])([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  const expected = Buffer.from(sig(`${m[1]}${m[2]}`));
  const given = Buffer.from(m[3]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return { kind: m[1] as LinkKind, id: m[2] };
}

/** Eigene Buchungsadresse, sonst App-Adresse (lib/public-url.ts). */
function base(): string {
  return publicBaseOrNull() ?? "https://app.performancegrowth.de";
}

export const unsubscribeUrl = (recipientId: string) => `${base()}/abmelden/${signLink("r", recipientId)}`;
/** Für den Header List-Unsubscribe (POST mit List-Unsubscribe=One-Click, RFC 8058). */
export const unsubscribePostUrl = (recipientId: string) => `${base()}/api/abmelden/${signLink("r", recipientId)}`;
/** Abmeldelink in werblichen Vorlagen-Mails an Leads (lib/mail/vorlagen-mail.ts): trägt die Adresse in die Sperrliste ein. */
export const leadAbmeldeUrl = (leadId: string) => `${base()}/abmelden/${signLink("l", leadId)}`;
export const consentUrl = (existingCustomerId: string) => `${base()}/einwilligung/${signLink("e", existingCustomerId)}`;

/** Zufälliges Bestätigungstoken (Double-Opt-in) und sein Hash. */
export function doiToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export const doiConfirmUrl = (token: string) => `${base()}/einwilligung/bestaetigen/${token}`;

/** Hash für die Sperrliste (E-Mail klein, Telefon normalisiert). */
export function optOutHash(kind: "email" | "phone", value: string): string {
  const v = kind === "email" ? value.trim().toLowerCase() : value.replace(/\D/g, "");
  return crypto.createHash("sha256").update(`${kind}:${v}`).digest("hex");
}
