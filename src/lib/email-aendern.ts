// Kunde ändert seine Login-E-Mail selbst (Ole, 15.11.2026): Anfrage (mit Passwort, falls vorhanden) → Link an
// die NEUE Adresse (24 h gültig) → nach Klick wird die Adresse übernommen, alle Sitzungen enden, Hinweis an die
// alte Adresse. Nur der Hash des Tokens wird gespeichert.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeLoginEmail } from "@/lib/login-email";
import { audit } from "@/lib/audit";
import { invalidateUserSessions, verifyPassword } from "@/lib/auth";
import { getAppUrl, sendCustomerMail } from "@/lib/email";

const TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export type EmailChangeResult = { ok: true; to: string } | { ok: false; error: string };

export async function requestEmailChange(userId: string, input: { newEmail: string; password?: string | null }, now = new Date()): Promise<EmailChangeResult & { rawToken?: string }> {
  const newEmail = normalizeLoginEmail(input.newEmail);
  if (!EMAIL_RE.test(newEmail)) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben." };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, passwordHash: true, customerId: true } });
  if (!user) return { ok: false, error: "Login nicht gefunden." };
  if (user.email === newEmail) return { ok: false, error: "Das ist schon Ihre aktuelle Adresse." };
  // Mit Passwort angemeldet: Passwort bestätigen (bei Anmeldung nur über Google/Microsoft entfällt das)
  if (user.passwordHash) {
    if (!input.password || !(await verifyPassword(input.password, user.passwordHash))) return { ok: false, error: "Das Passwort stimmt nicht." };
  }
  if (await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } })) return { ok: false, error: "Diese Adresse wird schon für einen anderen Zugang verwendet." };
  await prisma.emailChangeRequest.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
  const rawToken = crypto.randomBytes(32).toString("base64url");
  await prisma.emailChangeRequest.create({ data: { userId, newEmail, tokenHash: hash(rawToken), expiresAt: new Date(now.getTime() + TTL_MS) } });
  let url = `/email-bestaetigen?token=${rawToken}`;
  try {
    url = `${getAppUrl()}${url}`;
  } catch {
    /* ohne APP_URL (Tests): relativer Link */
  }
  await sendCustomerMail({
    to: newEmail,
    subject: "Bitte bestätigen Sie Ihre neue E-Mail-Adresse",
    greeting: "Guten Tag,",
    paragraphs: [
      "Sie möchten Ihre Anmeldung bei performancegrowth auf diese E-Mail-Adresse umstellen. Bitte bestätigen Sie das mit dem Knopf unten. Der Link ist 24 Stunden gültig.",
      "Danach melden Sie sich mit dieser Adresse und Ihrem bisherigen Passwort an. Waren Sie das nicht? Dann ignorieren Sie diese E-Mail einfach.",
    ],
    button: { label: "Neue Adresse bestätigen", url },
    signature: "Ihr Team von performancegrowth",
  }).catch(() => null);
  await audit("user.email_change_requested", { entity: "User", entityId: userId, customerId: user.customerId, details: { to: newEmail }, actor: { id: userId, email: user.email, role: "BUYER" } });
  return { ok: true, to: newEmail, rawToken };
}

export async function confirmEmailChange(rawToken: string, now = new Date()): Promise<EmailChangeResult> {
  if (!rawToken) return { ok: false, error: "Der Link ist unvollständig." };
  const req = await prisma.emailChangeRequest.findUnique({ where: { tokenHash: hash(rawToken) }, select: { id: true, userId: true, newEmail: true, expiresAt: true, usedAt: true } });
  if (!req) return { ok: false, error: "Der Link ist ungültig." };
  if (req.usedAt) {
    // Schon bestätigt (z. B. zweiter Klick): wenn die Adresse übernommen ist, gilt das als Erfolg
    const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
    return u?.email === req.newEmail ? { ok: true, to: req.newEmail } : { ok: false, error: "Der Link wurde schon verwendet." };
  }
  if (req.expiresAt.getTime() < now.getTime()) return { ok: false, error: "Der Link ist abgelaufen. Bitte fordern Sie im Konto einen neuen an." };
  if (await prisma.user.findUnique({ where: { email: req.newEmail }, select: { id: true } })) return { ok: false, error: "Diese Adresse wird inzwischen für einen anderen Zugang verwendet." };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId }, select: { email: true, customerId: true } });
  await prisma.$transaction([
    prisma.user.update({ where: { id: req.userId }, data: { email: req.newEmail } }),
    prisma.emailChangeRequest.update({ where: { id: req.id }, data: { usedAt: now } }),
  ]);
  await invalidateUserSessions(req.userId);
  await audit("user.email_change", { entity: "User", entityId: req.userId, customerId: user.customerId, details: { from: user.email, to: req.newEmail, by: "kunde" }, actor: { id: req.userId, email: req.newEmail, role: "BUYER" } });
  await sendCustomerMail({
    to: user.email,
    subject: "Ihre Anmelde-Adresse wurde geändert",
    greeting: "Guten Tag,",
    paragraphs: [
      `Ihre Anmeldung bei performancegrowth läuft ab sofort über ${req.newEmail}. Diese Adresse bekommt keine Nachrichten zu Ihrem Zugang mehr.`,
      "Waren Sie das nicht? Bitte melden Sie sich umgehend bei uns.",
    ],
    signature: "Ihr Team von performancegrowth",
  }).catch(() => null);
  return { ok: true, to: req.newEmail };
}
