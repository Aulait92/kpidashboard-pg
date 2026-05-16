"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { upsertMonthlyGoal } from "@/lib/goals";

export type SaveGoalState = {
  ok?: boolean;
  error?: string;
};

function parseOptionalNumber(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined; // invalid
  return n;
}

export async function saveMonthlyGoals(
  _prev: SaveGoalState,
  formData: FormData,
): Promise<SaveGoalState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    return { error: "Nur Admins." };
  }

  const monthKey = String(formData.get("monthKey") ?? "");
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return { error: "Ungültiger Monat." };
  }

  const leads = parseOptionalNumber(String(formData.get("leads") ?? ""));
  const closed = parseOptionalNumber(String(formData.get("closed") ?? ""));
  const revenue = parseOptionalNumber(String(formData.get("revenue") ?? ""));
  const marginPct = parseOptionalNumber(String(formData.get("margin") ?? ""));

  if (
    leads === undefined ||
    closed === undefined ||
    revenue === undefined ||
    marginPct === undefined
  ) {
    return { error: "Ungültiger Wert (Zahlen, ≥ 0)." };
  }
  if (marginPct != null && marginPct > 100) {
    return { error: "Marge max. 100 %." };
  }
  // Marge wird als Prozent eingegeben, intern als 0..1 gespeichert.
  const margin = marginPct == null ? null : marginPct / 100;

  await upsertMonthlyGoal(monthKey, {
    leadsGoal: leads == null ? null : Math.round(leads),
    closedGoal: closed == null ? null : Math.round(closed),
    revenueGoal: revenue,
    marginGoal: margin,
  });

  revalidatePath("/");
  return { ok: true };
}
