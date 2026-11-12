"use server";

import { revalidatePath } from "next/cache";
import { saveCatalogItem } from "@/lib/produkt-buchen";
import { requireAuth } from "@/lib/vertrieb/auth";

export type CatalogState = { ok?: boolean; error?: string; savedAt?: number };

/** Katalog buchbarer Produkte (nur Admin, mit Änderungsprotokoll). */
export async function saveCatalogItemAction(_prev: CatalogState, fd: FormData): Promise<CatalogState> {
  const session = await requireAuth();
  if (session.role !== "ADMIN") return { error: "Nur Admins." };
  const res = await saveCatalogItem(
    String(fd.get("key") ?? ""),
    { enabled: fd.get("enabled") === "on", proven: fd.get("proven") === "on", benefit: String(fd.get("benefit") ?? "") },
    { id: session.userId, email: session.email, role: session.role },
  );
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/einstellungen/produkte");
  revalidatePath("/buyer/konto");
  return { ok: true, savedAt: Date.now() };
}
