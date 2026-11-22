"use server";

import { requireAuth } from "@/lib/vertrieb/auth";
import { geplanteVorschau, type VorschauTeil } from "@/lib/vertrieb/nachricht-vorschau";
import type { Kanal } from "@/lib/vertrieb/geplante-nachrichten";

export type GeplanteVorschauErgebnis = { ok: true; teile: VorschauTeil[] } | { ok: false; error: string };

/** Vorschau einer geplanten Nachricht (Verkaufen → Geplante Nachrichten), ohne Seiteneffekte. */
export async function geplanteVorschauAction(key: string, atIso: string, kanaele: Kanal[]): Promise<GeplanteVorschauErgebnis> {
  await requireAuth();
  try {
    const at = new Date(atIso);
    if (!/^[a-z]+:[\w-]+:[\w-]+$/i.test(key) || Number.isNaN(at.getTime())) return { ok: false, error: "Nachricht nicht gefunden." };
    const teile = await geplanteVorschau(key, at, kanaele.filter((k) => k === "email" || k === "whatsapp"));
    return teile.length ? { ok: true, teile } : { ok: false, error: "Diese Nachricht geht nicht mehr raus." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Vorschau konnte nicht geladen werden." };
  }
}
