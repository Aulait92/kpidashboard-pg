"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { setzeVermittlerDu } from "@/lib/vermittler-ansprache-server";

/** Neue Oberfläche des Kundenbereichs (Vertreter-A) für diesen Kunden an/aus. */
export async function toggleNewUiAction(fd: FormData): Promise<void> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  const id = String(fd.get("customerId") ?? "");
  const c = await prisma.customer.findUnique({ where: { id }, select: { newUi: true } });
  if (!c) return;
  await prisma.customer.update({ where: { id }, data: { newUi: !c.newUi } });
  await audit("customer.new_ui", { entity: "Customer", entityId: id, customerId: id, details: { enabled: !c.newUi } });
  revalidatePath(`/admin/neu/kunden/${id}`, "layout");
  revalidatePath("/buyer", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
}

/** Vermittlertyp (Vertreter/Makler) – bestimmt die Standard-Provisionssätze. */
export async function setVermittlerTypAction(fd: FormData): Promise<void> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  const id = String(fd.get("customerId") ?? "");
  const raw = fd.get("typ");
  const typ = raw === "makler" ? "makler" : raw === "mehrfachvertreter" ? "mehrfachvertreter" : "vertreter";
  const c = await prisma.customer.findUnique({ where: { id }, select: { vermittlerTyp: true } });
  if (!c || c.vermittlerTyp === typ) return;
  await prisma.customer.update({ where: { id }, data: { vermittlerTyp: typ } });
  await audit("customer.provision", { entity: "Customer", entityId: id, customerId: id, details: { typ, durch: "admin" } });
  revalidatePath(`/admin/neu/kunden/${id}`, "layout");
  revalidatePath("/buyer", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
}

/** Anrede gegenüber dem Kunden (Vermittler) selbst: Sie oder Du. Nicht die Ansprache seiner Leads (lib/vermittler-ansprache.ts). */
export async function setVermittlerDuAction(fd: FormData): Promise<void> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  const id = String(fd.get("customerId") ?? "");
  const raw = fd.get("anrede");
  if (raw !== "du" && raw !== "sie") return;
  if (!(await setzeVermittlerDu(id, raw === "du", { id: s.userId, email: s.email, role: s.role }))) return;
  revalidatePath(`/admin/neu/kunden/${id}`, "layout");
  revalidatePath("/buyer", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
}
