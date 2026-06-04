"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { runMediaBuyer, type PoolResult } from "@/lib/media-buyer";
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
  savedLabel?: string;
};

function parseEurOrNull(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Speichert die Steuer-Einstellungen eines Liefer-Pools (Autopilot,
// Max-Budget, optionales Kampagnen-Keyword). Ziele sind read-only (Airtable).
export async function savePoolSettings(
  _prev: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  await requireAdmin();

  const key = String(formData.get("poolKey") ?? "");
  if (!key) return { error: "Pool fehlt." };

  const pool = await prisma.deliveryPool.findUnique({
    where: { key },
    select: { label: true },
  });
  if (!pool) return { error: "Pool existiert nicht (erst Sync/Lauf abwarten)." };

  const maxDailyBudget = parseEurOrNull(
    String(formData.get("maxDailyBudget") ?? ""),
  );
  const keywordRaw = String(formData.get("campaignKeyword") ?? "").trim();
  const campaignKeyword = keywordRaw === "" ? null : keywordRaw;
  const obKeywordRaw = String(
    formData.get("outbrainCampaignKeyword") ?? "",
  ).trim();
  const outbrainCampaignKeyword = obKeywordRaw === "" ? null : obKeywordRaw;
  const autopilot = formData.get("autopilot") === "on";

  await prisma.deliveryPool.update({
    where: { key },
    data: {
      maxDailyBudget,
      campaignKeyword,
      outbrainCampaignKeyword,
      autopilot,
    },
  });

  revalidatePath("/admin/media-buyer");
  return { ok: true, savedLabel: pool.label };
}

export type DryRunState = {
  ok?: boolean;
  error?: string;
  results?: PoolResult[];
};

// Trockenlauf: simuliert alle Pools (auch ohne Autopilot) — ohne an Meta zu
// schreiben oder zu benachrichtigen.
export async function runDryRun(): Promise<DryRunState> {
  await requireAdmin();
  try {
    const result = await runMediaBuyer({ dryRun: true });
    revalidatePath("/admin/media-buyer");
    return { ok: true, results: result.pools };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// Jetzt anwenden: echter Lauf, der die Normalbetrieb-Drosselung überspringt.
// Schreibt an Meta (nur Autopilot-Pools) — z. B. direkt nach dem Aktivieren
// des Autopiloten, um nicht aufs Drossel-Fenster zu warten.
export async function runApplyNow(): Promise<DryRunState> {
  await requireAdmin();
  try {
    const result = await runMediaBuyer({ force: true });
    revalidatePath("/admin/media-buyer");
    return { ok: true, results: result.pools };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
