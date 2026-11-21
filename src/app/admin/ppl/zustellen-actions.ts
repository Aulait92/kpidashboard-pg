"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export type ZustellenState = { error?: string; message?: string };

/**
 * Gelieferten Pay-per-Lead noch einmal über den Weg seines Bezugs zustellen (z. B. Mail kam nicht an,
 * Pivacom lehnte UTF-8 ab, 17.11.2026). Legt keinen neuen Lead an und berechnet nichts neu.
 */
export async function erneutZustellenAction(_prev: ZustellenState, fd: FormData): Promise<ZustellenState> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") return { error: "Nur Admins." };
  const leadId = String(fd.get("leadId") ?? "");
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, subscription: true } });
  if (!lead?.subscription) return { error: "Lead hat keinen Pay-per-Lead-Bezug." };
  const { sendDelivery } = await import("@/lib/ppl/delivery");
  const report = await sendDelivery(lead.id, lead.subscription);
  await audit("ppl.erneut_zugestellt", { entity: "Lead", entityId: lead.id, details: { ok: report.ok, ziele: report.targets.map((t) => ({ ziel: t.target, ok: t.ok, fehler: t.error ?? null })) } });
  revalidatePath("/admin/neu/leads/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
  const ziele = report.targets.map((t) => `${t.target} ${t.ok ? "✓" : `✗ ${t.error ?? ""}`}`).join(", ");
  return report.ok ? { message: `Erneut zugestellt: ${ziele || report.label}.${report.hinweis ? ` Achtung: ${report.hinweis}.` : ""}` } : { error: `Nicht zugestellt: ${report.error ?? ziele}` };
}
