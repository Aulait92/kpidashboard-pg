// „Kollegen empfehlen“ – reine Logik ohne Datenbank (Code, Status, Hinweise,
// Prämie, Selbstempfehlung). Server-Teil: lib/kollegen.ts.

const DAY_MS = 24 * 60 * 60 * 1000;

// Ohne verwechselbare Zeichen (0/O, 1/l/I) – der Code steht auch auf Visitenkarten/QR.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const CODE_LENGTH = 7;
export const CODE_RE = /^[a-z2-9]{5,12}$/;

export function newReferralCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

export const referralPath = (code: string) => `/empfehlen/${code}`;

// ─── Status einer Empfehlung ───────────────────────────────────────────
export type ReferralStage = "eingegangen" | "termin" | "kunde" | "praemie" | "abgelehnt";

export const STAGE_LABEL: Record<ReferralStage, string> = {
  eingegangen: "Eingegangen",
  termin: "Termin",
  kunde: "Kunde geworden",
  praemie: "Prämie gutgeschrieben",
  abgelehnt: "Nicht berücksichtigt",
};

export const REWARD_STATUS_LABEL: Record<string, string> = {
  none: "–",
  processing: "wird gebucht",
  credited: "gutgeschrieben (Stripe)",
  manual: "von Hand gutschreiben",
  done_manual: "von Hand gutgeschrieben",
  skipped: "keine Prämie",
};

export function referralStage(r: {
  status: string;
  rewardStatus: string;
  wonAt: Date | null;
  hasMeeting: boolean;
  hasAcceptedOffer: boolean;
}): ReferralStage {
  if (r.status === "blocked") return "abgelehnt";
  if (r.rewardStatus === "credited" || r.rewardStatus === "done_manual") return "praemie";
  if (r.wonAt || r.hasAcceptedOffer) return "kunde";
  if (r.hasMeeting) return "termin";
  return "eingegangen";
}

// ─── Prämie ────────────────────────────────────────────────────────────
export type RewardKind = "month" | "fixed";
export type BenefitKind = "none" | "setup_free" | "custom";

export type ReferralSettingsLike = {
  enabled: boolean;
  rewardKind: string;
  rewardFixed: number | null;
  benefitKind: string;
  benefitText: string | null;
};

export const DEFAULT_SETTINGS: ReferralSettingsLike = {
  enabled: true,
  rewardKind: "month",
  rewardFixed: null,
  benefitKind: "none",
  benefitText: null,
};

/** Betrag der Prämie (netto, EUR) – null = nicht automatisch bestimmbar. */
export function rewardAmount(settings: ReferralSettingsLike, referrerMonthly: number | null): number | null {
  if (settings.rewardKind === "fixed") return settings.rewardFixed != null && settings.rewardFixed > 0 ? round2(settings.rewardFixed) : null;
  return referrerMonthly != null && referrerMonthly > 0 ? round2(referrerMonthly) : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

/** Prämie in klaren Worten (für Kundenbereich, Mails, KI-Hilfe). */
export function rewardSentence(settings: ReferralSettingsLike, referrerMonthly: number | null): string {
  if (settings.rewardKind === "fixed" && settings.rewardFixed) {
    return `Wird ein empfohlener Kollege Kunde, schreiben wir Ihnen ${eur(settings.rewardFixed)} netto auf Ihre nächste Rechnung gut.`;
  }
  const amount = referrerMonthly != null && referrerMonthly > 0 ? ` (derzeit ${eur(referrerMonthly)} netto)` : "";
  return `Wird ein empfohlener Kollege Kunde, schenken wir Ihnen einen Monat Betreuung${amount} – als Gutschrift auf Ihrer nächsten Rechnung.`;
}

/** Vorteil für den Neukunden (Landingpage, Angebot) – null = kein Vorteil. */
export function benefitSentence(settings: ReferralSettingsLike): string | null {
  if (settings.benefitKind === "setup_free") return "Als empfohlener Kollege richten wir Ihnen alles ohne Einrichtungsgebühr ein.";
  if (settings.benefitKind === "custom" && settings.benefitText?.trim()) return settings.benefitText.trim();
  return null;
}

// ─── Teilen ────────────────────────────────────────────────────────────
/** Vorbefüllter Text, ohne Du/Sie (Kollegen sprechen sich unterschiedlich an). */
export function defaultShareText(referrerName: string, url: string): string {
  return [
    "Hallo,",
    "",
    "für die Gewinnung neuer Kunden arbeite ich mit performancegrowth zusammen: Werbung bei Meta, Leads direkt aufs Handy und eine App, mit der ich jeden Kontakt nachverfolge.",
    "",
    "Falls das auch für deine/Ihre Agentur interessant ist – hier kann man sich unverbindlich ein Erstgespräch holen:",
    url,
    "",
    "Viele Grüße",
    referrerName,
  ].join("\n");
}

export const shareMailSubject = "Tipp: Neukunden über performancegrowth";

// ─── Selbstempfehlung ──────────────────────────────────────────────────
// Freemail-Domains: gleiche Domain heißt hier nicht „gleiche Agentur“.
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "web.de", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "t-online.de", "outlook.com", "outlook.de",
  "hotmail.com", "hotmail.de", "live.com", "live.de", "yahoo.com", "yahoo.de", "icloud.com", "me.com", "mac.com", "aol.com",
  "aol.de", "freenet.de", "posteo.de", "mailbox.org", "proton.me", "protonmail.com", "online.de", "arcor.de", "vodafone.de",
]);
// Konzern-Domains der Versicherer: Vertreter haben dieselbe Domain, sind aber verschiedene Agenturen.
const CARRIER = /(^|\.)(allianz\.de|ergo\.de|axa\.de|signal-iduna\.(de|net)|hdi\.de|generali\.de|zurich\.de|r-v\.de|ruv\.de|lvm\.de|provinzial\.de|devk\.de|huk\.de|gothaer\.de|barmenia\.de|continentale\.de|debeka\.de|wwk\.de|nuernberger\.de|vgh\.de|sv-?versicherung\.de|bayerische\.de|alte-leipziger\.de|hallesche\.de|ukv\.de|dkv\.de|arag\.de|basler\.de|helvetia\.de|wuerttembergische\.de|interrisk\.de|concordia\.de|vhv\.de|itzehoer\.de|mecklenburgische\.de|ammerlaender-versicherung\.de|axa-betreuer\.de)$/;

export const emailDomain = (email: string) => email.trim().toLowerCase().split("@")[1] ?? "";

/**
 * Selbstempfehlung? Gleiche E-Mail-Adresse wie ein Login des Empfehlers oder
 * gleiche eigene Firmen-Domain (nicht Freemail, nicht Versicherer-Konzern).
 */
export function isSelfReferral(referredEmail: string, referrerEmails: string[]): boolean {
  const e = referredEmail.trim().toLowerCase();
  const own = referrerEmails.map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (own.includes(e)) return true;
  const d = emailDomain(e);
  if (!d || FREEMAIL.has(d) || CARRIER.test(d)) return false;
  return own.some((x) => emailDomain(x) === d);
}

// ─── Hinweise „Kollegen empfehlen“ ─────────────────────────────────────
export const NUDGE_GAP_DAYS = 30;
export const NUDGE_EXPIRE_DAYS = 14;

// „Garantie erreicht“ gibt es nicht mehr: Kunden sehen den Garantiestatus nicht in der App (Ole, 14.11.2026).
export type NudgeKey = "abschluss5" | "abschluss10" | "feedback-day30" | "feedback-day90";
export type NudgeState = { key: string; firstShownAt: Date; closedAt: Date | null };

export const NUDGE_TEXT: Record<NudgeKey, { title: string; text: string }> = {
  abschluss5: {
    title: "5 Abschlüsse – stark!",
    text: "Kennen Sie Kollegen, denen das auch helfen würde? Empfehlen Sie uns weiter.",
  },
  abschluss10: {
    title: "10 Abschlüsse – herzlichen Glückwunsch!",
    text: "Kennen Sie Kollegen, denen das auch helfen würde? Empfehlen Sie uns weiter.",
  },
  "feedback-day30": {
    title: "Danke für Ihr gutes Feedback!",
    text: "Kennen Sie Kollegen, denen wir genauso helfen können? Empfehlen Sie uns weiter.",
  },
  "feedback-day90": {
    title: "Danke für Ihr gutes Feedback!",
    text: "Kennen Sie Kollegen, denen wir genauso helfen können? Empfehlen Sie uns weiter.",
  },
};

/** Ab dieser Bewertung (1–5) gilt Feedback als „gut“. */
export const GOOD_FEEDBACK = 4;

/**
 * Anlässe in Prioritätsreihenfolge → welcher Hinweis wird gezeigt?
 * - jeder Anlass höchstens einmal (geschlossen = nie wieder)
 * - zwischen zwei Hinweisen mindestens 30 Tage
 * - ein gezeigter Hinweis läuft nach 14 Tagen von selbst ab
 * Rückgabe: anzuzeigender Schlüssel und abgelaufene Schlüssel (zum Schließen).
 */
export function pickNudge(candidates: NudgeKey[], states: NudgeState[], now: Date): { show: NudgeKey | null; expire: NudgeKey[] } {
  const byKey = new Map(states.map((s) => [s.key, s]));
  const expire: NudgeKey[] = [];
  const closedAt = (s: NudgeState) => s.closedAt ?? (now.getTime() - s.firstShownAt.getTime() > NUDGE_EXPIRE_DAYS * DAY_MS ? new Date(s.firstShownAt.getTime() + NUDGE_EXPIRE_DAYS * DAY_MS) : null);
  for (const s of states) if (!s.closedAt && closedAt(s)) expire.push(s.key as NudgeKey);
  // Offener (gezeigter, nicht abgelaufener) Hinweis hat Vorrang – auch wenn der Anlass inzwischen ein anderer ist.
  const open = states.find((s) => !closedAt(s) && s.key in NUDGE_TEXT);
  if (open) return { show: open.key as NudgeKey, expire };
  const lastClosed = Math.max(0, ...states.map((s) => closedAt(s)?.getTime() ?? 0));
  if (lastClosed && now.getTime() - lastClosed < NUDGE_GAP_DAYS * DAY_MS) return { show: null, expire };
  const show = candidates.find((k) => !byKey.has(k)) ?? null;
  return { show, expire };
}

/** Anlässe aus den Kennzahlen (höchste zuerst). */
export function nudgeCandidates(input: { closedDeals: number; goodFeedback: ("day30" | "day90")[] }): NudgeKey[] {
  const out: NudgeKey[] = [];
  for (const k of input.goodFeedback) out.push(`feedback-${k}` as NudgeKey);
  if (input.closedDeals >= 10) out.push("abschluss10");
  else if (input.closedDeals >= 5) out.push("abschluss5");
  return out;
}

export const CONSENT_TEXT =
  "Ich bin einverstanden, dass performancegrowth meine Angaben speichert, um mich zu einem Erstgespräch zu kontaktieren (per Telefon oder E-Mail). Die Einwilligung kann ich jederzeit widerrufen.";
