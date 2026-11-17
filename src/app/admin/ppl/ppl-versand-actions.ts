"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type VersandTestState = { error?: string; message?: string };

/** „Testmail senden“: Latin-1-Testmail mit Umlauten über das Versand-Postfach an den angemeldeten Admin. */
export async function versandTestAction(_prev: VersandTestState, _fd: FormData): Promise<VersandTestState> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") return { error: "Nur Admins." };
  if (!s.email) return { error: "Keine E-Mail-Adresse am Login." };
  const { sendViaVersandPostfach, testMail, versandPostfachVerbunden } = await import("@/lib/ppl/versand-postfach");
  if (!(await versandPostfachVerbunden())) return { error: "Versand-Postfach nicht verbunden." };
  const r = await sendViaVersandPostfach(testMail(s.email));
  await audit("ppl.versand_testmail", { entity: "AdminMailbox", entityId: "ppl-versand", details: { an: s.email, ok: r.ok, fehler: r.error ?? null } });
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
  if (!r.ok) return { error: r.error ?? "Nicht gesendet." };
  if (r.blocked) return { error: `Testumgebung: ${s.email} ist durch MAIL_NUR_AN gesperrt.` };
  return { message: `Gesendet an ${s.email}. In Outlook „Quelle anzeigen“: charset=ISO-8859-1?` };
}
