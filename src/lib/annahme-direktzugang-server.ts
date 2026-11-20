// Serverseite zu „Passwort jetzt festlegen“ nach der Annahme (Regeln und Signatur: lib/annahme-direktzugang.ts).

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { issuePasswordResetToken } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ANNAHME_COOKIE, ANNAHME_TTL_MS, pruefeAnnahme, signAnnahme } from "@/lib/annahme-direktzugang";

/** Link aus dem Knopf: kurz gültig, er wird sofort benutzt. Der Link aus der Mail bleibt daneben gültig. */
const DIREKT_TTL_MS = 60 * 60 * 1000;

/** Nach der Annahme: diesen Browser für das Angebot merken (httpOnly, nur unter /angebot). */
export async function merkeAnnahme(offerId: string): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return;
  const store = await cookies();
  store.set(ANNAHME_COOKIE, signAnnahme(offerId, secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Math.floor(ANNAHME_TTL_MS / 1000),
    path: "/angebot",
  });
}

/** Wurde das Angebot in diesem Browser angenommen (und ist das höchstens 12 Stunden her)? */
export async function annahmeImBrowser(offerId: string): Promise<boolean> {
  const store = await cookies().catch(() => null);
  return pruefeAnnahme(store?.get(ANNAHME_COOKIE)?.value, offerId, process.env.AUTH_SECRET);
}

export type DirektZugang =
  /** Login angelegt, noch nie angemeldet: Knopf zeigen */
  | { stand: "bereit"; userId: string; email: string }
  /** Schon angemeldet: kein Knopf (Passwort steht) */
  | { stand: "angemeldet" }
  /** Onboarding bzw. Login noch nicht angelegt (z. B. Zahlung wird noch bestätigt) */
  | { stand: "wartet" };

/** Login zum angenommenen Angebot (aus dem Onboarding); bevorzugt die Adresse aus dem Angebot. */
export async function direktZugang(offerId: string): Promise<DirektZugang> {
  const [offer, ob] = await Promise.all([
    prisma.offer.findUnique({ where: { id: offerId }, select: { email: true, status: true } }),
    prisma.onboarding.findUnique({
      where: { offerId },
      select: { customer: { select: { users: { where: { role: "BUYER" }, select: { id: true, email: true, lastLoginAt: true }, orderBy: { createdAt: "asc" } } } } },
    }),
  ]);
  if (!offer || offer.status !== "accepted" || !ob) return { stand: "wartet" };
  const users = ob.customer.users;
  const mail = (offer.email ?? "").trim().toLowerCase();
  const user = users.find((u) => u.email.toLowerCase() === mail) ?? users[0];
  if (!user) return { stand: "wartet" };
  if (user.lastLoginAt) return { stand: "angemeldet" };
  return { stand: "bereit", userId: user.id, email: user.email };
}

/** Frischen Link zum Passwort festlegen erzeugen (ohne den Link aus der Mail zu entwerten). Relativ: gleicher Host wie die Angebotsseite. */
export async function direktLink(offerId: string, user: { userId: string; email: string }): Promise<string | null> {
  const token = await issuePasswordResetToken(user.email, DIREKT_TTL_MS, { keepOthers: true });
  if (!token) return null;
  await audit("user.invite_direkt", { entity: "User", entityId: user.userId, details: { offerId, quelle: "angebot" }, actor: { role: "kunde" } });
  return `/reset-password?token=${encodeURIComponent(token.rawToken)}`;
}
