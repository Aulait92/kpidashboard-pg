"use server";

import { revalidatePath } from "next/cache";
import { deleteUpdate, draftUpdateWithAi, saveUpdate } from "@/lib/neuigkeiten";
import { asAudience, asKind } from "@/lib/neuigkeiten-shared";
import { requireAuth } from "@/lib/vertrieb/auth";

export type UpdateFormState = { ok?: boolean; error?: string; message?: string; savedAt?: number };

async function admin() {
  const session = await requireAuth();
  if (session.role !== "ADMIN") throw new Error("Nur Admins.");
  return { id: session.userId, email: session.email, role: session.role };
}

/** Eintrag speichern: als Entwurf oder veröffentlichen (optional mit Push). */
export async function saveUpdateAction(_prev: UpdateFormState, fd: FormData): Promise<UpdateFormState> {
  try {
    const actor = await admin();
    const publish = fd.get("intent") === "publish";
    const res = await saveUpdate(
      {
        id: String(fd.get("id") ?? "") || null,
        title: String(fd.get("title") ?? ""),
        body: String(fd.get("body") ?? ""),
        kind: asKind(fd.get("kind")),
        audience: asAudience(fd.get("audience")),
        publish,
        push: publish && fd.get("push") === "on",
      },
      actor,
    );
    if (!res.ok) return { error: res.error };
    revalidatePath("/admin/einstellungen/neuigkeiten");
    revalidatePath("/buyer", "layout");
    const pushNote = res.pushed > 0 ? ` Push an ${res.pushed} Gerät${res.pushed === 1 ? "" : "e"} gesendet.` : "";
    return { ok: true, savedAt: Date.now(), message: publish ? `Veröffentlicht.${pushNote}` : "Als Entwurf gespeichert." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

export async function deleteUpdateAction(fd: FormData): Promise<void> {
  const actor = await admin();
  await deleteUpdate(String(fd.get("id") ?? ""), actor);
  revalidatePath("/admin/einstellungen/neuigkeiten");
  revalidatePath("/buyer", "layout");
}

/** „Entwurf mit KI“: Stichworte → Titel, Text, Art. */
export async function draftUpdateAction(notes: string): Promise<{ ok: true; title: string; body: string; kind: string } | { ok: false; error: string }> {
  await admin();
  return draftUpdateWithAi(notes);
}
