"use server";

import { redirect } from "next/navigation";
import { rueckrufWunsch } from "@/lib/angebot-senden-server";
import { checkLimit, requestIp } from "@/lib/rate-limit";

/** „Rückruf anfordern“ (öffentlich, ohne Login, Drosselung je IP): Zeitfenster und freiwillige Notiz. */
export async function rueckrufAction(token: string, form: FormData): Promise<void> {
  const ip = await requestIp();
  if (!checkLimit("publicBooking", `rueckruf:${ip}`).ok) redirect(`/rueckruf/${token}?fehler=limit`);
  const fenster = form.get("fenster");
  const r = await rueckrufWunsch(token, { fenster: typeof fenster === "string" ? fenster : null, notiz: form.get("notiz") }).catch((e) => {
    console.error("[rueckruf]", e);
    return null;
  });
  if (!r) redirect(`/rueckruf/${token}`);
  if (!r.ok) redirect(`/rueckruf/${token}?fehler=fenster`);
  redirect(`/rueckruf/${token}?danke=${encodeURIComponent(r.fenster?.key ?? "bald")}${r.whatsapp ? "&wa=1" : ""}`);
}
