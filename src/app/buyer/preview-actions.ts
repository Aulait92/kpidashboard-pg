"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { VIEW_AS_COOKIE } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";

/** Admin: Kunden-CRM eines Kunden schreibgeschützt ansehen. */
export async function startPreviewAction(formData: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const customerId = String(formData.get("customerId") ?? "");
  const customer = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } })
    : null;
  if (!customer) redirect("/admin/buyers");
  (await cookies()).set(VIEW_AS_COOKIE, customer.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // Vorschau läuft nach 4 h von selbst aus
  });
  redirect("/buyer");
}

/** Vorschau beenden und zurück zur Buyer-Verwaltung. */
export async function endPreviewAction(): Promise<void> {
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/admin/buyers");
}
