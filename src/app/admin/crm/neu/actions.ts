"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findSalesPhaseForStatus } from "@/lib/sales-phases";

export type NewDealState = { error?: string };

/** Deal direkt im Dashboard anlegen (ohne Airtable) – z. B. für ein Angebot im Gespräch. */
export async function createDealAction(_prev: NewDealState, formData: FormData): Promise<NewDealState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { error: "Nicht berechtigt." };
  const str = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const name = str("name");
  if (!name) return { error: "Bitte einen Namen angeben." };
  const email = str("email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Die E-Mail-Adresse sieht nicht gültig aus." };
  const status = str("status") ?? "Neuer Lead";
  const won = findSalesPhaseForStatus(status)?.terminal === "won";

  const deal = await prisma.deal.create({
    data: {
      name,
      company: str("company"),
      email,
      phone: str("phone"),
      product: str("product"),
      status,
      source: "Manuell (Dashboard)",
      owner: session.email ?? null,
      notes: str("notes"),
      ...(won ? { wonAt: new Date() } : {}),
    },
  });
  await prisma.dealActivity
    .create({ data: { dealId: deal.id, kind: "note", title: "Deal im Dashboard angelegt", createdById: session.userId } })
    .catch(() => {});
  revalidatePath("/admin/crm");
  redirect(`/admin/crm/${deal.id}`);
}
