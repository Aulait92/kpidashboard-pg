"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { audit } from "@/lib/audit";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Freitexte fürs Investoren-Update (Herausforderungen, Nächste 30 Tage). */
export async function saveUpdateTextsAction(fd: FormData): Promise<{ ok: boolean }> {
  await requireAuth();
  const updateChallenges = s(fd, "challenges").slice(0, 2000) || null;
  const updateNext = s(fd, "next").slice(0, 2000) || null;
  await prisma.kpiSettings.upsert({
    where: { id: "default" },
    create: { id: "default", updateChallenges, updateNext },
    update: { updateChallenges, updateNext },
  });
  revalidatePath("/admin/zahlen");
  return { ok: true };
}

export type KostenState = { ok?: boolean; error?: string };

const PURPOSES = ["ppl", "software", "akquise", "betrieb"];

/** Laufende Kosten anlegen oder ändern. */
export async function saveRecurringCostAction(_prev: KostenState, fd: FormData): Promise<KostenState> {
  await requireAuth();
  const id = s(fd, "id");
  const name = s(fd, "name").slice(0, 120);
  const amount = Number(s(fd, "amount").replace(/\./g, "").replace(",", "."));
  const purpose = s(fd, "purpose");
  const startsAt = s(fd, "startsAt");
  const endsAt = s(fd, "endsAt");
  if (!name) return { error: "Bitte einen Namen eingeben." };
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return { error: "Bitte einen gültigen Monatsbetrag eingeben." };
  if (!PURPOSES.includes(purpose)) return { error: "Bitte einen Zweck wählen." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsAt)) return { error: "Bitte ein Startdatum wählen." };
  if (endsAt && (!/^\d{4}-\d{2}-\d{2}$/.test(endsAt) || endsAt < startsAt)) return { error: "Das Enddatum liegt vor dem Start." };
  const data = {
    name,
    monthlyAmount: amount,
    purpose,
    startsAt: new Date(`${startsAt}T00:00:00.000Z`),
    endsAt: endsAt ? new Date(`${endsAt}T00:00:00.000Z`) : null,
  };
  const saved = id ? await prisma.recurringCost.update({ where: { id }, data }) : await prisma.recurringCost.create({ data });
  await audit("kpi.kosten", { entity: "RecurringCost", entityId: saved.id, details: { name, amount, purpose } });
  revalidatePath("/admin/einstellungen/kosten");
  revalidatePath("/admin/zahlen");
  return { ok: true };
}

export async function deleteRecurringCostAction(fd: FormData): Promise<void> {
  await requireAuth();
  const id = s(fd, "id");
  if (!id) return;
  await prisma.recurringCost.delete({ where: { id } }).catch(() => null);
  await audit("kpi.kosten", { entity: "RecurringCost", entityId: id, details: { deleted: true } });
  revalidatePath("/admin/einstellungen/kosten");
  revalidatePath("/admin/zahlen");
}

/** Gründerzeit und Kampagnen der eigenen Kundengewinnung. */
export async function saveKpiSettingsAction(_prev: KostenState, fd: FormData): Promise<KostenState> {
  await requireAuth();
  const hours = Number(s(fd, "hours"));
  const rate = Number(s(fd, "rate").replace(",", "."));
  const campaigns = s(fd, "campaigns").slice(0, 500);
  if (!Number.isInteger(hours) || hours < 0 || hours > 80) return { error: "Stunden pro Woche: 0 bis 80." };
  if (!Number.isFinite(rate) || rate < 0 || rate > 1000) return { error: "Stundensatz: 0 bis 1.000 €." };
  await prisma.kpiSettings.upsert({
    where: { id: "default" },
    create: { id: "default", founderHoursPerWeek: hours, founderHourlyRate: rate, acquisitionCampaigns: campaigns },
    update: { founderHoursPerWeek: hours, founderHourlyRate: rate, acquisitionCampaigns: campaigns },
  });
  await audit("kpi.einstellungen", { details: { hours, rate, campaigns } });
  revalidatePath("/admin/einstellungen/kosten");
  revalidatePath("/admin/zahlen");
  return { ok: true };
}
