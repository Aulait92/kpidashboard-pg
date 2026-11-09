"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { acceptOffer } from "@/lib/offers";

export type AcceptState = { ok?: boolean; error?: string };

export async function acceptOfferAction(token: string, _prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const res = await acceptOffer(token, {
    name: String(formData.get("name") ?? ""),
    termsAccepted: formData.get("terms") === "on",
    ip,
    agent: h.get("user-agent"),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/angebot/${token}`);
  return { ok: true };
}
