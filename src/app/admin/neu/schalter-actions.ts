"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { ADMIN_NEU_COOKIE, ADMIN_NEU_MAX_AGE } from "@/lib/admin-neu/schalter";
import { requireAuth } from "@/lib/vertrieb/auth";

/** „Neue Oberfläche“ an/aus (Profilmenü beider Oberflächen). An → /admin/neu, aus → /admin/heute. */
export async function neueOberflaecheAction(fd: FormData): Promise<void> {
  const session = await requireAuth();
  const an = fd.get("an") === "1";
  const jar = await cookies();
  if (an) {
    jar.set(ADMIN_NEU_COOKIE, "1", {
      path: "/",
      maxAge: ADMIN_NEU_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } else {
    jar.delete(ADMIN_NEU_COOKIE);
  }
  await audit("admin.new_ui", { entity: "User", entityId: session.userId, details: { enabled: an, oberflaeche: "admin-neu" } });
  redirect(an ? "/admin/neu" : "/admin/heute");
}
