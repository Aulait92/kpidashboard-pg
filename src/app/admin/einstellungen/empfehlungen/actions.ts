"use server";

import { revalidatePath } from "next/cache";
import { saveReferralSettings } from "@/lib/kollegen";
import { requireAuth } from "@/lib/vertrieb/auth";

export type ReferralSettingsState = { ok?: boolean; error?: string; savedAt?: number };

/** Einstellungen „Kollegen empfehlen“ (nur Admin, mit Änderungsprotokoll). */
export async function saveReferralSettingsAction(_prev: ReferralSettingsState, fd: FormData): Promise<ReferralSettingsState> {
  const session = await requireAuth();
  const fixed = Number(String(fd.get("rewardFixed") ?? "").replace(",", "."));
  const res = await saveReferralSettings(
    {
      enabled: fd.get("enabled") === "on",
      rewardKind: String(fd.get("rewardKind") ?? "month"),
      rewardFixed: Number.isFinite(fixed) && fixed > 0 ? fixed : null,
      benefitKind: String(fd.get("benefitKind") ?? "none"),
      benefitText: String(fd.get("benefitText") ?? ""),
    },
    { id: session.userId, email: session.email, role: session.role },
  );
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/einstellungen/empfehlungen");
  return { ok: true, savedAt: Date.now() };
}
