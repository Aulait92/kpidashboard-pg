"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { checkAdAccountAccess } from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export type MetaAccountState = { ok?: boolean; error?: string; message?: string };

/** Meta-Werbekonto des Kunden hinterlegen (für Adspend) und Zugriff prüfen. */
export async function setMetaAdAccountAction(_prev: MetaAccountState, fd: FormData): Promise<MetaAccountState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { error: "Nur Admins." };
  const customerId = String(fd.get("customerId") ?? "");
  const raw = String(fd.get("account") ?? "").trim().replace(/^act_/i, "").replace(/\s/g, "");
  if (raw && !/^\d{5,25}$/.test(raw)) return { error: "Bitte die Werbekonto-ID eingeben (nur Ziffern, z. B. 1234567890123456)." };
  await prisma.customer.update({ where: { id: customerId }, data: { metaAdAccountId: raw || null } });
  await audit("customer.meta_account", { entity: "Customer", entityId: customerId, customerId, details: { account: raw || null } });
  revalidatePath(`/admin/kunden/${customerId}`, "layout");
  if (!raw) return { ok: true, message: "Werbekonto entfernt." };
  const check = await checkAdAccountAccess(raw);
  return check.ok
    ? { ok: true, message: `Gespeichert. Zugriff klappt: „${check.name}“ (${check.currency}). Der Adspend kommt mit dem nächsten Sync.` }
    : { ok: true, error: `Gespeichert, aber noch kein Zugriff: ${check.error}` };
}
