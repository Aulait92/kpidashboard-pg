"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { runMediaBuyer, type CustomerBuyerResult } from "@/lib/media-buyer";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Nur Admins.");
  }
  return session;
}

export type SaveSettingsState = {
  ok?: boolean;
  error?: string;
  savedName?: string;
};

function parseIntOrNull(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseEurOrNull(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function saveCustomerBuyerSettings(
  _prev: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  await requireAdmin();

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return { error: "Kunde fehlt." };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true },
  });
  if (!customer) return { error: "Kunde existiert nicht." };

  const monthlyLeadGoal = parseIntOrNull(
    String(formData.get("monthlyLeadGoal") ?? ""),
  );
  const maxDailyBudget = parseEurOrNull(
    String(formData.get("maxDailyBudget") ?? ""),
  );
  const keywordRaw = String(formData.get("campaignKeyword") ?? "").trim();
  const campaignKeyword = keywordRaw === "" ? null : keywordRaw;
  const autopilot = formData.get("autopilot") === "on";

  await prisma.customer.update({
    where: { id: customerId },
    data: { monthlyLeadGoal, maxDailyBudget, campaignKeyword, autopilot },
  });

  revalidatePath("/admin/media-buyer");
  return { ok: true, savedName: customer.name };
}

export type DryRunState = {
  ok?: boolean;
  error?: string;
  results?: CustomerBuyerResult[];
};

// Trockenlauf: zeigt sofort, was der Buyer entscheiden würde — ohne an Meta
// zu schreiben oder zu benachrichtigen.
export async function runDryRun(): Promise<DryRunState> {
  await requireAdmin();
  try {
    const result = await runMediaBuyer({ dryRun: true });
    revalidatePath("/admin/media-buyer");
    return { ok: true, results: result.customers };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
