"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { HALTE_DEFAULTS, type HalteSettings } from "@/lib/halteangebote";
import { saveHalteSettings } from "@/lib/halteangebote-server";
import { requireAuth } from "@/lib/vertrieb/auth";

export type HalteFormState = { ok?: boolean; error?: string; savedAt?: number };

/** Halteangebote: je Angebot an/aus, Prozente, Monate, Preis „Nur Bestand“ (nur Admin, mit Änderungsprotokoll). */
export async function saveHalteAction(_prev: HalteFormState, fd: FormData): Promise<HalteFormState> {
  const session = await requireAuth();
  if (session.role !== "ADMIN") return { error: "Nur Admins." };
  const input: Partial<Record<keyof HalteSettings, unknown>> = {};
  for (const key of Object.keys(HALTE_DEFAULTS) as (keyof HalteSettings)[]) {
    if (typeof HALTE_DEFAULTS[key] === "boolean") input[key] = fd.get(key) === "on";
    else if (fd.has(key)) input[key] = String(fd.get(key) ?? "");
  }
  const next = await saveHalteSettings(input);
  await audit("halteangebote.einstellungen", {
    entity: "RetentionOfferSettings",
    entityId: "default",
    details: next,
    actor: { id: session.userId, email: session.email, role: session.role },
  }).catch(() => undefined);
  revalidatePath("/admin/neu/einstellungen/halteangebote");
  return { ok: true, savedAt: Date.now() };
}
