"use server";

// Admin: Betreuungsgebühr (Retainer) eines Kunden von Hand pflegen – für
// Alt-Kunden ohne Online-Angebot. Fließt in die Zahlen-Seite (Umsatzbuch) und
// in die Lead-Kosten des Kunden-Dashboards. Ändert NICHTS an Stripe.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminZiel } from "@/components/admin-neu/ui/rueckweg";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Mittag UTC, damit der Berliner Kalendertag stabil bleibt
const toDate = (s: string) => new Date(`${s}T12:00:00.000Z`);
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function back(id: string, msg: string, failed = false): Promise<never> {
  revalidatePath(`/admin/neu/kunden/${id}`, "layout");
  revalidatePath("/admin/neu/zahlen");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  redirect(await adminZiel(`/admin/neu/kunden/${id}/abrechnung?retainer=${encodeURIComponent(msg)}${failed ? "&fehler=1" : ""}`));
}

export async function saveRetainerAction(fd: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") throw new Error("Nur Admins.");
  const id = String(fd.get("customerId") ?? "");
  const rawAmount = String(fd.get("monthly") ?? "").replace(/\s|€/g, "");
  const start = String(fd.get("start") ?? "").trim();
  const end = String(fd.get("end") ?? "").trim();
  const c = await prisma.customer.findUnique({ where: { id }, select: { retainerMonthly: true, retainerStart: true, retainerEnd: true } });
  if (!c) return back(id, "Kunde nicht gefunden.", true);

  // Leeres Betragsfeld = Betreuungsgebühr entfernen
  if (!rawAmount) {
    await prisma.customer.update({ where: { id }, data: { retainerMonthly: null, retainerEnd: null } });
    await audit("billing.retainer", { entity: "Customer", entityId: id, customerId: id, details: { monthly: { from: c.retainerMonthly != null ? Number(c.retainerMonthly) : null, to: null } } });
    return back(id, "Betreuungsgebühr entfernt.");
  }
  const monthly = Number(rawAmount.includes(",") ? rawAmount.replace(/\./g, "").replace(",", ".") : rawAmount);
  if (!Number.isFinite(monthly) || monthly <= 0 || monthly > 100_000) return back(id, "Bitte einen Monatsbetrag (netto) über 0 € eingeben.", true);
  if (!DATE.test(start)) return back(id, "Bitte das Startdatum angeben.", true);
  if (end && (!DATE.test(end) || end < start)) return back(id, "Das Ende liegt vor dem Start.", true);

  await prisma.customer.update({ where: { id }, data: { retainerMonthly: monthly, retainerStart: toDate(start), retainerEnd: end ? toDate(end) : null } });
  await audit("billing.retainer", {
    entity: "Customer",
    entityId: id,
    customerId: id,
    details: {
      monthly: { from: c.retainerMonthly != null ? Number(c.retainerMonthly) : null, to: monthly },
      start: { from: ymd(c.retainerStart), to: start },
      end: { from: ymd(c.retainerEnd), to: end || null },
    },
  });
  return back(id, "Betreuungsgebühr gespeichert.");
}
