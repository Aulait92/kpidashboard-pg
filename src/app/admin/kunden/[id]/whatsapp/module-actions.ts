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
