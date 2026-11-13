// Kampagnen-Automatik: Schalter und Schwellen (Admin → Einstellungen → Kampagnen-Automatik).

import { prisma } from "@/lib/prisma";

export type AutomationSettings = {
  budgetSync: boolean;
  autoLaunch: boolean;
  refresh: boolean;
  refreshMaxFrequency: number;
  refreshCtrDrop: number;
  refreshCplRise: number;
  refreshMinSpendEur: number;
};

export const DEFAULT_AUTOMATION: AutomationSettings = {
  budgetSync: true,
  autoLaunch: true,
  refresh: true,
  refreshMaxFrequency: 3,
  refreshCtrDrop: 0.3,
  refreshCplRise: 0.4,
  refreshMinSpendEur: 50,
};

export async function loadAutomationSettings(): Promise<AutomationSettings> {
  const row = await prisma.campaignAutomationSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  if (!row) return { ...DEFAULT_AUTOMATION };
  return {
    budgetSync: row.budgetSync,
    autoLaunch: row.autoLaunch,
    refresh: row.refresh,
    refreshMaxFrequency: row.refreshMaxFrequency,
    refreshCtrDrop: row.refreshCtrDrop,
    refreshCplRise: row.refreshCplRise,
    refreshMinSpendEur: row.refreshMinSpendEur,
  };
}

const clamp = (n: number, min: number, max: number, fallback: number) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);

export async function saveAutomationSettings(input: Partial<AutomationSettings>): Promise<AutomationSettings> {
  const cur = await loadAutomationSettings();
  const next: AutomationSettings = {
    budgetSync: input.budgetSync ?? cur.budgetSync,
    autoLaunch: input.autoLaunch ?? cur.autoLaunch,
    refresh: input.refresh ?? cur.refresh,
    refreshMaxFrequency: clamp(Number(input.refreshMaxFrequency ?? cur.refreshMaxFrequency), 1.5, 10, DEFAULT_AUTOMATION.refreshMaxFrequency),
    refreshCtrDrop: clamp(Number(input.refreshCtrDrop ?? cur.refreshCtrDrop), 0.1, 0.9, DEFAULT_AUTOMATION.refreshCtrDrop),
    refreshCplRise: clamp(Number(input.refreshCplRise ?? cur.refreshCplRise), 0.1, 3, DEFAULT_AUTOMATION.refreshCplRise),
    refreshMinSpendEur: clamp(Number(input.refreshMinSpendEur ?? cur.refreshMinSpendEur), 10, 1000, DEFAULT_AUTOMATION.refreshMinSpendEur),
  };
  await prisma.campaignAutomationSettings.upsert({ where: { id: "default" }, create: { id: "default", ...next }, update: next });
  return next;
}
