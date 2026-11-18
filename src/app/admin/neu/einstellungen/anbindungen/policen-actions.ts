"use server";

// Admin → Anbindungen → „KI für Unterlagen“: Nachweis „keine Speicherung“ beim Anbieter hinterlegen (schaltet
// Kranken/BU/Leben für das Auslesen frei, Rechtsprüfung K2) und die Pause nach 401 aufheben.

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { hebePauseAuf, setzeZdrNachweis } from "@/lib/policen/auslesen/server";

const PFAD = "/admin/neu/einstellungen/anbindungen";

export async function zdrNachweisAction(form: FormData): Promise<void> {
  const s = await requireAuth();
  const entfernen = form.get("entfernen") === "1";
  const am = String(form.get("am") ?? "");
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(am) ? new Date(`${am}T00:00:00Z`) : null;
  if (!entfernen && !datum) return;
  await setzeZdrNachweis({ am: entfernen ? null : datum, referenz: String(form.get("referenz") ?? ""), userId: s.userId });
  revalidatePath(PFAD);
}

export async function pauseAufhebenAction(): Promise<void> {
  const s = await requireAuth();
  await hebePauseAuf(s.userId);
  revalidatePath(PFAD);
}
