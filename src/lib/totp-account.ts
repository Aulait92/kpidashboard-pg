// Zwei-Faktor-Login (TOTP) einrichten/ausschalten – gemeinsam für Admins
// (Einstellungen → Sicherheit) und Kunden-Logins (Kundenbereich → Konto).
// Jede Änderung beendet alle ANDEREN Sitzungen des Nutzers.

import { invalidateUserSessions } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { generateBackupCodes, generateTotpSecret, hashBackupCode, verifyTotp } from "@/lib/totp";

export type TotpState = { error?: string; backupCodes?: string[]; done?: boolean };

/**
 * Hat dieser Login den Zwei-Faktor-Login eingerichtet? Pflicht für das Öffnen von Policen vom Kunden und die Freischaltung
 * Kranken/BU/Leben (AVV-Ergänzung § 5, Ole 18.11.2026). Die Anmeldung fragt den Code bei jedem neuen Gerät ab
 * (lib/auth.ts), beim Einrichten werden alle anderen Sitzungen beendet.
 */
export async function zweiFaktorAktiv(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true, totpSecretEnc: true } });
  return !!(u?.totpEnabledAt && u.totpSecretEnc);
}

/** Nur eigene Seiten als Rücksprung nach dem Einrichten (z. B. /buyer/leads/…#dokumente), sonst die Sicherheitsseite. */
export function sichererRuecksprung(ziel: string | null | undefined, standard = "/buyer/konto/sicherheit"): string {
  const z = (ziel ?? "").trim();
  return /^\/buyer(\/[A-Za-z0-9_\-/]*)?(\?[A-Za-z0-9_=&%.-]*)?(#[A-Za-z0-9_-]*)?$/.test(z) && !z.startsWith("//") ? z : standard;
}

/** Schritt 1: neuen Schlüssel erzeugen (noch nicht aktiv). */
export async function startTotpSetup(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true } });
  if (user.totpEnabledAt) return;
  await prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(generateTotpSecret()) } });
}

/** Schritt 2: Code aus der App bestätigen → aktiv, Notfall-Codes einmalig zurückgeben. */
export async function confirmTotpSetup(userId: string, code: string, opts: { keepCurrent?: boolean } = { keepCurrent: true }): Promise<TotpState> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabledAt: true, customerId: true } });
  if (!user.totpSecretEnc) return { error: "Bitte zuerst „Einrichten“ wählen." };
  if (!verifyTotp(decryptSecret(user.totpSecretEnc), code)) {
    return { error: "Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben." };
  }
  const codes = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabledAt: user.totpEnabledAt ?? new Date(), totpBackupCodes: codes.map(hashBackupCode) },
  });
  await audit("2fa.enable", { entity: "User", entityId: userId, customerId: user.customerId });
  await invalidateUserSessions(userId, opts);
  return { backupCodes: codes, done: true };
}

/** Ausschalten nur mit gültigem Code (schützt vor fremder, offener Sitzung). */
export async function disableTotp(userId: string, code: string, opts: { keepCurrent?: boolean } = { keepCurrent: true }): Promise<TotpState> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpSecretEnc: true, customerId: true } });
  if (!user.totpSecretEnc || !verifyTotp(decryptSecret(user.totpSecretEnc), code)) {
    return { error: "Code stimmt nicht." };
  }
  await prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpEnabledAt: null, totpBackupCodes: [] } });
  await audit("2fa.disable", { entity: "User", entityId: userId, customerId: user.customerId });
  await invalidateUserSessions(userId, opts);
  return { done: true };
}

/** „Überall abmelden“: beendet alle anderen Sitzungen, das aufrufende Gerät bleibt angemeldet. */
export async function signOutEverywhere(userId: string, email: string, role: string | null): Promise<void> {
  await invalidateUserSessions(userId, { keepCurrent: true });
  await audit("session.revoke_all", { entity: "User", entityId: userId, actor: { id: userId, email, role } });
}
