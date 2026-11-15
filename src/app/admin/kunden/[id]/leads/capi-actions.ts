"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { resolveDataset, setDatasetManually } from "@/lib/capi/server";

export type CapiDatasetState = { ok?: boolean; error?: string; message?: string };

/** Rückmeldung an Meta: Dataset von Hand setzen bzw. leeren (dann automatisch aus dem Werbekonto ermitteln). */
export async function setCapiDatasetAction(_prev: CapiDatasetState, fd: FormData): Promise<CapiDatasetState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { error: "Nur Admins." };
  const customerId = String(fd.get("customerId") ?? "");
  const raw = String(fd.get("dataset") ?? "").trim();
  const res = await setDatasetManually(customerId, raw || null);
  if (!res.ok) return { error: res.error };
  await audit("customer.capi_dataset", { entity: "Customer", entityId: customerId, customerId, details: { dataset: res.datasetId } });
  revalidatePath(`/admin/kunden/${customerId}`, "layout");
  if (res.datasetId) return { ok: true, message: "Dataset gespeichert." };
  // Leer: gleich automatisch suchen (Werbekonto → erstes Dataset)
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, metaAdAccountId: true, metaDatasetId: true, metaDatasetCheckedAt: true } });
  if (!c?.metaAdAccountId) return { ok: true, error: "Kein Werbekonto hinterlegt, daher keine automatische Suche." };
  const found = await resolveDataset(c, new Date(), { force: true });
  if (found) return { ok: true, message: `Automatisch ermittelt: ${found}` };
  const after = await prisma.customer.findUnique({ where: { id: customerId }, select: { metaDatasetError: true } });
  return { ok: true, error: `Nicht gefunden: ${after?.metaDatasetError ?? "kein Dataset"}` };
}
