// Telefonate sauber erfassen: Datenbank-Teil (Regeln und Felder in lib/telefonat.ts).
//
// - anrufGestartet / anrufErledigt: Pause des Assistenten für diesen Lead an bzw. aus (jedes eingetragene Ergebnis).
// - anrufPausiert*: Prüfung für Assistent (bot.ts, gateway.ts), Nachfass-Abfolgen und Erstanschreiben.
// - bedarfLaden / bedarfSpeichern: Bedarf aus dem Telefonat, zusätzlich in Conversation.qualificationData, damit
//   der Assistent nichts doppelt fragt und die Terminvorbereitung ihn zeigt.
// - runOffeneFragen (Cron): Assistent fragt nach dem Telefonat die offenen Punkte ab, mit Bezug aufs Gespräch.
// - runAnrufErinnerungen (Cron): Push „Was ist bei … rausgekommen?“ 15 Minuten nach „Anrufen“ ohne Ergebnis.

import { NUR_PPL_WHERE } from "@/lib/customer-package";
import Anthropic from "@anthropic-ai/sdk";
import { jsonAusAntwort, jsonAusgabe } from "@/lib/ki-json";
import { prisma } from "@/lib/prisma";
import { logLeadHistory } from "@/lib/lead-history";
import { advisorDisplayName } from "@/lib/advisor-name";
import { HEALTH_REDACTED, istTierLead, redactHealthText } from "@/lib/gesundheitsdaten";
import { QUALIFICATION_FIELDS, cleanQualificationData, mergeQualificationData, type QualificationData } from "@/lib/whatsapp/qualification";
import {
  anrufLaeuft,
  anstossNachTelefonat,
  bedarfFelder,
  bedarfStand,
  felderMit,
  offenePunkte,
  CALL_PAUSE_MAX_MS,
  CALL_REMINDER_AFTER_MS,
  NEED_STATE_LABEL,
  OPEN_QUESTIONS_DELAY_MS,
  type BedarfFeld,
  type NeedState,
} from "@/lib/telefonat";

const DONE = ["Abschluss", "Kein Interesse", "Disqualifiziert", "Disqualified", "Nicht qualifiziert"];

/** „Anrufen“ getippt: Assistent pausiert für diesen Lead, bis ein Ergebnis eingetragen ist. */
export async function anrufGestartet(leadId: string, customerId: string, now = new Date()): Promise<boolean> {
  const r = await prisma.lead.updateMany({ where: { id: leadId, customerId, erasedAt: null }, data: { callStartedAt: now, callReminderAt: null } });
  return r.count > 0;
}

/** Ergebnis eingetragen (egal welches): Pause endet. */
export async function anrufErledigt(leadId: string): Promise<void> {
  await prisma.lead.updateMany({ where: { id: leadId, callStartedAt: { not: null } }, data: { callStartedAt: null } }).catch((e) => console.error("[telefonat]", e));
}

/** Pausiert der Assistent für diesen Lead (laufender Anruf ohne Ergebnis)? */
export async function anrufPausiert(leadId: string | null | undefined, now = new Date()): Promise<boolean> {
  if (!leadId) return false;
  const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { callStartedAt: true } }).catch(() => null);
  return anrufLaeuft(l, now);
}

const formAnswers = (raw: unknown): { label: string; value: string }[] =>
  Array.isArray(raw)
    ? raw.flatMap((x) =>
        x && typeof x === "object" && typeof (x as { label?: unknown }).label === "string" && typeof (x as { value?: unknown }).value === "string"
          ? [{ label: (x as { label: string }).label, value: (x as { value: string }).value }]
          : [],
      )
    : [];

type LeadNeedRow = { id: string; customerId: string; source: string | null; formData: unknown; needData: unknown; needState: string | null };

/** Bisherige Angaben: Chat (Assistent) und Telefonat zusammen. */
async function angabenFuer(l: LeadNeedRow): Promise<QualificationData> {
  const convs = await prisma.conversation.findMany({ where: { customerId: l.customerId, leadId: l.id }, orderBy: { lastMessageAt: "asc" }, select: { qualificationData: true } });
  let merged: QualificationData = {};
  for (const c of convs) merged = { ...merged, ...cleanQualificationData(c.qualificationData) };
  return { ...merged, ...cleanQualificationData(l.needData) };
}

export type BedarfStandDaten = { felder: BedarfFeld[]; stand: NeedState | null; offen: string[]; tier: boolean };

/** Bedarfspunkte für das Fenster „Wie lief's?“ (vorbelegt mit allem, was schon bekannt ist). */
export async function bedarfLaden(leadId: string, customerId: string): Promise<BedarfStandDaten | null> {
  const l = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { id: true, customerId: true, source: true, formData: true, needData: true, needState: true } });
  if (!l) return null;
  const felder = bedarfFelder({ produkt: l.source, formular: formAnswers(l.formData), angaben: await angabenFuer(l) });
  return { felder, stand: (l.needState as NeedState | null) ?? null, offen: offenePunkte(felder), tier: istTierLead(l.source) };
}

/**
 * Bedarf aus dem Telefonat speichern. `stand` ohne Angabe: aus den Punkten abgeleitet; `uebersprungen` = der
 * Vermittler hat nichts angegeben (dann fragt der Assistent vorsichtig nach). Lead gilt als erreicht.
 */
export async function bedarfSpeichern(
  leadId: string,
  customerId: string,
  input: { angaben?: unknown; notiz?: string | null; stand?: NeedState | null; uebersprungen?: boolean; userId?: string | null },
  now = new Date(),
): Promise<{ stand: NeedState | null; offen: string[] } | null> {
  const l = await prisma.lead.findFirst({
    where: { id: leadId, customerId, erasedAt: null },
    select: { id: true, customerId: true, source: true, formData: true, needData: true, needState: true, firstContactAt: true },
  });
  if (!l) return null;
  const eingaben = cleanQualificationData(input.angaben);
  const vorher = bedarfFelder({ produkt: l.source, formular: formAnswers(l.formData), angaben: await angabenFuer(l) });
  const nachher = felderMit(vorher, eingaben);
  const offen = offenePunkte(nachher);
  const stand: NeedState | null = input.uebersprungen ? null : bedarfStand(vorher, eingaben, input.stand ?? null);
  const neu = Object.keys(eingaben).length > 0;
  const notiz = (input.notiz ?? "").trim().slice(0, 2000);

  await prisma.lead.update({
    where: { id: l.id },
    data: {
      ...(neu ? { needData: mergeQualificationData(l.needData, eingaben) ?? undefined } : {}),
      ...(stand ? { needState: stand, needAt: now } : {}),
      reached: true,
      ...(!l.firstContactAt ? { firstContactAt: now } : {}),
      callStartedAt: null,
      // Offene Punkte fragt der Assistent danach ab (nur mit Termin, im Chat-Fenster; runOffeneFragen)
      openQuestionsAt: stand !== "komplett" && offen.length ? new Date(now.getTime() + OPEN_QUESTIONS_DELAY_MS) : null,
    },
  });
  // Im Chat liest der Assistent mit: Gesundheitsangaben einer Person bleiben nur am Lead (lib/gesundheitsdaten.ts)
  const fuerChat = Object.fromEntries(
    Object.entries(eingaben)
      .map(([k, v]) => [k, redactHealthText(v ?? "", { tier: istTierLead(l.source) })])
      .filter(([, v]) => v && !v.includes(HEALTH_REDACTED)),
  );
  if (Object.keys(fuerChat).length) {
    const convs = await prisma.conversation.findMany({ where: { customerId, leadId: l.id }, select: { id: true, qualificationData: true } });
    for (const c of convs) {
      const merged = mergeQualificationData(c.qualificationData, fuerChat);
      await prisma.conversation.update({ where: { id: c.id }, data: { qualificationData: merged ?? undefined } });
    }
  }
  if (stand || neu || notiz) {
    const label = (k: string) => vorher.find((f) => f.key === k)?.label ?? QUALIFICATION_FIELDS.find((f) => f.key === k)?.label ?? k;
    const lines = [
      `Telefonat: ${stand ? NEED_STATE_LABEL[stand] : "Bedarf erfasst"}`,
      ...Object.entries(eingaben).map(([k, v]) => `${label(k)}: ${v}`),
      ...(notiz ? [`Besprochen: ${notiz}`] : []),
      ...(offen.length ? [`Noch offen: ${offen.join(", ")}`] : []),
    ];
    await logLeadHistory(l.id, "anruf", lines.join("\n"), { customerId, ...(input.userId !== undefined ? { userId: input.userId } : {}) });
  }
  return { stand, offen };
}

/** KI ordnet eine Notiz bzw. ein Diktat den Bedarfspunkten zu (Vermittler bestätigt). Ohne Schlüssel: leer. */
export async function bedarfAusNotiz(text: string, felder: BedarfFeld[], opts: { tier?: boolean } = {}): Promise<QualificationData> {
  // Gesundheitsangaben einer Person gehen nicht an die KI (lib/gesundheitsdaten.ts)
  const t = redactHealthText(text.trim(), { tier: opts.tier });
  if (!t || !process.env.ANTHROPIC_API_KEY || !felder.length) return {};
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    max_tokens: 600,
    system:
      "Ein Versicherungsvermittler hat nach einem Telefonat mit einem Interessenten kurz notiert, was besprochen wurde. Ordne die Notiz den Punkten zu. Nur, was ausdrücklich in der Notiz steht, als kurze Stichworte. Nichts erfinden, nichts ergänzen. Punkte ohne Angabe weglassen. Keine Gedankenstriche.",
    output_config: jsonAusgabe({
      type: "object",
      properties: Object.fromEntries(felder.map((f) => [f.key, { type: "string", description: `${f.label} (${f.hint})` }])),
    }),
    messages: [{ role: "user", content: `Notiz:\n${t.slice(0, 3000)}` }],
  });
  const keys = new Set(felder.map((f) => f.key));
  const out = cleanQualificationData(jsonAusAntwort(resp) ?? {});
  for (const k of Object.keys(out) as (keyof QualificationData)[]) if (!keys.has(k)) delete out[k];
  return out;
}

/** WhatsApp-Versandfenster wie beim Nachfassen: Mo–Sa 9–19 Uhr (Berlin). */
function imSendefenster(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  return wd !== "Sun" && hour >= 9 && hour < 19;
}

export type OffeneFragenErgebnis = { due: number; sent: number; skipped: number };

/**
 * Nach dem Telefonat: Assistent fragt die offenen Punkte ab (einmal, mit Bezug aufs Telefonat). Nur mit gebuchtem
 * Termin, offenem 24h-Fenster (freie Nachricht, keine Vorlage), eingeschaltetem Assistenten und ohne laufenden Anruf.
 */
export async function runOffeneFragen(now = new Date(), deps: { botTurn?: (conversationId: string, anstoss: string) => Promise<void> } = {}): Promise<OffeneFragenErgebnis> {
  const res: OffeneFragenErgebnis = { due: 0, sent: 0, skipped: 0 };
  // Zu alt (über 3 Tage): verwerfen, der Termin ist dann meist schon nah oder vorbei
  await prisma.lead.updateMany({ where: { openQuestionsAt: { lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } }, data: { openQuestionsAt: null } });
  if (!imSendefenster(now)) return res;
  const due = await prisma.lead.findMany({
    where: { openQuestionsAt: { lte: now }, erasedAt: null, customer: { dormantSince: null } },
    orderBy: { openQuestionsAt: "asc" },
    take: 30,
    select: { id: true, customerId: true, source: true, formData: true, needData: true, needState: true, status: true, callStartedAt: true, openQuestionsAt: true, assignedUser: { select: { displayName: true } } },
  });
  for (const l of due) {
    res.due++;
    if (anrufLaeuft(l, now)) continue; // neuer Anruf läuft: später
    const claimed = await prisma.lead.updateMany({ where: { id: l.id, openQuestionsAt: l.openQuestionsAt }, data: { openQuestionsAt: null } });
    if (!claimed.count) continue;
    const skip = () => {
      res.skipped++;
    };
    if (DONE.includes((l.status ?? "").trim())) {
      skip();
      continue;
    }
    const termin = await prisma.appointment.findFirst({
      where: { leadId: l.id, status: "booked", startsAt: { gt: new Date(now.getTime() + 60 * 60 * 1000) } },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    });
    const conv = await prisma.conversation.findFirst({
      where: { customerId: l.customerId, leadId: l.id },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, customerId: true, leadId: true, contactPhone: true, botActive: true, optedOutAt: true, windowExpiresAt: true },
    });
    if (!termin || !conv || !conv.botActive || conv.optedOutAt || !conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= now.getTime()) {
      skip();
      continue;
    }
    const [agent, { assistentDarfAntworten }] = await Promise.all([
      prisma.agentConfig.findUnique({ where: { customerId: l.customerId }, select: { active: true } }),
      import("@/lib/whatsapp/nur-leads"),
    ]);
    if (!agent?.active || !(await assistentDarfAntworten(conv))) {
      skip();
      continue;
    }
    const felder = bedarfFelder({ produkt: l.source, formular: formAnswers(l.formData), angaben: await angabenFuer(l) });
    const offen = offenePunkte(felder);
    if (!offen.length) {
      skip();
      continue;
    }
    const customer = await prisma.customer.findUnique({ where: { id: l.customerId }, select: { name: true, leadAddress: true } });
    const fallback = l.assignedUser?.displayName?.trim() || advisorDisplayName(customer?.name) || "Ihr Berater";
    // Vermittler-Nennung (Ole, 17.11.2026, lib/vermittler-nennung.ts): gesiezt „Herr Kannapinn“, nie Vor- und Nachname
    const berater = await (async () => {
      const [{ ansprechpartner }, { vermittlerName }, { asAnsprache }] = await Promise.all([import("@/lib/lead-anrede"), import("@/lib/vermittler-nennung"), import("@/lib/ansprache")]);
      const who = await ansprechpartner({ customerId: l.customerId, leadId: l.id });
      return vermittlerName(asAnsprache(customer?.leadAddress), { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback }).nom;
    })().catch(() => fallback);
    const anstoss = anstossNachTelefonat({ berater, termin: termin.startsAt, offen, stand: (l.needState as NeedState | null) ?? null });
    try {
      const turn = deps.botTurn ?? (async (id: string, a: string) => (await import("@/lib/whatsapp/bot")).runBotTurn(id, { anstoss: a }));
      await turn(conv.id, anstoss);
      res.sent++;
      await logLeadHistory(l.id, "notiz", `Assistent fragt nach dem Telefonat die offenen Punkte ab: ${offen.join(", ")}`, { customerId: l.customerId, userId: null });
    } catch (e) {
      console.error("[telefonat offene fragen]", e);
      skip();
    }
  }
  return res;
}

/** Push „Was ist bei {Name} rausgekommen?“ 15 Minuten nach „Anrufen“ ohne Ergebnis (einmal je Anruf). */
export async function runAnrufErinnerungen(now = new Date(), deps: { push?: (userId: string | null, customerId: string, p: { title: string; body: string; url: string; tag: string }) => Promise<unknown> } = {}): Promise<number> {
  const due = await prisma.lead.findMany({
    where: {
      callStartedAt: { lte: new Date(now.getTime() - CALL_REMINDER_AFTER_MS), gt: new Date(now.getTime() - CALL_PAUSE_MAX_MS) },
      callReminderAt: null,
      erasedAt: null,
      // Nicht an reine Pay-per-Lead-Kunden (Ole, 18.11.2026)
      NOT: { customer: NUR_PPL_WHERE },
    },
    take: 50,
    select: { id: true, name: true, customerId: true, assignedUserId: true, callStartedAt: true },
  });
  let sent = 0;
  for (const l of due) {
    const claimed = await prisma.lead.updateMany({ where: { id: l.id, callReminderAt: null, callStartedAt: l.callStartedAt }, data: { callReminderAt: now } });
    if (!claimed.count) continue;
    const payload = { title: "Wie lief das Gespräch?", body: `Was ist bei ${l.name?.trim() || "Ihrem Kontakt"} rausgekommen? Ein Tipp genügt.`, url: "/buyer#ergebnis", tag: `anruf:${l.id}` };
    const push =
      deps.push ??
      (async (userId: string | null, customerId: string, p: typeof payload) => {
        const m = await import("@/lib/push");
        return userId ? m.sendToUser(userId, p) : m.sendToBuyersOfCustomer(customerId, p);
      });
    await push(l.assignedUserId, l.customerId, payload).catch((e) => console.error("[telefonat push]", e));
    sent++;
  }
  return sent;
}
