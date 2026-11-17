// Punkte von „Mein Tag“ (lib/admin-heute.ts) je Rolle des Admin v2 (Paket A2, Zuordnung docs/ux/admin-v2/zuordnung.md):
// Mein Tag bündelt die Punkte in Karten je Rolle, jede Rollen-Startseite zeigt oben ihre Punkte („Braucht Aufmerksamkeit“).
// Reine Daten, nur Typ-Import.

import type { HeuteItem } from "@/lib/admin-heute";
import type { BereichId } from "./navigation";

export type Rolle = Extract<BereichId, "verkaufen" | "betreuen" | "liefern" | "geld" | "werkzeuge">;

/** Reihenfolge auf Mein Tag; Werkzeuge (Technik, z. B. Hintergrund-Jobs) zuletzt. */
export const ROLLEN_REIHE: Rolle[] = ["verkaufen", "betreuen", "liefern", "geld", "werkzeuge"];

/** Rolle eines Punkts: Geld (Zahlung offen, Bank, Steuernummer) vor dem Bereich, sonst nach Bereich. */
export function rolleVonPunkt(i: Pick<HeuteItem, "key" | "area">): Rolle {
  if (i.key.startsWith("pay:") || i.key.startsWith("bank:") || i.key.startsWith("rechnung:")) return "geld";
  switch (i.area) {
    case "Vertrieb":
      return "verkaufen";
    case "Kunden":
    case "Chats":
      return "betreuen";
    case "Leads":
    case "Pay-per-Lead":
      return "liefern";
    default:
      return "werkzeuge";
  }
}

/** Punkte je Rolle in fester Reihenfolge, nur Rollen mit Punkten; Reihenfolge innerhalb bleibt (Dringlichkeit). */
export function punkteJeRolle<T extends Pick<HeuteItem, "key" | "area">>(items: T[]): { rolle: Rolle; punkte: T[] }[] {
  return ROLLEN_REIHE.map((rolle) => ({ rolle, punkte: items.filter((i) => rolleVonPunkt(i) === rolle) })).filter((g) => g.punkte.length > 0);
}
