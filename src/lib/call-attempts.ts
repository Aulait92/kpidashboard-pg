// Anrufversuche zählen und den nächsten Versuch planen (Ole, 14.11.2026).
// - Ergebnis „nicht erreicht“ nach einem Anruf zählt als dokumentierter Versuch, je 30 Minuten nur einmal
//   (Doppelklick, Anrufliste und Kontakt gleichzeitig: kein zweiter Versuch).
// - Der nächste Versuch kommt als Wiedervorlage „Anrufversuch X von 6“ (lib/call-plan.ts). Eine eigene,
//   spätere Wiedervorlage des Beraters bleibt bestehen; Anruf-Aufgaben der Nicht-erreicht-Abfolge werden
//   ersetzt statt verdoppelt.
// - Dazwischen: Nicht-erreicht-Abfolge (WhatsApp), falls beim Kunden eingeschaltet.
// - Alles steht im Verlauf.

import { anrufErledigt } from "@/lib/telefonat-server";
import { updateLeadEditableFields } from "@/lib/airtable-write";
import { CALL_ATTEMPT_LOCK_MS, CALL_ATTEMPTS_TARGET, callPlanNote, fmtAttemptAt, isReplaceableCallTask, nextCallAttemptAt } from "@/lib/call-plan";
import { logLeadHistory } from "@/lib/lead-history";
import { startSequence } from "@/lib/lead-sequences";
import { prisma } from "@/lib/prisma";

export type CallAttemptResult = {
  /** false: in den letzten 30 Minuten schon gezählt */
  counted: boolean;
  attempts: number;
  /** Nächster geplanter Versuch (ISO) oder null (alle Versuche gemacht bzw. eigene Wiedervorlage bleibt) */
  nextAt: string | null;
  /** Eigene, spätere Wiedervorlage des Beraters bleibt bestehen */
  keptFollowUp: boolean;
  /** Nicht-erreicht-Abfolge schickt automatisch eine WhatsApp */
  auto: boolean;
  /** Nur im Browser: Nachricht „Nicht erreicht“ wurde schon angeboten (kein zweites Angebot) */
  offered?: boolean;
};

/**
 * Nächsten Versuch als Wiedervorlage setzen (ohne neuen Versuch zu zählen). Gibt den Zeitpunkt zurück,
 * null wenn alle Versuche gemacht sind oder eine eigene Wiedervorlage bleibt.
 */
export async function planNextCallAttempt(leadId: string, now = new Date()): Promise<{ nextAt: Date | null; kept: boolean }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { callAttempts: true, lastCallAttemptAt: true, callPlanStartedAt: true, followUpAt: true, followUpNote: true },
  });
  if (!lead) return { nextAt: null, kept: false };
  const own = lead.followUpAt && lead.followUpAt.getTime() > now.getTime() && !isReplaceableCallTask(lead.followUpNote);
  if (own) return { nextAt: null, kept: true };
  const startedAt = lead.callPlanStartedAt ?? lead.lastCallAttemptAt ?? now;
  const nextAt = nextCallAttemptAt({ done: lead.callAttempts, startedAt, lastAt: lead.lastCallAttemptAt ?? now, now });
  if (!nextAt) {
    // Alle Versuche gemacht: die eigene Plan-Aufgabe entfällt, jetzt entscheidet der Berater (Gewonnen bzw. Verloren).
    if (isReplaceableCallTask(lead.followUpNote)) {
      await prisma.lead.update({ where: { id: leadId }, data: { followUpAt: null, followUpNote: null } });
    }
    return { nextAt: null, kept: false };
  }
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      followUpAt: nextAt,
      followUpNote: callPlanNote(Math.max(1, lead.callAttempts) + 1),
      callbackSnoozedUntil: nextAt,
      ...(lead.callPlanStartedAt ? {} : { callPlanStartedAt: startedAt }),
    },
  });
  return { nextAt, kept: false };
}

/** Ergebnis „nicht erreicht“: Versuch zählen (30-Minuten-Sperre), nächsten Versuch planen, Verlauf. */
export async function registerCallAttempt(leadId: string, opts: { customerId: string; userId?: string | null; now?: Date } ): Promise<CallAttemptResult | null> {
  const now = opts.now ?? new Date();
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, airtableId: true, status: true, contactAttempts: true, callAttempts: true, firstContactAt: true, lastCallAttemptAt: true, callPlanStartedAt: true },
  });
  if (!lead) return null;
  // Ergebnis „nicht erreicht“ eingetragen: Pause des Assistenten nach „Anrufen“ endet (lib/telefonat.ts)
  await anrufErledigt(lead.id);
  const lockedSince = new Date(now.getTime() - CALL_ATTEMPT_LOCK_MS);
  const s = (lead.status ?? "").trim().toLowerCase();
  const nextStatus = s === "" || s === "neuer lead" ? "Nicht erreicht" : null;
  // Bedingt zählen: zwei gleichzeitige Klicks ergeben nur einen Versuch.
  const claimed = await prisma.lead.updateMany({
    where: { id: lead.id, OR: [{ lastCallAttemptAt: null }, { lastCallAttemptAt: { lte: lockedSince } }] },
    data: {
      callAttempts: { increment: 1 },
      contactAttempts: { increment: 1 },
      lastCallAttemptAt: now,
      ...(lead.callPlanStartedAt && lead.callAttempts > 0 ? {} : { callPlanStartedAt: now }),
      ...(nextStatus ? { status: nextStatus, reached: false } : {}),
      ...(!lead.firstContactAt ? { firstContactAt: now } : {}),
    },
  });
  if (claimed.count === 0) {
    const cur = await prisma.lead.findUnique({ where: { id: lead.id }, select: { callAttempts: true, followUpAt: true } });
    return { counted: false, attempts: cur?.callAttempts ?? lead.callAttempts, nextAt: cur?.followUpAt?.toISOString() ?? null, keptFollowUp: false, auto: false };
  }
  const attempts = lead.callAttempts + 1;
  if (lead.airtableId) {
    await updateLeadEditableFields({
      airtableId: lead.airtableId,
      kontaktversuche: lead.contactAttempts + 1,
      ...(nextStatus ? { bearbeitungsstatus: nextStatus } : {}),
      ...(!lead.firstContactAt ? { ersterKontaktversuch: now.toISOString() } : {}),
    }).catch((e) => console.error("[call attempt]", e));
  }
  const plan = await planNextCallAttempt(lead.id, now);
  // Ohne geplanten Versuch (alle gemacht oder eigene Wiedervorlage): wie bisher morgen wieder in der Rückrufliste.
  if (!plan.nextAt) await prisma.lead.update({ where: { id: lead.id }, data: { callbackSnoozedUntil: new Date(now.getTime() + 20 * 60 * 60 * 1000) } });
  const seq = await startSequence(lead.id, "not_reached", now).catch((e) => {
    console.error("[lead-sequences]", e);
    return null;
  });
  const n = Math.min(attempts, CALL_ATTEMPTS_TARGET);
  const tail = plan.nextAt
    ? ` · nächster Versuch ${fmtAttemptAt(plan.nextAt, now)}`
    : attempts >= CALL_ATTEMPTS_TARGET
      ? " · alle Versuche gemacht"
      : plan.kept
        ? " · Ihre Wiedervorlage bleibt"
        : "";
  await logLeadHistory(lead.id, "anruf", `Anruf: nicht erreicht (Versuch ${attempts > CALL_ATTEMPTS_TARGET ? attempts : `${n} von ${CALL_ATTEMPTS_TARGET}`})${tail}`, {
    customerId: opts.customerId,
    ...(opts.userId !== undefined ? { userId: opts.userId } : {}),
  });
  return { counted: true, attempts, nextAt: plan.nextAt?.toISOString() ?? null, keptFollowUp: plan.kept, auto: !!seq };
}
