"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/vertrieb/auth";
import { deleteLoginCard, moveLoginCard, saveLoginCard, toggleLoginCard, type LoginCardImageChange } from "@/lib/login-karten-server";

export type LoginCardFormState = { ok?: boolean; errors?: string[]; savedAt?: number };

const actorOf = (s: { userId: string; email: string; role: string }) => ({ id: s.userId, email: s.email, role: s.role });

// Rücksprung nach Anlegen bzw. Löschen: alte Seite oder die im neuen Admin (nur diese beiden, kein offener Redirect)
const BASEN = ["/admin/einstellungen/login", "/admin/neu/einstellungen/login"];
const basisAus = (fd: FormData) => (BASEN.includes(String(fd.get("basis") ?? "")) ? String(fd.get("basis")) : BASEN[0]);

function refresh() {
  revalidatePath("/login");
  revalidatePath("/admin/einstellungen/login");
}

/** Karte anlegen oder speichern (nur Admin, mit Änderungsprotokoll). */
export async function saveLoginCardAction(_prev: LoginCardFormState, fd: FormData): Promise<LoginCardFormState> {
  const session = await requireAuth();
  const id = String(fd.get("id") ?? "") || null;
  let image: LoginCardImageChange = { kind: "keep" };
  const file = fd.get("image");
  if (fd.get("removeImage") === "1") image = { kind: "remove" };
  else if (file instanceof File && file.size > 0) {
    image = { kind: "set", bytes: new Uint8Array(await file.arrayBuffer()), type: file.type };
  }
  const res = await saveLoginCard(
    id,
    {
      enabled: fd.get("enabled"),
      badge: fd.get("badge"),
      title: fd.get("title"),
      text: fd.get("text"),
      linkText: fd.get("linkText"),
      linkUrl: fd.get("linkUrl"),
    },
    image,
    actorOf(session),
  );
  if (!res.ok) return { errors: res.errors };
  refresh();
  // Neue Karte: zur Bearbeitung der angelegten Karte wechseln
  if (!id) redirect(`${basisAus(fd)}?karte=${encodeURIComponent(res.card.id)}&gespeichert=1`);
  return { ok: true, savedAt: Date.now() };
}

export async function toggleLoginCardAction(fd: FormData): Promise<void> {
  const session = await requireAuth();
  await toggleLoginCard(String(fd.get("id") ?? ""), actorOf(session));
  refresh();
}

export async function moveLoginCardAction(fd: FormData): Promise<void> {
  const session = await requireAuth();
  await moveLoginCard(String(fd.get("id") ?? ""), fd.get("dir") === "up" ? -1 : 1, actorOf(session));
  refresh();
}

export async function deleteLoginCardAction(fd: FormData): Promise<void> {
  const session = await requireAuth();
  await deleteLoginCard(String(fd.get("id") ?? ""), actorOf(session));
  refresh();
  redirect(basisAus(fd));
}
