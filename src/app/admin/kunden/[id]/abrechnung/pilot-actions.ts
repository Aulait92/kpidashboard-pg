"use server";

// Admin: Pilot bis … am Kunden setzen oder entfernen (Ole, 20.11.2026). Erinnerungen an das Pilotende legt
// lib/pilot-server.ts an. Ändert nichts an Stripe.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminZiel } from "@/components/admin-neu/ui/rueckweg";
import { requireAuth } from "@/lib/vertrieb/auth";
import { parsePilotBis } from "@/lib/pilot";
import { setzePilot } from "@/lib/pilot-server";

export async function savePilotAction(fd: FormData): Promise<void> {
  await requireAuth();
  const id = String(fd.get("customerId") ?? "");
  const parsed = fd.get("entfernen") === "1" ? ({ ok: true, value: null } as const) : parsePilotBis(fd.get("pilotBis"));
  const res = parsed.ok ? await setzePilot(id, parsed.value) : parsed;
  revalidatePath(`/admin/kunden/${id}`, "layout");
  revalidatePath("/admin/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenliste und Kundenakte)
  const msg = !res.ok ? res.error : parsed.ok && parsed.value ? "Pilot gespeichert, Erinnerungen sind angelegt." : "Pilot entfernt.";
  redirect(await adminZiel(`/admin/kunden/${id}/abrechnung?pilot=${encodeURIComponent(msg)}${res.ok ? "" : "&fehler=1"}#pilot`));
}
