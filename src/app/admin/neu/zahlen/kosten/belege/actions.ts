"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/vertrieb/auth";
import { audit } from "@/lib/audit";
import { syncBelege } from "@/lib/belege/server";

/** Belege sofort aus GetMyInvoices holen und zuordnen (sonst nachts automatisch). */
export async function belegeJetztAbgleichenAction() {
  await requireAuth();
  const r = await syncBelege().catch((e: unknown) => ({ geholt: 0, neu: 0, zugeordnet: 0, fehler: e instanceof Error ? e.message : String(e) }));
  await audit("belege.abgleich", { details: { ...r } });
  revalidatePath("/admin/neu/zahlen", "layout");
  if (r.fehler) redirect(`/admin/neu/zahlen/kosten/belege?fehler=${encodeURIComponent(r.fehler.slice(0, 200))}`);
  redirect(`/admin/neu/zahlen/kosten/belege?ok=${r.zugeordnet}`);
}
