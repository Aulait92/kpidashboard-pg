// Lernphase von Meta im Media Buyer berücksichtigen (reine Logik, ohne
// Seiteneffekte, daher vollständig testbar).
//
// Meta-Regeln (vereinfacht): Eine Anzeigengruppe braucht ca. 50
// Optimierungsereignisse (bei uns: Leads) in 7 Tagen nach einer wesentlichen
// Änderung. Wesentlich sind u. a. Budgetänderungen über ca. 20 % auf einmal,
// mehrere Änderungen kurz hintereinander, Pausen ab 7 Tagen sowie Gebots-,
// Ziel- und Creative-Änderungen. Jede wesentliche Änderung startet die
// Lernphase neu (teurer, schwankender CPL).
//
// Entscheidungsregeln:
//   1. Schonend (Standard, solange Status LEARNING, SUCCESS oder unbekannt):
//      je Änderung höchstens ±MEDIA_BUYER_LEARNING_MAX_STEP und höchstens eine
//      Budgetänderung je MEDIA_BUYER_LEARNING_MIN_HOURS pro Pool/Kampagne.
//   2. Zurücksetzen (größerer Sprung nach oben) nur, wenn es sich lohnt:
//      (a) Ziel mit schonenden Schritten bis Monatsende rechnerisch nicht
//          erreichbar (Simulation mit aktuellem CPL), UND
//      (b) es bleiben mindestens LEARNING_DAYS + DELIVERY_LAG_DAYS Tage, UND
//      (c) das neue Budget erzeugt genug Ereignisse (Budget/CPL × 7 ≥ 50).
//      Endspurt-Ausnahme (letzte BOOST_DAYS Tage): reichen kleine Schritte
//      nicht, geht das Ziel vor (abschaltbar mit MEDIA_BUYER_ENDSPURT_RESET=0).
//   3. Frei ändern ohne Schonung: Status FAIL („Learning limited") mit
//      schlechtem CPL (7-Tage-CPL ≥ Monats-CPL × BAD_CPL_FACTOR) oder
//      Reaktivierung nach einer Pause ab LONG_PAUSE_DAYS Tagen (die Lernphase
//      startet dann ohnehin neu).
//   4. Kürzen: nie stärker als die Schonregel erlaubt. Ist das Ziel erreicht,
//      wird pausiert (eine Pause unter 7 Tagen setzt die Lernphase nicht
//      zurück), statt hart zu kürzen. Kein Reset nach unten.
//
// Env (alle optional):
//   MEDIA_BUYER_LEARNING_GUARD        1 = an (Standard), 0 = Schonregel aus
//   MEDIA_BUYER_LEARNING_MAX_STEP     max. Änderung je Schritt (Standard 0.2 = ±20 %)
//   MEDIA_BUYER_LEARNING_MIN_HOURS    Mindestabstand zwischen Budgetänderungen (Standard 72)
//   MEDIA_BUYER_LEARNING_DAYS         Dauer der Lernphase in Tagen (Standard 7)
//   MEDIA_BUYER_LEARNING_EVENTS       nötige Ereignisse in LEARNING_DAYS (Standard 50)
//   MEDIA_BUYER_DELIVERY_LAG_DAYS     Lieferzeit-Puffer nach der Lernphase (Standard 2)
//   MEDIA_BUYER_GOAL_TOLERANCE        „erreichbar" ab Ziel × (1 − x) (Standard 0.02)
//   MEDIA_BUYER_RESET_BAD_CPL_FACTOR  FAIL gilt als „schlechter CPL" ab Monats-CPL × x (Standard 1)
//   MEDIA_BUYER_LONG_PAUSE_DAYS       Pause, ab der die Lernphase ohnehin neu startet (Standard 7)
//   MEDIA_BUYER_ENDSPURT_RESET        1 = im Endspurt geht das Ziel vor (Standard), 0 = nie

export type LearningStatus = "LEARNING" | "SUCCESS" | "FAIL" | "UNKNOWN";

export type LearningConfig = {
  enabled: boolean;
  maxStep: number;
  minHoursBetween: number;
  learningDays: number;
  eventsTarget: number;
  deliveryLagDays: number;
  goalTolerance: number;
  badCplFactor: number;
  longPauseDays: number;
  endspurtReset: boolean;
};

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envFlag(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "aus", "off", "nein"].includes(raw);
}

export function loadLearningConfig(): LearningConfig {
  return {
    enabled: envFlag("MEDIA_BUYER_LEARNING_GUARD", true),
    maxStep: envNum("MEDIA_BUYER_LEARNING_MAX_STEP", 0.2),
    minHoursBetween: envNum("MEDIA_BUYER_LEARNING_MIN_HOURS", 72),
    learningDays: envNum("MEDIA_BUYER_LEARNING_DAYS", 7),
    eventsTarget: envNum("MEDIA_BUYER_LEARNING_EVENTS", 50),
    deliveryLagDays: envNum("MEDIA_BUYER_DELIVERY_LAG_DAYS", 2),
    goalTolerance: envNum("MEDIA_BUYER_GOAL_TOLERANCE", 0.02),
    badCplFactor: envNum("MEDIA_BUYER_RESET_BAD_CPL_FACTOR", 1),
    longPauseDays: envNum("MEDIA_BUYER_LONG_PAUSE_DAYS", 7),
    endspurtReset: envFlag("MEDIA_BUYER_ENDSPURT_RESET", true),
  };
}

export const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  enabled: true,
  maxStep: 0.2,
  minHoursBetween: 72,
  learningDays: 7,
  eventsTarget: 50,
  deliveryLagDays: 2,
  goalTolerance: 0.02,
  badCplFactor: 1,
  longPauseDays: 7,
  endspurtReset: true,
};

// ─── Lernstatus aus der Graph API zusammenfassen ─────────────────────

// adset.learning_stage_info laut Graph API.
export type AdSetLearningRaw = {
  effective_status?: string;
  learning_stage_info?: {
    status?: string; // "LEARNING" | "SUCCESS" | "FAIL"
    conversions?: number;
    last_sig_edit_ts?: number; // Unix-Sekunden
  } | null;
};

export type LearningSummary = {
  status: LearningStatus;
  // Zeitpunkt der letzten wesentlichen Änderung laut Meta (jüngste Anzeigengruppe).
  lastSigEditAt: Date | null;
};

// Fasst den Lernstatus aller aktiven Anzeigengruppen eines Pools zusammen.
// Vorrang: LEARNING (eine lernt noch) > FAIL (eingeschränkt) > SUCCESS.
// Fehlt die Info bei einer aktiven Anzeigengruppe, ist das Ergebnis UNKNOWN
// (konservativ, wird wie LEARNING geschont), außer eine lernt gerade.
export function summarizeLearning(adSets: AdSetLearningRaw[]): LearningSummary {
  const active = adSets.filter(
    (a) => !a.effective_status || a.effective_status === "ACTIVE",
  );
  const considered = active.length > 0 ? active : adSets;
  let lastSig: number | null = null;
  let hasLearning = false;
  let hasFail = false;
  let hasUnknown = considered.length === 0;
  let hasSuccess = false;
  for (const a of considered) {
    const info = a.learning_stage_info;
    const ts = info?.last_sig_edit_ts;
    if (typeof ts === "number" && ts > 0) lastSig = Math.max(lastSig ?? 0, ts);
    const s = info?.status?.toUpperCase();
    if (s === "LEARNING") hasLearning = true;
    else if (s === "FAIL") hasFail = true;
    else if (s === "SUCCESS") hasSuccess = true;
    else hasUnknown = true;
  }
  const status: LearningStatus = hasLearning
    ? "LEARNING"
    : hasUnknown
      ? "UNKNOWN"
      : hasFail
        ? "FAIL"
        : hasSuccess
          ? "SUCCESS"
          : "UNKNOWN";
  return {
    status,
    lastSigEditAt: lastSig != null ? new Date(lastSig * 1000) : null,
  };
}

// Knappe Anzeige fürs Admin: „abgeschlossen", „läuft (Tag 3/7)", „eingeschränkt".
export function learningLabel(
  status: string | null | undefined,
  since: Date | null | undefined,
  now: Date,
  learningDays = 7,
): string | null {
  if (!status) return null;
  if (status === "SUCCESS") return "abgeschlossen";
  if (status === "FAIL") return "eingeschränkt";
  if (status === "LEARNING") {
    if (!since) return "läuft";
    const day = Math.floor((now.getTime() - since.getTime()) / 86_400_000) + 1;
    return `läuft (Tag ${Math.min(learningDays, Math.max(1, day))}/${learningDays})`;
  }
  return "unbekannt";
}

// ─── Schonende Schritte simulieren ───────────────────────────────────

// Wie viele Leads kämen bis Monatsende noch, wenn wir nur schonend erhöhen
// (höchstens +maxStep je Schritt, höchstens ein Schritt je minHours)? Tag für
// Tag: an jedem erlaubten Tag Richtung nötiges Budget, gedeckelt.
export function simulateGentleLeads(p: {
  leadsMtd: number;
  goal: number;
  daysLeft: number; // inkl. heute
  currentBudget: number;
  costPerLead: number;
  maxBudget: number;
  maxStep: number;
  minHoursBetween: number;
  hoursUntilNextChange: number; // 0 = sofort erlaubt
}): number {
  let leads = p.leadsMtd;
  let budget = p.currentBudget;
  let wait = Math.max(0, p.hoursUntilNextChange);
  for (let d = 0; d < p.daysLeft; d++) {
    if (wait <= 0) {
      const need = ((p.goal - leads) / (p.daysLeft - d)) * p.costPerLead;
      const capped = Math.min(need, budget * (1 + p.maxStep), p.maxBudget);
      if (capped > budget * 1.005) {
        budget = capped;
        wait = p.minHoursBetween;
      }
    }
    leads += budget / p.costPerLead;
    wait -= 24;
  }
  return leads - p.leadsMtd;
}

// ─── Schutz-Entscheidung ─────────────────────────────────────────────

export type GuardableDecision = {
  action: "increase" | "decrease" | "pause" | "activate" | "boost" | "none";
  reason: string;
  targetBudget: number | null;
  setStatus: "ACTIVE" | "PAUSED" | null;
};

export type LearningGuardResult = {
  decision: GuardableDecision;
  // Erlaubte relative Änderung je Channel (für die Meta-Nachkontrolle nach
  // der Channel-Aufteilung). null = keine Schonung (frei oder Reset).
  protectStep: number | null;
  reset: boolean;
  // Kurzer Grund für Log/Admin; null = Schonregel hat nicht eingegriffen.
  note: string | null;
};

const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)} %`;
const eur0 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function guardLearning(p: {
  decision: GuardableDecision;
  currentBudget: number;
  learning: LearningStatus;
  hoursSinceLastChange: number | null; // null = keine Änderung bekannt
  pausedDays: number | null; // nur bei Reaktivierung: Dauer der Pause (null = unbekannt)
  leadsMtd: number;
  goal: number;
  projected: number;
  daysLeft: number; // inkl. heute
  inBoostWindow: boolean;
  costPerLead: number | null; // 7-Tage-CPL
  cplMtd: number | null; // Monats-CPL
  maxBudget: number;
  cfg: LearningConfig;
}): LearningGuardResult {
  const { decision, currentBudget, cfg } = p;
  const free = (note: string | null): LearningGuardResult => ({
    decision: note ? { ...decision, reason: `${note} ${decision.reason}` } : decision,
    protectStep: null,
    reset: false,
    note,
  });

  if (!cfg.enabled || decision.targetBudget == null || currentBudget <= 0) {
    return free(null);
  }
  const target = decision.targetBudget;
  const change = target / currentBudget - 1;
  const reactivation = decision.setStatus === "ACTIVE";

  if (reactivation && p.pausedDays != null && p.pausedDays >= cfg.longPauseDays) {
    return free(
      `Pause seit ${Math.floor(p.pausedDays)} Tagen: Lernphase startet ohnehin neu, Budget frei.`,
    );
  }

  if (
    p.learning === "FAIL" &&
    (p.costPerLead == null ||
      p.cplMtd == null ||
      p.costPerLead >= p.cplMtd * cfg.badCplFactor)
  ) {
    return free("Lernphase eingeschränkt und CPL schwach: Neustart kostet wenig.");
  }

  const hoursOk =
    p.hoursSinceLastChange == null || p.hoursSinceLastChange >= cfg.minHoursBetween;
  const hoursUntilNext = hoursOk
    ? 0
    : cfg.minHoursBetween - (p.hoursSinceLastChange ?? 0);

  // Kleine Änderung innerhalb der Grenze und Abstand eingehalten → nichts tun.
  if (Math.abs(change) <= cfg.maxStep + 1e-9 && hoursOk) {
    return { decision, protectStep: cfg.maxStep, reset: false, note: null };
  }

  const capped =
    change > 0
      ? currentBudget * (1 + Math.min(change, cfg.maxStep))
      : currentBudget * (1 - Math.min(-change, cfg.maxStep));

  const hold = (why: string): LearningGuardResult => {
    const note = `Lernphase schonen: ${why}, nächste Budgetänderung frühestens in ${Math.ceil(hoursUntilNext)} h (rechnerisch ${pct(change)}).`;
    return {
      decision: {
        action: reactivation ? "activate" : "none",
        reason: `${note} Prognose ${p.projected}/${p.goal}.`,
        targetBudget: null,
        setStatus: decision.setStatus,
      },
      protectStep: cfg.maxStep,
      reset: false,
      note,
    };
  };
  const cap = (extra: string): LearningGuardResult => {
    if (!hoursOk) return hold(extra ? `${extra}; letzte Änderung vor ${Math.floor(p.hoursSinceLastChange ?? 0)} h` : `letzte Änderung vor ${Math.floor(p.hoursSinceLastChange ?? 0)} h`);
    const note = `Lernphase schonen: ${pct(capped / currentBudget - 1)} statt ${pct(change)}${extra ? ` (${extra})` : ""}.`;
    return {
      decision: {
        ...decision,
        targetBudget: capped,
        reason: `${note} Budget ${eur0.format(currentBudget)} → ${eur0.format(capped)}/Tag (rechnerisch nötig ${eur0.format(target)}), Prognose ${p.projected}/${p.goal}.`,
      },
      protectStep: cfg.maxStep,
      reset: false,
      note,
    };
  };
  const doReset = (why: string): LearningGuardResult => {
    const note = `Reset lohnt sich: ${why}`;
    return {
      decision: { ...decision, reason: `${note} ${decision.reason}` },
      protectStep: null,
      reset: true,
      note,
    };
  };

  // Kürzen: nie per Reset; Ziel erreicht → Pause (macht decideBudget).
  if (change < 0) return cap(p.leadsMtd < p.goal ? "bei Ziel wird pausiert" : "");

  // Erhöhen: lohnt sich ein Reset?
  const cpl = p.costPerLead;
  if (cpl == null || cpl <= 0) return cap("ohne CPL kein Reset");
  const gentle = simulateGentleLeads({
    leadsMtd: p.leadsMtd,
    goal: p.goal,
    daysLeft: p.daysLeft,
    currentBudget,
    costPerLead: cpl,
    maxBudget: p.maxBudget,
    maxStep: cfg.maxStep,
    minHoursBetween: cfg.minHoursBetween,
    hoursUntilNextChange: hoursUntilNext,
  });
  const gentleTotal = Math.round(p.leadsMtd + gentle);
  const reachable = p.leadsMtd + gentle >= p.goal * (1 - cfg.goalTolerance);
  if (reachable) return cap(`mit kleinen Schritten ~${gentleTotal}/${p.goal}`);

  if (p.inBoostWindow) {
    if (cfg.endspurtReset) {
      return doReset(
        `Endspurt, mit kleinen Schritten nur ~${gentleTotal}/${p.goal} Leads, das Ziel geht vor.`,
      );
    }
    return cap(`Endspurt-Reset aus, ~${gentleTotal}/${p.goal}`);
  }

  const minDays = cfg.learningDays + cfg.deliveryLagDays;
  if (p.daysLeft < minDays) {
    return cap(
      `Reset lohnt sich nicht: nur ${p.daysLeft} Tage übrig (mind. ${minDays}), ~${gentleTotal}/${p.goal}`,
    );
  }
  const events = (target / cpl) * cfg.learningDays;
  if (events < cfg.eventsTarget) {
    return cap(
      `Reset lohnt sich nicht: ~${Math.round(events)} statt ${cfg.eventsTarget} Ereignisse in ${cfg.learningDays} Tagen, ~${gentleTotal}/${p.goal}`,
    );
  }
  return doReset(
    `mit kleinen Schritten nur ~${gentleTotal}/${p.goal} Leads, noch ${p.daysLeft} Tage, ~${Math.round(events)} Ereignisse in ${cfg.learningDays} Tagen.`,
  );
}
