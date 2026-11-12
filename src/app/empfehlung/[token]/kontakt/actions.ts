"use server";

import { redirect } from "next/navigation";
import { submitReferral } from "@/lib/empfehlung/requests";
import { EMAIL_RE, normalizePhone } from "@/lib/whatsapp/phone";
import { checkLimit, requestIp } from "@/lib/rate-limit";

// Empfohlene Person trägt sich selbst ein (öffentlich, ohne Login): alles
// serverseitig prüfen, Bot-Falle wie auf der Buchungsseite, Missbrauchsbremse je Link.
export async function submitReferralAction(token: string, fd: FormData): Promise<void> {
  if (!/^[\w-]{10,64}$/.test(token)) redirect("/");
  const base = `/empfehlung/${token}/kontakt`;
  const fail = (code: string): never => redirect(`${base}?err=${code}`);
  // Drosselung je IP (wie die öffentliche Buchungsseite)
  if (!checkLimit("publicBooking", `empfehlung:${await requestIp()}`).ok) fail("busy");
  const honeypot = String(fd.get("zq_hp_field") ?? "").trim();
  const renderedAt = Number(fd.get("rendered_at") ?? 0);
  if (honeypot && (!renderedAt || Date.now() - renderedAt < 3000)) fail("invalid");

  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  const emailRaw = String(fd.get("email") ?? "").trim().toLowerCase();
  const topic = String(fd.get("topic") ?? "").trim().slice(0, 80) || null;
  const message = String(fd.get("message") ?? "").trim().slice(0, 500) || null;
  if (!name) fail("name");
  if (!phone) fail("phone");
  if (emailRaw && !EMAIL_RE.test(emailRaw)) fail("email");
  const r = await submitReferral(token, { name, phone: phone!, email: emailRaw || null, topic, message, consent: fd.get("consent") === "on" });
  if (!r.ok) fail(r.error);
  redirect(`${base}?ok=1`);
}
