"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { saveSetupSettings, VIDEO_STEPS } from "@/lib/selbst-einrichtung";

export type SetupSettingsState = { ok?: boolean; error?: string };

export async function saveSetupSettingsAction(_prev: SetupSettingsState, fd: FormData): Promise<SetupSettingsState> {
  await requireAuth();
  const videos: Record<string, string> = {};
  for (const k of VIDEO_STEPS) videos[k] = String(fd.get(`video_${k}`) ?? "");
  const res = await saveSetupSettings({ businessId: String(fd.get("businessId") ?? ""), videos });
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/einstellungen/einrichtung");
  revalidatePath("/buyer/einrichtung");
  return { ok: true };
}
