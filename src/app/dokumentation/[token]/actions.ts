"use server";

// Erhalt der Beratungsdokumentation bestätigen (Paket B, Ole 18.11.2026): öffentlich, ohne Login, nur per POST
// (Server-Aktion nach dem Klick). Der Aufruf der Seite per Link (auch durch Link-Scanner) speichert nichts. Drosselung je IP.

import { redirect } from "next/navigation";
import { checkLimit, requestIp } from "@/lib/rate-limit";
import { bdBestaetigen } from "@/lib/beratungsdoku-server";

export async function bestaetigenAction(token: string): Promise<void> {
  const t = String(token);
  if (!checkLimit("offerAccept", `beratungsdoku:${await requestIp()}`).ok) redirect(`/dokumentation/${encodeURIComponent(t)}?f=busy`);
  await bdBestaetigen(t);
  redirect(`/dokumentation/${encodeURIComponent(t)}`);
}
