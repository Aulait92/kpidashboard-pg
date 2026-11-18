// Punkte von Mein Tag für Zähler und Rollen (Admin v2, Pakete A2/A1b): EINE Quelle für die Zahl an „Mein Tag“, die
// Zähler je Rolle in der Seitenleiste, die Karten auf Mein Tag und „Braucht Aufmerksamkeit“ auf den Rollen-Startseiten.
// loadAdminHeute (lib/admin-heute.ts, ausgeblendete Punkte des Admins fehlen) läuft je Anfrage nur einmal (React cache):
// Layout und Seite teilen sich das Ergebnis. Fehler blenden Zähler bzw. Block nur aus, Meldung an Sentry.

import { cache } from "react";
import { activeDismissals, loadAdminHeute, rankItems, withoutDismissed, type HeuteItem } from "@/lib/admin-heute";
import { reportError } from "@/lib/monitoring";
import { punkteJeRolle, rolleVonPunkt, type Rolle } from "./rollen";

/** Punkte, die nur der neue Admin zeigt (Admin v2): Leadpreis je Werbekonto mehr als 5 € über Ziel (Paket A6). */
async function v2Punkte(userId: string): Promise<HeuteItem[]> {
  try {
    const { leadpreisPunkte } = await import("@/lib/optimierung/leadpreis-server");
    const [punkte, aus] = await Promise.all([leadpreisPunkte(), activeDismissals(userId)]);
    return withoutDismissed(punkte, aus);
  } catch (err) {
    reportError(err, "admin-neu-leadpreis-punkte");
    return [];
  }
}

/** Mein-Tag-Punkte des Admins, einmal je Anfrage geladen. */
export const heuteFuer = cache(async (userId: string) => {
  const [heute, extra] = await Promise.all([loadAdminHeute(new Date(), userId), v2Punkte(userId)]);
  return extra.length ? { ...heute, items: rankItems([...heute.items, ...extra]) } : heute;
});

/** Für ladeHeuteSeite: gleiche Signatur wie loadAdminHeute, aber aus dem Anfrage-Cache. */
export const heuteGemerkt: typeof loadAdminHeute = (_now, userId) => (userId ? heuteFuer(userId) : loadAdminHeute(_now, userId));

export async function punkteDerRolle(userId: string, rolle: Rolle): Promise<HeuteItem[] | null> {
  try {
    const { items } = await heuteFuer(userId);
    return items.filter((i) => rolleVonPunkt(i) === rolle);
  } catch (err) {
    reportError(err, `admin-neu-aufmerksamkeit-${rolle}`);
    return null;
  }
}

export type NavZaehler = { heute: number; rollen: Partial<Record<Rolle, number>> };

/** Zähler der Navigation: Mein Tag = Anzahl Punkte (wie „13 Punkte brauchen Sie“), je Rolle deren Punkte. */
export async function ladeNavZaehler(userId: string): Promise<NavZaehler> {
  try {
    const { items } = await heuteFuer(userId);
    return { heute: items.length, rollen: Object.fromEntries(punkteJeRolle(items).map((g) => [g.rolle, g.punkte.length])) };
  } catch (err) {
    reportError(err, "admin-neu-nav-zaehler");
    return { heute: 0, rollen: {} };
  }
}
