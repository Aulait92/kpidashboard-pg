"use server";

import { submitReferral } from "@/lib/kollegen";
import { RATE_LIMIT_MESSAGE, hit, requestIp } from "@/lib/rate-limit";

// Drosselung je IP (zusätzlich zur Bremse je Empfehlungscode in lib/kollegen)
const REFERRAL_FORM_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

export type ReferralFormState = { ok?: boolean; error?: string; values?: Record<string, string> };

// Öffentliches Formular „Kollegen empfehlen“: kein Login, alles serverseitig
// prüfen (lib/kollegen.submitReferral), Bot-Falle wie bei der Terminbuchung.
export async function submitReferralAction(code: string, _prev: ReferralFormState, fd: FormData): Promise<ReferralFormState> {
  const values = {
    name: String(fd.get("name") ?? ""),
    company: String(fd.get("company") ?? ""),
    email: String(fd.get("email") ?? ""),
    phone: String(fd.get("phone") ?? ""),
  };
  // Unsichtbares Feld ausgefüllt UND blitzschnell abgeschickt → Bot (still „ok“, nichts gespeichert)
  const honeypot = String(fd.get("website_hp") ?? "").trim();
  const renderedAt = Number(fd.get("rendered_at") ?? 0);
  if (honeypot && (!renderedAt || Date.now() - renderedAt < 3000)) return { ok: true };
  if (!hit("publicReferral", await requestIp(), REFERRAL_FORM_LIMIT).ok) return { error: RATE_LIMIT_MESSAGE, values };
  const res = await submitReferral({ code, ...values, consent: fd.get("consent") === "on" });
  if (!res.ok) return { error: res.error, values };
  return { ok: true };
}
