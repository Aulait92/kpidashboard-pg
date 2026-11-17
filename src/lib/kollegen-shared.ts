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
/** month = 1 Monat Betreuung gratis, fixed = fester Betrag, bestand = Bestandskunden-Modul N Monate gratis. */
export type RewardKind = "month" | "fixed" | "bestand";
export const REWARD_KINDS: readonly RewardKind[] = ["bestand", "month", "fixed"];
export const normalizeRewardKind = (k: unknown): RewardKind => (REWARD_KINDS.includes(k as RewardKind) ? (k as RewardKind) : "month");
export type BenefitKind = "none" | "setup_free" | "setup_discount" | "custom";
export const BENEFIT_KINDS: readonly BenefitKind[] = ["none", "setup_free", "setup_discount", "custom"];
export const normalizeBenefitKind = (k: unknown): BenefitKind => (BENEFIT_KINDS.includes(k as BenefitKind) ? (k as BenefitKind) : "none");

/** Standardbetrag „Rabatt auf die Einrichtung“ (netto, EUR), Ole 14.11.2026. */
export const DEFAULT_SETUP_DISCOUNT = 300;
/** Obergrenze im Formular (Schutz vor Tippfehlern). */
export const MAX_SETUP_DISCOUNT = 10000;
/** Monate Bestandskunden-Modul gratis bei Prämie „bestand“ (Standard der Option, Ole 14.11.2026). */
export const DEFAULT_REWARD_MONTHS = 3;
/** Standard-Prämie für den Empfehler: fester Betrag (netto, EUR) als Gutschrift je Empfehlung (Ole, 15.11.2026). */
export const DEFAULT_REWARD_FIXED = 300;
export const MAX_REWARD_MONTHS = 24;

export type ReferralSettingsLike = {
  enabled: boolean;
  rewardKind: string;
  rewardFixed: number | null;
  /** Monate Bestandskunden-Modul gratis bei rewardKind „bestand“ (Standard 3). */
  rewardMonths?: number | null;
  benefitKind: string;
  benefitText: string | null;
  /** Rabatt auf die Einrichtung (netto) bei benefitKind „setup_discount“. */
  benefitAmount?: number | null;
  /** Hinweise „Kollegen empfehlen“ im Kundenbereich zeigen (Standard aus: nicht aktiv bewerben). */
  nudgesEnabled?: boolean;
};

// Standard seit 15.11.2026 (Ole): 300 € netto Gutschrift je Empfehlung, die Kunde wird (vorher 3 Monate Bestandskunden-Modul).
export const DEFAULT_SETTINGS: ReferralSettingsLike = {
  enabled: true,
  rewardKind: "fixed",
  rewardFixed: DEFAULT_REWARD_FIXED,
  rewardMonths: null,
  benefitKind: "none",
  benefitText: null,
  benefitAmount: null,
  nudgesEnabled: false,
};

/** Monate Modul gratis (nur rewardKind „bestand“). */
export function rewardMonthsOf(settings: ReferralSettingsLike): number {
  const n = Math.round(Number(settings.rewardMonths ?? DEFAULT_REWARD_MONTHS));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_REWARD_MONTHS) : DEFAULT_REWARD_MONTHS;
}

/**
 * Betrag der Prämie (netto, EUR), null = nicht automatisch bestimmbar.
 * month: Monatspreis des Empfehlers; fixed: fester Betrag; bestand: N × Monatspreis des Moduls.
 */
export function rewardAmount(settings: ReferralSettingsLike, referrerMonthly: number | null, bestandMonthly: number | null = null): number | null {
  if (settings.rewardKind === "fixed") return settings.rewardFixed != null && settings.rewardFixed > 0 ? round2(settings.rewardFixed) : null;
  if (settings.rewardKind === "bestand") return bestandMonthly != null && bestandMonthly > 0 ? round2(rewardMonthsOf(settings) * bestandMonthly) : null;
  return referrerMonthly != null && referrerMonthly > 0 ? round2(referrerMonthly) : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const months = (n: number) => (n === 1 ? "1 Monat" : `${n} Monate`);

/** Rest einer Gutschrift, die höher ist als die nächste Rechnung (Stripe verrechnet ihn mit den folgenden). */
export const REWARD_CARRY_OVER = "Ist die Rechnung kleiner, verrechnen wir den Rest automatisch mit den folgenden Rechnungen.";

/** Prämie in klaren Worten (für Kundenbereich, Mails, KI-Hilfe). */
export function rewardSentence(settings: ReferralSettingsLike, referrerMonthly: number | null): string {
  if (settings.rewardKind === "fixed" && settings.rewardFixed) {
    const n = round2(settings.rewardFixed);
    return `Wird ein empfohlener Kollege Kunde, schreiben wir Ihnen ${eur(n)} netto auf Ihre nächste Rechnung gut. ${REWARD_CARRY_OVER} Jede weitere Empfehlung zählt wieder: 3 Kollegen sind ${eur(round2(3 * n))}.`;
  }
  if (settings.rewardKind === "bestand") {
    const n = rewardMonthsOf(settings);
    return `Wird ein empfohlener Kollege Kunde, bekommen Sie ${months(n)} das Bestandskunden-Modul gratis. Haben Sie das Modul schon, schreiben wir Ihnen ${n === 1 ? "einen Monatsbeitrag" : `${n} Monatsbeiträge`} auf Ihre nächste Rechnung gut. Jede weitere Empfehlung zählt zusätzlich.`;
  }
  const amount = referrerMonthly != null && referrerMonthly > 0 ? ` (derzeit ${eur(referrerMonthly)} netto)` : "";
  return `Wird ein empfohlener Kollege Kunde, schenken wir Ihnen einen Monat Betreuung${amount} als Gutschrift auf Ihrer nächsten Rechnung.`;
}

/** Rabatt auf die Einrichtung (netto) laut Einstellung, null = keiner. */
export function setupDiscountAmount(settings: ReferralSettingsLike): number | null {
  if (settings.benefitKind !== "setup_discount") return null;
  const n = Number(settings.benefitAmount ?? DEFAULT_SETUP_DISCOUNT);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

/**
 * Vorteil für den Neukunden (Landingpage, Mails, Angebot) in Sie-Form, null = kein Vorteil.
 * Mit Namen des Empfehlers: „Als Empfehlung von Max Muster sparen Sie 300 € bei der Einrichtung.“
 */
export function benefitSentence(settings: ReferralSettingsLike, referrerName?: string | null): string | null {
  const von = referrerName?.trim() ? ` von ${referrerName.trim()}` : "";
  if (settings.benefitKind === "setup_free") return `Als Empfehlung${von} richten wir Ihnen alles ohne Einrichtungsgebühr ein.`;
  const discount = setupDiscountAmount(settings);
  if (discount != null) return `Als Empfehlung${von} sparen Sie ${eur(discount)} bei der Einrichtung.`;
  if (settings.benefitKind === "custom" && settings.benefitText?.trim()) return settings.benefitText.trim();
  return null;
}

/** Prämie für den Empfehler, kurz: „300 € Gutschrift“, „3 Monate Bestandskunden-Modul gratis“ bzw. „1 Monat gratis“. */
export function rewardShort(settings: ReferralSettingsLike): string {
  if (settings.rewardKind === "fixed" && settings.rewardFixed != null && settings.rewardFixed > 0) return `${eur(round2(settings.rewardFixed))} Gutschrift`;
  if (settings.rewardKind === "bestand") return `${months(rewardMonthsOf(settings))} Bestandskunden-Modul gratis`;
  return "1 Monat gratis";
}

/** Prämie im Satz: „300 € auf Ihre nächste Rechnung gutgeschrieben“, „3 Monate das Bestandskunden-Modul gratis“, „einen Monat Betreuung gratis“. */
function rewardPhrase(settings: ReferralSettingsLike): string {
  if (settings.rewardKind === "fixed" && settings.rewardFixed != null && settings.rewardFixed > 0) return `${eur(round2(settings.rewardFixed))} auf Ihre nächste Rechnung gutgeschrieben`;
  if (settings.rewardKind === "bestand") return `${months(rewardMonthsOf(settings))} das Bestandskunden-Modul gratis`;
  return "einen Monat Betreuung gratis";
}

/** Vorteil für den Kollegen, kurz: „300 € weniger Einrichtung“, „Einrichtung gratis“, eigener Text oder null. */
export function benefitShort(settings: ReferralSettingsLike): string | null {
  if (settings.benefitKind === "setup_free") return "Einrichtung gratis";
  const discount = setupDiscountAmount(settings);
  if (discount != null) return `${eur(discount)} weniger Einrichtung`;
  if (settings.benefitKind === "custom" && settings.benefitText?.trim()) return settings.benefitText.trim();
  return null;
}

/**
 * Beide Kurztexte für Kacheln/Infokarten (z. B. /buyer/empfehlen, Login-Infokarte):
 * kollege = Vorteil des Empfohlenen (null = keiner), sie = Prämie des Empfehlers.
 * Mit Oles Einstellung: { kollege: "300 € weniger Einrichtung", sie: "300 € Gutschrift" }.
 */
export function referralOfferLines(settings: ReferralSettingsLike): { kollege: string | null; sie: string } {
  return { kollege: benefitShort(settings), sie: rewardShort(settings) };
}

// ─── Zugang zur Seite /buyer/empfehlen ─────────────────────────────────
/**
 * Wer sieht „Kollegen empfehlen“? Gilt für die Kachel in den Einstellungen UND die Seite selbst,
 * damit die Kachel nie ins Leere führt: alle Inhaber, auch interne Testkunden und die Admin-Vorschau, keine Berater.
 */
export function canOpenReferralPage(ctx: { teamRole: "owner" | "advisor" }): boolean {
  return ctx.teamRole !== "advisor";
}

/**
 * Untertitel der Kachel in den Einstellungen, aus der Prämie laut Einstellung (Sie-Form, wie der Teilen-Text ohne „netto“).
 * Standard: „300 € Gutschrift für jeden Kollegen, der Kunde wird“.
 */
export function referralTileText(settings: ReferralSettingsLike): string {
  if (!settings.enabled) return "Ihr Empfehlungslink und der Stand Ihrer Empfehlungen";
  const praemie =
    settings.rewardKind === "fixed" && settings.rewardFixed != null && settings.rewardFixed > 0
      ? `${eur(round2(settings.rewardFixed))} Gutschrift`
      : settings.rewardKind === "bestand"
        ? `${months(rewardMonthsOf(settings))} Bestandskunden-Modul gratis`
        : "1 Monat Betreuung gratis";
  return `${praemie} für jeden Kollegen, der Kunde wird`;
}

/**
 * Persönlicher Link auf /buyer/empfehlen: anlegen, zeigen oder stattdessen ein Hinweis?
 * - Vorschau: nie anlegen (schreibgeschützt); vorhandenen Link zeigen, sonst Hinweis.
 * - Interner Kunde: kein Link (die Landingpage nimmt interne Codes nicht an, referrerByCode), nur Hinweis.
 * - Sonst: anlegen, falls noch keiner da ist, und zeigen.
 */
export function referralLinkState(c: { preview: boolean; internal: boolean; hasCode: boolean }): { create: boolean; show: boolean; hinweis: string | null } {
  if (c.internal) return { create: false, show: false, hinweis: "Interne Testkonten bekommen keinen Empfehlungslink. Kunden sehen hier ihren persönlichen Link." };
  if (c.preview && !c.hasCode) return { create: false, show: false, hinweis: "Der Kunde hat noch keinen Empfehlungslink. Er entsteht, sobald der Kunde diese Seite selbst öffnet." };
  return { create: !c.preview && !c.hasCode, show: true, hinweis: null };
}

/**
 * Satz für Hinweise, Mails und KI-Hilfe (an den Empfehler), z. B.
 * „Ihr Kollege spart 300 € bei der Einrichtung. Sie bekommen 300 € auf Ihre nächste Rechnung gutgeschrieben.“
 */
export function referralIncentiveSentence(settings: ReferralSettingsLike): string {
  const sie = `Sie bekommen ${rewardPhrase(settings)}.`;
  const discount = setupDiscountAmount(settings);
  if (discount != null) return `Ihr Kollege spart ${eur(discount)} bei der Einrichtung. ${sie}`;
  if (settings.benefitKind === "setup_free") return `Ihr Kollege bekommt die Einrichtung gratis. ${sie}`;
  return `Sie bekommen ${rewardPhrase(settings)}, sobald Ihr Kollege Kunde wird.`;
}

// ─── Empfehlungsrabatt im Angebot ──────────────────────────────────────
/** Gilt nur innerhalb von 12 Monaten nach der Empfehlung (wie die Löschfrist). */
export const SETUP_DISCOUNT_VALID_DAYS = 365;

export type SetupDiscountCheck = {
  /** Rabatt laut Einstellung (null = Option nicht aktiv). */
  amount: number | null;
  referral: { status: string; existingContact: boolean; createdAt: Date };
  /** Vertriebskontakt ist schon Kunde (Kundenakte verknüpft). */
  contactIsCustomer: boolean;
  /** Empfehlung an sich selbst bzw. die eigene Agentur. */
  selfReferral: boolean;
  /** Vor der Empfehlung gab es schon ein Angebot an den Kontakt. */
  offerBefore: boolean;
  now: Date;
};

/** Bekommt ein empfohlener Kontakt den Einrichtungsrabatt automatisch? Mit Grund, wenn nicht. */
export function setupDiscountDecision(c: SetupDiscountCheck): { ok: true; amount: number } | { ok: false; reason: string } {
  if (c.amount == null) return { ok: false, reason: "Kein Einrichtungsrabatt eingestellt" };
  if (c.referral.status !== "open") return { ok: false, reason: "Empfehlung nicht berücksichtigt" };
  if (c.selfReferral) return { ok: false, reason: "Selbstempfehlung" };
  if (c.contactIsCustomer) return { ok: false, reason: "Kontakt ist schon Kunde" };
  if (c.referral.existingContact) return { ok: false, reason: "Kontakt war vor der Empfehlung schon im Vertrieb" };
  if (c.offerBefore) return { ok: false, reason: "Kontakt hatte vor der Empfehlung schon ein Angebot" };
  if (c.now.getTime() - c.referral.createdAt.getTime() > SETUP_DISCOUNT_VALID_DAYS * DAY_MS) return { ok: false, reason: "Empfehlung ist älter als 12 Monate" };
  return { ok: true, amount: c.amount };
}

/** Zeile im Angebot: mit Namen nur, wenn der Empfohlene ihn auf der Landingpage gesehen und eingewilligt hat. */
export function setupDiscountLabel(referrerName: string | null): string {
  return referrerName?.trim() ? `Empfehlungsrabatt (empfohlen von ${referrerName.trim()})` : "Empfehlungsrabatt";
}

// ─── Teilen ────────────────────────────────────────────────────────────
/** Anrede im Teilen-Text: „du“, „sie“ oder offen (Standard, „deine/Ihre“: Kollegen sprechen sich unterschiedlich an). */
export type ShareForm = "du" | "sie" | "offen";

/**
 * Offenlegung der Prämie (§ 5a Abs. 4 UWG): Der Empfehler sagt offen, dass er etwas bekommt.
 * Betrag nur bei fester Gutschrift, sonst allgemein „eine Gutschrift“.
 */
export function shareDisclosureSentence(settings?: ReferralSettingsLike, form: ShareForm = "offen"): string {
  const fixed = settings && settings.rewardKind === "fixed" && settings.rewardFixed != null && settings.rewardFixed > 0 ? round2(settings.rewardFixed) : null;
  const gutschrift = fixed != null ? `eine Gutschrift über ${eur(fixed)}` : "eine Gutschrift";
  const wenn = form === "du" ? "Wirst du Kunde" : form === "sie" ? "Werden Sie Kunde" : "Wirst du/Werden Sie Kunde";
  return `Offen gesagt: ${wenn}, bekomme ich von performancegrowth ${gutschrift}.`;
}

/** Vorbefüllter Text, standardmäßig ohne feste Du/Sie-Anrede (Kollegen sprechen sich unterschiedlich an). */
export function defaultShareText(referrerName: string, url: string, settings?: ReferralSettingsLike, form: ShareForm = "offen"): string {
  const discount = settings ? setupDiscountAmount(settings) : null;
  const perk = discount != null ? ` Über diesen Link gibt es ${eur(discount)} Rabatt auf die Einrichtung.` : settings?.benefitKind === "setup_free" ? " Über diesen Link ist die Einrichtung gratis." : "";
  const deine = form === "du" ? "deine" : form === "sie" ? "Ihre" : "deine/Ihre";
  return [
    "Hallo,",
    "",
    "für die Gewinnung neuer Kunden arbeite ich mit performancegrowth zusammen: Werbung bei Meta, Leads direkt aufs Handy und eine App, mit der ich jeden Kontakt nachverfolge.",
    "",
    `Falls das auch für ${deine} Agentur interessant ist: Hier kann man sich unverbindlich ein Erstgespräch holen.${perk} ${shareDisclosureSentence(settings, form)}`,
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
    title: "5 Abschlüsse, stark!",
    text: "Kennen Sie Kollegen, denen das auch helfen würde? Empfehlen Sie uns weiter.",
  },
  abschluss10: {
    title: "10 Abschlüsse, herzlichen Glückwunsch!",
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
