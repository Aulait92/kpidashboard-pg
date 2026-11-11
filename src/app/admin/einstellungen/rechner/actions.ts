"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { canEditRechner, saveRechnerConfig } from "@/lib/rechner-server";

export type RechnerFormState = { ok?: boolean; errors?: string[] };

/** Rechner-Einstellungen speichern (nur Admin, mit Änderungsprotokoll). */
export async function saveRechnerAction(_prev: RechnerFormState, fd: FormData): Promise<RechnerFormState> {
  const session = await requireAuth();
  if (!canEditRechner(session)) return { errors: ["Nur Admins dürfen den Rechner einstellen."] };
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("config") ?? ""));
  } catch {
    return { errors: ["Ungültige Eingabe."] };
  }
  const res = await saveRechnerConfig(raw, { id: session.userId, email: session.email, role: session.role });
  if (!res.ok) return { errors: res.errors };
  revalidatePath("/rechner");
  revalidatePath("/admin/einstellungen/rechner");
  return { ok: true };
}
