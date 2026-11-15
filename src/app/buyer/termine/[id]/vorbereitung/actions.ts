"use server";

// Terminvorbereitung: „Vorbereitet“ abhaken bzw. zurücknehmen.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { angeboteSpeichern, auslesenUndSpeichern, setPrepared } from "@/lib/termin-vorbereitung-server";

export async function setPreparedAction(appointmentId: string, prepared: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  const ok = await setPrepared(appointmentId, ctx, prepared);
  revalidatePath("/buyer");
  revalidatePath(`/buyer/termine/${appointmentId}/vorbereitung`);
  return ok ? { ok: true } : { ok: false, error: "Termin nicht gefunden." };
}

/** Angebote aus den hochgeladenen Dateien („Angebot“) auslesen (Testkunden). */
export async function angeboteAuslesenAction(appointmentId: string): Promise<{ ok: boolean; error?: string; anzahl?: number }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  const r = await auslesenUndSpeichern(appointmentId, ctx);
  revalidatePath(`/buyer/termine/${appointmentId}/vorbereitung`);
  return r.ok ? { ok: true, anzahl: r.anzahl } : { ok: false, error: r.error };
}

/** Angebote speichern; bestaetigen = für die Präsentation freigeben. */
export async function angeboteSpeichernAction(appointmentId: string, daten: unknown, bestaetigen: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  const ok = await angeboteSpeichern(appointmentId, ctx, daten, bestaetigen);
  revalidatePath(`/buyer/termine/${appointmentId}/vorbereitung`);
  return ok ? { ok: true } : { ok: false, error: "Termin nicht gefunden." };
}
