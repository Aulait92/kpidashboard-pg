// Nachfass-Abfolgen: nach „Nicht erreicht“, „Angebot gesendet“ und „Nicht
// erschienen“ fasst die App in festen Schritten nach (WhatsApp bzw.
// Anruf-Aufgabe auf „Heute“). Abgearbeitet vom 5-Minuten-Cron (runSequences).
//
// Regeln:
// - nur wenn der Kunde „Automatisch nachfassen“ an hat (AgentConfig.followUpSequencesEnabled)
//   und der Assistent aktiv ist
// - WhatsApp nur Mo–Sa 9–19 Uhr (Berlin), nur mit verbundenem Konto; außerhalb des
//   24h-Fensters nur mit freigegebener Vorlage – sonst wird stattdessen eine Anruf-Aufgabe angelegt
// - jeder Schritt wird vor dem Senden per bedingtem Update „beansprucht“ → nie doppelt
// - Stopp vor jedem Schritt, wenn: Lead antwortet, Termin gebucht, Phase Abschluss /
//   Kein Interesse / Disqualifiziert, Reklamation, Löschung, „Stopp“, Schalter aus
// - Verlauf (log) ohne Nachrichteninhalte

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { displayProduct } from "@/lib/products";
import {
  firstNameOf,
  NoTemplateError,
  renderTemplate,
  sendWhatsAppNotice,
  type NoticePurpose,
} from "@/lib/whatsapp/templates";

export type SequenceKind = "not_reached" | "offer" | "no_show";

const DAY = 24 * 60 * 60 * 1000;
const DONE_STATUSES = new Set(["abschluss", "kein interesse", "disqualifiziert"]);
const STOP_WORDS = /^\s*(stopp?|stop|abmelden|keine (weiteren )?nachrichten|nicht mehr (schreiben|kontaktieren))\b/i;

type Ctx = { firstName: string; topic: string; bookingUrl: string | null };
type Step =
  | { day: number; action: "whatsapp"; purpose: NoticePurpose; params: (c: Ctx) => string[]; text: (c: Ctx) => string; fallbackNote: string }
  | { day: number; action: "call"; note: string };

export const SEQUENCES: Record<SequenceKind, { label: string; steps: Step[] }> = {
  not_reached: {
    label: "Nicht erreicht",
    steps: [
      {
        day: 0,
        action: "whatsapp",
        purpose: "followup",
        params: (c) => [c.firstName],
        text: (c) => `Hallo ${c.firstName}, ich habe gerade versucht, dich anzurufen. Wann passt es dir am besten? Antworte einfach hier, dann melde ich mich zu deiner Wunschzeit.`,
        fallbackNote: "Nicht erreicht: nochmal anrufen",
      },
      { day: 2, action: "call", note: "Nachfassen: nochmal anrufen" },
      {
        day: 6,
        action: "whatsapp",
        purpose: "followup_last",
        params: (c) => [c.firstName],
        text: (c) => `Hallo ${c.firstName}, ich melde mich ein letztes Mal: Ist das Thema für dich noch aktuell? Dann antworte einfach hier. Wenn nicht, ist das völlig in Ordnung – ich melde mich dann nicht weiter. Alles Gute!`,
        fallbackNote: "Letzter Versuch: anrufen",
      },
    ],
  },
  offer: {
    label: "Angebot gesendet",
    steps: [
      {
        day: 3,
        action: "whatsapp",
        purpose: "followup_offer",
        params: (c) => [c.firstName, c.topic],
        text: (c) => `Hallo ${c.firstName}, konntest du dir das Angebot zu ${c.topic} schon anschauen? Wenn du Fragen hast oder etwas anpassen möchtest, antworte einfach hier.`,
        fallbackNote: "Angebot nachfassen: anrufen",
      },
      { day: 7, action: "call", note: "Angebot nachfassen: anrufen" },
    ],
  },
  no_show: {
    label: "Nicht erschienen",
    steps: [
      {
        day: 0,
        action: "whatsapp",
        purpose: "followup_noshow",
        params: (c) => [c.firstName],
        text: (c) =>
          `Hallo ${c.firstName}, schade, dass es mit unserem Termin nicht geklappt hat. Sollen wir einen neuen finden?${c.bookingUrl ? ` Hier kannst du dir direkt eine Zeit aussuchen: ${c.bookingUrl}` : " Antworte einfach hier."}`,
        fallbackNote: "Nicht erschienen: neuen Termin vereinbaren",
      },
      { day: 2, action: "call", note: "Neuen Termin vereinbaren" },
    ],
  },
};

export type SequenceLogEntry = {
  at: string;
  step: number;
  action: "whatsapp" | "call" | "stop";
  /** sent | template | call_task | kept_followup | skipped | failed | stopped */
  result: string;
  detail?: string;
};

/** Mo–Sa 9–19 Uhr Berlin (wie Bestandskunden-Kampagnen). */
export function inSendWindow(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  return wd !== "Sun" && hour >= 9 && hour < 19;
}

async function enabledFor(customerId: string): Promise<boolean> {
  const agent = await prisma.agentConfig.findUnique({ where: { customerId }, select: { active: true, followUpSequencesEnabled: true } });
  return !!agent?.active && !!agent.followUpSequencesEnabled;
}

function appendLog(log: Prisma.JsonValue, entry: SequenceLogEntry): Prisma.InputJsonValue {
  const list = Array.isArray(log) ? (log as unknown as SequenceLogEntry[]) : [];
  return [...list, entry] as unknown as Prisma.InputJsonValue;
}

/**
 * Abfolge starten (wenn eingeschaltet). Läuft schon eine Abfolge derselben Art,
 * bleibt sie (kein Neustart bei wiederholtem „Nicht erreicht“); andere laufende
 * Abfolgen des Leads werden beendet. Liefert die Abfolge oder null.
 */
export async function startSequence(leadId: string, kind: SequenceKind, now = new Date()) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return null;
  if (!(await enabledFor(lead.customerId))) return null;
  const running = await prisma.leadSequence.findMany({ where: { leadId, stoppedAt: null } });
  const same = running.find((r) => r.kind === kind);
  if (same) return same;
  for (const r of running) {
    await prisma.leadSequence.update({
      where: { id: r.id },
      data: {
        stoppedAt: now,
        stopReason: `Neue Abfolge: ${SEQUENCES[kind].label}`,
        nextAt: null,
        log: appendLog(r.log, { at: now.toISOString(), step: -1, action: "stop", result: "stopped", detail: `Neue Abfolge: ${SEQUENCES[kind].label}` }),
      },
    });
  }
  return prisma.leadSequence.create({
    data: { leadId, customerId: lead.customerId, kind, step: 0, startedAt: now, nextAt: new Date(now.getTime() + SEQUENCES[kind].steps[0].day * DAY) },
  });
}

/** Laufende Abfolgen eines Leads beenden. Optional nur die seit `since` gestarteten. */
export async function stopSequences(leadId: string, reason: string, opts: { since?: Date; now?: Date } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const running = await prisma.leadSequence.findMany({
    where: { leadId, stoppedAt: null, ...(opts.since ? { startedAt: { gte: opts.since } } : {}) },
    select: { id: true, log: true },
  });
  for (const r of running) {
    await prisma.leadSequence.update({
      where: { id: r.id },
      data: { stoppedAt: now, stopReason: reason, nextAt: null, log: appendLog(r.log, { at: now.toISOString(), step: -1, action: "stop", result: "stopped", detail: reason }) },
    });
  }
  return running.length;
}

/** Status-Wechsel (zentral über syncFollowUpWithStatus): Angebot → Abfolge starten, Ende → stoppen. */
export async function onLeadStatus(leadId: string, status: string | null | undefined, now = new Date()): Promise<{ started: boolean }> {
  const s = (status ?? "").trim().toLowerCase();
  if (DONE_STATUSES.has(s)) {
    await stopSequences(leadId, `Phase: ${status}`, { now });
    return { started: false };
  }
  if (s === "angebot gesendet") {
    const seq = await startSequence(leadId, "offer", now);
    return { started: !!seq };
  }
  return { started: false };
}

/** Thema für „Angebot zu …“ – wie beim manuellen Nachfassen (lib/whatsapp/followup.ts). */
function topicOf(formData: Prisma.JsonValue | null, source: string | null): string {
  if (Array.isArray(formData)) {
    const hit = (formData as { label?: unknown; value?: unknown }[]).find((a) => a?.label === "Versicherungsinteresse" && typeof a.value === "string" && a.value.trim());
    if (hit) return String(hit.value).trim().slice(0, 60);
  }
  return source ? displayProduct(source) : "deiner Anfrage";
}

/** Grund, warum eine Abfolge vor dem nächsten Schritt endet – oder null. */
export async function stopReasonFor(seq: { leadId: string; customerId: string; startedAt: Date }, now = new Date()): Promise<string | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: seq.leadId },
    select: { status: true, stornoState: true, erasedAt: true, phone: true },
  });
  if (!lead || lead.erasedAt) return "Lead gelöscht";
  if (lead.stornoState) return "Lead reklamiert";
  const s = (lead.status ?? "").trim().toLowerCase();
  if (DONE_STATUSES.has(s)) return `Phase: ${lead.status}`;
  if (!(await enabledFor(seq.customerId))) return "Automatisches Nachfassen ausgeschaltet";
  // Neu gebuchter oder noch bevorstehender Termin → nicht weiter nachfassen.
  const booked = await prisma.appointment.count({ where: { leadId: seq.leadId, status: "booked", OR: [{ createdAt: { gt: seq.startedAt } }, { startsAt: { gt: now } }] } });
  if (booked > 0) return "Termin gebucht";
  const reply = await prisma.message.findFirst({
    where: {
      direction: "inbound",
      createdAt: { gt: seq.startedAt },
      conversation: { customerId: seq.customerId, OR: [{ leadId: seq.leadId }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] },
    },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  if (reply) return STOP_WORDS.test(reply.body ?? "") ? "Abgemeldet („Stopp“)" : "Lead hat geantwortet";
  if (lead.phone) {
    const revoked = await prisma.consentOptIn.findFirst({ where: { customerId: seq.customerId, contactPhone: lead.phone, revokedAt: { not: null } }, select: { id: true } });
    if (revoked) return "Einwilligung widerrufen";
  }
  return null;
}

/** Anruf-Aufgabe: Wiedervorlage für heute – eine eigene, spätere Wiedervorlage bleibt bestehen. */
async function createCallTask(leadId: string, note: string, now: Date): Promise<"call_task" | "kept_followup"> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { followUpAt: true } });
  if (lead?.followUpAt && lead.followUpAt.getTime() > now.getTime()) return "kept_followup";
  await prisma.lead.update({ where: { id: leadId }, data: { followUpAt: now, followUpNote: note, callbackSnoozedUntil: null } });
  return "call_task";
}

export type SequenceRunResult = { due: number; sent: number; tasks: number; stopped: number; waiting: number; failed: number };

/** Fällige Schritte abarbeiten (Cron alle 5 Minuten). */
export async function runSequences(now = new Date()): Promise<SequenceRunResult> {
  const res: SequenceRunResult = { due: 0, sent: 0, tasks: 0, stopped: 0, waiting: 0, failed: 0 };
  const due = await prisma.leadSequence.findMany({
    where: { stoppedAt: null, nextAt: { lte: now } },
    orderBy: { nextAt: "asc" },
    take: 100,
  });
  const windowOpen = inSendWindow(now);
  for (const seq of due) {
    res.due++;
    const def = SEQUENCES[seq.kind as SequenceKind];
    const step = def?.steps[seq.step];
    if (!def || !step) {
      await prisma.leadSequence.update({ where: { id: seq.id }, data: { stoppedAt: now, stopReason: "Abgeschlossen", nextAt: null } });
      continue;
    }
    const reason = await stopReasonFor(seq, now);
    if (reason) {
      await stopSequences(seq.leadId, reason, { now });
      res.stopped++;
      continue;
    }
    // WhatsApp nur im Versandfenster – Schritt wartet, Anruf-Aufgaben jederzeit.
    if (step.action === "whatsapp" && !windowOpen) {
      res.waiting++;
      continue;
    }
    // Schritt beanspruchen (nie doppelt, auch bei parallelen Läufen).
    const next = def.steps[seq.step + 1];
    const claimed = await prisma.leadSequence.updateMany({
      where: { id: seq.id, step: seq.step, stoppedAt: null },
      data: next
        ? { step: seq.step + 1, nextAt: new Date(seq.startedAt.getTime() + next.day * DAY) }
        : { step: seq.step + 1, nextAt: null, stoppedAt: now, stopReason: "Abgeschlossen" },
    });
    if (claimed.count === 0) continue;

    let entry: SequenceLogEntry;
    if (step.action === "call") {
      const r = await createCallTask(seq.leadId, step.note, now);
      entry = { at: now.toISOString(), step: seq.step, action: "call", result: r };
      if (r === "call_task") res.tasks++;
    } else {
      entry = await sendStep(seq, step, now);
      if (entry.result === "sent" || entry.result === "template") res.sent++;
      else if (entry.result === "call_task") res.tasks++;
      else if (entry.result === "failed") res.failed++;
    }
    const fresh = await prisma.leadSequence.findUnique({ where: { id: seq.id }, select: { log: true } });
    await prisma.leadSequence.update({ where: { id: seq.id }, data: { log: appendLog(fresh?.log ?? [], entry) } });
  }
  return res;
}

async function sendStep(
  seq: { leadId: string; customerId: string; step: number },
  step: Extract<Step, { action: "whatsapp" }>,
  now: Date,
): Promise<SequenceLogEntry> {
  const base = { at: now.toISOString(), step: seq.step, action: "whatsapp" as const };
  const [lead, account, cal] = await Promise.all([
    prisma.lead.findUnique({ where: { id: seq.leadId }, select: { name: true, phone: true, formData: true, source: true } }),
    prisma.whatsAppAccount.findUnique({ where: { customerId: seq.customerId }, select: { status: true } }),
    prisma.calendarConnection.findUnique({ where: { customerId: seq.customerId }, select: { status: true, bookingSlug: true } }),
  ]);
  if (!lead?.phone || account?.status !== "connected") {
    const r = await createCallTask(seq.leadId, step.fallbackNote, now);
    return { ...base, result: r, detail: !lead?.phone ? "Keine Handynummer" : "WhatsApp nicht verbunden" };
  }
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const ctx: Ctx = {
    firstName: firstNameOf(lead.name),
    topic: topicOf(lead.formData, lead.source),
    bookingUrl: cal?.status === "connected" && cal.bookingSlug && appUrl ? `${appUrl}/book/${cal.bookingSlug}` : null,
  };
  const params = step.params(ctx);
  // Freitext = freigegebene Vorlage (falls vorhanden), sonst unser Standardtext.
  const tpl = await prisma.messageTemplate.findFirst({
    where: { customerId: seq.customerId, purpose: step.purpose, status: "approved" },
    orderBy: { updatedAt: "desc" },
    select: { body: true },
  });
  const text = step.purpose === "followup_noshow" && ctx.bookingUrl ? step.text(ctx) : tpl ? renderTemplate(tpl.body, params) : step.text(ctx);
  try {
    const { mode } = await sendWhatsAppNotice({
      customerId: seq.customerId,
      to: lead.phone,
      purpose: step.purpose,
      params,
      text,
      leadId: seq.leadId,
      contactName: lead.name,
    });
    return { ...base, result: mode === "template" ? "template" : "sent" };
  } catch (err) {
    if (err instanceof NoTemplateError) {
      const r = await createCallTask(seq.leadId, step.fallbackNote, now);
      return { ...base, result: r, detail: "Keine freigegebene Vorlage – Anruf-Aufgabe statt WhatsApp" };
    }
    return { ...base, result: "failed", detail: (err instanceof Error ? err.message : String(err)).slice(0, 160) };
  }
}

/** Für die Anzeige im Lead: Abfolgen mit lesbaren Einträgen (neueste zuerst). */
export async function loadLeadSequences(leadId: string) {
  const list = await prisma.leadSequence.findMany({ where: { leadId }, orderBy: { startedAt: "desc" }, take: 5 });
  return list.map((s) => {
    const def = SEQUENCES[s.kind as SequenceKind];
    const total = def?.steps.length ?? 0;
    const log = (Array.isArray(s.log) ? (s.log as unknown as SequenceLogEntry[]) : []).map((e) => ({ at: e.at, text: describe(e, total) }));
    const nextStep = def?.steps[s.step];
    return {
      id: s.id,
      label: def?.label ?? s.kind,
      active: !s.stoppedAt,
      startedAt: s.startedAt.toISOString(),
      stopReason: s.stopReason,
      next: !s.stoppedAt && nextStep && s.nextAt ? { at: s.nextAt.toISOString(), text: nextStep.action === "whatsapp" ? "WhatsApp" : "Anruf-Aufgabe" } : null,
      entries: log,
    };
  });
}

export function describe(e: SequenceLogEntry, total: number): string {
  const n = `(Schritt ${e.step + 1} von ${total})`;
  if (e.action === "stop") return `Abfolge beendet: ${e.detail ?? "gestoppt"}`;
  if (e.action === "call") return e.result === "kept_followup" ? `Anruf fällig – Ihre eigene Wiedervorlage bleibt ${n}` : `Anruf-Aufgabe auf „Heute“ angelegt ${n}`;
  switch (e.result) {
    case "sent":
    case "template":
      return `Nachfassen: WhatsApp gesendet ${n}`;
    case "call_task":
      return `WhatsApp nicht möglich${e.detail ? ` (${e.detail.replace(/ – .*$/, "")})` : ""} – Anruf-Aufgabe angelegt ${n}`;
    case "kept_followup":
      return `WhatsApp nicht möglich – Ihre Wiedervorlage bleibt ${n}`;
    default:
      return `WhatsApp konnte nicht gesendet werden ${n}`;
  }
}
