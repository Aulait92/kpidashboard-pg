"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { sendReport } from "@/lib/monatsbericht/server";
import { prisma } from "@/lib/prisma";
import type { ReportActionState } from "@/app/admin/monatsberichte/actions";

/** Entwürfe, die „Alle guten freigeben“ verschickt: Einstufung „gut“, Daten nicht unsicher, noch nicht entschieden. */
const guteEntwuerfeWhere = (month: string) => ({ month, status: "draft", rating: "gut", NOT: { dataQuality: "unsicher" } });

/**
 * Betreuen › Monatsberichte: alle guten Entwürfe eines Monats unverändert senden (je Bericht derselbe Weg wie „So senden“
 * in der Kundenakte: lib/monatsbericht/server.ts sendReport, mit Audit). Mittlere, schwache und unsichere Berichte
 * bleiben zur Einzelprüfung liegen.
 */
export async function alleGutenFreigebenAction(_prev: ReportActionState, fd: FormData): Promise<ReportActionState> {
  const s = await requireAuth();
  const month = String(fd.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Monat fehlt." };
  const actor = { id: s.userId, email: s.email, role: s.role };
  const ids = (await prisma.monthlyReport.findMany({ where: guteEntwuerfeWhere(month), select: { id: true } })).map((r) => r.id);
  if (!ids.length) return { error: "Kein guter Entwurf offen." };
  let ok = 0;
  const fehler: string[] = [];
  for (const id of ids) {
    const r = await sendReport(id, actor);
    if (r.ok) ok++;
    else fehler.push(r.error);
  }
  revalidatePath("/admin/monatsberichte");
  revalidatePath("/admin/neu", "layout");
  if (fehler.length) return { ok: ok > 0, error: `${ok} gesendet, ${fehler.length} nicht: ${fehler[0]}` };
  return { ok: true, message: `${ok} ${ok === 1 ? "Bericht" : "Berichte"} gesendet.` };
}
