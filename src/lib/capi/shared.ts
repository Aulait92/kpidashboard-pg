// Rückmeldung an Meta (Conversions API für CRM, „Conversion Leads“; Ole, 15.11.2026): reine Logik ohne
// Datenbank und ohne Meta-Aufrufe, damit jede Regel in Unit-Tests nachprüfbar ist.
//
// Nur Leads aus Meta-Lead-Ads (Lead.externalId = leadgen_id, 15 bis 17 Ziffern). Je Lead jede Stufe höchstens
// einmal mit dem frühesten Zeitpunkt:
//   1. Lead               Eingang (Lead.createdAt)
//   2. Erreicht           erste eingehende WhatsApp-Nachricht, als erreicht markiert (Status bzw. Lead.reached),
//                         spätestens mit dem ersten Termin oder Abschluss
//   3. Termin vereinbart  erster Termin (Appointment.createdAt)
//   4. Abschluss          Status „Abschluss“ (closedAt), Wert = Jahresbeitrag netto der Verträge beim Senden
// Gesendet wird je Ereignis NUR: lead_id, event_name, event_time, beim Abschluss value + currency EUR.
// Keine Namen, Telefonnummern, E-Mails, kein Produkt bzw. keine Sparte (§ 203 StGB), kein erweiterter Abgleich.
// Meta nimmt Ereignisse nur bis 7 Tage nach event_time an: ältere werden nicht gesendet („zu alt“).

export const CAPI_STAGES = ["lead", "erreicht", "termin", "abschluss"] as const;
export type CapiStage = (typeof CAPI_STAGES)[number];
export const isCapiStage = (v: unknown): v is CapiStage => typeof v === "string" && (CAPI_STAGES as readonly string[]).includes(v);

/** event_name bei Meta (so erscheinen die Stufen im Events Manager zum Zuordnen). */
export const STAGE_EVENT_NAME: Record<CapiStage, string> = {
  lead: "Lead",
  erreicht: "Erreicht",
  termin: "Termin vereinbart",
  abschluss: "Abschluss",
};

/** Stufen, die als Optimierungsziel („Conversion Leads“) in Frage kommen, in dieser Reihenfolge. */
export const GOAL_STAGES = ["erreicht", "termin", "abschluss"] as const;
export type GoalStage = (typeof GOAL_STAGES)[number];

export const CAPI_STATUSES = ["queued", "sent", "failed", "skipped"] as const;
export type CapiStatus = (typeof CAPI_STATUSES)[number];
export const STATUS_LABEL: Record<CapiStatus, string> = { queued: "wartet", sent: "gesendet", failed: "Fehler", skipped: "nicht gesendet" };

export const LEAD_EVENT_SOURCE = "performancegrowth";
export const DAY_MS = 86_400_000;
/** Meta: event_time höchstens 7 Tage alt; eine Stunde Puffer für Laufzeit und Uhren. */
export const MAX_EVENT_AGE_MS = 7 * DAY_MS - 60 * 60 * 1000;
export const TOO_OLD = "zu alt";

/** Meta-Lead-ID (leadgen_id) aus einem Lead-Formular? Andere Leads (Airtable, Pools, Empfehlungen) nie senden. */
export function isMetaLeadId(v: string | null | undefined): v is string {
  return typeof v === "string" && /^\d{15,17}$/.test(v);
}

export function isTooOld(eventTime: Date, now: Date): boolean {
  return now.getTime() - eventTime.getTime() > MAX_EVENT_AGE_MS;
}

// ─── Stufen erkennen ────────────────────────────────────────────────────

/** Status, die „erreicht“ bedeuten (wie lib/products REACHED, ohne Import für den Browser). */
const REACHED_STATUSES = new Set(["Im Gespräch", "In Beratung", "Angebot gesendet", "Erreicht", "Qualifiziert", "Termin vereinbart", "Angebot/Beratung läuft", "Abschluss", "Kein Interesse"]);
export const CLOSED_STATUS = "Abschluss";

export type StageInput = {
  createdAt: Date;
  /** Lead.reached (Vermittler hat ihn als erreicht markiert, z. B. über „Wie lief's?“) */
  reached: boolean;
  status: string | null;
  /** Letzte Statusänderung (DB-Trigger) */
  statusChangedAt: Date | null;
  closedAt: Date | null;
  /** Erste eingehende WhatsApp-Nachricht des Leads */
  firstInboundAt: Date | null;
  /** Erster Termin (angelegt am) */
  firstAppointmentAt: Date | null;
};

const minDate = (xs: (Date | null | undefined)[]): Date | null => {
  let m: Date | null = null;
  for (const x of xs) if (x && (!m || x.getTime() < m.getTime())) m = x;
  return m;
};

/**
 * Erreichte Stufen eines Leads mit dem frühesten Zeitpunkt. Zeiten liegen nie vor dem Eingang und nie in der
 * Zukunft. „Erreicht“ ohne Zeitstempel (nur Lead.reached gesetzt, Status ohne „erreicht“-Bedeutung) zählt ab
 * dem Zeitpunkt der Erkennung (now); einmal gespeichert bleibt der Zeitpunkt (Postausgang je Lead und Stufe).
 */
export function detectStages(l: StageInput, now: Date): Partial<Record<CapiStage, Date>> {
  const clamp = (d: Date) => new Date(Math.min(now.getTime(), Math.max(l.createdAt.getTime(), d.getTime())));
  const out: Partial<Record<CapiStage, Date>> = { lead: clamp(l.createdAt) };
  const closed = l.status === CLOSED_STATUS && l.closedAt ? l.closedAt : null;
  const reachedStatus = !!l.status && REACHED_STATUSES.has(l.status);
  const flagTime = reachedStatus ? (l.statusChangedAt ?? now) : l.reached ? now : null;
  const reached = minDate([l.firstInboundAt, flagTime, l.firstAppointmentAt, closed]);
  if (reached) out.erreicht = clamp(reached);
  if (l.firstAppointmentAt) out.termin = clamp(l.firstAppointmentAt);
  if (closed) out.abschluss = clamp(closed);
  return out;
}

// ─── Wert beim Abschluss ────────────────────────────────────────────────

/** Rechenart je Sparte (lib/provision sparteKind), hier nur, was den Jahresbeitrag bestimmt. */
export type PremiumKind = "percent" | "monthly" | "beitragssumme" | "honorar" | string;

/**
 * Jahresbeitrag netto aller (nicht stornierten) Verträge zum Lead. Gespeichert ist bei Leben/BU der
 * Jahresbeitrag, bei PKV (Rechenart monthly) der Monatsbeitrag (× 12). Die Tarifoptimierung (Honorar) hat
 * keinen Beitrag und zählt nicht. null = kein Beitrag eingetragen (dann ohne value senden).
 */
export function annualPremium(contracts: { premium: number | null; status: string; kind: PremiumKind }[]): number | null {
  let sum = 0;
  for (const c of contracts) {
    if (c.status === "storniert" || c.premium == null || !(c.premium > 0) || c.kind === "honorar") continue;
    sum += c.kind === "monthly" ? c.premium * 12 : c.premium;
  }
  return sum > 0 ? Math.round(sum * 100) / 100 : null;
}

// ─── Nutzlast für Meta ──────────────────────────────────────────────────

export type CapiOutgoing = { metaLeadId: string; stage: CapiStage; eventTime: Date; value: number | null };

/**
 * `data` für POST /{dataset}/events. lead_id als Zahl (wie in der Meta-Doku); die 15 bis 17 Ziffern liegen
 * über Number.MAX_SAFE_INTEGER, deshalb werden sie unverändert als Ziffern in das JSON geschrieben.
 */
export function buildEventsData(events: CapiOutgoing[]): string {
  const rows = events.map((e) => {
    if (!isMetaLeadId(e.metaLeadId)) throw new Error("Keine Meta-Lead-ID");
    const custom: Record<string, unknown> = { event_source: "crm", lead_event_source: LEAD_EVENT_SOURCE };
    if (e.stage === "abschluss" && e.value != null && e.value > 0) {
      custom.value = Math.round(e.value * 100) / 100;
      custom.currency = "EUR";
    }
    return {
      event_name: STAGE_EVENT_NAME[e.stage],
      event_time: Math.floor(e.eventTime.getTime() / 1000),
      action_source: "system_generated",
      user_data: { lead_id: `__LID_${e.metaLeadId}__` },
      custom_data: custom,
    };
  });
  return JSON.stringify(rows).replace(/"__LID_(\d{15,17})__"/g, "$1");
}

// ─── Kennzahlen und Empfehlung (Optimierungsziel) ───────────────────────

/** Meta-Kriterien für „Conversion Leads“ (Optimierung auf eine CRM-Stufe). */
export const GOAL_CRITERIA = { minLeadsPerMonth: 200, maxDays: 28, minRate: 0.01, maxRate: 0.4, minCoverage: 0.6 } as const;

export type StageRow = { count: number; within28: number; rate: number; medianDays: number | null };
export type StageStats = { days: number; leads: number; leadsPerMonth: number; stages: Record<GoalStage, StageRow> };

/** Anteil je Stufe (innerhalb von 28 Tagen nach Eingang) für Leads aus einem Zeitraum. */
export function stageStats(leads: { createdAt: Date; times: Partial<Record<CapiStage, Date>> }[], days: number): StageStats {
  const stages = {} as Record<GoalStage, StageRow>;
  for (const s of GOAL_STAGES) {
    const delays = leads.filter((l) => l.times[s]).map((l) => (l.times[s]!.getTime() - l.createdAt.getTime()) / DAY_MS).sort((a, b) => a - b);
    const within28 = delays.filter((d) => d <= GOAL_CRITERIA.maxDays).length;
    const mid = delays.length ? (delays.length % 2 ? delays[(delays.length - 1) / 2] : (delays[delays.length / 2 - 1] + delays[delays.length / 2]) / 2) : null;
    stages[s] = { count: delays.length, within28, rate: leads.length ? within28 / leads.length : 0, medianDays: mid == null ? null : Math.round(mid * 10) / 10 };
  }
  return { days, leads: leads.length, leadsPerMonth: days > 0 ? Math.round((leads.length / days) * 30 * 10) / 10 : 0, stages };
}

export type Check = { ok: boolean; text: string };
export type Recommendation = {
  /** Stufe, die als Optimierungsziel taugt (nach Quote und Dauer), auch wenn Menge oder Abdeckung noch fehlen */
  stage: GoalStage | null;
  /** alle Kriterien erfüllt: Umstellung auf „Conversion Leads“ sinnvoll */
  ready: boolean;
  checks: { volume: Check; coverage: Check; stage: Check };
  /** Hinweise in Sie-Form (z. B. warum nicht „Erreicht“) */
  notes: string[];
};

const pct = (n: number) => `${(Math.round(n * 1000) / 10).toLocaleString("de-DE")} %`;

/**
 * Empfehlung nach Meta-Kriterien: mindestens etwa 200 Leads im Monat, Stufe meist innerhalb von 28 Tagen,
 * Quote der Stufe zwischen 1 % und 40 %, Lead-Abdeckung (Leads mit Rückmeldung) mindestens 60 %.
 * Geprüft in der Reihenfolge Erreicht, Termin vereinbart, Abschluss; ist „Erreicht“ zu häufig (über 40 %),
 * kommt „Termin vereinbart“ in Frage.
 */
export function recommendStage(s: StageStats, coverage: number | null): Recommendation {
  const notes: string[] = [];
  let stage: GoalStage | null = null;
  for (const g of GOAL_STAGES) {
    const r = s.stages[g];
    const fast = r.medianDays != null && r.medianDays <= GOAL_CRITERIA.maxDays;
    if (r.rate > GOAL_CRITERIA.maxRate) {
      notes.push(`${STAGE_EVENT_NAME[g]} ist zu häufig (${pct(r.rate)} der Leads, Meta braucht höchstens 40 %), daran kann Meta wenig unterscheiden.`);
      continue;
    }
    if (r.rate >= GOAL_CRITERIA.minRate && fast) {
      stage = g;
      break;
    }
    if (r.rate >= GOAL_CRITERIA.minRate && !fast && r.medianDays != null) notes.push(`${STAGE_EVENT_NAME[g]} dauert meist länger als 28 Tage.`);
  }
  const volumeOk = s.leadsPerMonth >= GOAL_CRITERIA.minLeadsPerMonth;
  const coverageOk = coverage != null && coverage >= GOAL_CRITERIA.minCoverage;
  const checks = {
    volume: {
      ok: volumeOk,
      text: `${s.leadsPerMonth.toLocaleString("de-DE")} Leads im Monat aus Meta-Formularen (Meta braucht etwa ${GOAL_CRITERIA.minLeadsPerMonth})`,
    },
    coverage: {
      ok: coverageOk,
      text: coverage == null ? "Noch keine Rückmeldung an Meta gesendet" : `${pct(coverage)} der Leads mit Rückmeldung an Meta (mindestens 60 %)`,
    },
    stage: {
      ok: !!stage,
      text: stage
        ? `${STAGE_EVENT_NAME[stage]}: ${pct(s.stages[stage].rate)} der Leads innerhalb von 28 Tagen (passend sind 1 % bis 40 %)`
        : "Noch keine Stufe mit 1 % bis 40 % der Leads innerhalb von 28 Tagen",
    },
  };
  return { stage, ready: volumeOk && coverageOk && !!stage, checks, notes };
}

// ─── Fehler verständlich ────────────────────────────────────────────────

/** Fehler bzw. Grund für den Kundenbereich (Sie-Form, ohne Technik). */
export function explainCapiError(raw: string | null | undefined): string {
  const t = (raw ?? "").toLowerCase();
  if (!t) return "Unbekannter Fehler. Wir versuchen es automatisch erneut.";
  if (t === TOO_OLD) return "Älter als 7 Tage, solche Rückmeldungen nimmt Meta nicht mehr an.";
  if (t.includes("abgeschaltet")) return "Rückmeldung war ausgeschaltet.";
  if (t.includes("gelöscht")) return "Lead wurde gelöscht.";
  if (t.includes("token") || t.includes("oauth") || t.includes("session")) return "Die Verbindung zu Meta ist gerade gestört. Wir kümmern uns darum.";
  if (t.includes("permission") || t.includes("does not exist") || t.includes("cannot be loaded") || t.includes("(#10)") || t.includes("(#200)") || t.includes("zugriff"))
    return "Meta lässt uns noch nicht auf Ihr Dataset zugreifen. Wir kümmern uns darum, Sie müssen nichts tun.";
  if (t.includes("dataset") || t.includes("pixel")) return "In Ihrem Werbekonto ist noch kein Dataset (Pixel) eingerichtet. Wir kümmern uns darum.";
  return "Meta hat die Rückmeldung nicht angenommen. Wir versuchen es automatisch erneut.";
}

/** Fehlertext für Admin und Diagnose kürzen, Lead-IDs (lange Ziffernfolgen) entfernen. */
export function shortError(raw: string | null | undefined, max = 200): string | null {
  if (!raw) return null;
  return raw.replace(/\d{12,}/g, "…").slice(0, max);
}
