"use server";

import { redirect } from "next/navigation";
import { rueckrufWunsch } from "@/lib/angebot-senden-server";
import { checkLimit, requestIp } from "@/lib/rate-limit";

/** „Ja, bitte anrufen“ (öffentlich, ohne Login, Drosselung je IP). */
export async function rueckrufAction(token: string): Promise<void> {
  const ip = await requestIp();
  if (!checkLimit("publicBooking", `rueckruf:${ip}`).ok) redirect(`/rueckruf/${token}`);
  const r = await rueckrufWunsch(token).catch(() => null);
  redirect(r ? `/rueckruf/${token}?danke=1` : `/rueckruf/${token}`);
}
