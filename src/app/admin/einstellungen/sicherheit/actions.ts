"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { confirmTotpSetup, disableTotp, signOutEverywhere, startTotpSetup, type TotpState } from "@/lib/totp-account";

export type { TotpState };

/** Schritt 1: neuen Schlüssel erzeugen (noch nicht aktiv). */
export async function startTotpSetupAction(): Promise<void> {
  const session = await requireAuth();
  await startTotpSetup(session.userId);
  revalidatePath("/admin/einstellungen/sicherheit");
}

/** Schritt 2: Code aus der App bestätigen → aktiv, Notfall-Codes einmalig anzeigen. */
export async function confirmTotpAction(_prev: TotpState, fd: FormData): Promise<TotpState> {
  const session = await requireAuth();
  // Kein Neu-Rendern der Seite: die Notfall-Codes sollen stehen bleiben, bis „Fertig“.
  return confirmTotpSetup(session.userId, String(fd.get("code") ?? ""));
}

/** Ausschalten nur mit gültigem Code (schützt vor fremder Sitzung). */
export async function disableTotpAction(_prev: TotpState, fd: FormData): Promise<TotpState> {
  const session = await requireAuth();
  const res = await disableTotp(session.userId, String(fd.get("code") ?? ""));
  if (res.done) revalidatePath("/admin/einstellungen/sicherheit");
  return res;
}

/** „Überall abmelden“: alle anderen Sitzungen beenden, dieses Gerät bleibt angemeldet. */
export async function signOutEverywhereAction(): Promise<{ ok: boolean }> {
  const session = await requireAuth();
  await signOutEverywhere(session.userId, session.email, session.role);
  return { ok: true };
}
