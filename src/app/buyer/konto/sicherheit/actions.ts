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
  revalidatePath(PATH);
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
