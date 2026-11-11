"use server";

// „Ich bin abwesend“ im Kundenbereich. Rechte prüft lib/absence-flow:
// jeder für sich, der Inhaber fürs Team, die Admin-Vorschau nur lesend.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import {
  AbsenceError,
  absenceOverview,
  endAbsence,
  handoverToSubstitute,
  pauseAdsForAbsence,
  rescheduleAfterAbsence,
  saveAbsence,
  undoTaskMoves,
  type AbsenceActor,
  type AbsenceInput,
  type AbsenceOverview,
  type HandoverResult,
  type RescheduleResult,
} from "@/lib/absence-flow";
import { reportError } from "@/lib/monitoring";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function actor(): Promise<AbsenceActor> {
  const ctx = await getBuyerContext();
  if (!ctx) throw new AbsenceError("Bitte neu anmelden.");
  return { customerId: ctx.customerId, userId: ctx.userId, teamRole: ctx.teamRole, preview: ctx.preview };
}

async function run<T>(fn: (a: AbsenceActor) => Promise<T>, where: string): Promise<Result<T>> {
  try {
    const data = await fn(await actor());
    revalidatePath("/buyer", "layout");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AbsenceError) return { ok: false, error: err.message };
    reportError(err, where);
    return { ok: false, error: "Das hat nicht geklappt. Bitte versuch es noch einmal." };
  }
}

export async function saveAbsenceAction(input: AbsenceInput): Promise<Result<AbsenceOverview>> {
  return run((a) => saveAbsence(a, input), "absence-save");
}

export async function absenceOverviewAction(absenceId: string): Promise<Result<AbsenceOverview>> {
  try {
    return { ok: true, data: await absenceOverview(await actor(), absenceId) };
  } catch (err) {
    if (err instanceof AbsenceError) return { ok: false, error: err.message };
    reportError(err, "absence-overview");
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export async function rescheduleAbsenceAction(absenceId: string, ids: string[] | null): Promise<Result<RescheduleResult>> {
  return run((a) => rescheduleAfterAbsence(a, absenceId, ids), "absence-reschedule");
}

export async function handoverAbsenceAction(absenceId: string, ids: string[] | null): Promise<Result<HandoverResult>> {
  return run((a) => handoverToSubstitute(a, absenceId, ids), "absence-handover");
}

export async function undoAbsenceTasksAction(absenceId: string): Promise<Result<number>> {
  return run((a) => undoTaskMoves(a, absenceId), "absence-undo");
}

export async function endAbsenceAction(absenceId: string): Promise<Result<null>> {
  return run(async (a) => {
    await endAbsence(a, absenceId);
    return null;
  }, "absence-end");
}

export async function pauseAdsForAbsenceAction(absenceId: string): Promise<Result<null>> {
  return run(async (a) => {
    await pauseAdsForAbsence(a, absenceId);
    return null;
  }, "absence-pause");
}
