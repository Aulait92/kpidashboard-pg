import { prisma } from "@/lib/prisma";
import {
  COMPONENT_KEYS,
  SAMPLE_INTERVAL_MIN,
  SAMPLE_RETENTION_DAYS,
  dayLevel,
  deriveStatus,
  uptimePercent,
  type ComponentKey,
  type StatusLevel,
  type StatusMap,
} from "@/lib/status";

const DAY = 24 * 60 * 60 * 1000;

/** Laufende Meldungen: begonnen und nicht beendet. */
export async function activeIncidents(now = new Date()) {
  return prisma.statusIncident.findMany({
    where: { startsAt: { lte: now }, OR: [{ resolvedAt: null }, { resolvedAt: { gt: now } }] },
    orderBy: { startsAt: "desc" },
  });
}

/** Aktueller Zustand aller Komponenten (Datenbank, Lebenszeichen, Meldungen). */
export async function currentStatus(now = new Date()): Promise<StatusMap> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [beats, incidents] = await Promise.all([prisma.systemHeartbeat.findMany(), activeIncidents(now)]);
    return deriveStatus({ dbOk: true, beats, incidents, now });
  } catch {
    return deriveStatus({ dbOk: false, beats: [], now });
  }
}

/**
 * Messpunkt für die Statusseite (vom Cron alle 5 Min.). Höchstens einer je
 * Intervall, auch wenn der Cron öfter läuft; löscht Messpunkte älter als 90 Tage.
 */
export async function recordStatusSample(now = new Date()): Promise<{ recorded: boolean; pruned: number }> {
  const last = await prisma.statusSample.findFirst({ orderBy: { at: "desc" }, select: { at: true } });
  let recorded = false;
  if (!last || now.getTime() - last.at.getTime() >= (SAMPLE_INTERVAL_MIN - 1) * 60000) {
    const s = await currentStatus(now);
    await prisma.statusSample.create({ data: { at: now, ...s } });
    recorded = true;
  }
  const { count } = await prisma.statusSample.deleteMany({ where: { at: { lt: new Date(now.getTime() - SAMPLE_RETENTION_DAYS * DAY) } } });
  return { recorded, pruned: count };
}

export type ComponentHistory = {
  uptime30: number | null;
  uptime90: number | null;
  days: { day: string; level: StatusLevel | null }[];
};

export type StatusHistory = { since: Date | null; hasFull30: boolean; components: Record<ComponentKey, ComponentHistory> };

type DayRow = { day: string; total: bigint } & Record<`${ComponentKey}_down` | `${ComponentKey}_degraded`, bigint>;

/** Verfügbarkeit (30/90 Tage) und Tagesbalken je Komponente aus den Messpunkten. */
export async function statusHistory(now = new Date(), days = 90): Promise<StatusHistory> {
  const from = new Date(now.getTime() - days * DAY);
  // Tage in Berliner Zeit; je Komponente Anzahl Störung/eingeschränkt
  const rows = await prisma.$queryRaw<DayRow[]>`
    SELECT to_char(("at" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE "app" = 'down') AS app_down, COUNT(*) FILTER (WHERE "app" = 'degraded') AS app_degraded,
      COUNT(*) FILTER (WHERE "leads" = 'down') AS leads_down, COUNT(*) FILTER (WHERE "leads" = 'degraded') AS leads_degraded,
      COUNT(*) FILTER (WHERE "whatsapp" = 'down') AS whatsapp_down, COUNT(*) FILTER (WHERE "whatsapp" = 'degraded') AS whatsapp_degraded,
      COUNT(*) FILTER (WHERE "calendar" = 'down') AS calendar_down, COUNT(*) FILTER (WHERE "calendar" = 'degraded') AS calendar_degraded,
      COUNT(*) FILTER (WHERE "payments" = 'down') AS payments_down, COUNT(*) FILTER (WHERE "payments" = 'degraded') AS payments_degraded,
      COUNT(*) FILTER (WHERE "jobs" = 'down') AS jobs_down, COUNT(*) FILTER (WHERE "jobs" = 'degraded') AS jobs_degraded
    FROM "StatusSample" WHERE "at" >= ${from}
    GROUP BY 1 ORDER BY 1`;
  const first = await prisma.statusSample.findFirst({ where: { at: { gte: from } }, orderBy: { at: "asc" }, select: { at: true } });
  const since = first?.at ?? null;

  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dayKeys.push(new Date(now.getTime() - i * DAY).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }));
  }
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const start30 = new Date(now.getTime() - 30 * DAY).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

  const components = {} as Record<ComponentKey, ComponentHistory>;
  for (const k of COMPONENT_KEYS) {
    const sum = (filter: (day: string) => boolean) => {
      let samples = 0;
      let down = 0;
      for (const r of rows) {
        if (!filter(r.day)) continue;
        samples += Number(r.total);
        down += Number(r[`${k}_down`]);
      }
      return { samples, notDown: samples - down };
    };
    const s90 = sum(() => true);
    const s30 = sum((d) => d > start30);
    const first30 = since && since.getTime() > now.getTime() - 30 * DAY ? since : new Date(now.getTime() - 30 * DAY);
    components[k] = {
      uptime90: uptimePercent({ ...s90, firstAt: since, now, countGaps: k === "jobs" }),
      uptime30: uptimePercent({ ...s30, firstAt: s30.samples ? first30 : null, now, countGaps: k === "jobs" }),
      days: dayKeys.map((day) => {
        const r = byDay.get(day);
        return { day, level: r ? dayLevel({ samples: Number(r.total), down: Number(r[`${k}_down`]), degraded: Number(r[`${k}_degraded`]) }) : null };
      }),
    };
  }
  return { since, hasFull30: !!since && since.getTime() <= now.getTime() - 30 * DAY, components };
}
