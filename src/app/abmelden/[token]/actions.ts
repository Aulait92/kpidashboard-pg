"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { unsubscribe } from "@/lib/bestand/abmelden";
import { checkLimit, requestIp } from "@/lib/rate-limit";

/** „Auch keine WhatsApp-Nachrichten mehr“ (öffentlich, ohne Login, Drosselung je IP). */
export async function unsubscribeAllAction(token: string): Promise<void> {
  const ip = await requestIp();
  if (!checkLimit("publicBooking", `abmelden:${ip}`).ok) redirect(`/abmelden/${token}`);
  const h = await headers();
  await unsubscribe(token, "all", { ip, userAgent: h.get("user-agent") });
  redirect(`/abmelden/${token}?alle=1`);
}
