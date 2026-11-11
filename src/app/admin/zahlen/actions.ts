"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { audit } from "@/lib/audit";
import { getCurrentSession } from "@/lib/auth";

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
  // Ende der Pay-per-Lead-Pilotphase: Monat „YYYY-MM“ (aus <input type="month">), leer = läuft noch
  const pilotRaw = s(fd, "pplPilotEnd").trim();
  if (pilotRaw && !/^\d{4}-\d{2}$/.test(pilotRaw)) return { error: "Ende Pilotphase: Monat im Format JJJJ-MM oder leer." };
  const pplPilotEnd = pilotRaw || null;
  if (!Number.isInteger(hours) || hours < 0 || hours > 80) return { error: "Stunden pro Woche: 0 bis 80." };
  if (!Number.isFinite(rate) || rate < 0 || rate > 1000) return { error: "Stundensatz: 0 bis 1.000 €." };
  await prisma.kpiSettings.upsert({
    where: { id: "default" },
    create: { id: "default", founderHoursPerWeek: hours, founderHourlyRate: rate, acquisitionCampaigns: campaigns, pplPilotEnd },
    update: { founderHoursPerWeek: hours, founderHourlyRate: rate, acquisitionCampaigns: campaigns, pplPilotEnd },
  });
  await audit("kpi.einstellungen", { details: { hours, rate, campaigns, pplPilotEnd } });
  revalidatePath("/admin/einstellungen/kosten");
  revalidatePath("/admin/zahlen");
  return { ok: true };
}

export type NachtragState = { ok?: boolean; error?: string };

/** Betrag in deutscher Schreibweise („1.490,50 €“) oder mit Punkt als Dezimaltrenner. */
function parseEuro(raw: string): number {
  const t = raw.replace(/\s|€/g, "");
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  return Number(normalized);
}

/** Einmal-Umsatz nachtragen (z. B. Einrichtungsgebühr aus der Papier-Zeit). Fließt als „setup“ ins Umsatzbuch. */
export async function saveManualRevenueAction(_prev: NachtragState, fd: FormData): Promise<NachtragState> {
  await requireAuth();
  const month = s(fd, "month");
  const customerId = s(fd, "customerId") || null;
  const amount = parseEuro(s(fd, "amount"));
  const kind = s(fd, "kind") === "other" ? "other" : "setup";
  const note = s(fd, "note").slice(0, 300) || null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "2020-01") return { error: "Bitte einen Monat wählen." };
  const nowKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  if (month > nowKey) return { error: "Der Monat liegt in der Zukunft." };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return { error: "Bitte einen Betrag (netto) über 0 € eingeben." };
  if (customerId && !(await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) return { error: "Kunde nicht gefunden." };
  const session = await getCurrentSession().catch(() => null);
  const saved = await prisma.manualRevenue.create({ data: { month, customerId, amount, kind, note, createdBy: session?.email ?? null } });
  await audit("kpi.nachtrag", { entity: "ManualRevenue", entityId: saved.id, customerId, details: { month, amount, kind, note } });
  revalidatePath("/admin/zahlen");
  return { ok: true };
}

export async function deleteManualRevenueAction(fd: FormData): Promise<void> {
  await requireAuth();
  const id = s(fd, "id");
  if (!id) return;
  const row = await prisma.manualRevenue.findUnique({ where: { id } });
  if (!row) return;
  await prisma.manualRevenue.delete({ where: { id } });
  await audit("kpi.nachtrag", { entity: "ManualRevenue", entityId: id, customerId: row.customerId, details: { deleted: true, month: row.month, amount: Number(row.amount), kind: row.kind } });
  revalidatePath("/admin/zahlen");
}
