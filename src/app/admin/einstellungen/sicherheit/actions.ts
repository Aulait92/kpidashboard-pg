"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { generateBackupCodes, generateTotpSecret, hashBackupCode, verifyTotp } from "@/lib/totp";
import { audit } from "@/lib/audit";

export type TotpState = { error?: string; backupCodes?: string[]; done?: boolean };

/** Schritt 1: neuen Schlüssel erzeugen (noch nicht aktiv). */
export async function startTotpSetupAction(): Promise<void> {
  const session = await requireAuth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId }, select: { totpEnabledAt: true } });
  if (user.totpEnabledAt) return;
  await prisma.user.update({ where: { id: session.userId }, data: { totpSecretEnc: encryptSecret(generateTotpSecret()) } });
  revalidatePath("/admin/einstellungen/sicherheit");
}

/** Schritt 2: Code aus der App bestätigen → aktiv, Notfall-Codes einmalig anzeigen. */
export async function confirmTotpAction(_prev: TotpState, fd: FormData): Promise<TotpState> {
  const session = await requireAuth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId }, select: { totpSecretEnc: true, totpEnabledAt: true } });
  if (!user.totpSecretEnc) return { error: "Bitte zuerst „Einrichten“ wählen." };
  if (!verifyTotp(decryptSecret(user.totpSecretEnc), String(fd.get("code") ?? ""))) {
    return { error: "Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben." };
  }
  const codes = generateBackupCodes();
  await prisma.user.update({
    where: { id: session.userId },
    data: { totpEnabledAt: user.totpEnabledAt ?? new Date(), totpBackupCodes: codes.map(hashBackupCode) },
  });
  await audit("2fa.enable", { entity: "User", entityId: session.userId });
  // Kein Neu-Rendern der Seite: die Notfall-Codes sollen stehen bleiben, bis „Fertig“.
  return { backupCodes: codes, done: true };
}

/** Ausschalten nur mit gültigem Code (schützt vor fremder Sitzung). */
export async function disableTotpAction(_prev: TotpState, fd: FormData): Promise<TotpState> {
  const session = await requireAuth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId }, select: { totpSecretEnc: true } });
  if (!user.totpSecretEnc || !verifyTotp(decryptSecret(user.totpSecretEnc), String(fd.get("code") ?? ""))) {
    return { error: "Code stimmt nicht." };
  }
  await prisma.user.update({ where: { id: session.userId }, data: { totpSecretEnc: null, totpEnabledAt: null, totpBackupCodes: [] } });
  await audit("2fa.disable", { entity: "User", entityId: session.userId });
  revalidatePath("/admin/einstellungen/sicherheit");
  return { done: true };
}
