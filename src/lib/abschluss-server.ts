// Abschluss erkennen und melden, Datenbank-Teil (P4, Ole 17.11.2026; Regeln und Texte in lib/abschluss.ts):
//   ladeAbschlussStand      Zeile „Privatschutz · 612 €/Jahr aus Ihrem Angebot · Provision ≈ 337 €“, Chips, Glückwunsch
//   setzeAbschlussBeitrag   „Stimmt“, Chip bzw. anderer Betrag (Beitrag gilt dann als vom Vermittler)
//   aendereAbschluss        „Ändern“: Sparte und Beitrag über das bestehende Abschluss-Blatt
//   sendeGlueckwunsch       Haken „Glückwunsch per WhatsApp senden“: nur im offenen 24-h-Fenster (Vorlage vorbereitet,
//                           nicht eingereicht), je Lead einmal, vom Vermittler ausgelöst
//   runVorabendAbschluss    Cron 18 bis 21 Uhr: „Hat Frau Becker abgeschlossen?“ am Abend eines stattgefundenen Termins
//                           ohne Ergebnis, ein Push je Berater, je Lead einmal am Tag. Vor dem Nachfassen zum Angebot fragt
//                           der Vorab-Check aus P3 (lib/angebot-senden-server.ts) mit demselben Blatt.
//   meldeAbschlussVomLead   Werkzeug schon_abgeschlossen des Assistenten: Vermittler benachrichtigen, Nachfassen
//                           stoppen, nicht selbst als Abschluss eintragen
//   pausiereNachfassen      „Nachfassen pausieren“ im Blatt: nächster Schritt eine Woche später

import type { Prisma } from "@/generated/prisma/client";
import {
  abschlussZeile,
  asPremiumSource,
  beitragEinheit,
  beitragsChips,
  beitragText,
  blattUrl,
  glueckwunschText,
  glueckwunschVorausgewaehlt,
  NACHFASSEN_PAUSE_TAGE,
  premiumYearFor,
  VORABEND_BIS,
  VORABEND_VON,
  vorabendPush,
  type PremiumSource,
  type VorabendGrund,
} from "@/lib/abschluss";
import { anredeName } from "@/lib/ansprache";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { logLeadHistory } from "@/lib/lead-history";
import { prisma } from "@/lib/prisma";
import { sparteLabel } from "@/lib/provision";
import { leadLabel } from "@/lib/showup";

const DAY = 86_400_000;
const TZ = "Europe/Berlin";
const CLOSED = "Abschluss";
const ENDE = ["Abschluss", "Kein Interesse", "Disqualifiziert"];
/** Anlass der Danke-Mail (je Kontakt einmal, Paket M6). */
export const DANKE_ANLASS = "abschluss";

type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushFn = (userId: string | null, customerId: string, p: PushPayload) => Promise<unknown>;
const standardPush: PushFn = async (userId, customerId, p) => {
  const m = await import("@/lib/push");
  return userId ? m.sendToUser(userId, p) : m.sendToBuyersOfCustomer(customerId, p);
};

function berlinHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d));
}
export function berlinDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}
/** Beginn des Berliner Kalendertags von d (+ n Tage). */
export function berlinDayStart(d: Date, plusDays = 0): Date {
  const base = new Date(`${berlinDayKey(d)}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + plusDays);
  const ymd = base.toISOString().slice(0, 10);
  const guess = new Date(`${ymd}T00:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(guess));
  return new Date(guess.getTime() - (h >= 12 ? h - 24 : h) * 3600_000);
}

// ─── Stand nach dem Tipp ────────────────────────────────────────────────────

export type GlueckwunschStand = {
  /** WhatsApp an den Lead grundsätzlich möglich (Chat, Nummer, nicht abgemeldet) */
  moeglich: boolean;
  /** 24-h-Fenster offen */
  offen: boolean;
  /** Fenster zu, aber die Meta-Vorlage „glueckwunsch“ ist für diesen Kunden freigegeben (Versand als Vorlage) */
  vorlage: boolean;
  vorausgewaehlt: boolean;
  gesendet: boolean;
  text: string;
};

export type AbschlussStand = {
  leadId: string;
  label: string;
  source: string | null;
  geschlossen: boolean;
  sparte: string | null;
  zeile: string | null;
  premiumSource: PremiumSource | null;
  beitrag: string | null;
  /** Chips in der Eingabe-Einheit (z. B. 350 · 600 · 900 €/Jahr) */
  chips: number[];
  einheit: "/Jahr" | "/Monat";
  ersparnis: boolean;
  glueckwunsch: GlueckwunschStand;
  /** Paket M6: Haken „Danke-Mail senden“ (Vorlage „Nach dem Abschluss“), null = nicht anbieten */
  dankeMail: import("@/lib/mail/ein-tipp").EinTippMail | null;
};

async function leadKontakt(leadId: string, customerId: string) {
  return prisma.lead.findFirst({
    where: { id: leadId, customerId, erasedAt: null },
    select: { id: true, customerId: true, name: true, phone: true, source: true, status: true, formData: true, contactOverrides: true, assignedUserId: true, closedAt: true, abschlussGemeldetAt: true },
  });
}

async function chatVon(customerId: string, leadId: string, phone: string | null) {
  return prisma.conversation.findFirst({
    where: { customerId, OR: [{ leadId }, ...(phone ? [{ contactPhone: phone }] : [])] },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, contactPhone: true, contactName: true, windowExpiresAt: true, optedOutAt: true },
  });
}

/** Text und Stand des Glückwunsches (Ergänzung D). */
export async function glueckwunschStand(leadId: string, customerId: string, now = new Date()): Promise<GlueckwunschStand> {
  const lead = await leadKontakt(leadId, customerId);
  const leer: GlueckwunschStand = { moeglich: false, offen: false, vorlage: false, vorausgewaehlt: false, gesendet: false, text: "" };
  if (!lead) return leer;
  const conv = await chatVon(customerId, leadId, lead.phone);
  const [{ anspracheOf }, { ansprechpartner }, { vermittlerName }] = await Promise.all([
    import("@/lib/whatsapp/reminders"),
    import("@/lib/lead-anrede"),
    import("@/lib/whatsapp/gespraech"),
  ]);
  const an = await anspracheOf(customerId);
  const who = await ansprechpartner({ customerId, leadId, phone: lead.phone, name: conv?.contactName ?? lead.name });
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || who.firm });
  const text = glueckwunschText({ an, name: anredeName(an, who.kontakt), vermittler: person.dat });
  const account = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true } });
  const moeglich = !!conv?.contactPhone && !conv.optedOutAt && account?.status === "connected";
  const offen = moeglich && !!conv?.windowExpiresAt && conv.windowExpiresAt.getTime() > now.getTime();
  const gesendet = conv ? (await prisma.message.count({ where: { conversationId: conv.id, direction: "outbound", purpose: "glueckwunsch" } })) > 0 : false;
  const termin = await prisma.appointment.findFirst({
    where: { leadId, startsAt: { lte: now }, status: { in: ["booked", "completed"] }, OR: [{ attendance: null }, { attendance: { not: "nicht_erschienen" } }] },
    orderBy: { startsAt: "desc" },
    select: { startsAt: true },
  });
  // Außerhalb des Fensters: freigegebene Vorlage (Ole, 18.11.2026); nicht vorausgewählt (Vorlagen kosten Gebühr)
  const vorlage =
    moeglich && !offen && !gesendet
      ? await import("@/lib/whatsapp/templates")
          .then((t) => t.pickApprovedTemplate(customerId, "glueckwunsch"))
          .then((x) => !!x)
          .catch(() => false)
      : false;
  return { moeglich, offen, vorlage, gesendet, vorausgewaehlt: offen && !gesendet && glueckwunschVorausgewaehlt(termin?.startsAt, now), text };
}

export async function ladeAbschlussStand(leadId: string, customerId: string, now = new Date(), opts: { userId?: string | null } = {}): Promise<AbschlussStand | null> {
  const lead = await leadKontakt(leadId, customerId);
  if (!lead) return null;
  const { loadCustomerProvision } = await import("@/lib/provision-server");
  const rates = (await loadCustomerProvision(customerId)).rates;
  const c = await prisma.leadContract.findUnique({
    where: { primaryLeadId: leadId },
    select: { sparte: true, premium: true, premiumSource: true, productName: true, rateAbschluss: true, rateBestand: true, provisionValue: true },
  });
  const num = (v: unknown) => (v == null ? null : Number(v));
  const v = c
    ? { sparte: c.sparte, premium: num(c.premium), premiumSource: asPremiumSource(c.premiumSource), productName: c.productName, rateAbschluss: num(c.rateAbschluss), rateBestand: num(c.rateBestand), provisionValue: num(c.provisionValue) }
    : null;
  const e = beitragEinheit(v?.sparte ?? "sonstiges");
  return {
    leadId,
    label: leadLabel(kontaktFromLead(lead), lead.name),
    source: lead.source,
    geschlossen: lead.status === CLOSED,
    sparte: v?.sparte ?? null,
    zeile: v ? abschlussZeile(v, rates) : null,
    premiumSource: v?.premiumSource ?? null,
    beitrag: v ? beitragText(v) : null,
    chips: v ? beitragsChips(v.sparte, rates) : [],
    einheit: e.suffix,
    ersparnis: e.ersparnis,
    glueckwunsch: await glueckwunschStand(leadId, customerId, now),
    dankeMail:
      lead.status === CLOSED
        ? await import("@/lib/mail/ein-tipp")
            .then((m) => m.einTippMailStand(leadId, "nach_abschluss", { anlass: DANKE_ANLASS, userId: opts.userId }))
            .catch(() => null)
        : null,
  };
}

// ─── Beitrag bestätigen bzw. ändern ────────────────────────────────────────

/**
 * „Stimmt“ (eingabe null): Beitrag bleibt, ein typischer gilt danach als bestätigt. Chip bzw. anderer Betrag (Eingabe-
 * Einheit, z. B. Monatsbeitrag bei Leben/BU): wird gespeichert, auch als Wert des Abschlusses am Lead.
 */
export async function setzeAbschlussBeitrag(leadId: string, customerId: string, eingabe: number | null, opts: { userId?: string | null } = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await prisma.leadContract.findFirst({ where: { primaryLeadId: leadId, customerId }, select: { id: true, sparte: true, premium: true, premiumSource: true } });
  if (!c) return { ok: false, error: "Abschluss nicht gefunden." };
  if (eingabe == null) {
    if (c.premiumSource === "standard") await prisma.leadContract.update({ where: { id: c.id }, data: { premiumSource: "vermittler" } });
    return { ok: true };
  }
  if (!Number.isFinite(eingabe) || eingabe <= 0 || eingabe > 1_000_000) return { ok: false, error: "Bitte einen Betrag eingeben." };
  const premium = Math.round(eingabe * beitragEinheit(c.sparte).faktor * 100) / 100;
  await prisma.leadContract.update({ where: { id: c.id }, data: { premium, premiumSource: "vermittler", premiumYear: premiumYearFor(c.sparte, premium), provisionValue: null } });
  await prisma.lead.update({ where: { id: leadId }, data: { closeValue: premium } });
  const { abschlussText } = await import("@/lib/lead-history");
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { source: true } });
  await logLeadHistory(leadId, "abschluss", `Beitrag eingetragen · ${(await abschlussText(customerId, lead?.source ?? null, premium, leadId)).replace(/^Abschluss · /, "")}`, { customerId, userId: opts.userId });
  return { ok: true };
}

/** „Ändern“ über das bestehende Abschluss-Blatt (Sparte, Beitrag in gespeicherter Einheit). */
export async function aendereAbschluss(leadId: string, customerId: string, value: number | null, sparte: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId, status: CLOSED }, select: { id: true } });
  if (!lead) return { ok: false, error: "Abschluss nicht gefunden." };
  await prisma.lead.update({ where: { id: leadId }, data: { closeValue: value != null && value > 0 ? value : null } });
  const { syncPrimaryContract } = await import("@/lib/vertraege");
  await syncPrimaryContract(leadId, { sparte, takeValue: true });
  return { ok: true };
}

// ─── Glückwunsch per WhatsApp ───────────────────────────────────────────────

export type GlueckwunschErgebnis = { ok: true; gesendet: boolean } | { ok: false; error: string };

export async function sendeGlueckwunsch(leadId: string, customerId: string, opts: { userId?: string | null; now?: Date } = {}): Promise<GlueckwunschErgebnis> {
  const now = opts.now ?? new Date();
  const lead = await leadKontakt(leadId, customerId);
  if (!lead || lead.status !== CLOSED) return { ok: false, error: "Erst den Abschluss eintragen." };
  const g = await glueckwunschStand(leadId, customerId, now);
  if (g.gesendet) return { ok: true, gesendet: false };
  if (!g.moeglich) return { ok: false, error: "WhatsApp an diesen Kontakt ist nicht möglich." };
  // Außerhalb des 24-h-Fensters nur mit freigegebener Vorlage „glueckwunsch“
  if (!g.offen && !g.vorlage) return { ok: false, error: "Geht nur bis 24 Stunden nach der letzten Nachricht des Kontakts." };
  const conv = await chatVon(customerId, leadId, lead.phone);
  if (!conv?.contactPhone) return { ok: false, error: "WhatsApp an diesen Kontakt ist nicht möglich." };
  const templates = await import("@/lib/whatsapp/templates");
  try {
    await templates.sendWhatsAppNotice({
      customerId,
      to: conv.contactPhone,
      purpose: "glueckwunsch",
      params: [templates.firstNameOf(conv.contactName ?? lead.name)],
      text: g.text,
      leadId,
      contactName: conv.contactName,
      // Vom Vermittler per Haken ausgelöst
      manuell: true,
      textButtons: [],
    });
  } catch (err) {
    if (err instanceof templates.NoTemplateError) return { ok: false, error: "Geht nur bis 24 Stunden nach der letzten Nachricht des Kontakts." };
    console.error("[glueckwunsch]", err instanceof Error ? err.message : err);
    return { ok: false, error: "Senden hat nicht geklappt. Bitte später noch einmal." };
  }
  await logLeadHistory(leadId, "abschluss", "Glückwunsch per WhatsApp gesendet", { customerId, userId: opts.userId });
  return { ok: true, gesendet: true };
}

// ─── Vorabend-Push ─────────────────────────────────────────────────────────

export type VorabendKandidat = { leadId: string; customerId: string; grund: VorabendGrund; userId: string | null };

/** Abfolgen des Nachfassens zum Angebot (P3, lib/lead-sequences.ts): über die App bzw. selbst gesendet. */
const ANGEBOT_ABFOLGEN = ["offer", "offer_selbst"];

/**
 * Leads für den Vorabend-Push „Hat Frau Becker abgeschlossen?“ am Abend eines stattgefundenen Termins ohne Ergebnis (kein
 * Abschluss, nicht verloren). Gesendete Angebote fragt der Vorab-Check des Nachfassens (P3, runAngebotVorabCheck) am
 * Vorabend jedes automatischen Schritts mit demselben Blatt; Leads mit laufendem Nachfassen zum Angebot deshalb nicht
 * hier (kein zweiter Push). Je Lead höchstens einmal am Tag (abschlussFrageAt), nicht nach einer Meldung des Leads im Chat.
 */
export async function vorabendKandidaten(now = new Date()): Promise<VorabendKandidat[]> {
  const heute = berlinDayStart(now);
  const leadWhere: Prisma.LeadWhereInput = {
    erasedAt: null,
    stornoState: null,
    abschlussGemeldetAt: null,
    OR: [{ abschlussFrageAt: null }, { abschlussFrageAt: { lt: heute } }],
    customer: { archived: false, dormantSince: null },
    sequences: { none: { kind: { in: ANGEBOT_ABFOLGEN }, stoppedAt: null } },
  };
  const [termine] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        startsAt: { gte: heute, lt: now },
        status: { in: ["booked", "completed"] },
        OR: [{ attendance: null }, { attendance: { not: "nicht_erschienen" } }],
        leadId: { not: null },
        lead: { ...leadWhere, NOT: { status: { in: ENDE } } },
      },
      select: { leadId: true, customerId: true, calendarKey: true, lead: { select: { assignedUserId: true } } },
      take: 500,
    }),
  ]);
  const out = new Map<string, VorabendKandidat>();
  for (const t of termine) {
    if (!t.leadId || out.has(t.leadId)) continue;
    const userId = t.lead?.assignedUserId ?? (t.calendarKey?.startsWith("user:") ? t.calendarKey.slice(5) : null);
    out.set(t.leadId, { leadId: t.leadId, customerId: t.customerId, grund: "termin", userId });
  }
  return [...out.values()];
}

export async function runVorabendAbschluss(now = new Date(), deps: { push?: PushFn } = {}): Promise<{ due: boolean; leads: number; pushes: number }> {
  const h = berlinHour(now);
  if (h < VORABEND_VON || h >= VORABEND_BIS) return { due: false, leads: 0, pushes: 0 };
  const push = deps.push ?? standardPush;
  const heute = berlinDayStart(now);
  const day = berlinDayKey(now);
  const gruppen = new Map<string, { userId: string | null; customerId: string; items: { leadId: string; label: string; grund: VorabendGrund }[] }>();
  let leads = 0;
  for (const k of await vorabendKandidaten(now)) {
    // Sperre je Lead und Tag (parallele Läufe)
    const claimed = await prisma.lead.updateMany({
      where: { id: k.leadId, OR: [{ abschlussFrageAt: null }, { abschlussFrageAt: { lt: heute } }] },
      data: { abschlussFrageAt: now },
    });
    if (!claimed.count) continue;
    const l = await prisma.lead.findUnique({ where: { id: k.leadId }, select: { name: true, formData: true, contactOverrides: true } });
    const key = `${k.customerId}:${k.userId ?? ""}`;
    const g = gruppen.get(key) ?? { userId: k.userId, customerId: k.customerId, items: [] };
    g.items.push({ leadId: k.leadId, label: leadLabel(kontaktFromLead(l), l?.name), grund: k.grund });
    gruppen.set(key, g);
    leads++;
  }
  let pushes = 0;
  for (const g of gruppen.values()) {
    await push(g.userId, g.customerId, vorabendPush(g.items, day)).catch((e) => console.error("[abschluss vorabend push]", e));
    pushes++;
  }
  return { due: true, leads, pushes };
}

// ─── Lead meldet im Chat: schon abgeschlossen ───────────────────────────────

export type MeldungErgebnis = "gemeldet" | "schon_eingetragen" | "schon_gemeldet" | "kein_lead";

/**
 * Werkzeug schon_abgeschlossen: Der Lead schreibt, er habe abgeschlossen (z. B. „Antrag ist unterschrieben“). Nachfassen
 * stoppt, der Vermittler bekommt einen Push auf das Blatt „Hat Frau Becker abgeschlossen?“ und der Chat steht auf
 * „Braucht Sie“. Der Abschluss selbst wird NICHT eingetragen: das bestätigt der Vermittler mit einem Tipp.
 */
export async function meldeAbschlussVomLead(
  leadId: string,
  opts: { conversationId?: string | null; aussage?: string | null; now?: Date; push?: PushFn } = {},
): Promise<MeldungErgebnis> {
  const now = opts.now ?? new Date();
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, customerId: true, name: true, status: true, erasedAt: true, formData: true, contactOverrides: true, assignedUserId: true, abschlussGemeldetAt: true },
  });
  if (!lead || lead.erasedAt) return "kein_lead";
  if (lead.status === CLOSED) return "schon_eingetragen";
  const { stopSequences } = await import("@/lib/lead-sequences");
  await stopSequences(leadId, "Lead meldet: schon abgeschlossen", { now });
  if (lead.abschlussGemeldetAt) return "schon_gemeldet";
  await prisma.lead.update({ where: { id: leadId }, data: { abschlussGemeldetAt: now } });
  const label = leadLabel(kontaktFromLead(lead), lead.name);
  const zitat = (opts.aussage ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (opts.conversationId) {
    const { flagAttention } = await import("@/lib/whatsapp/attention");
    // Push kommt unten mit dem Link auf das Blatt (nicht zweimal)
    await flagAttention(opts.conversationId, `Meldet Abschluss${zitat ? `: „${zitat}“` : ""}. Bitte eintragen.`, { push: false }).catch((e) => console.error("[abschluss meldung]", e));
  }
  await (opts.push ?? standardPush)(lead.assignedUserId, lead.customerId, {
    title: `${label} meldet: abgeschlossen`,
    body: "Mit einem Tipp eintragen. Das Nachfassen ist gestoppt.",
    url: blattUrl([leadId]),
    tag: `abschluss-meldung:${leadId}`,
  }).catch((e) => console.error("[abschluss meldung push]", e));
  await logLeadHistory(leadId, "status", `Im Chat: meldet Abschluss${zitat ? ` („${zitat}“)` : ""}, Nachfassen gestoppt`, { customerId: lead.customerId, userId: null });
  return "gemeldet";
}

// ─── Nachfassen pausieren ──────────────────────────────────────────────────

export async function pausiereNachfassen(leadId: string, customerId: string, opts: { now?: Date; userId?: string | null } = {}): Promise<{ ok: true; bis: string } | { ok: false; error: string }> {
  const now = opts.now ?? new Date();
  const seq = await prisma.leadSequence.findFirst({ where: { leadId, customerId, kind: { in: ANGEBOT_ABFOLGEN }, stoppedAt: null, nextAt: { not: null } }, select: { id: true, nextAt: true, log: true } });
  if (!seq?.nextAt) return { ok: false, error: "Es läuft kein Nachfassen." };
  const next = new Date(Math.max(seq.nextAt.getTime(), now.getTime()) + NACHFASSEN_PAUSE_TAGE * DAY);
  const list = Array.isArray(seq.log) ? (seq.log as unknown[]) : [];
  await prisma.leadSequence.update({
    where: { id: seq.id },
    // Vorab-Check (P3) kommt am Vorabend des verschobenen Schritts noch einmal
    data: { nextAt: next, vorabCheckStep: null, log: [...list, { at: now.toISOString(), step: -1, action: "pause", result: "planned", detail: `vom Vermittler pausiert bis ${berlinDayKey(next)}` }] as unknown as Prisma.InputJsonValue },
  });
  await logLeadHistory(leadId, "status", `Nachfassen zum Angebot ${NACHFASSEN_PAUSE_TAGE} Tage pausiert`, { customerId, userId: opts.userId });
  return { ok: true, bis: next.toISOString() };
}

// ─── Entscheidungsblatt ────────────────────────────────────────────────────

export type BlattEintrag = {
  leadId: string;
  label: string;
  /** Kontext unter der Frage, z. B. „Angebot gesendet · Nachfassen morgen“ */
  kontext: string;
  geschlossen: boolean;
  gemeldet: boolean;
  nachfassenLaeuft: boolean;
  /** Termin ohne Ergebnis: „Ja“ trägt das Ergebnis am Termin ein */
  terminId: string | null;
};

const fmtTag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);

export async function ladeBlatt(leadIds: string[], leadScope: Prisma.LeadWhereInput, now = new Date()): Promise<BlattEintrag[]> {
  const ids = [...new Set(leadIds)].slice(0, 10);
  if (!ids.length) return [];
  const leads = await prisma.lead.findMany({
    where: { AND: [leadScope, { id: { in: ids }, erasedAt: null }] },
    select: {
      id: true,
      name: true,
      status: true,
      formData: true,
      contactOverrides: true,
      abschlussGemeldetAt: true,
      sequences: { where: { kind: { in: ANGEBOT_ABFOLGEN }, stoppedAt: null }, select: { nextAt: true }, take: 1 },
      appointments: { where: { startsAt: { lte: now }, status: { in: ["booked", "completed"] } }, orderBy: { startsAt: "desc" }, take: 1, select: { id: true, startsAt: true, status: true } },
    },
  });
  const byId = new Map(leads.map((l) => [l.id, l]));
  return ids.flatMap((id) => {
    const l = byId.get(id);
    if (!l) return [];
    const seq = l.sequences[0];
    const t = l.appointments[0];
    const kontext = l.abschlussGemeldetAt
      ? "Hat im Chat geschrieben, dass abgeschlossen ist."
      : seq?.nextAt
        ? `Angebot gesendet · nächstes Nachfassen ${fmtTag(seq.nextAt)}`
        : t
          ? `Termin am ${fmtTag(t.startsAt)}`
          : l.status === "Angebot gesendet"
            ? "Angebot gesendet"
            : (l.status ?? "");
    return [
      {
        leadId: l.id,
        label: leadLabel(kontaktFromLead(l), l.name),
        kontext,
        geschlossen: l.status === CLOSED,
        gemeldet: !!l.abschlussGemeldetAt,
        nachfassenLaeuft: !!seq?.nextAt,
        terminId: t && t.status === "booked" ? t.id : null,
      },
    ];
  });
}

/** Sparte als Text (für Toasts). */
export const sparteText = (sparte: string | null) => (sparte ? sparteLabel(sparte) : "");
