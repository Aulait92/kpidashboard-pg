"use server";

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { confirmTotpSetup, disableTotp, signOutEverywhere, startTotpSetup, type TotpState } from "@/lib/totp-account";

const PATH = "/buyer/konto/sicherheit";

/** Eigener Login (nicht in der Admin-Vorschau). */
async function self(): Promise<{ userId: string; email: string } | null> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return null;
  return { userId: ctx.userId, email: ctx.email };
}

export async function startBuyerTotpAction(): Promise<void> {
  const me = await self();
  if (!me) return;
  await startTotpSetup(me.userId);
  // Auch die Einrichtungs-Karte (…/zwei-faktor) neu laden
  revalidatePath(PATH, "layout");
}

export async function confirmBuyerTotpAction(_prev: TotpState, fd: FormData): Promise<TotpState> {
  const me = await self();
  if (!me) return { error: "In der Vorschau nicht möglich." };
  return confirmTotpSetup(me.userId, String(fd.get("code") ?? ""));
}

export async function disableBuyerTotpAction(_prev: TotpState, fd: FormData): Promise<TotpState> {
  const me = await self();
  if (!me) return { error: "In der Vorschau nicht möglich." };
  const res = await disableTotp(me.userId, String(fd.get("code") ?? ""));
  if (res.done) revalidatePath(PATH);
  return res;
}

export async function signOutEverywhereBuyerAction(): Promise<{ ok: boolean }> {
  const me = await self();
  if (!me) return { ok: false };
  await signOutEverywhere(me.userId, me.email, "BUYER");
  return { ok: true };
}

export type EmailChangeState = { ok?: boolean; error?: string; to?: string };

/** Neue Login-E-Mail anfragen: Bestätigungslink geht an die neue Adresse. */
export async function requestEmailChangeAction(_prev: EmailChangeState, fd: FormData): Promise<EmailChangeState> {
  const me = await self();
  if (!me) return { error: "In der Vorschau nicht möglich." };
  const { requestEmailChange } = await import("@/lib/email-aendern");
  const res = await requestEmailChange(me.userId, { newEmail: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") || null });
  return res.ok ? { ok: true, to: res.to } : { error: res.error };
}
