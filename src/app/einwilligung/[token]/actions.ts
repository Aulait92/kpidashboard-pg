"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyLink } from "@/lib/bestand/links";
import { submitConsentForm } from "@/lib/bestand/einwilligung-server";
import { checkLimit, requestIp } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/whatsapp/phone";

// Einwilligung abschicken (öffentlich, ohne Login): Bot-Falle und Drosselung wie auf der Empfehlungsseite.
export async function submitConsentAction(token: string, fd: FormData): Promise<void> {
  const base = `/einwilligung/${token}`;
  const v = verifyLink(token);
  if (!v || v.kind !== "e") redirect(`${base}?err=unavailable`);
  const ip = await requestIp();
  if (!checkLimit("publicBooking", `einwilligung:${ip}`).ok) redirect(`${base}?err=busy`);
  const honeypot = String(fd.get("zq_hp_field") ?? "").trim();
  const renderedAt = Number(fd.get("rendered_at") ?? 0);
  if (honeypot && (!renderedAt || Date.now() - renderedAt < 3000)) redirect(`${base}?err=invalid`);
  const phoneRaw = String(fd.get("phone") ?? "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) redirect(`${base}?err=phone`);
  const h = await headers();
  const r = await submitConsentForm(v!.id, {
    email: fd.get("email") === "on",
    whatsapp: fd.get("whatsapp") === "on",
    emailAddress: String(fd.get("emailAddress") ?? "").trim() || null,
    phone,
    ip,
    userAgent: h.get("user-agent"),
  });
  if (!r.ok) redirect(`${base}?err=${r.error}`);
  redirect(`${base}?ok=1${r.doiSent ? "&doi=1" : ""}${r.whatsapp ? "&wa=1" : ""}`);
}
