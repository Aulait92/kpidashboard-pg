"use server";

// Nächster Schritt und Verloren-Schutz (Ole, 14.11.2026). Aktionen für die Dialoge „Wie geht es weiter?“
// und „Warum verloren?“ – genutzt im Kontakt, in der Pipeline, auf „Heute“, in der Anrufliste und in der
// Kontakte-Liste. Schreibrecht wie überall: eigener Kunde bzw. Admin-Vorschau nur für Demo-Leads.

import { revalidatePath } from "next/cache";
import { updateLeadEditableFields } from "@/lib/airtable-write";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { planNextCallAttempt, registerCallAttempt, type CallAttemptResult } from "@/lib/call-attempts";
import { fmtAttemptAt } from "@/lib/call-plan";
import { formWithOverrides } from "@/lib/lead-stammdaten";
import { a, anredeZeile, asAnsprache, namePartsFromForm, salutationFromForm, type Ansprache } from "@/lib/ansprache";
import { syncFollowUpWithStatus, workdaysFromNow } from "@/lib/lead-followup";
import { fmtDayShort, logLeadHistory } from "@/lib/lead-history";
import { canChooseUnreachable, isLostReason, lostReason, needsLostWarning, CALL_ATTEMPTS_TARGET, type LostReasonKey } from "@/lib/lead-lost";
import { NEXT_STEP_TASK_NOTE } from "@/lib/lead-next-step";
import { nextStepStateOf } from "@/lib/lead-next-step-server";
import { fuelle, fuelleMitSignatur, werteFuer } from "@/lib/mail/platzhalter";
import { mailFeaturesOffFor, postfachOf, sendViaPostfach } from "@/lib/mail/postfach";
import { planTerminErinnerung } from "@/lib/mail/termin-erinnerung";
import { STANDARD_VORLAGEN_JE } from "@/lib/mail/vorlagen";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { bookingPageUrl } from "@/lib/public-url";
import type { InboxResult, UndoSnapshot } from "@/app/buyer/inbox-actions";

const PREVIEW = "In der Vorschau nur mit Demo-Leads möglich.";

function refresh(leadId?: string) {
  revalidatePath("/buyer");
  revalidatePath("/buyer/leads");
  revalidatePath("/buyer/kanban");
  revalidatePath("/buyer/kontakte", "layout");
  revalidatePath("/buyer/zahlen");
  if (leadId) revalidatePath(`/buyer/leads/${leadId}`);
}

const leadSelect = {
  id: true,
  airtableId: true,
  customerId: true,
  name: true,
  phone: true,
  email: true,
  source: true,
  formData: true,
  status: true,
  reached: true,
  closedAt: true,
  closeValue: true,
  contactAttempts: true,
  callAttempts: true,
  lastCallAttemptAt: true,
  callbackSnoozedUntil: true,
  followUpAt: true,
  followUpNote: true,
  lostReason: true,
  lostNote: true,
  lostAt: true,
  lostEarly: true,
  disqualifyReason: true,
} as const;

type LeadRow = NonNullable<Awaited<ReturnType<typeof loadLead>>>;

async function loadLead(leadId: string, customerId: string) {
  return prisma.lead.findFirst({ where: { id: leadId, customerId }, select: leadSelect });
}

function undoOf(l: LeadRow, appointment?: { id: string; status: string }): UndoSnapshot {
  return {
    kind: "lead",
    leadId: l.id,
    prev: {
      status: l.status,
      contactAttempts: l.contactAttempts,
      callbackSnoozedUntil: l.callbackSnoozedUntil?.toISOString() ?? null,
      reached: l.reached,
      closedAt: l.closedAt?.toISOString() ?? null,
      closeValue: l.closeValue == null ? null : Number(l.closeValue),
      followUpAt: l.followUpAt?.toISOString() ?? null,
      followUpNote: l.followUpNote ?? null,
      callAttempts: l.callAttempts,
      lastCallAttemptAt: l.lastCallAttemptAt?.toISOString() ?? null,
      lost: { reason: l.lostReason, note: l.lostNote, at: l.lostAt?.toISOString() ?? null, early: l.lostEarly, disqualifyReason: l.disqualifyReason },
    },
    ...(appointment ? { appointment } : {}),
  };
}

async function anspracheFor(customerId: string): Promise<Ansprache> {
  return asAnsprache((await prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true } }))?.leadAddress);
}

async function terminlinkFor(customerId: string, leadId: string): Promise<string | null> {
  const cal = await prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true, bookingSlug: true } });
  // Persönlicher Link für den Kontakt, auf der eigenen Buchungsadresse (lib/public-url.ts)
  return cal?.status === "connected" && cal.bookingSlug ? bookingPageUrl(cal.bookingSlug, { lead: leadId }) : null;
}

// ─── Angaben für die Dialoge ───────────────────────────────────────────────

export type LeadStepInfo = {
  leadId: string;
  name: string;
  source: string | null;
  phone: string | null;
  email: string | null;
  reached: boolean;
  callAttempts: number;
  target: number;
  ansprache: Ansprache;
  /** Eigenes Postfach verbunden */
  mailReady: boolean;
  terminlink: string | null;
  conversationId: string | null;
  /** „Nach 6 Versuchen nicht erreichbar“ wählbar */
  canUnreachable: boolean;
  needsStep: boolean;
};

export async function leadStepInfoAction(leadId: string): Promise<{ ok: true; info: LeadStepInfo } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Nicht angemeldet." };
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, customerId: ctx.customerId, ...(ctx.teamRole === "advisor" && ctx.userId ? { assignedUserId: ctx.userId } : {}) },
    select: { id: true, name: true, source: true, phone: true, email: true, reached: true, callAttempts: true, customerId: true },
  });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const [an, postfach, link, conv, state, mailOff] = await Promise.all([
    anspracheFor(lead.customerId),
    postfachOf(ctx.userId),
    terminlinkFor(lead.customerId, lead.id),
    prisma.conversation.findFirst({ where: { leadId: lead.id }, orderBy: { lastMessageAt: "desc" }, select: { id: true } }),
    nextStepStateOf(lead.id),
    mailFeaturesOffFor(lead.customerId),
  ]);
  return {
    ok: true,
    info: {
      leadId: lead.id,
      name: lead.name ?? "Lead",
      source: lead.source,
      phone: lead.phone,
      // E-Mail-Funktionen aus („Meine Gesellschaft erlaubt das nicht“): keine E-Mail-Wege anbieten
      email: mailOff ? null : lead.email,
      reached: lead.reached,
      callAttempts: lead.callAttempts,
      target: CALL_ATTEMPTS_TARGET,
      ansprache: an,
      mailReady: !mailOff && !!postfach && !!lead.email,
      terminlink: link,
      conversationId: conv?.id ?? null,
      canUnreachable: canChooseUnreachable(lead),
      needsStep: state === "missing" || state === "result_missing",
    },
  };
}

// ─── Verloren mit Grund ────────────────────────────────────────────────────

export type LostResult = InboxResult | { ok: false; error: string; warn: { attempts: number; target: number } };

/**
 * Lead auf Verloren setzen. Nie erreicht und unter 6 Anrufversuchen: ohne `override` kommt die Warnung zurück;
 * mit `override` („Trotzdem verloren“) ist eine Begründung Pflicht und der Lead zählt als vorzeitig verloren.
 * Optional das Ergebnis eines vorbeigegangenen Termins (appointmentId) gleich mit eintragen.
 */
export async function markLeadLostResult(
  leadId: string,
  input: { reason: string; note?: string | null; override?: boolean; appointmentId?: string | null },
): Promise<LostResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: PREVIEW };
  if (!isLostReason(input.reason)) return { ok: false, error: "Bitte einen Grund wählen." };
  const reason = lostReason(input.reason)!;
  const lead = await loadLead(leadId, customerId);
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const note = (input.note ?? "").trim().slice(0, 500);
  const appt = input.appointmentId
    ? await prisma.appointment.findFirst({ where: { id: input.appointmentId, leadId: lead.id, customerId }, select: { id: true, status: true } })
    : null;
  // Termin hat stattgefunden: der Lead war erreicht.
  const guard = { reached: lead.reached || !!appt, callAttempts: lead.callAttempts };
  if (reason.key === "nicht_erreichbar" && !canChooseUnreachable(guard)) {
    return { ok: false, error: `Erst ${guard.callAttempts} von ${CALL_ATTEMPTS_TARGET} Versuchen.` };
  }
  if (reason.needsNote && note.length < 3) return { ok: false, error: "Bitte kurz begründen." };
  const warn = needsLostWarning(guard, reason.key as LostReasonKey);
  if (warn && !input.override) return { ok: false, error: "Zu wenige Anrufversuche.", warn: { attempts: guard.callAttempts, target: CALL_ATTEMPTS_TARGET } };
  if (warn && note.length < 3) return { ok: false, error: "Bitte begründen, warum der Lead trotzdem verloren ist." };

  const undo = undoOf(lead, appt ?? undefined);
  const now = new Date();
  // Bei übergangener Warnung bleibt „erreicht“, wie es war (der Lead wurde ja nicht erreicht).
  const reached = warn ? lead.reached : reason.reached ?? (lead.reached || !!appt);
  if (appt && appt.status === "booked") await prisma.appointment.update({ where: { id: appt.id }, data: { status: "completed" } });
  if (lead.airtableId) {
    await updateLeadEditableFields({ airtableId: lead.airtableId, bearbeitungsstatus: reason.status }).catch((e) => console.error("[verloren]", e));
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: reason.status,
      reached,
      closedAt: null,
      lostReason: reason.key,
      lostNote: note || null,
      lostAt: now,
      lostEarly: warn,
      // Gründe für die Auswertung der Leadqualität (lib/lead-quality, Optimierung) mitführen
      disqualifyReason: reason.status === "Disqualifiziert" ? reason.key : null,
    },
  });
  await syncFollowUpWithStatus(lead.id, reason.status);
  await logLeadHistory(
    lead.id,
    "status",
    `Verloren: ${reason.label}${note ? ` · ${note}` : ""}${warn ? ` (nach ${guard.callAttempts} von ${CALL_ATTEMPTS_TARGET} Anrufversuchen, Warnung übergangen)` : ""}`,
    { customerId },
  );
  await recordUsage("action", `lost.${reason.key}${warn ? ".override" : ""}`);
  refresh(lead.id);
  return { ok: true, undo };
}

// ─── Nicht erreicht und Weiter versuchen ───────────────────────────────────

export type AttemptResult = InboxResult & { attempt?: CallAttemptResult & { nextLabel: string | null } };

/** „Nicht erreicht?“: Anrufversuch eintragen (30-Minuten-Sperre), nächsten Versuch planen, Lead bleibt offen. */
export async function notReachedResult(leadId: string): Promise<AttemptResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: PREVIEW };
  const lead = await loadLead(leadId, customerId);
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const undo = undoOf(lead);
  const r = await registerCallAttempt(lead.id, { customerId });
  if (!r) return { ok: false, error: "Lead nicht gefunden." };
  await recordUsage("action", "callback.not_reached");
  refresh(lead.id);
  return { ok: true, ...(r.counted ? { undo } : {}), attempt: { ...r, nextLabel: r.nextAt ? fmtAttemptAt(new Date(r.nextAt), new Date()) : null } };
}

/** „Weiter versuchen“: nächsten Anrufversuch nach Plan anlegen (ohne neuen Versuch zu zählen). */
export async function keepTryingResult(leadId: string): Promise<AttemptResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: PREVIEW };
  const lead = await loadLead(leadId, customerId);
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const undo = undoOf(lead);
  const now = new Date();
  const plan = await planNextCallAttempt(lead.id, now);
  let nextAt = plan.nextAt;
  if (!nextAt && !plan.kept) {
    // Plan fertig oder nie gestartet: morgen nochmal (eigene Wiedervorlage).
    nextAt = workdaysFromNow(1);
    await prisma.lead.update({ where: { id: lead.id }, data: { followUpAt: nextAt, followUpNote: "Nochmal anrufen", callbackSnoozedUntil: nextAt } });
  }
  if (nextAt) await logLeadHistory(lead.id, "wiedervorlage", `Weiter versuchen: nächster Anruf ${fmtAttemptAt(nextAt, now)}`, { customerId });
  await recordUsage("action", "lost.keep_trying");
  refresh(lead.id);
  return {
    ok: true,
    undo,
    attempt: { counted: false, attempts: lead.callAttempts, nextAt: nextAt?.toISOString() ?? null, keptFollowUp: plan.kept, auto: false, nextLabel: nextAt ? fmtAttemptAt(nextAt, now) : null },
  };
}

/** Texte „Nicht erreicht“ für WhatsApp und E-Mail (Ansprache nach Einstellung des Kunden, ohne Gedankenstriche). */
export async function notReachedTextsAction(leadId: string): Promise<{ ok: true; whatsapp: string; subject: string; body: string } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Nicht angemeldet." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId: ctx.customerId }, select: { id: true, name: true, source: true, formData: true, contactOverrides: true } });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const [an, link, me, postfach, own] = await Promise.all([
    anspracheFor(ctx.customerId),
    terminlinkFor(ctx.customerId, lead.id),
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true, mailSignature: true } }) : null,
    postfachOf(ctx.userId),
    prisma.mailTemplate.findFirst({ where: { customerId: ctx.customerId, name: "Nicht erreicht" }, select: { subject: true, body: true } }),
  ]);
  const meinname = postfach?.fromName ?? me?.displayName ?? "";
  const werte = { ...werteFuer({ name: lead.name, source: lead.source, salutation: salutationFromForm(formWithOverrides(lead.formData, lead.contactOverrides)), ...namePartsFromForm(formWithOverrides(lead.formData, lead.contactOverrides)) }, meinname, { ansprache: an, terminlink: link }), signatur: me?.mailSignature ?? "" };
  const v = own ?? STANDARD_VORLAGEN_JE[an].find((x) => x.name === "Nicht erreicht")!;
  const kontakt = { fullName: lead.name, salutation: salutationFromForm(formWithOverrides(lead.formData, lead.contactOverrides)), ...namePartsFromForm(formWithOverrides(lead.formData, lead.contactOverrides)) };
  const hi = anredeZeile(an, kontakt);
  const whatsapp = [
    `${hi} ${a(an, "ich habe gerade versucht, dich anzurufen, leider ohne Erfolg.", "ich habe gerade versucht, Sie anzurufen, leider ohne Erfolg.")}`,
    // Zwei konkrete Rückrufzeiten wie in der E-Mail „Nicht erreicht“ (Ole, 15.11.2026)
    a(
      an,
      `Ich versuche es gern noch einmal ${werte.rueckruf_1} oder ${werte.rueckruf_2}. Passt dir eine der beiden Zeiten?`,
      `Ich versuche es gern noch einmal ${werte.rueckruf_1} oder ${werte.rueckruf_2}. Passt Ihnen eine der beiden Zeiten?`,
    ),
    link ? a(an, `Oder such dir direkt einen Termin aus: ${link}`, `Oder suchen Sie sich direkt einen Termin aus: ${link}`) : "",
    meinname ? `Viele Grüße\n${meinname}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { ok: true, whatsapp, subject: fuelle(v.subject, werte).trim(), body: fuelleMitSignatur(v.body, werte) };
}

// ─── Wie geht es weiter? ───────────────────────────────────────────────────

/** Wiedervorlage „heute später“: in 3 Stunden, abends bzw. am Wochenende nächster Werktag 9 Uhr. */
export async function laterTodayResult(leadId: string): Promise<InboxResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: PREVIEW };
  const lead = await loadLead(leadId, customerId);
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const now = new Date();
  let at = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(at));
  if (hour >= 20 || hour < 8) at = workdaysFromNow(1);
  await prisma.lead.update({ where: { id: lead.id }, data: { followUpAt: at, followUpNote: lead.followUpNote || "Nochmal melden", callbackSnoozedUntil: at } });
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(at);
  await logLeadHistory(lead.id, "wiedervorlage", `Wiedervorlage ${fmtDayShort(at)} ${time} Uhr`, { customerId });
  await recordUsage("action", "followup.set", { meta: { hours: 3 } });
  refresh(lead.id);
  return { ok: true, undo: undoOf(lead) };
}

/**
 * Dialog ohne Wahl geschlossen: Aufgabe „Nächsten Schritt festlegen“ für morgen, aber nur, wenn der Lead
 * weiterhin keinen nächsten Schritt hat (keine Doppelungen).
 */
export async function nextStepTaskResult(leadId: string): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: PREVIEW };
  const state = await nextStepStateOf(leadId);
  if (state !== "missing" && state !== "result_missing") return { ok: true, created: false };
  const at = workdaysFromNow(1);
  const r = await prisma.lead.updateMany({ where: { id: leadId, customerId, followUpAt: null }, data: { followUpAt: at, followUpNote: NEXT_STEP_TASK_NOTE } });
  if (r.count > 0) {
    await logLeadHistory(leadId, "wiedervorlage", `Wiedervorlage ${fmtDayShort(at)} · ${NEXT_STEP_TASK_NOTE}`, { customerId });
    refresh(leadId);
  }
  return { ok: true, created: r.count > 0 };
}

/** Texte „Termin anbieten“ mit persönlichem Terminlink (WhatsApp und E-Mail, Ansprache nach Einstellung). */
export async function appointmentTextsAction(leadId: string): Promise<{ ok: true; link: string; whatsapp: string; subject: string; body: string } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Nicht angemeldet." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId: ctx.customerId }, select: { id: true, name: true, formData: true, contactOverrides: true } });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const link = await terminlinkFor(ctx.customerId, lead.id);
  if (!link) return { ok: false, error: "Für den Terminlink bitte zuerst den Kalender verbinden." };
  const [an, me, postfach] = await Promise.all([
    anspracheFor(ctx.customerId),
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true, mailSignature: true } }) : null,
    postfachOf(ctx.userId),
  ]);
  const meinname = postfach?.fromName ?? me?.displayName ?? "";
  const hi = anredeZeile(an, { fullName: lead.name, salutation: salutationFromForm(formWithOverrides(lead.formData, lead.contactOverrides)), ...namePartsFromForm(formWithOverrides(lead.formData, lead.contactOverrides)) });
  const core = `${hi} ${a(an, "lass uns kurz sprechen. Such dir hier einfach einen passenden Termin aus:", "lassen Sie uns kurz sprechen. Suchen Sie sich hier einfach einen passenden Termin aus:")}\n\n${link}`;
  const gruss = meinname ? `Viele Grüße\n${meinname}` : "";
  return {
    ok: true,
    link,
    whatsapp: [core, gruss].filter(Boolean).join("\n\n"),
    subject: a(an, "Dein Termin", "Ihr Termin"),
    body: [core, me?.mailSignature?.trim() || gruss].filter(Boolean).join("\n\n"),
  };
}

/** E-Mail über das eigene Postfach senden und in den Verlauf schreiben. */
async function sendMail(leadId: string, customerId: string, subject: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  const postfach = await postfachOf(ctx?.userId);
  if (!ctx?.userId || !postfach) return { ok: false, error: "Bitte zuerst Ihr E-Mail-Postfach verbinden." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { email: true } });
  if (!lead?.email) return { ok: false, error: "Für diesen Kontakt ist keine E-Mail-Adresse hinterlegt." };
  const sub = subject.trim().slice(0, 200);
  const text = body.trim().slice(0, 20000);
  if (!sub || !text) return { ok: false, error: "Betreff und Text ausfüllen." };
  const res = await sendViaPostfach(ctx.userId, { to: lead.email, subject: sub, text });
  if (!res.ok) return { ok: false, error: res.error };
  await logLeadHistory(leadId, "email", `E-Mail an ${lead.email}: ${sub}\n\n${text}`, { customerId, userId: ctx.userId });
  await recordUsage("action", "lead.email");
  return { ok: true };
}

/**
 * Termin anbieten: Terminlink per E-Mail (eigenes Postfach) senden bzw. per WhatsApp oder kopiert angeboten.
 * Danach Erinnerung in 2 Werktagen, falls kein Termin gebucht wird (lib/mail/termin-erinnerung).
 */
export async function offerAppointmentResult(
  leadId: string,
  channel: "mail" | "whatsapp" | "copy",
  mail?: { subject: string; body: string },
): Promise<(InboxResult & { reminder?: string | null }) | { ok: false; error: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: PREVIEW };
  const ctx = await getBuyerContext();
  const lead = await loadLead(leadId, customerId);
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const undo = undoOf(lead);
  if (channel === "mail") {
    if (!mail) return { ok: false, error: "Betreff und Text ausfüllen." };
    const r = await sendMail(lead.id, customerId, mail.subject, mail.body);
    if (!r.ok) return r;
  } else {
    await logLeadHistory(lead.id, "notiz", channel === "whatsapp" ? "Terminlink per WhatsApp angeboten" : "Terminlink kopiert und angeboten", { customerId });
  }
  const reminder = await planTerminErinnerung(lead.id, 2, { customerId, userId: ctx?.userId ?? null }).catch(() => null);
  await recordUsage("action", `next_step.termin.${channel}`);
  refresh(lead.id);
  return { ok: true, undo, reminder };
}

/** „Nicht erreicht“ per E-Mail aus dem eigenen Postfach (Text aus notReachedTextsAction, ggf. angepasst). */
export async function sendNotReachedMailResult(leadId: string, subject: string, body: string): Promise<InboxResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: PREVIEW };
  const r = await sendMail(leadId, customerId, subject, body);
  if (!r.ok) return r;
  refresh(leadId);
  return { ok: true };
}

/** „Nicht erreicht“ per WhatsApp angeboten (öffnet WhatsApp bzw. den Chat): nur Verlauf. */
export async function logNotReachedWhatsAppAction(leadId: string): Promise<void> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return;
  await logLeadHistory(leadId, "notiz", "Nicht erreicht: WhatsApp-Nachricht angeboten", { customerId });
}

/** Braucht der Lead (noch) einen nächsten Schritt? Für den Dialog nach einer Aktion im Kontakt. */
export async function needsNextStepAction(leadId: string): Promise<boolean> {
  const ctx = await getBuyerContext();
  if (!ctx) return false;
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId: ctx.customerId }, select: { id: true } });
  if (!lead) return false;
  const s = await nextStepStateOf(lead.id);
  return s === "missing" || s === "result_missing";
}

// ─── Einstellungen ─────────────────────────────────────────────────────────

/** Tägliche Erinnerung (8 Uhr) an- bzw. abschalten (je Login). */
export async function setNextStepReminderAction(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx?.userId || ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  await prisma.user.update({ where: { id: ctx.userId }, data: { nextStepReminder: on } });
  revalidatePath("/buyer/einstellungen");
  return { ok: true };
}
