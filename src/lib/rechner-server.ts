// Break-even-Rechner: Konfiguration aus der Datenbank und echte Kosten pro Lead.
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { DEFAULT_CONFIG, parseRechnerConfig, resolveCpl, type CplData, type CplInfo, type RechnerConfig, type RechnerProduct } from "@/lib/rechner";

const DAY = 86_400_000;
/** So viele Leads braucht es, bevor echte Daten zählen. */
export const MIN_LEADS_FOR_DATA = 200;
export const DATA_WINDOW_DAYS = 180;

/** Gespeicherte Konfiguration (geprüft); ohne Eintrag die Startwerte. */
export async function loadRechnerConfig(): Promise<RechnerConfig> {
  const row = await prisma.rechnerConfig.findUnique({ where: { id: "default" } }).catch(() => null);
  return row ? parseRechnerConfig(row.config).config : DEFAULT_CONFIG;
}

/**
 * Kosten pro Lead aus echten Daten der letzten 180 Tage: Meta-Kosten (Cost LEAD)
 * des Produkts ÷ Leads mit passender Quelle. null = zu wenig Daten.
 */
export async function cplFromData(p: Pick<RechnerProduct, "match">, now = new Date()): Promise<CplData> {
  const match = p.match.trim();
  if (!match) return null;
  const since = new Date(now.getTime() - DATA_WINDOW_DAYS * DAY);
  const [cost, leads] = await Promise.all([
    prisma.cost.aggregate({
      where: { kind: "LEAD", occurredAt: { gte: since }, product: { contains: match, mode: "insensitive" } },
      _sum: { amount: true },
    }),
    prisma.lead.count({ where: { createdAt: { gte: since }, source: { contains: match, mode: "insensitive" } } }),
  ]);
  const sum = Number(cost._sum.amount ?? 0);
  if (leads < MIN_LEADS_FOR_DATA || sum <= 0) return null;
  return { cpl: Math.round((sum / leads) * 100) / 100, leads };
}

/** Kosten pro Lead je aktivem Produkt (konservativ, siehe resolveCpl). */
export async function cplInfos(config: RechnerConfig, now = new Date()): Promise<Record<string, CplInfo>> {
  const active = config.products.filter((p) => p.active);
  const data = await Promise.all(active.map((p) => (p.cplOverride ? Promise.resolve(null) : cplFromData(p, now).catch(() => null))));
  return Object.fromEntries(active.map((p, i) => [p.key, resolveCpl(p, data[i])]));
}

/** Nur Admins dürfen die Rechner-Einstellungen ändern. */
export function canEditRechner(session: { role?: string | null } | null): boolean {
  return session?.role === "ADMIN";
}

/** Prüfen und speichern; bei Fehlern wird nichts gespeichert. */
export async function saveRechnerConfig(raw: unknown, actor?: AuditActor): Promise<{ ok: true; config: RechnerConfig } | { ok: false; errors: string[] }> {
  const { config, errors } = parseRechnerConfig(raw);
  if (errors.length) return { ok: false, errors };
  const json = config as unknown as Prisma.InputJsonValue;
  await prisma.rechnerConfig.upsert({ where: { id: "default" }, create: { id: "default", config: json }, update: { config: json } });
  await audit("rechner.config", {
    entity: "RechnerConfig",
    entityId: "default",
    actor,
    details: {
      aktiv: config.products.filter((p) => p.active).map((p) => p.key),
      garantien: Object.entries(config.guarantees).filter(([, g]) => g.enabled).map(([k]) => k),
    },
  });
  return { ok: true, config };
}
