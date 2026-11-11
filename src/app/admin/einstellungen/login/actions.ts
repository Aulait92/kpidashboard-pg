"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { saveLoginInfo, type LoginInfoImageChange } from "@/lib/login-info-server";

export type LoginInfoFormState = { ok?: boolean; errors?: string[]; savedAt?: number };

/** Infokarte der Login-Seite speichern (nur Admin, mit Änderungsprotokoll). */
export async function saveLoginInfoAction(_prev: LoginInfoFormState, fd: FormData): Promise<LoginInfoFormState> {
  const session = await requireAuth();
  let image: LoginInfoImageChange = { kind: "keep" };
  const file = fd.get("image");
  if (fd.get("removeImage") === "1") image = { kind: "remove" };
  else if (file instanceof File && file.size > 0) {
    image = { kind: "set", bytes: new Uint8Array(await file.arrayBuffer()), type: file.type };
  }
  const res = await saveLoginInfo(
    {
      enabled: fd.get("enabled"),
      badge: fd.get("badge"),
      title: fd.get("title"),
      text: fd.get("text"),
      linkText: fd.get("linkText"),
      linkUrl: fd.get("linkUrl"),
    },
    image,
    { id: session.userId, email: session.email, role: session.role },
  );
  if (!res.ok) return { errors: res.errors };
  revalidatePath("/login");
  revalidatePath("/admin/einstellungen/login");
  return { ok: true, savedAt: Date.now() };
}
