"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { sendAnnouncement } from "@/lib/empfehlung/module";

/** Einmalige Ankündigung „Neu: Empfehlungen & Bewertungen“ – nur per Knopf, mit Bestätigung. */
export async function sendAnnouncementAction(fd: FormData): Promise<void> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  // Neuer Admin (Zahlen → Qualität & Nutzung) schickt zurueck=neu mit
  const basis = fd.get("zurueck") === "neu" ? "/admin/neu/zahlen/qualitaet" : "/admin/nutzung";
  if (fd.get("confirm") !== "on") redirect(`${basis}?ankuendigung=bestaetigen#zusatzmodule`);
  const r = await sendAnnouncement({ id: s.userId, email: s.email, role: s.role });
  revalidatePath("/admin/nutzung");
  revalidatePath("/admin/neu", "layout");
  redirect(`${basis}?ankuendigung=${encodeURIComponent(r.ok ? `Verschickt an ${r.sent} Kunden.` : r.error)}#zusatzmodule`);
}
