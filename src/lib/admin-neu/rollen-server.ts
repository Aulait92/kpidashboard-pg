// Punkte von Mein Tag für eine Rolle laden (Admin v2, Paket A2): „Braucht Aufmerksamkeit“ oben auf den Rollen-Startseiten.
// Dieselben Punkte wie auf Mein Tag (lib/admin-heute.ts: loadAdminHeute, ausgeblendete Punkte des Admins fehlen).
// Fehler blenden den Block nur aus (Seite lädt weiter), Meldung an Sentry.

import { loadAdminHeute, type HeuteItem } from "@/lib/admin-heute";
import { reportError } from "@/lib/monitoring";
import { rolleVonPunkt, type Rolle } from "./rollen";

export async function punkteDerRolle(userId: string, rolle: Rolle, now = new Date()): Promise<HeuteItem[] | null> {
  try {
    const { items } = await loadAdminHeute(now, userId);
    return items.filter((i) => rolleVonPunkt(i) === rolle);
  } catch (err) {
    reportError(err, `admin-neu-aufmerksamkeit-${rolle}`);
    return null;
  }
}
