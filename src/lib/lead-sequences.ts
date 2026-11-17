// Nicht erreicht (Ole, 14.11.2026): die Anrufe plant der Anrufplan (6 Versuche, lib/call-plan.ts); diese
// Abfolge schickt dazwischen die WhatsApp. Ihr Anruf-Schritt legt keine zweite Aufgabe an, solange der Plan läuft.
//
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
import { firstNameOf, NoTemplateError, noticeText, sendWhatsAppNotice, type NoticePurpose } from "@/lib/whatsapp/templates";
import { zweiTerminvorschlaege } from "@/lib/whatsapp/termin-vorschlaege";
import { a, anredeZeile, type Ansprache, type AnredeKontakt } from "@/lib/ansprache";
import { anspracheOf } from "@/lib/whatsapp/reminders";
import { ansprechpartner } from "@/lib/lead-anrede";
import { isCallPlanNote } from "@/lib/call-plan";
import { anrufPausiert } from "@/lib/telefonat-server";

export type SequenceKind = "not_reached" | "offer" | "no_show" | "silent" | "recall";

const DAY = 24 * 60 * 60 * 1000;
const DONE_STATUSES = new Set(["abschluss", "kein interesse", "disqualifiziert"]);
const STOP_WORDS = /^\s*(stopp?|stop|abmelden|keine (weiteren )?nachrichten|nicht mehr (schreiben|kontaktieren))\b/i;

/** hi = Anrede-Zeile nach Regel („Hallo Julia,“ bzw. „Guten Tag Frau Schneider,“ / „Guten Tag,“). */
// Kein Buchungslink in Nachrichten an Leads (Ole, 15.11.2026: „nur per Chat“): Termine bucht der Assistent im Gespräch.
type Ctx = { firstName: string; hi: string; kontakt: AnredeKontakt; topic: string; an: Ansprache };
const HOUR = 60 * 60 * 1000;
/** Mindestabstand zwischen zwei Schritten (z. B. wenn morgens zwei über Nacht fällige Schritte anstehen). */
const MIN_GAP_MS = 2 * HOUR;

type Step =
  | {
      day: number;
      action: "whatsapp";
      purpose: NoticePurpose;
      params: (c: Ctx) => string[];
      text: (c: Ctx) => string;
      fallbackNote: string;
      /** Nur als Freitext im offenen 24h-Fenster senden, sonst still überspringen (keine Vorlage doppelt). */
      onlyInWindow?: boolean;
      /** Zweck „followup“ mit zwei Terminvorschlägen: eigener Freitext (sonst der Text der Vorlage). */
      slotText?: (c: Ctx, zeiten: [string, string]) => string;
    }
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
        text: (c) =>
          a(c.an, `${c.hi} ich habe gerade versucht, dich anzurufen. Wann passt es dir am besten? Antworte einfach hier, dann melde ich mich zu deiner Wunschzeit.`, `${c.hi} ich habe gerade versucht, Sie anzurufen. Wann passt es Ihnen am besten? Antworten Sie einfach hier, dann melde ich mich zu Ihrer Wunschzeit.`),
        slotText: (c, [z1, z2]) =>
          a(c.an, `${c.hi} ich habe gerade versucht, dich anzurufen. Passt dir für ein kurzes Gespräch ${z1} oder ${z2}?`, `${c.hi} ich habe gerade versucht, Sie anzurufen. Passt Ihnen für ein kurzes Gespräch ${z1} oder ${z2}?`),
        fallbackNote: "Nicht erreicht: nochmal anrufen",
      },
      { day: 2, action: "call", note: "Nachfassen: nochmal anrufen" },
      {
        day: 6,
        action: "whatsapp",
        purpose: "followup_last",
        params: (c) => [c.firstName],
        text: (c) =>
          a(c.an, `${c.hi} ich melde mich ein letztes Mal: Ist das Thema für dich noch aktuell? Wenn nicht, ist das völlig in Ordnung, dann melde ich mich nicht weiter. Alles Gute!`, `${c.hi} ich melde mich ein letztes Mal: Ist das Thema für Sie noch aktuell? Wenn nicht, ist das völlig in Ordnung, dann melde ich mich nicht weiter. Alles Gute!`),
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
        text: (c) =>
          a(c.an, `${c.hi} konntest du dir das Angebot zu ${c.topic} schon anschauen? Ist für dich eher der Beitrag oder die Leistung entscheidend?`, `${c.hi} konnten Sie sich das Angebot zu ${c.topic} schon anschauen? Ist für Sie eher der Beitrag oder die Leistung entscheidend?`),
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
          `${c.hi} kein Problem, so etwas passiert. Sollen wir einen neuen Termin finden?`,
        fallbackNote: "Nicht erschienen: neuen Termin vereinbaren",
      },
      { day: 2, action: "call", note: "Neuen Termin vereinbaren" },
    ],
  },
  // Chat ruht (Ole, 15.11.2026: „schon nach wenigen Stunden … recht aggressiv, der Interessent hat ja
  // Interesse gezeigt“; „nach 6–10 Stunden nochmal nachhaken“): startet bei jeder Nachricht des Assistenten neu
  // (restartSilentSequence) und läuft, solange der Lead nicht antwortet: 2 Std., 8 Std., ca. 20 Std. (nur als
  // Freitext im offenen Fenster), 3 Tage. Außerhalb des Fensters jede Vorlage nur einmal (followup,
  // followup_nudge, followup_last).
  silent: {
    label: "Chat ruht",
    steps: [
      {
        day: 2 / 24,
        action: "whatsapp",
        purpose: "followup",
        params: (c) => [c.firstName],
        text: (c) =>
          a(
            c.an,
            `${c.hi} kurze Nachfrage zu ${c.topic}: Antworte einfach hier, dann geht es direkt weiter. Es dauert nur noch einen Moment, dann kann ich dir Termine vorschlagen.`,
            `${c.hi} kurze Nachfrage zu ${c.topic}: Antworten Sie einfach hier, dann geht es direkt weiter. Es dauert nur noch einen Moment, dann kann ich Ihnen Termine vorschlagen.`,
          ),
        fallbackNote: "Keine Reaktion im Chat: anrufen",
      },
      {
        day: 8 / 24,
        action: "whatsapp",
        purpose: "followup_nudge",
        params: (c) => [c.firstName],
        text: (c) =>
          a(
            c.an,
            `${c.hi} sollen wir mit ${c.topic} weitermachen? Es dauert nur ein paar Minuten.`,
            `${c.hi} sollen wir mit ${c.topic} weitermachen? Es dauert nur ein paar Minuten.`,
          ),
        fallbackNote: "Keine Reaktion im Chat: anrufen",
      },
      {
        day: 20 / 24,
        action: "whatsapp",
        purpose: "followup",
        onlyInWindow: true,
        params: (c) => [c.firstName],
        text: (c) =>
          `${c.hi} ich wollte mich noch einmal melden. ${a(c.an, "Wann passt es dir für ein kurzes Gespräch? Antworte einfach hier, dann schlage ich dir Zeiten vor.", "Wann passt es Ihnen für ein kurzes Gespräch? Antworten Sie einfach hier, dann schlage ich Ihnen Zeiten vor.")}`,
        fallbackNote: "Keine Reaktion im Chat: anrufen",
      },
      {
        day: 3,
        action: "whatsapp",
        purpose: "followup_last",
        params: (c) => [c.firstName],
        text: (c) =>
          `${c.hi} ${a(c.an, "ich melde mich ein letztes Mal: Ist das Thema für dich noch aktuell?", "ich melde mich ein letztes Mal: Ist das Thema für Sie noch aktuell?")} Wenn nicht, ist das völlig in Ordnung, dann melde ich mich nicht weiter.`,
        fallbackNote: "Letzter Versuch: anrufen",
      },
    ],
  },
  // Lead bittet um später („melden Sie sich morgen“, Ole 15.11.2026): der Assistent legt sich selbst eine
  // Wiedervorlage (scheduleBotRecall) und meldet sich zur vereinbarten Zeit. Unabhängig vom Schalter
  // „Automatisch nachfassen“, weil der Lead ausdrücklich darum gebeten hat.
  recall: {
    label: "Assistent meldet sich wieder",
    steps: [
      {
        day: 0,
        action: "whatsapp",
        purpose: "followup",
        params: (c) => [c.firstName],
        text: (c) =>
          a(
            c.an,
            `${c.hi} wie besprochen melde ich mich wieder zu ${c.topic}. Passt es dir jetzt? Dann machen wir direkt weiter.`,
            `${c.hi} wie besprochen melde ich mich wieder zu ${c.topic}. Passt es Ihnen jetzt? Dann machen wir direkt weiter.`,
          ),
        slotText: (c, [z1, z2]) =>
          a(
            c.an,
            `${c.hi} wie besprochen melde ich mich wieder zu ${c.topic}. Passt dir für ein kurzes Gespräch ${z1} oder ${z2}?`,
            `${c.hi} wie besprochen melde ich mich wieder zu ${c.topic}. Passt Ihnen für ein kurzes Gespräch ${z1} oder ${z2}?`,
          ),
        fallbackNote: "Lead wollte, dass wir uns wieder melden: anrufen",
      },
    ],
  },
};

export type SequenceLogEntry = {
  at: string;
  step: number;
  action: "whatsapp" | "call" | "stop" | "plan";
  /** sent | template | call_task | kept_followup | skipped | failed | stopped | planned */
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

/**
 * „Chat ruht“ nach einer Nachricht des Assistenten (neu) starten: läuft schon eine, beginnt sie von vorn.
 * Nicht, wenn eine andere Abfolge läuft (Nicht erreicht, Angebot, Nicht erschienen), ein Termin
 * ansteht oder der Lead abgeschlossen ist.
 */
export async function restartSilentSequence(leadId: string, now = new Date()) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, erasedAt: true, status: true, stornoState: true, waUnavailableAt: true } });
  if (!lead || lead.erasedAt || lead.stornoState) return null;
  // Kein WhatsApp (lib/whatsapp/kein-whatsapp.ts): kein Nachfassen im Chat, der Vermittler ruft an
  if (lead.waUnavailableAt) return null;
  if (DONE_STATUSES.has((lead.status ?? "").trim().toLowerCase())) return null;
  if (!(await enabledFor(lead.customerId))) return null;
  const upcoming = await prisma.appointment.count({ where: { leadId, status: "booked", startsAt: { gt: now } } });
  if (upcoming > 0) return null;
  const running = await prisma.leadSequence.findMany({ where: { leadId, stoppedAt: null }, select: { id: true, kind: true } });
  if (running.some((r) => r.kind !== "silent")) return null;
  const nextAt = new Date(now.getTime() + SEQUENCES.silent.steps[0].day * DAY);
  const same = running.find((r) => r.kind === "silent");
  if (same) return prisma.leadSequence.update({ where: { id: same.id }, data: { step: 0, startedAt: now, nextAt } });
  return prisma.leadSequence.create({ data: { leadId, customerId: lead.customerId, kind: "silent", step: 0, startedAt: now, nextAt } });
}

const fmtWhen = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

/**
 * Der Lead möchte später kontaktiert werden: Assistent legt sich eine Wiedervorlage (Abfolge „recall“).
 * Andere laufende Abfolgen enden (auch „Chat ruht“). Zeitpunkt frühestens in 15 Minuten, höchstens 60 Tage.
 */
export async function scheduleBotRecall(leadId: string, at: Date, note: string | null, now = new Date()) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return null;
  const agent = await prisma.agentConfig.findUnique({ where: { customerId: lead.customerId }, select: { active: true } });
  if (!agent?.active) return null;
  const when = new Date(Math.min(Math.max(at.getTime(), now.getTime() + 15 * 60 * 1000), now.getTime() + 60 * DAY));
  await stopSequences(leadId, "Lead möchte später kontaktiert werden", { now });
  const detail = `meldet sich ${fmtWhen(when)} Uhr${note ? ` („${note.replace(/\s+/g, " ").trim().slice(0, 80)}“)` : ""}`;
  return prisma.leadSequence.create({
    data: {
      leadId,
      customerId: lead.customerId,
      kind: "recall",
      step: 0,
      startedAt: now,
      nextAt: when,
      log: [{ at: now.toISOString(), step: -1, action: "plan", result: "planned", detail }] as unknown as Prisma.InputJsonValue,
    },
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
function topicOf(formData: Prisma.JsonValue | null, source: string | null, an: Ansprache = "sie"): string {
  if (Array.isArray(formData)) {
    const hit = (formData as { label?: unknown; value?: unknown }[]).find((a) => a?.label === "Versicherungsinteresse" && typeof a.value === "string" && a.value.trim());
    if (hit) return String(hit.value).trim().slice(0, 60);
  }
  return source ? displayProduct(source) : a(an, "deiner Anfrage", "Ihrer Anfrage");
}

/** Grund, warum eine Abfolge vor dem nächsten Schritt endet – oder null. */
export async function stopReasonFor(seq: { leadId: string; customerId: string; startedAt: Date; kind?: string }, now = new Date()): Promise<string | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: seq.leadId },
    select: { status: true, stornoState: true, erasedAt: true, phone: true },
  });
  if (!lead || lead.erasedAt) return "Lead gelöscht";
  if (lead.stornoState) return "Lead reklamiert";
  const s = (lead.status ?? "").trim().toLowerCase();
  if (DONE_STATUSES.has(s)) return `Phase: ${lead.status}`;
  if (seq.kind === "recall") {
    const agent = await prisma.agentConfig.findUnique({ where: { customerId: seq.customerId }, select: { active: true } });
    if (!agent?.active) return "Assistent ausgeschaltet";
  } else if (!(await enabledFor(seq.customerId))) return "Automatisches Nachfassen ausgeschaltet";
  // Neu gebuchter oder noch bevorstehender Termin → nicht weiter nachfassen.
  const booked = await prisma.appointment.count({ where: { leadId: seq.leadId, status: "booked", OR: [{ createdAt: { gt: seq.startedAt } }, { startsAt: { gt: now } }] } });
  if (booked > 0) return "Termin gebucht";
  const reply = await prisma.message.findFirst({
    where: {
      direction: "inbound",
      // Wiedervorlage: ein kurzes „Danke, bis morgen“ direkt danach hebt sie nicht auf
      createdAt: { gt: seq.kind === "recall" ? new Date(seq.startedAt.getTime() + 60 * 60 * 1000) : seq.startedAt },
      conversation: { customerId: seq.customerId, OR: [{ leadId: seq.leadId }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] },
    },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  if (reply) return STOP_WORDS.test(reply.body ?? "") ? "Abgemeldet („Stopp“)" : "Lead hat geantwortet";
  if (seq.kind === "silent") {
    // Der Vermittler hat übernommen (Assistent pausiert oder eigene Nachricht): kein Nachfassen im Namen des Assistenten
    const conv = await prisma.conversation.findFirst({
      where: { customerId: seq.customerId, OR: [{ leadId: seq.leadId }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, botActive: true, optedOutAt: true },
    });
    if (conv?.optedOutAt) return "Abgemeldet („Stopp“)";
    if (conv && !conv.botActive) return "Assistent pausiert";
    if (conv) {
      const human = await prisma.message.count({
        where: { conversationId: conv.id, direction: "outbound", createdAt: { gt: seq.startedAt }, NOT: { sentBy: { in: ["bot", "system"] } } },
      });
      if (human > 0) return "Vermittler schreibt selbst";
    }
  }
  if (lead.phone) {
    const revoked = await prisma.consentOptIn.findFirst({ where: { customerId: seq.customerId, contactPhone: lead.phone, revokedAt: { not: null } }, select: { id: true } });
    if (revoked) return "Einwilligung widerrufen";
  }
  return null;
}

/**
 * Anruf-Aufgabe: Wiedervorlage für heute – eine eigene, spätere Wiedervorlage bleibt bestehen.
 * Läuft der Anrufplan (lib/call-plan.ts, „Anrufversuch X von 6“), plant er die Anrufe: keine zweite Aufgabe.
 */
async function createCallTask(leadId: string, note: string, now: Date): Promise<"call_task" | "kept_followup"> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { followUpAt: true, followUpNote: true } });
  if (lead?.followUpAt && lead.followUpAt.getTime() > now.getTime()) return "kept_followup";
  if (lead?.followUpAt && isCallPlanNote(lead.followUpNote)) return "kept_followup";
  await prisma.lead.update({ where: { id: leadId }, data: { followUpAt: now, followUpNote: note, callbackSnoozedUntil: null } });
  return "call_task";
}

export type SequenceRunResult = { due: number; sent: number; tasks: number; stopped: number; waiting: number; failed: number };

/** Fällige Schritte abarbeiten (Cron alle 5 Minuten). */
export async function runSequences(now = new Date()): Promise<SequenceRunResult> {
  const res: SequenceRunResult = { due: 0, sent: 0, tasks: 0, stopped: 0, waiting: 0, failed: 0 };
  const due = await prisma.leadSequence.findMany({
    // Ruhende Konten (lib/ruhend.ts): kein Nachfassen
    where: { stoppedAt: null, nextAt: { lte: now }, lead: { customer: { dormantSince: null } } },
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
    // Vermittler telefoniert gerade bzw. hat noch kein Ergebnis eingetragen (lib/telefonat.ts): kein Nachfassen, Schritt wartet
    if (step.action === "whatsapp" && (await anrufPausiert(seq.leadId, now))) {
      res.waiting++;
      continue;
    }
    // Schritt beanspruchen (nie doppelt, auch bei parallelen Läufen).
    const next = def.steps[seq.step + 1];
    const claimed = await prisma.leadSequence.updateMany({
      where: { id: seq.id, step: seq.step, stoppedAt: null },
      data: next
        ? { step: seq.step + 1, nextAt: new Date(Math.max(seq.startedAt.getTime() + next.day * DAY, now.getTime() + MIN_GAP_MS)) }
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
  const [lead, account] = await Promise.all([
    prisma.lead.findUnique({ where: { id: seq.leadId }, select: { name: true, phone: true, formData: true, source: true, waConsent: true, waUnavailableAt: true } }),
    prisma.whatsAppAccount.findUnique({ where: { customerId: seq.customerId }, select: { status: true } }),
  ]);
  // Kein WhatsApp (Nummer nicht erreichbar, lib/whatsapp/kein-whatsapp.ts): Anruf statt WhatsApp, außer der Lead hat selbst geschrieben
  const noWa = !!lead?.waUnavailableAt && lead.phone
    ? (await prisma.message.count({ where: { direction: "inbound", conversation: { customerId: seq.customerId, contactPhone: lead.phone } } })) === 0
    : false;
  if (!lead?.phone || account?.status !== "connected" || lead.waConsent === "nein" || noWa) {
    const r = await createCallTask(seq.leadId, step.fallbackNote, now);
    return {
      ...base,
      result: r,
      detail: !lead?.phone ? "Keine Handynummer" : lead.waConsent === "nein" ? "Keine WhatsApp-Einwilligung im Formular" : noWa ? "Nicht per WhatsApp erreichbar" : "WhatsApp nicht verbunden",
    };
  }
  const an = await anspracheOf(seq.customerId);
  const who = await ansprechpartner({ customerId: seq.customerId, leadId: seq.leadId, phone: lead.phone, name: lead.name });
  const ctx: Ctx = {
    firstName: firstNameOf(lead.name),
    hi: anredeZeile(an, who.kontakt),
    kontakt: who.kontakt,
    topic: topicOf(lead.formData, lead.source, an),
    an,
  };
  if (step.onlyInWindow) {
    const conv = await prisma.conversation.findUnique({
      where: { customerId_contactPhone: { customerId: seq.customerId, contactPhone: lead.phone } },
      select: { windowExpiresAt: true },
    });
    if (!conv?.windowExpiresAt || conv.windowExpiresAt.getTime() <= now.getTime()) {
      return { ...base, result: "skipped", detail: "24h-Fenster geschlossen, keine zweite Vorlage" };
    }
  }
  let purpose = step.purpose;
  let params = step.params(ctx);
  // Freitext (offenes Fenster) = unser Text mit Anrede nach Regel; außerhalb wählt sendWhatsAppNotice
  // die freigegebene Vorlage passend zu Ansprache und Anrede.
  let text = step.text(ctx);
  let buttons: { buttonPayloads?: string[]; textButtons?: string[]; legacyParams?: string[] } = {};
  // Nachfassen mit zwei konkreten Zeiten aus dem Kalender (Ole, 15.11.2026); ohne Kalender die kurze Nachfrage
  if (purpose === "followup") {
    const zeiten = await zweiTerminvorschlaege(seq.customerId, seq.leadId);
    if (zeiten) {
      params = [...params, ...zeiten.labels];
      text = step.slotText ? step.slotText(ctx, zeiten.labels) : noticeText("followup", ctx.an, who, ctx.kontakt, zeiten.labels);
      // Ältere freigegebene „followup“-Fassung (nur Name): ohne Zeiten
      buttons = { buttonPayloads: zeiten.payloads, legacyParams: [ctx.firstName] };
    } else {
      purpose = "followup_nudge";
      buttons = { textButtons: [] };
    }
  }
  try {
    const { mode } = await sendWhatsAppNotice({
      customerId: seq.customerId,
      to: lead.phone,
      purpose,
      params,
      text,
      leadId: seq.leadId,
      contactName: lead.name,
      anrede: ctx.kontakt,
      ...buttons,
    });
    return { ...base, result: mode === "template" ? "template" : "sent" };
  } catch (err) {
    if (err instanceof NoTemplateError) {
      const r = await createCallTask(seq.leadId, step.fallbackNote, now);
      return { ...base, result: r, detail: "Keine freigegebene Vorlage, Anruf-Aufgabe statt WhatsApp" };
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
      kind: s.kind,
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
  if (e.action === "plan") return `Wiedervorlage vom Assistenten: ${e.detail ?? "meldet sich später"}`;
  if (e.action === "call") return e.result === "kept_followup" ? `Anruf fällig, Ihre eigene Wiedervorlage bleibt ${n}` : `Anruf-Aufgabe auf „Heute“ angelegt ${n}`;
  switch (e.result) {
    case "sent":
    case "template":
      return `Nachfassen: WhatsApp gesendet ${n}`;
    case "call_task":
      return `WhatsApp nicht möglich${e.detail ? ` (${e.detail.replace(/ – .*$/, "")})` : ""} – Anruf-Aufgabe angelegt ${n}`;
    case "kept_followup":
      return `WhatsApp nicht möglich, Ihre Wiedervorlage bleibt ${n}`;
    default:
      return `WhatsApp konnte nicht gesendet werden ${n}`;
  }
}
