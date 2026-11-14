// Später-Follow-up (Ole, 14.11.2026): Kontakt schreibt „gerne später“ (oder bekommt den
// Ausgang „Später wieder“). Zum Zeitpunkt geht Mail 1 als Antwort im selben Instantly-
// Thread aus demselben Postfach raus, nach 5 Werktagen ohne Antwort Mail 2, danach
// Aufgabe „Wieder melden“ (ersetzt die 60-Tage-Aufgabe). Abbruch bei Antwort,
// Abmeldung, Stufe Termin/Gewonnen/Verloren/Ungültig oder „Stoppen“. Abwesenheits-
// notizen verschieben Mail 2. Versand nur werktags 8–17 Uhr, je Postfach und Tag begrenzt.
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { claudeCall, runAgent, type LlmCall } from "@/lib/kampagnen/llm";
import type { Valid } from "@/lib/kampagnen/types";
import type { SalesStage as Stage } from "@/generated/prisma/enums";
import { STAGE_LABEL } from "@/lib/vertrieb/crm";
import { addDays, dayKey, fmtDate, fmtDateTime, fromDayKey } from "@/lib/vertrieb/dates";
import { parseDue } from "@/lib/vertrieb/legacy";
import { inSendWindow, isLaterInterest, laterTiming, monthPhrase, nextWorkdayKey, workdayMorning, workdaysLater } from "@/lib/vertrieb/spaeter";
import { accountSignature, latestReceivedFrom, replyInThread, stripQuoted, threadEmails } from "@/lib/vertrieb/instantly";
import { anredeZeile } from "@/lib/ansprache";

export const FOLLOWUP_CAMPAIGN = "Später-Follow-up";
export const STOP_STAGES: Stage[] = ["TERMIN", "GEWONNEN", "VERLOREN", "UNGUELTIG"];
/** Aufgabe nach dem Follow-up (gleicher Titel wie beim Ausgang „Später wieder“) */
export const AGAIN_TASK = "Wieder melden";
const MAIL2_WORKDAYS = 5;
const MAX_ATTEMPTS = 3;
const LOCK_MS = 15 * 60_000;

export type FollowupStatus = "FREIGABE" | "GEPLANT" | "FERTIG" | "GESTOPPT";
export const STATUS_LABEL: Record<FollowupStatus, string> = {
  FREIGABE: "wartet auf Freigabe",
  GEPLANT: "geplant",
  FERTIG: "beendet",
  GESTOPPT: "gestoppt",
};

export async function loadFollowupSettings() {
  return prisma.salesFollowupSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

/** Letzte Mail des Kontakts aus Instantly, auf die wir im Thread antworten können (nicht manuell eingefügt). */
async function threadEmailFor(contactId: string, emailId?: string | null) {
  if (emailId) {
    const e = await prisma.salesEmail.findUnique({ where: { id: emailId } });
    if (e && e.direction === "IN") return e;
  }
  const fromInstantly = { contactId, direction: "IN", OR: [{ instantlyId: { not: null } }, { AND: [{ campaign: { not: null } }, { campaign: { not: "manuell" } }] }] };
  return (
    (await prisma.salesEmail.findFirst({ where: { ...fromInstantly, isAutoReply: false }, orderBy: { sentAt: "desc" } })) ??
    (await prisma.salesEmail.findFirst({ where: fromInstantly, orderBy: { sentAt: "desc" } }))
  );
}

const cleanSubject = (s: string | null | undefined) => (s ?? "").replace(/^((re|aw|antw|wg|fwd?)\s*:\s*)+/i, "").trim();

type PlanOpts = {
  source: "ANTWORT" | "AUSGANG" | "BESTAND";
  replyEmailId?: string | null;
  dueAt?: Date;
  timing?: string | null;
  status?: FollowupStatus;
  now?: Date;
};

/**
 * Follow-up für einen Kontakt einplanen. Ein laufendes wird ersetzt. Ohne Instantly-Thread
 * (z. B. nur Telefon) gibt es kein Follow-up per Mail: dann null, die Aufgabe bleibt.
 * Offene Aufgaben „Wieder melden“ entfallen (kommen nach Mail 2 wieder, nicht doppelt).
 */
export async function planFollowup(contactId: string, opts: PlanOpts) {
  const now = opts.now ?? new Date();
  const contact = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { stage: true } });
  if (!contact || STOP_STAGES.includes(contact.stage)) return null;
  const email = await threadEmailFor(contactId, opts.replyEmailId);
  if (!email) return null;
  let dueAt = opts.dueAt;
  let timing = opts.timing ?? null;
  if (!dueAt) {
    const t = laterTiming(stripQuoted(email.text ?? ""), email.sentAt, contactId);
    dueAt = t.date;
    timing = timing ?? t.label;
  }
  // Zeitpunkt schon vorbei: nächster Werktag
  if (dueAt.getTime() < now.getTime()) dueAt = workdayMorning(nextWorkdayKey(dayKey(addDays(now, 1))), contactId);

  const active = await prisma.salesFollowup.findUnique({ where: { activeFor: contactId } });
  if (active) await finish(active.id, "GESTOPPT", "Neu eingeplant");
  const removed = await prisma.salesTask.deleteMany({ where: { contactId, doneAt: null, title: AGAIN_TASK } });
  const f = await prisma.salesFollowup.create({
    data: {
      contactId,
      activeFor: contactId,
      status: opts.status ?? "GEPLANT",
      source: opts.source,
      dueAt,
      nextAt: dueAt,
      timing,
      replyEmailId: email.id,
      subject: `Re: ${cleanSubject(email.subject) || "Unser Austausch"}`,
    },
  });
  await prisma.salesActivity.create({
    data: {
      contactId,
      type: "NOTIZ",
      outcome: f.status === "FREIGABE" ? "Später-Follow-up eingeplant (wartet auf Freigabe)" : "Später-Follow-up geplant",
      note: `Mail 1 am ${fmtDate(dueAt)}${timing ? ` (${timing})` : ""} als Antwort im selben Thread, Mail 2 nach ${MAIL2_WORKDAYS} Werktagen ohne Antwort.${removed.count ? " Aufgabe „Wieder melden“ kommt danach, falls keine Antwort." : ""}`,
      occurredAt: now,
    },
  });
  return f;
}

/** Ausgang „Später wieder“ im Kontakt: Datum aus der Notiz, sonst das Aufgabendatum, sonst 3 Monate. */
export async function planFromOutcome(contactId: string, note: string | null, taskDue: Date | null, now = new Date()) {
  const fromNote = note ? laterTiming(note, now, contactId) : null;
  const dueAt = fromNote?.label ? fromNote.date : taskDue ? workdayMorning(dayKey(taskDue), contactId) : laterTiming("", now, contactId).date;
  return planFollowup(contactId, { source: "AUSGANG", dueAt, timing: fromNote?.label ?? null, now });
}

async function finish(id: string, status: "FERTIG" | "GESTOPPT", reason: string) {
  await prisma.salesFollowup.update({
    where: { id },
    data: { status, activeFor: null, sendingAt: null, stoppedAt: new Date(), stopReason: reason },
  });
}

/** Laufendes Follow-up stoppen (Antwort, Abmeldung, Stufe, „Stoppen“). manual: Aufgabe „Wieder melden“ statt Mail. */
export async function stopFollowup(contactId: string, reason: string, opts: { manual?: boolean } = {}) {
  const f = await prisma.salesFollowup.findUnique({ where: { activeFor: contactId } });
  if (!f) return false;
  await finish(f.id, "GESTOPPT", reason);
  await prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: "Später-Follow-up gestoppt", note: reason } });
  if (opts.manual) {
    const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { stage: true } });
    if (c && !STOP_STAGES.includes(c.stage)) await ensureAgainTask(contactId, f.nextAt > new Date() ? f.nextAt : new Date(), "Später-Follow-up gestoppt");
  }
  return true;
}

/** Stufe geändert: Termin, Gewonnen, Verloren, Ungültig beenden das Follow-up. */
export async function stopFollowupOnStage(contactId: string, stage: Stage) {
  if (STOP_STAGES.includes(stage)) await stopFollowup(contactId, `Stufe „${STAGE_LABEL[stage]}“`);
}

/** Genau eine offene Aufgabe „Wieder melden“ (vorhandene wird verschoben statt doppelt angelegt). */
async function ensureAgainTask(contactId: string, dueAt: Date, note: string) {
  const open = await prisma.salesTask.findFirst({ where: { contactId, doneAt: null, title: AGAIN_TASK }, orderBy: { dueAt: "asc" } });
  if (open) {
    await prisma.salesTask.update({ where: { id: open.id }, data: { dueAt, type: "ANRUF", note } });
    await prisma.salesTask.deleteMany({ where: { contactId, doneAt: null, title: AGAIN_TASK, id: { not: open.id } } });
  } else {
    await prisma.salesTask.create({ data: { contactId, title: AGAIN_TASK, type: "ANRUF", dueAt, note } });
  }
}

/**
 * Neue Mail vom Kontakt (aus recordReply). Abwesenheitsnotiz nach Mail 1 verschiebt Mail 2,
 * echte Antwort stoppt; ist sie selbst ein „später“, wird neu eingeplant.
 */
export async function onIncomingReply(contactId: string, r: { emailId: string; sentiment: string; isAutoReply: boolean; text: string; sentAt: Date }) {
  const active = await prisma.salesFollowup.findUnique({ where: { activeFor: contactId } });
  if (r.isAutoReply) {
    if (!active || active.step !== 1) return;
    const back = parseDue(r.text, r.sentAt);
    const later = back && back > active.nextAt ? workdaysLater(back, 1, contactId) : workdaysLater(new Date(Math.max(active.nextAt.getTime(), Date.now())), MAIL2_WORKDAYS, contactId);
    await prisma.salesFollowup.update({ where: { id: active.id }, data: { nextAt: later } });
    await prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: "Später-Follow-up: Abwesenheitsnotiz", note: `Mail 2 verschoben auf ${fmtDate(later)}.` } });
    return;
  }
  if (active && active.replyEmailId !== r.emailId && r.sentAt > (await anchorOf(active))) {
    await stopFollowup(contactId, "Antwort erhalten");
  }
  if (r.sentiment !== "SPAETER") return;
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { stage: true } });
  if (!c || STOP_STAGES.includes(c.stage)) return;
  if (c.stage !== "SPAETER") {
    await prisma.salesContact.update({ where: { id: contactId }, data: { stage: "SPAETER", lossReason: null } });
    await prisma.salesActivity.create({ data: { contactId, type: "STATUS", outcome: `${STAGE_LABEL[c.stage]} → ${STAGE_LABEL.SPAETER}`, note: "Antwort: gerne später" } });
  }
  // Ältere Antworten (z. B. beim ersten vollständigen Abgleich) nicht ungefragt anschreiben
  const old = Date.now() - r.sentAt.getTime() > 14 * 86_400_000;
  await planFollowup(contactId, { source: "ANTWORT", replyEmailId: r.emailId, status: old ? "FREIGABE" : "GEPLANT" });
}

/** Ab wann eine Mail des Kontakts als „neue Antwort“ zählt */
async function anchorOf(f: { replyEmailId: string | null; mail1SentAt: Date | null; createdAt: Date }): Promise<Date> {
  if (f.mail1SentAt) return f.mail1SentAt;
  const e = f.replyEmailId ? await prisma.salesEmail.findUnique({ where: { id: f.replyEmailId }, select: { sentAt: true } }) : null;
  return e?.sentAt ?? f.createdAt;
}

/** Grund, das Follow-up jetzt nicht (mehr) zu senden, oder null */
async function stopReasonFor(f: { id: string; contactId: string; replyEmailId: string | null; mail1SentAt: Date | null; createdAt: Date }): Promise<string | null> {
  const c = await prisma.salesContact.findUnique({ where: { id: f.contactId }, select: { stage: true } });
  if (!c) return "Kontakt gelöscht";
  if (STOP_STAGES.includes(c.stage)) return `Stufe „${STAGE_LABEL[c.stage]}“`;
  if (await prisma.salesCampaignLead.findFirst({ where: { contactId: f.contactId, unsubscribed: true }, select: { id: true } })) return "Abgemeldet";
  const anchor = await anchorOf(f);
  const answered = await prisma.salesEmail.findFirst({
    where: { contactId: f.contactId, direction: "IN", isAutoReply: false, sentAt: { gt: anchor }, ...(f.replyEmailId ? { id: { not: f.replyEmailId } } : {}) },
    select: { id: true },
  });
  return answered ? "Antwort erhalten" : null;
}

// ─── Texte ──────────────────────────────────────────────────────────────
type Ctx = {
  greeting: string;
  senderName: string | null;
  theirReply: string;
  ourMail: string;
  replyMonth: string;
  hasLaterReply: boolean;
  timing: string | null;
  pitch: string;
  bookingUrl: string | null;
};

/** Anrede-Zeile nach der zentralen Regel (lib/ansprache.ts): „Guten Tag Frau Meier,“ / „Guten Tag Anna Meier,“ / „Guten Tag,“. */
export function greetingFor(c: { salutation: string | null; firstName: string | null; lastName: string | null }): string {
  // Nur mit echtem Nachnamen (nicht aus dem Vornamen ableiten)
  return anredeZeile("sie", { salutation: c.salutation, firstName: c.firstName, lastName: c.lastName });
}

async function contextFor(f: { contactId: string; replyEmailId: string | null; timing: string | null }): Promise<Ctx> {
  const [contact, settings, email] = await Promise.all([
    prisma.salesContact.findUniqueOrThrow({ where: { id: f.contactId }, select: { salutation: true, firstName: true, lastName: true } }),
    loadFollowupSettings(),
    f.replyEmailId ? prisma.salesEmail.findUnique({ where: { id: f.replyEmailId } }) : null,
  ]);
  const text = email?.text ?? "";
  const theirReply = stripQuoted(text);
  let ourMail = text.length > theirReply.length + 5 ? text.slice(theirReply.length).trim() : "";
  if (!ourMail && email?.threadId && process.env.INSTANTLY_API_KEY) {
    const thread = await threadEmails(email.threadId).catch(() => []);
    const sent = thread.find((e) => e.ue_type === 1 || e.ue_type === 3);
    ourMail = sent?.body?.text ?? sent?.content_preview ?? "";
  }
  const senderName = email?.eaccount && process.env.INSTANTLY_API_KEY ? (await accountSignature(email.eaccount).catch(() => null))?.name ?? null : null;
  return {
    greeting: greetingFor(contact),
    senderName,
    theirReply: theirReply.slice(0, 1500),
    ourMail: ourMail.slice(0, 2500),
    replyMonth: email ? monthPhrase(email.sentAt) : "",
    hasLaterReply: !!email && (email.sentiment === "SPAETER" || isLaterInterest(theirReply, email.sentAt)),
    timing: f.timing,
    pitch: settings.pitch,
    bookingUrl: settings.bookingUrl?.trim() || null,
  };
}

/** Feste Vorlage (ohne KI oder wenn die KI nichts Brauchbares liefert). */
export function templateTexts(c: Ctx): { body1: string; body2: string } {
  const clause = c.timing ? `das Thema ${c.timing} wieder interessant für Sie wird` : "ein späterer Zeitpunkt besser passt";
  const opener = c.hasLaterReply
    ? `Sie hatten mir ${c.replyMonth} geschrieben, dass ${clause}. Deshalb melde ich mich wie versprochen noch einmal.`
    : `Wir hatten ${c.replyMonth} Kontakt, und Sie meinten, dass ${clause}. Deshalb melde ich mich wie versprochen noch einmal.`;
  const ask1 = c.bookingUrl
    ? `Hätten Sie in den nächsten Tagen Zeit für ein kurzes Gespräch von 15 Minuten? Hier können Sie sich direkt einen passenden Termin aussuchen: ${c.bookingUrl}`
    : "Hätten Sie in den nächsten Tagen Zeit für ein kurzes Gespräch von 15 Minuten? Sagen Sie mir gern, wann es Ihnen passt.";
  const ask2 = c.bookingUrl
    ? `Kurz nachgehakt: Passt Ihnen in den nächsten Tagen ein kurzes Gespräch von 15 Minuten? Hier geht es direkt zur Terminauswahl: ${c.bookingUrl}`
    : "Kurz nachgehakt: Passt Ihnen in den nächsten Tagen ein kurzes Gespräch von 15 Minuten?";
  return { body1: [c.greeting, opener, c.pitch, ask1].join("\n\n"), body2: [c.greeting, ask2].join("\n\n") };
}

const DASH = /[–—]/;
const DU = /\b(du|dich|dir|dein\w*|euch|euer\w*)\b/i;

/** Gedankenstriche raus (Ole: nie – oder —), Leerraum aufräumen */
export function cleanText(s: string): string {
  return s.replace(/\s*[–—]\s*/g, ", ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function validateTexts(c: Ctx) {
  return (x: unknown): Valid<{ body1: string; body2: string }> => {
    const o = x as { mail1?: unknown; mail2?: unknown };
    const errors: string[] = [];
    const m1 = typeof o?.mail1 === "string" ? o.mail1.trim() : "";
    const m2 = typeof o?.mail2 === "string" ? o.mail2.trim() : "";
    if (!m1 || !m2) errors.push("mail1 und mail2 müssen Text enthalten.");
    for (const [n, t, max] of [["mail1", m1, 1100], ["mail2", m2, 500]] as const) {
      if (t.length > max) errors.push(`${n} ist zu lang (höchstens ${max} Zeichen).`);
      if (DASH.test(t)) errors.push(`${n} enthält einen Gedankenstrich (– oder —). Bitte ohne.`);
      if (DU.test(t)) errors.push(`${n} duzt. Bitte Sie-Form.`);
      if (/garantie/i.test(t)) errors.push(`${n} enthält das Wort Garantie.`);
      if (/[[{]/.test(t)) errors.push(`${n} enthält Platzhalter in Klammern.`);
      if (c.bookingUrl && !t.includes(c.bookingUrl)) errors.push(`${n} muss den Buchungslink ${c.bookingUrl} enthalten.`);
    }
    return errors.length ? { ok: false, errors } : { ok: true, value: { body1: cleanText(m1), body2: cleanText(m2) } };
  };
}

const TEXT_SCHEMA = {
  type: "object",
  properties: { mail1: { type: "string" }, mail2: { type: "string" } },
  required: ["mail1", "mail2"],
  additionalProperties: false,
};

async function aiTexts(c: Ctx, llm: LlmCall): Promise<{ body1: string; body2: string }> {
  const system = `Du schreibst kurze Follow-up-E-Mails im Vertrieb an Versicherungsvermittler in Deutschland. Wir hatten eine Cold-Mail geschickt, der Vermittler hat geantwortet, dass später ein besserer Zeitpunkt ist. Dieser Zeitpunkt ist jetzt da. Beide Mails gehen als Antwort im selben E-Mail-Verlauf raus.

Mail 1: Geht konkret auf unsere damalige Mail und seine Antwort ein (zum Beispiel: "Sie hatten mir im August geschrieben, dass das Thema ab dem neuen Jahr interessant wird. Deshalb melde ich mich wie versprochen."), dann ein Satz zum Angebot, dann die Frage nach einem kurzen Termin von 15 Minuten${c.bookingUrl ? " mit dem Buchungslink" : ""}.
Mail 2: Kommt einige Werktage später, falls keine Antwort kam. Sehr kurz, zum Beispiel "Kurz nachgehakt: ...", mit der Frage nach einem kurzen Termin${c.bookingUrl ? " und dem Buchungslink" : ""}.

Regeln:
- Sie-Form, freundlich, natürlich, wie von einem Menschen geschrieben. Mail 1 höchstens 90 Wörter, Mail 2 höchstens 40 Wörter.
- Keine Gedankenstriche (weder – noch —), keine Aufzählungen, kein Betreff.
- Beginne mit der Anrede "${c.greeting}". Kein Gruß und keine Signatur am Ende, die werden automatisch angehängt.
- Keine Versprechen zu Ergebnissen, nie das Wort "Garantie", keine erfundenen Fakten, keine Platzhalter.
- Zitiere den Vermittler nicht wörtlich, sondern nimm sinngemäß Bezug.
Antworte nur mit dem JSON-Objekt {"mail1": "...", "mail2": "..."}.`;
  const user = [
    `Unsere damalige Mail:\n${c.ourMail || "(nicht vorhanden)"}`,
    `Seine Antwort (${c.replyMonth}):\n${c.theirReply || "(keine schriftliche Antwort, er hat im Gespräch gesagt, dass später besser passt)"}`,
    `Erkannter Zeitpunkt: ${c.timing ?? "nicht genannt"}`,
    `Unser Angebot in einem Satz: ${c.pitch}`,
    c.bookingUrl ? `Buchungslink: ${c.bookingUrl}` : "Kein Buchungslink: bitte fragen, wann es passt.",
    c.senderName ? `Absender: ${c.senderName}` : "",
  ].filter(Boolean).join("\n\n");
  const { value } = await runAgent(llm, { agent: "Später-Follow-up", system, user, schema: TEXT_SCHEMA, maxTokens: 4000 }, validateTexts(c));
  return value;
}

/** Texte für Mail 1 und 2 schreiben (KI, sonst Vorlage). Vorhandene (auch von Hand geänderte) bleiben. */
export async function draftFollowup(id: string, opts: { llm?: LlmCall; force?: boolean } = {}) {
  const f = await prisma.salesFollowup.findUniqueOrThrow({ where: { id } });
  if (f.body1 && f.body2 && !opts.force) return f;
  const c = await contextFor(f);
  const settings = await loadFollowupSettings();
  let texts = templateTexts(c);
  let source = "VORLAGE";
  const llm = opts.llm ?? (process.env.ANTHROPIC_API_KEY ? claudeCall : null);
  if (settings.useAi && llm) {
    try {
      texts = await aiTexts(c, llm);
      source = "KI";
    } catch (e) {
      reportError(e, "followup-ai");
    }
  }
  return prisma.salesFollowup.update({
    where: { id },
    data: { body1: opts.force || !f.body1 ? texts.body1 : f.body1, body2: opts.force || !f.body2 ? texts.body2 : f.body2, textSource: source },
  });
}

// ─── Versand ────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function textToHtml(s: string): string {
  return esc(s)
    .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}">${u}</a>`)
    .replace(/\n/g, "<br/>");
}

function quoteBlock(header: string, inner: string) {
  return `<div class="gmail_quote"><div>${esc(header)}</div><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${inner}</blockquote></div>`;
}

async function signatureHtml(eaccount: string): Promise<string> {
  const a = await accountSignature(eaccount).catch(() => ({ signature: null, name: null }));
  const sig = a.signature ? (/<[a-z][\s\S]*>/i.test(a.signature) ? a.signature : textToHtml(a.signature)) : a.name ? esc(a.name) : "";
  const hasGreeting = /gr(ü|ue)(ß|ss)e|gru(ß|ss)|regards/i.test(a.signature ?? "");
  return [hasGreeting ? "" : "Viele Grüße", sig].filter(Boolean).join("<br/>");
}

type SendResult = { sent?: 1 | 2; finished?: boolean; stopped?: string; skipped?: string; error?: string };

/** Startzeit des heutigen Tags (deutsche Zeit) */
const dayStart = (now: Date) => fromDayKey(dayKey(now), "00:00");

/**
 * Nächsten Schritt eines Follow-ups ausführen (Mail 1, Mail 2 oder Abschluss mit Aufgabe).
 * manual = „Jetzt senden“ (ohne Versandfenster und Tageslimit, auch vor der Freigabe).
 */
export async function sendFollowupStep(id: string, opts: { now?: Date; manual?: boolean; llm?: LlmCall } = {}): Promise<SendResult> {
  const now = opts.now ?? new Date();
  let f = await prisma.salesFollowup.findUnique({ where: { id }, include: { contact: { select: { email: true, name: true } } } });
  if (!f || !f.activeFor) return { skipped: "nicht aktiv" };
  if (f.status !== "GEPLANT" && !(opts.manual && f.status === "FREIGABE")) return { skipped: f.status };
  // Sperre: nur ein Lauf je Follow-up und Schritt (kein Doppelversand)
  const claimed = await prisma.salesFollowup.updateMany({
    where: { id, step: f.step, activeFor: { not: null }, OR: [{ sendingAt: null }, { sendingAt: { lt: new Date(now.getTime() - LOCK_MS) } }] },
    data: { sendingAt: now },
  });
  if (claimed.count !== 1) return { skipped: "läuft schon" };
  const release = () => prisma.salesFollowup.update({ where: { id }, data: { sendingAt: null } });
  let sent = false;
  try {
    const why = await stopReasonFor(f);
    if (why) {
      await stopFollowup(f.contactId, why);
      return { stopped: why };
    }
    if (f.step >= 2) {
      await ensureAgainTask(f.contactId, now, "Später-Follow-up: 2 Mails ohne Antwort. Jetzt anrufen.");
      await finish(f.id, "FERTIG", "2 Mails ohne Antwort, Aufgabe „Wieder melden“");
      await prisma.salesActivity.create({ data: { contactId: f.contactId, type: "NOTIZ", outcome: "Später-Follow-up beendet", note: "Keine Antwort auf 2 Mails. Aufgabe „Wieder melden“ (Anruf) angelegt." } });
      return { finished: true };
    }
    if (!f.body1 || !f.body2) f = { ...f, ...(await draftFollowup(f.id, { llm: opts.llm })) };

    // Antwortziel: die Mail des Kontakts im Thread und unser Postfach, das sie empfangen hat
    const reply = f.replyEmailId ? await prisma.salesEmail.findUnique({ where: { id: f.replyEmailId } }) : null;
    let replyTo = reply?.instantlyId ?? null;
    let eaccount = reply?.eaccount ?? null;
    if (!replyTo || !eaccount) {
      const latest = await latestReceivedFrom(f.contact.email);
      if (latest && (!replyTo || latest.id === replyTo)) {
        replyTo = latest.id;
        eaccount = latest.eaccount ?? eaccount;
        if (reply) await prisma.salesEmail.update({ where: { id: reply.id }, data: { eaccount, threadId: reply.threadId ?? latest.thread_id } }).catch(() => {});
      }
    }
    // Nie aus einem anderen Postfach senden (Ole): ohne Postfach kein Versand
    if (!replyTo || !eaccount) throw new Error("Instantly-Thread oder Postfach nicht gefunden");

    if (!opts.manual) {
      const settings = await loadFollowupSettings();
      const today = await prisma.salesEmail.count({ where: { direction: "OUT", campaign: FOLLOWUP_CAMPAIGN, eaccount, sentAt: { gte: dayStart(now) } } });
      if (today >= settings.perDay) {
        await release();
        return { skipped: "Tageslimit" };
      }
    }

    const step = (f.step + 1) as 1 | 2;
    const body = step === 1 ? f.body1! : f.body2!;
    let quoted = "";
    if (step === 1 && reply) {
      quoted = quoteBlock(`Am ${fmtDateTime(reply.sentAt)} schrieb ${reply.fromEmail ?? f.contact.email}:`, reply.html ?? textToHtml(reply.text ?? ""));
    } else if (step === 2) {
      const prev = await prisma.salesEmail.findFirst({ where: { contactId: f.contactId, direction: "OUT", campaign: FOLLOWUP_CAMPAIGN }, orderBy: { sentAt: "desc" } });
      if (prev?.html) quoted = quoteBlock(`Am ${fmtDateTime(prev.sentAt)} schrieb ${eaccount}:`, prev.html);
    }
    const html = `<div>${textToHtml(body)}</div><br/><div>${await signatureHtml(eaccount)}</div><br/>${quoted}`;
    const subject = f.subject ?? "Re: Unser Austausch";
    const res = await replyInThread({ eaccount, replyToUuid: replyTo, subject, html, text: body });
    // Ab hier ist die Mail raus: Schritt zuerst festhalten, damit nie erneut gesendet wird,
    // auch wenn das Speichern von Mail oder Verlauf danach scheitert.
    sent = true;
    await prisma.salesFollowup.update({
      where: { id },
      data: {
        step,
        status: "GEPLANT",
        sendingAt: null,
        lastError: null,
        attempts: 0,
        nextAt: workdaysLater(now, MAIL2_WORKDAYS, f.contactId),
        ...(step === 1 ? { mail1SentAt: now } : { mail2SentAt: now }),
      },
    });
    const mail = { contactId: f.contactId, campaign: FOLLOWUP_CAMPAIGN, direction: "OUT", subject, text: body, html, fromEmail: eaccount, eaccount, threadId: res.threadId ?? reply?.threadId ?? null, sentAt: now };
    await prisma.salesEmail
      .create({ data: { ...mail, instantlyId: res.id } })
      .catch(() => prisma.salesEmail.create({ data: { ...mail, instantlyId: null } }))
      .catch((e) => reportError(e, "followup-record"));
    await prisma.salesActivity
      .create({ data: { contactId: f.contactId, type: "EMAIL", outcome: `Später-Follow-up: Mail ${step} gesendet`, note: `${subject}\n\n${body}`, occurredAt: now } })
      .catch((e) => reportError(e, "followup-record"));
    await prisma.salesContact.update({ where: { id: f.contactId }, data: { lastContactAt: now } }).catch(() => {});
    return { sent: step };
  } catch (e) {
    if (sent) return { sent: (f.step + 1) as 1 | 2 };
    const msg = e instanceof Error ? e.message : String(e);
    reportError(e, "followup-send");
    const attempts = f.attempts + 1;
    await prisma.salesFollowup.update({ where: { id }, data: { sendingAt: null, attempts, lastError: msg.slice(0, 500), nextAt: new Date(now.getTime() + 2 * 3600_000) } });
    if (attempts >= MAX_ATTEMPTS && !opts.manual) {
      await stopFollowup(f.contactId, `Versand fehlgeschlagen: ${msg.slice(0, 200)}`, { manual: true });
    }
    return { error: msg };
  }
}

// ─── Bestand einplanen (einmalig, wartet auf Freigabe) ───────────────────
/**
 * Kontakte mit Stufe „Später“ oder Später-Antwort, die noch kein Follow-up haben, einplanen.
 * Status FREIGABE: es geht nichts raus, bevor Ole freigibt. Vergangene Zeitpunkte werden
 * über die nächsten Werktage verteilt (je Postfach höchstens perDay am Tag).
 */
export async function planExistingFollowups(now = new Date()) {
  const settings = await loadFollowupSettings();
  const contacts = await prisma.salesContact.findMany({
    where: {
      stage: { notIn: STOP_STAGES },
      followups: { none: {} },
      OR: [{ stage: "SPAETER" }, { emails: { some: { direction: "IN", isAutoReply: false } } }],
    },
    select: { id: true, stage: true, tasks: { where: { doneAt: null, title: AGAIN_TASK }, orderBy: { dueAt: "asc" }, take: 1, select: { dueAt: true } } },
  });
  const plans: { contactId: string; emailId: string; eaccount: string; dueAt: Date; timing: string | null }[] = [];
  for (const c of contacts) {
    const last = await prisma.salesEmail.findFirst({ where: { contactId: c.id, direction: "IN", isAutoReply: false }, orderBy: { sentAt: "desc" } });
    const lastText = stripQuoted(last?.text ?? "");
    const laterReply = !!last && (last.sentiment === "SPAETER" || classifyLater(lastText, last.sentAt));
    if (c.stage !== "SPAETER" && !laterReply) continue;
    if (laterReply && last.sentiment !== "SPAETER") await prisma.salesEmail.update({ where: { id: last.id }, data: { sentiment: "SPAETER" } });
    const email = await threadEmailFor(c.id, laterReply ? last.id : null);
    if (!email) continue;
    const t = laterTiming(laterReply ? lastText : "", email.sentAt, c.id);
    const dueAt = c.tasks[0]?.dueAt && !laterReply ? workdayMorning(dayKey(c.tasks[0].dueAt), c.id) : t.date;
    plans.push({ contactId: c.id, emailId: email.id, eaccount: email.eaccount ?? "?", dueAt, timing: laterReply ? t.label : null });
  }
  spread(plans, now, settings.perDay);
  let n = 0;
  for (const p of plans) {
    if (await planFollowup(p.contactId, { source: "BESTAND", replyEmailId: p.emailId, dueAt: p.dueAt, timing: p.timing, status: "FREIGABE", now })) n++;
  }
  await prisma.salesFollowupSettings.update({ where: { id: "default" }, data: { backfillAt: now } });
  return n;
}

const classifyLater = (text: string, at: Date) => !!text && isLaterInterest(text, at);

/** Vergangene/zu frühe Termine über die nächsten Werktage verteilen (je Postfach perDay am Tag). */
function spread<T extends { dueAt: Date; eaccount: string; contactId: string }>(items: T[], now: Date, perDay: number) {
  const tomorrow = nextWorkdayKey(dayKey(addDays(now, 1)));
  const overdue = items.filter((p) => dayKey(p.dueAt) < tomorrow).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const used = new Map<string, number>();
  let day = tomorrow;
  const cap = Math.max(1, perDay);
  for (const p of overdue) {
    for (;;) {
      const k = `${day}|${p.eaccount}`;
      const n = used.get(k) ?? 0;
      if (n < cap) {
        used.set(k, n + 1);
        p.dueAt = workdayMorning(day, p.contactId);
        break;
      }
      day = nextWorkdayKey(dayKey(addDays(fromDayKey(day, "12:00"), 1)));
    }
    day = tomorrow;
  }
}

/** „Alle freigeben“ bzw. einzeln: wartet auf Freigabe → geplant (vergangene Zeitpunkte neu verteilt). */
export async function approveFollowups(ids: string[] | "all", now = new Date()) {
  const list = await prisma.salesFollowup.findMany({
    where: { status: "FREIGABE", activeFor: { not: null }, ...(ids === "all" ? {} : { id: { in: ids } }) },
    include: { contact: { select: { emails: { where: { direction: "IN" }, orderBy: { sentAt: "desc" }, take: 1, select: { eaccount: true } } } } },
  });
  const settings = await loadFollowupSettings();
  const items = list.map((f) => ({ id: f.id, contactId: f.contactId, dueAt: f.step === 0 ? f.dueAt : f.nextAt, eaccount: f.contact.emails[0]?.eaccount ?? "?" }));
  spread(items, now, settings.perDay);
  for (const it of items) {
    await prisma.salesFollowup.update({ where: { id: it.id }, data: { status: "GEPLANT", dueAt: it.dueAt, nextAt: it.dueAt } });
    await prisma.salesActivity.create({ data: { contactId: it.contactId, type: "NOTIZ", outcome: "Später-Follow-up freigegeben", note: `Mail 1 am ${fmtDate(it.dueAt)}.` } });
  }
  return items.length;
}

/** Text und Datum von Hand ändern */
export async function updateFollowup(id: string, d: { date?: string | null; body1?: string | null; body2?: string | null }) {
  const f = await prisma.salesFollowup.findUniqueOrThrow({ where: { id } });
  if (!f.activeFor) return f;
  const data: Record<string, unknown> = {};
  if (d.date) {
    const at = workdayMorning(d.date, f.contactId);
    if (f.step === 0) Object.assign(data, { dueAt: at, nextAt: at });
    else if (f.step === 1) data.nextAt = at;
  }
  if (d.body1 != null && f.step === 0 && d.body1 !== f.body1) Object.assign(data, { body1: cleanText(d.body1), textSource: "MANUELL" });
  if (d.body2 != null && f.step <= 1 && d.body2 !== f.body2) Object.assign(data, { body2: cleanText(d.body2), textSource: "MANUELL" });
  return prisma.salesFollowup.update({ where: { id }, data });
}

/** Cron (alle 5 Minuten): Bestand einmalig einplanen, Texte vorbereiten, fällige Schritte ausführen. */
export async function runFollowups(now = new Date(), opts: { llm?: LlmCall; limit?: number } = {}) {
  const settings = await loadFollowupSettings();
  const out = { planned: 0, drafted: 0, sent: 0, finished: 0, stopped: 0, skipped: 0, errors: 0 };
  if (!settings.backfillAt) out.planned = await planExistingFollowups(now);
  // Texte schon vorher schreiben, damit die Vorschau im Kontakt und in der Übersicht steht
  const missing = await prisma.salesFollowup.findMany({ where: { activeFor: { not: null }, OR: [{ body1: null }, { body2: null }] }, orderBy: { nextAt: "asc" }, take: 5, select: { id: true } });
  for (const m of missing) {
    await draftFollowup(m.id, { llm: opts.llm }).then(() => out.drafted++).catch((e) => reportError(e, "followup-draft"));
  }
  if (!settings.enabled) return out;
  const due = await prisma.salesFollowup.findMany({
    where: { status: "GEPLANT", activeFor: { not: null }, nextAt: { lte: now } },
    orderBy: { nextAt: "asc" },
    take: opts.limit ?? 10,
    select: { id: true, step: true },
  });
  const sendAllowed = inSendWindow(now) && !!process.env.INSTANTLY_API_KEY && process.env.INSTANTLY_AUTO_SYNC === "1";
  for (const f of due) {
    // Mails nur im Versandfenster; die Aufgabe nach Mail 2 jederzeit
    if (f.step < 2 && !sendAllowed) continue;
    const r = await sendFollowupStep(f.id, { now, llm: opts.llm });
    if (r.sent) out.sent++;
    else if (r.finished) out.finished++;
    else if (r.stopped) out.stopped++;
    else if (r.error) out.errors++;
    else out.skipped++;
  }
  return out;
}
