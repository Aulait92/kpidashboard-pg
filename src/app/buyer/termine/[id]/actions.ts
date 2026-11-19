"use server";

// Terminseite (UX-Runde Team C, 19.11.2026): „Wie lief der Termin?“ mit „Abschluss“ als Hauptaktion. Speichert über den
// bestehenden Weg (appointmentOutcomeResult, wie „Ergebnis eintragen“ auf Heute); Beitrag und Glückwunsch folgen inline
// (components/abschluss-nachher.tsx).

import { revalidatePath } from "next/cache";
import { appointmentOutcomeResult, type InboxResult } from "@/app/buyer/inbox-actions";
import { recordUsage } from "@/lib/usage";

export async function terminAbschlussAction(appointmentId: string): Promise<InboxResult> {
  const r = await appointmentOutcomeResult(appointmentId, "closed", null);
  if (r.ok) {
    await recordUsage("action", "termin.abschluss");
    revalidatePath(`/buyer/termine/${appointmentId}`);
  }
  return r;
}
