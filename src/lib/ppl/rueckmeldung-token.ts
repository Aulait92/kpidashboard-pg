// Signierter Link für die Rückmeldung des Pay-per-Lead-Käufers (lib/ppl/rueckmeldung.ts): <leadId>.<ablauf>.<signatur>.
// HMAC-SHA256 mit AUTH_SECRET über Lead, Käufer (steht nicht im Link) und Ablauf. Nur auf dem Server.
import crypto from "node:crypto";
import { RUECKMELDUNG_TAGE } from "@/lib/ppl/rueckmeldung";

const signatur = (leadId: string, customerId: string, ablauf: number, secret: string) =>
  crypto.createHmac("sha256", secret).update(`ppl-rueckmeldung:${leadId}:${customerId}:${ablauf}`).digest("base64url").slice(0, 32);

function geheimnis(secret: string | undefined): string {
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET fehlt für Rückmelde-Links.");
  return secret;
}

/** Token für einen Lead, gebunden an den Käufer; gilt RUECKMELDUNG_TAGE Tage. */
export function rueckmeldungToken(leadId: string, customerId: string, now = new Date(), secret = process.env.AUTH_SECRET): string {
  const ablauf = Math.floor(now.getTime() / 1000) + RUECKMELDUNG_TAGE * 86_400;
  return `${leadId}.${ablauf}.${signatur(leadId, customerId, ablauf, geheimnis(secret))}`;
}

/** Teile des Tokens ohne Prüfung (für die Abfrage des Leads); null bei falscher Form. */
export function rueckmeldungTokenTeile(token: string): { leadId: string; ablauf: number; sig: string } | null {
  const t = (token ?? "").split(".");
  if (t.length !== 3) return null;
  const [leadId, e, sig] = t;
  if (!/^[\w-]{1,64}$/.test(leadId) || !/^\d{9,11}$/.test(e) || !/^[\w-]{32}$/.test(sig)) return null;
  return { leadId, ablauf: Number(e), sig };
}

export type RueckmeldungPruefung = { ok: true; leadId: string } | { ok: false; grund: "ungueltig" | "abgelaufen" };

/** Signatur (konstante Zeit) gegen den Käufer des Leads und Ablauf prüfen. */
export function pruefeRueckmeldungToken(token: string, customerId: string, now = new Date(), secret = process.env.AUTH_SECRET): RueckmeldungPruefung {
  const teile = rueckmeldungTokenTeile(token);
  if (!teile || !secret || secret.length < 16) return { ok: false, grund: "ungueltig" };
  const soll = Buffer.from(signatur(teile.leadId, customerId, teile.ablauf, secret));
  const ist = Buffer.from(teile.sig);
  if (soll.length !== ist.length || !crypto.timingSafeEqual(soll, ist)) return { ok: false, grund: "ungueltig" };
  if (teile.ablauf * 1000 < now.getTime()) return { ok: false, grund: "abgelaufen" };
  return { ok: true, leadId: teile.leadId };
}

