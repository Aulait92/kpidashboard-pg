"use server";

import { redirect } from "next/navigation";
import { istRueckmeldungArt } from "@/lib/ppl/rueckmeldung";
import { ladeRueckmeldungSeite, setzeRueckmeldung } from "@/lib/ppl/rueckmeldung-server";
import { checkLimit, requestIp } from "@/lib/rate-limit";

/** Rückmeldung aus der Liefer-E-Mail speichern (öffentlich, ohne Login, signierter Link, Drosselung je IP). */
export async function rueckmeldungAction(token: string, form: FormData): Promise<void> {
  const ip = await requestIp();
  if (!checkLimit("kaeuferRueckmeldung", `post:${ip}`).ok) redirect(`/rueckmeldung/${token}?fehler=limit`);
  const art = form.get("art");
  if (!istRueckmeldungArt(art)) redirect(`/rueckmeldung/${token}?fehler=wahl`);
  const seite = await ladeRueckmeldungSeite(token);
  if (!seite.ok) redirect(`/rueckmeldung/${token}`);
  const r = await setzeRueckmeldung({ leadId: seite.leadId, customerId: seite.customerId, art, quelle: "mail", userId: null }).catch((e) => {
    console.error("[ppl-rueckmeldung]", e);
    return null;
  });
  if (!r?.ok) redirect(`/rueckmeldung/${token}?fehler=speichern`);
  redirect(`/rueckmeldung/${token}?ok=${art}`);
}
