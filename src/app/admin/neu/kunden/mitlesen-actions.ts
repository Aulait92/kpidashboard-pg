"use server";

// Glocke im Kopf der Kundenakte (Ole, 21.11.2026): Admin-Push bei Lead, Termin und Abschluss je Kunde an/aus.
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function mitlesenUmschaltenAction(fd: FormData): Promise<void> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  const customerId = String(fd.get("customerId") ?? "");
  if (!customerId) return;
  const an = fd.get("an") === "1";
  await prisma.customer.update({ where: { id: customerId }, data: { adminMitlesen: an } });
  await audit("customer.admin_mitlesen", { entity: "Customer", entityId: customerId, customerId, actor: { id: s.userId, email: s.email, role: s.role }, details: { an } });
  revalidatePath(`/admin/neu/kunden/${customerId}`, "layout");
}
