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

  // "" = Gesamt; sonst Produktname. Leads werden nie hier gesetzt (Airtable).
  const product = String(formData.get("product") ?? "");
  const isTotal = product === "";

  // Lead- & Umsatzziel kommen automatisch aus Airtable — hier nur
  // Abschlussquote und Marge (beide in %, intern als 0..1).
  const closedPct = parseOptionalNumber(String(formData.get("closed") ?? ""));
  const marginPct = parseOptionalNumber(String(formData.get("margin") ?? ""));

  if (closedPct === undefined || marginPct === undefined) {
    return { error: "Ungültiger Wert (Zahlen, ≥ 0)." };
  }
  if ((closedPct != null && closedPct > 100) || (marginPct != null && marginPct > 100)) {
    return { error: "Quote/Marge max. 100 %." };
  }
  const closedRate = closedPct == null ? null : closedPct / 100;
  const margin = marginPct == null ? null : marginPct / 100;

  await upsertMonthlyGoal(monthKey, isTotal ? null : product, {
    closedRateGoal: closedRate,
    marginGoal: margin,
  });

  revalidatePath("/");
  return { ok: true };
}
