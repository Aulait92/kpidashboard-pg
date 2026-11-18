"use server";

// Maklervollmacht unterschreiben (öffentlich, ohne Login). Prüfung: lib/maklervollmacht/regeln.ts, Ablauf: server.ts.

import { headers } from "next/headers";
import { checkLimit, clientIp } from "@/lib/rate-limit";
import { FEHLER_TEXT, pruefeEingabe } from "@/lib/maklervollmacht/regeln";

export type VollmachtState = { error?: string; fertig?: boolean; mailGesendet?: boolean };

export async function unterschreibenAction(token: string, _prev: VollmachtState, fd: FormData): Promise<VollmachtState> {
  const h = await headers();
  const ip = clientIp(h);
  if (!checkLimit("offerAccept", `vollmacht:${ip}`).ok) return { error: "Gerade kamen sehr viele Anfragen. Bitte versuchen Sie es gleich noch einmal." };
  const r = pruefeEingabe((k) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : null;
  });
  if (!r.ok) return { error: FEHLER_TEXT[r.fehler] };
  const { unterschreiben } = await import("@/lib/maklervollmacht/server");
  const res = await unterschreiben(String(token), r.eingabe, { ip: ip === "unknown" ? null : ip, ua: h.get("user-agent") });
  if (!res.ok) return { error: res.error };
  return { fertig: true, mailGesendet: res.mailGesendet };
}
