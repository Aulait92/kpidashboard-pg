"use server";

// Anwesenheit am Termin (Show-up-Paket, Ole 17.11.2026): Entscheidungsblatt aus dem Push, „Heute“ und Terminansicht.
//   „Ja, da“ / „Ist doch da“ / „Ja, gekommen“ → erschienen
//   „Fehlt noch“                             → WhatsApp „… wartet schon im Videoraum“ an den Lead, Anruf-Knopf
//   „Nein, nicht gekommen“                   → nicht erschienen und No-Show-Rettung (wie „Nicht erschienen“ auf Heute)
// Schreibrecht wie überall (lib/buyer-write.ts): eigener Kunde, Berater nur für eigene Leads, Vorschau nur Demo-Leads.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { writableCustomerId } from "@/lib/buyer-write";
import { getBuyerContext } from "@/lib/buyer-context";
import { recordUsage } from "@/lib/usage";
import { setzeAnwesenheit, type WartetErgebnis } from "@/lib/showup-server";
import { appointmentOutcomeResult, type UndoSnapshot } from "@/app/buyer/inbox-actions";
import type { Anwesenheit } from "@/lib/showup";

export type AnwesenheitResult = { ok: true; anwesenheit: Anwesenheit; wa?: WartetErgebnis; undo?: UndoSnapshot } | { ok: false; error: string };

export async function anwesenheitAction(appointmentId: string, antwort: "da" | "fehlt" | "nicht_gekommen"): Promise<AnwesenheitResult> {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { id: true, leadId: true, customerId: true } });
  if (!appt?.leadId) return { ok: false, error: "Termin nicht gefunden." };
  const customerId = await writableCustomerId(appt.leadId);
  if (!customerId || customerId !== appt.customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  if (antwort === "nicht_gekommen") {
    // Gleicher Weg wie „Nicht erschienen“ auf „Heute“: Status, Anrufliste, No-Show-Rettung (lib/lead-sequences.ts)
    const r = await appointmentOutcomeResult(appt.id, "no_show", null);
    await recordUsage("action", "termin.nicht_gekommen");
    revalidatePath(`/buyer/termine/${appt.id}`);
    return r.ok ? { ok: true, anwesenheit: "nicht_erschienen", undo: r.undo } : r;
  }
  const ctx = await getBuyerContext();
  const r = await setzeAnwesenheit(appt.id, antwort, { customerId, userId: ctx?.userId ?? null });
  await recordUsage("action", `termin.${antwort}`);
  revalidatePath("/buyer");
  revalidatePath(`/buyer/termine/${appt.id}`);
  return r;
}
