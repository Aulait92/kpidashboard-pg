"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REFERRAL_DRAFT_COOKIE, REFERRAL_DRAFT_MAX_AGE, encodeReferralDraft } from "@/lib/empfehlung/entwurf";
import { claimPersonalLink, submitReferral } from "@/lib/empfehlung/requests";
import { EMAIL_RE, normalizePhone } from "@/lib/whatsapp/phone";
import { checkLimit, requestIp } from "@/lib/rate-limit";
import { anFromParam } from "@/lib/empfehlung/shared";

// Empfohlene Person trägt sich selbst ein (öffentlich, ohne Login): alles
// serverseitig prüfen, Bot-Falle wie auf der Buchungsseite, Missbrauchsbremse je Link.
export async function submitReferralAction(token: string, fd: FormData): Promise<void> {
  if (!/^[\w-]{10,64}$/.test(token)) redirect("/");
  const base = `/empfehlung/${token}/kontakt`;
  // Ansprache der Seite (vom Empfehlenden gewählt) bleibt bei Fehlern und auf der Erfolgsseite erhalten
  const an = anFromParam(fd.get("an"));
  const suffix = an === "du" ? "&an=du" : "";
  const jar = await cookies();
  // Bei einem Fehler die Eingaben kurz merken, damit niemand alles neu tippen muss (lib/empfehlung/entwurf.ts)
  const fail = (code: string, keep = true): never => {
    if (keep) {
      const draft = encodeReferralDraft({
        name: String(fd.get("name") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        email: String(fd.get("email") ?? ""),
        topic: String(fd.get("topic") ?? ""),
        message: String(fd.get("message") ?? ""),
        consent: true,
        statusConsent: fd.get("statusConsent") === "on",
      });
      jar.set(REFERRAL_DRAFT_COOKIE, draft, { path: base, maxAge: REFERRAL_DRAFT_MAX_AGE, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    }
    redirect(`${base}?err=${code}${suffix}`);
  };
  // Drosselung je IP (wie die öffentliche Buchungsseite)
  if (!checkLimit("publicBooking", `empfehlung:${await requestIp()}`).ok) fail("busy");
  const honeypot = String(fd.get("zq_hp_field") ?? "").trim();
  const renderedAt = Number(fd.get("rendered_at") ?? 0);
  if (honeypot && (!renderedAt || Date.now() - renderedAt < 3000)) fail("invalid", false);

  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  const emailRaw = String(fd.get("email") ?? "").trim().toLowerCase();
  const topic = String(fd.get("topic") ?? "").trim().slice(0, 80) || null;
  const message = String(fd.get("message") ?? "").trim().slice(0, 500) || null;
  if (!name) fail("name");
  if (!phone) fail("phone");
  if (emailRaw && !EMAIL_RE.test(emailRaw)) fail("email");
  // Absenden = Einwilligung: Der Satz steht direkt über dem Knopf „Rückruf anfordern“ (contactConsentText).
  // submitReferral speichert genau diesen Wortlaut (in der Ansprache der Seite) mit Zeitstempel am Lead.
  const r = await submitReferral(token, { name, phone: phone!, email: emailRaw || null, topic, message, consent: true, statusConsent: fd.get("statusConsent") === "on", an });
  if (!r.ok) fail(r.error, r.error !== "unavailable");
  jar.delete({ name: REFERRAL_DRAFT_COOKIE, path: base });
  redirect(`${base}?ok=1${suffix}`);
}

/**
 * Allgemeiner Link (E-Mail-Signatur): Kunde gibt seine Handynummer an und landet auf seinem
 * persönlichen Empfehlungslink. Unbekannte Nummer → zurück zur allgemeinen Seite (teilen geht trotzdem).
 */
export async function claimPersonalLinkAction(token: string, fd: FormData): Promise<void> {
  if (!/^[\w-]{10,64}$/.test(token)) redirect("/");
  const base = `/empfehlung/${token}`;
  if (!checkLimit("publicBooking", `empfehlung-claim:${await requestIp()}`).ok) redirect(`${base}?p=busy`);
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  if (!phone) redirect(`${base}?p=invalid`);
  const personal = await claimPersonalLink(token, phone!);
  redirect(personal ? `/empfehlung/${personal}` : `${base}?p=unknown`);
}
