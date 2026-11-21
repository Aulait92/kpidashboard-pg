"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { sendAnnouncement } from "@/lib/empfehlung/module";

// Rücksprung: Nutzung (alt) oder im neuen Admin Einstellungen → Neuigkeiten bzw. Zahlen → Qualität & Nutzung (nur diese)
const ZIELE = ["/admin/neu/zahlen/qualitaet", "/admin/neu/einstellungen/neuigkeiten", "/admin/neu/zahlen/qualitaet"];

/** Einmalige Ankündigung „Neu: Empfehlungen & Bewertungen“ – nur per Knopf, mit Bestätigung. */
export async function sendAnnouncementAction(fd: FormData): Promise<void> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  const ziel = ZIELE.includes(String(fd.get("zurueck") ?? "")) ? String(fd.get("zurueck")) : ZIELE[0];
  if (fd.get("confirm") !== "on") redirect(`${ziel}?ankuendigung=bestaetigen#zusatzmodule`);
  const r = await sendAnnouncement({ id: s.userId, email: s.email, role: s.role });
  revalidatePath("/admin/neu/zahlen/qualitaet");
  revalidatePath("/admin/neu", "layout");
  redirect(`${ziel}?ankuendigung=${encodeURIComponent(r.ok ? `Verschickt an ${r.sent} Kunden.` : r.error)}#zusatzmodule`);
}
