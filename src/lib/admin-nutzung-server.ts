// Nutzungsmessung im Admin: speichern (nur eingeloggte Admins) und aufräumen (180 Tage). Regeln: lib/admin-nutzung.ts.
// Fehler beim Schreiben dürfen die Bedienung nie stören (der Browser schickt per sendBeacon und wartet nicht).

import type { SessionPayload } from "@/lib/auth";
import { bereinige, DEDUPE_MS, type AdminNutzungEreignis } from "@/lib/admin-nutzung";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ältere Ereignisse einer Sendung werden auf diesen Abstand zur Sendezeit begrenzt (Browser-Uhr ist egal). */
const MAX_ALTER_MS = 2 * 60 * 1000;

export type AdminNutzungErgebnis = { status: 200 | 400 | 403; gespeichert: number };

/**
 * Sendung aus dem Browser speichern: `{ n: Sendezeit, e: Ereignisse }` (Zeiten in ms nach der Uhr des Browsers).
 * Zeitpunkte werden relativ zur Sendezeit auf die Server-Uhr umgerechnet. Nur Admins; gleicher Schlüssel innerhalb
 * von 1 s (auch über Sendungen hinweg) zählt einmal.
 */
export async function speichereAdminNutzung(session: SessionPayload | null, body: unknown, now = Date.now()): Promise<AdminNutzungErgebnis> {
  if (!session || session.role !== "ADMIN") return { status: 403, gespeichert: 0 };
  if (!body || typeof body !== "object" || !Array.isArray((body as { e?: unknown }).e)) return { status: 400, gespeichert: 0 };
  const { n, e } = body as { n?: unknown; e: unknown[] };
  const gesendet = typeof n === "number" && Number.isFinite(n) ? n : null;
  const aufServerZeit = e.map((r) => {
    if (!r || typeof r !== "object") return r;
    const t = (r as { t?: unknown }).t;
    if (typeof t !== "number" || !Number.isFinite(t)) return { ...r, t: now };
    const abstand = gesendet === null ? 0 : Math.min(MAX_ALTER_MS, Math.max(0, gesendet - t));
    return { ...r, t: now - abstand };
  });
  // Letzte gespeicherte Zeitpunkte dieses Admins (Dedupe über Sendungen hinweg)
  const vorher = await prisma.adminUsageEvent.findMany({
    where: { adminUserId: session.userId, at: { gte: new Date(now - MAX_ALTER_MS - DEDUPE_MS) } },
    select: { art: true, schluessel: true, at: true },
  });
  const zuletzt = new Map<string, number>();
  for (const v of vorher) {
    const key = `${v.art}|${v.schluessel}`;
    zuletzt.set(key, Math.max(zuletzt.get(key) ?? 0, v.at.getTime()));
  }
  const ereignisse: AdminNutzungEreignis[] = bereinige(aufServerZeit, zuletzt);
  if (ereignisse.length === 0) return { status: 200, gespeichert: 0 };
  const r = await prisma.adminUsageEvent.createMany({
    data: ereignisse.map((x) => ({ at: new Date(x.t), adminUserId: session.userId, art: x.a, schluessel: x.k, oberflaeche: x.o })),
  });
  return { status: 200, gespeichert: r.count };
}

/** Admin-Nutzung älter als 180 Tage löschen (täglich im Cron, docs/datenschutz.md). */
export async function pruneAdminNutzung(now = new Date(), days = 180): Promise<number> {
  const r = await prisma.adminUsageEvent.deleteMany({ where: { at: { lt: new Date(now.getTime() - days * DAY_MS) } } });
  return r.count;
}
