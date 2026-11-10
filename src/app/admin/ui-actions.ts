"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { adminHome } from "@/lib/admin-ui";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

/** Neue Admin-Oberfläche (Admin-A) für den angemeldeten Admin an/aus. */
export async function toggleAdminNewUiAction(): Promise<void> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  const u = await prisma.user.findUnique({ where: { id: s.userId }, select: { adminNewUi: true } });
  if (!u) return;
  const enabled = !u.adminNewUi;
  await prisma.user.update({ where: { id: s.userId }, data: { adminNewUi: enabled } });
  await audit("admin.new_ui", { entity: "User", entityId: s.userId, details: { enabled } });
  revalidatePath("/", "layout");
  redirect(adminHome(enabled));
}
