"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function toggleBestandModuleAction(fd: FormData): Promise<void> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  const id = String(fd.get("customerId") ?? "");
  const c = await prisma.customer.findUnique({ where: { id }, select: { existingCustomersEnabled: true } });
  if (!c) return;
  await prisma.customer.update({ where: { id }, data: { existingCustomersEnabled: !c.existingCustomersEnabled } });
  await audit("bestand.module", { entity: "Customer", entityId: id, customerId: id, details: { enabled: !c.existingCustomersEnabled } });
  revalidatePath(`/admin/kunden/${id}`, "layout");
}

/** Neue Oberfläche des Kundenbereichs (Vertreter-A) für diesen Kunden an/aus. */
export async function toggleNewUiAction(fd: FormData): Promise<void> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  const id = String(fd.get("customerId") ?? "");
  const c = await prisma.customer.findUnique({ where: { id }, select: { newUi: true } });
  if (!c) return;
  await prisma.customer.update({ where: { id }, data: { newUi: !c.newUi } });
  await audit("customer.new_ui", { entity: "Customer", entityId: id, customerId: id, details: { enabled: !c.newUi } });
  revalidatePath(`/admin/kunden/${id}`, "layout");
  revalidatePath("/buyer", "layout");
}

/** Vermittlertyp (Vertreter/Makler) – bestimmt die Standard-Provisionssätze. */
export async function setVermittlerTypAction(fd: FormData): Promise<void> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  const id = String(fd.get("customerId") ?? "");
  const typ = fd.get("typ") === "makler" ? "makler" : "vertreter";
  const c = await prisma.customer.findUnique({ where: { id }, select: { vermittlerTyp: true } });
  if (!c || c.vermittlerTyp === typ) return;
  await prisma.customer.update({ where: { id }, data: { vermittlerTyp: typ } });
  await audit("customer.provision", { entity: "Customer", entityId: id, customerId: id, details: { typ, durch: "admin" } });
  revalidatePath(`/admin/kunden/${id}`, "layout");
  revalidatePath("/buyer", "layout");
}
