"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { preisPilotSetzen } from "@/lib/preise/pilot-server";

/** Schalter „Beiträge rechnen“ je Gesellschaft und Sparte umlegen (nur Admin). */
export async function preisPilotUmschaltenAction(fd: FormData): Promise<void> {
  const session = await requireAuth();
  const schluessel = String(fd.get("schluessel") ?? "");
  const an = fd.get("an") === "1";
  await preisPilotSetzen(schluessel, an, { id: session.userId, email: session.email, role: session.role });
  revalidatePath("/admin/einstellungen/beitraege");
}
