"use server";

// Vorschläge von Vermittlern zum Tarifkatalog (Ole, 18.11.2026): übernehmen, ablehnen, zurücknehmen. Nur Admin.

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { vorschlagAblehnen, vorschlagUebernehmen, vorschlagZuruecknehmen } from "@/lib/tarif-vorschlaege-server";

const ziel = (fd: FormData) => ({ tarifId: String(fd.get("tarifId") ?? ""), merkmal: String(fd.get("merkmal") ?? ""), wert: String(fd.get("wert") ?? "") });

function neuLaden() {
  revalidatePath("/admin/neu/einstellungen/tarife");
  revalidatePath("/admin/neu", "layout");
}

/** Wert übernehmen: wirkt sofort für alle Vermittler (Überlagerung über den Datei-Katalog). */
export async function tarifVorschlagUebernehmenAction(fd: FormData): Promise<void> {
  const s = await requireAuth();
  await vorschlagUebernehmen(ziel(fd), { id: s.userId, email: s.email, role: s.role });
  neuLaden();
}

export async function tarifVorschlagAblehnenAction(fd: FormData): Promise<void> {
  const s = await requireAuth();
  await vorschlagAblehnen(ziel(fd), { id: s.userId, email: s.email, role: s.role });
  neuLaden();
}

/** Übernommen bzw. abgelehnt → wieder offen (ein übernommener Wert gilt dann nicht mehr). */
export async function tarifVorschlagZuruecknehmenAction(fd: FormData): Promise<void> {
  const s = await requireAuth();
  await vorschlagZuruecknehmen(ziel(fd), { id: s.userId, email: s.email, role: s.role });
  neuLaden();
}
