"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { nachholenAusAirtable } from "@/lib/ppl/airtable-nachholen";

export type NachholenState = { error?: string; message?: string };

const STATUS: Record<string, string> = { delivered: "ausgeliefert", parked: "geparkt", duplicate: "Dublette", invalid: "ungültig" };

/** Admin → Pay-per-Lead → Geparkt: Lead aus Airtable (Lead-Nr.) in den App-Eingang holen. */
export async function nachholenAction(_prev: NachholenState, fd: FormData): Promise<NachholenState> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") return { error: "Nur Admins." };
  const nr = Number(String(fd.get("leadNr") ?? "").replace(/\D/g, ""));
  if (!Number.isFinite(nr) || nr <= 0) return { error: "Bitte die Lead-Nr. aus Airtable eingeben." };
  const r = await nachholenAusAirtable(nr);
  if (!r.ok) return { error: r.error };
  await audit("ppl.airtable_nachgeholt", { entity: "PoolLead", entityId: r.result.poolLeadId, details: { leadNr: nr, status: r.result.status, grund: r.result.reason ?? null } });
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout");
  const st = STATUS[r.result.status] ?? r.result.status;
  return { message: `Lead ${nr}: ${st}${r.result.reason ? ` (${r.result.reason})` : ""}.` };
}
