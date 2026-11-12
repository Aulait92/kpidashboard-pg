// Zusatzmodul „Empfehlungen & Bewertungen“ – reine Funktionen und Texte
// (auch im Browser nutzbar, ohne Datenbank; testbar).
//
// Ablauf (Ole, 12.11.2026):
//  1. Abschluss → nach X Tagen (Standard 7) bekommen ALLE dieselbe Nachricht: erst der
//     direkte Draht zum Vertreter, dann der Google-Link. Kein „Review Gating“: Es gibt
//     keine Vorab-Frage, die über den Link entscheidet.
//  2. Antworten wertet die KI aus. Kritik → Push + Aufgabe „Kunde unzufrieden – bitte
//     heute anrufen“, Empfehlungsanfrage gestoppt. Positiv → kurzer Dank (ohne Link).
//  3. Nach Y Tagen (Standard 21) die Bitte um Empfehlung – nicht bei Kritik oder offener
//     Aufgabe „unzufrieden“ (betrifft nur die Empfehlung, nicht Google).
//  4. „Nicht anfragen“ je Kontakt schaltet der Vertreter selbst – nie automatisch.

import { PRICE_LIST } from "@/lib/offer-pricing";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Livegang des Moduls: „Neu“-Markierung im Menü für 30 Tage. */
export const EMPFEHLUNG_LAUNCH = new Date("2026-11-12T00:00:00+01:00");
export const NEW_BADGE_DAYS = 30;
export function showNewBadge(now = new Date()): boolean {
  const t = now.getTime() - EMPFEHLUNG_LAUNCH.getTime();
  return t >= 0 && t < NEW_BADGE_DAYS * DAY_MS;
}

/** Hinweis-Stellen (je Kunde einmal wegklickbar). */
export const HINTS = {
  abschluss: "empf_abschluss",
  heute: "empf_heute",
  zahlen: "empf_zahlen",
  neu: "empf_neu",
} as const;
export type HintKey = (typeof HINTS)[keyof typeof HINTS];
export const HINT_KEYS: readonly string[] = Object.values(HINTS);

/** Ab so vielen Abschlüssen in 60 Tagen lohnt sich das Modul (Heute-Hinweis, Admin-Kandidaten). */
export const CANDIDATE_MIN_CLOSINGS = 3;
export const CANDIDATE_WINDOW_DAYS = 60;

export const ANNOUNCEMENT_KEY = "empfehlung-launch";

/** Aufgabe in „Heute“ bei Kritik (Wiedervorlage am Lead). */
export const UNHAPPY_TASK = "Kunde unzufrieden – bitte heute anrufen";
export const isUnhappyTask = (note: string | null | undefined) => !!note && note.startsWith(UNHAPPY_TASK);

export const DEFAULT_DELAYS = { review: 7, referral: 21 } as const;
export const DELAY_LIMITS = { min: 1, max: 120 } as const;

// ─── Texte ─────────────────────────────────────────────────────────────────
// Platzhalter: {Vorname}, {Link}, {Vertreter}. Eigene Texte gelten im offenen
// 24-h-Fenster (und für Antworten); sonst die bei Meta freigegebene Vorlage.

export const DEFAULT_TEXTS = {
  review:
    "Hallo {Vorname}, ich hoffe, Sie sind mit Ihrem neuen Vertrag gut versorgt. Wenn irgendetwas nicht gepasst hat, antworten Sie mir einfach direkt hier, ich kümmere mich persönlich darum. Und wenn Sie zufrieden waren, freue ich mich sehr über eine kurze Google-Bewertung: {Link} Herzliche Grüße, {Vertreter}",
  thanks: "Vielen Dank für Ihre Rückmeldung, {Vorname}! Das freut mich sehr. Wenn Sie etwas brauchen, schreiben Sie mir einfach hier. Herzliche Grüße, {Vertreter}",
  unhappy:
    "Danke, dass Sie mir das so offen schreiben, {Vorname}. Das möchte ich gern klären und melde mich heute noch persönlich bei Ihnen. Herzliche Grüße, {Vertreter}",
  referral:
    "Hallo {Vorname}, hier ist {Vertreter}. Kennen Sie jemanden, dem ich genauso weiterhelfen kann? Über Ihren persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen: {Link} Vielen Dank für Ihr Vertrauen!",
  // Bewusst ohne Namen und Details der empfohlenen Person (Datenschutz), ohne Prämie
  referralThanks:
    "Hallo {Vorname}, ich wollte mich noch einmal herzlich für Ihre Empfehlung bedanken. Ich konnte weiterhelfen. Das ist das schönste Lob für meine Arbeit! Herzliche Grüße, {Vertreter}",
} as const;
export type TextKey = keyof typeof DEFAULT_TEXTS;

export const TEXT_LABELS: Record<TextKey, { title: string; hint: string; needsLink: boolean }> = {
  review: {
    title: "Nachfrage nach dem Abschluss",
    hint: "Empfehlung: erst der direkte Draht zu Ihnen, dann der Google-Link. So landet Kritik bei Ihnen statt bei Google – und alle bekommen denselben Link.",
    needsLink: true,
  },
  thanks: { title: "Dank bei positiver Antwort", hint: "Ohne Link – der Google-Link stand schon in der ersten Nachricht.", needsLink: false },
  unhappy: { title: "Antwort bei Kritik", hint: "Kurz, ehrlich, mit Zusage, dass Sie sich melden. Sie bekommen zugleich eine Aufgabe in „Heute“.", needsLink: false },
  referral: { title: "Bitte um Empfehlung", hint: "Der Link führt zu einer Seite, auf der Ihr Kunde die Empfehlung teilen kann. Keine Prämien versprechen.", needsLink: true },
  referralThanks: {
    title: "Dank an den Empfehlenden",
    hint: "Geht automatisch raus, sobald aus einer Empfehlung ein Abschluss wird. Ohne Namen oder Details der empfohlenen Person und ohne Prämie.",
    needsLink: false,
  },
};

export const MAX_TEXT = 700;

export function renderText(text: string, vars: { vorname?: string | null; link?: string | null; vertreter: string }): string {
  return text
    .split("{Vorname}")
    .join(vars.vorname?.trim() || "")
    .split("{Link}")
    .join(vars.link ?? "")
    .split("{empfehlungslink}")
    .join(vars.link ?? "")
    .split("{Vertreter}")
    .join(vars.vertreter)
    .replace(/\s+,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Eigener Text gültig? (Länge, Link-Platzhalter, keine Prämien-Versprechen) */
export function validateText(key: TextKey, raw: string): string | null {
  const t = raw.trim();
  if (!t) return null; // leer = Standard
  if (t.length > MAX_TEXT) return `Bitte höchstens ${MAX_TEXT} Zeichen.`;
  if (TEXT_LABELS[key].needsLink && !t.includes("{Link}") && !t.includes("{empfehlungslink}")) return "Bitte den Platzhalter {Link} im Text lassen.";
  if (/(prämie|gutschein|belohnung|geschenk|bonus|euro|€)/i.test(t) && key !== "unhappy") {
    return "Bitte keine Prämien, Gutscheine oder Geschenke versprechen (Provisionsabgabeverbot, Google-Richtlinien).";
  }
  return null;
}

/** Google-Link: nur https (Bewertungs-Link aus dem Google-Unternehmensprofil). */
export function normalizeGoogleUrl(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function clampDelay(n: unknown, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(DELAY_LIMITS.max, Math.max(DELAY_LIMITS.min, v));
}

// ─── Antwort auswerten (Rückfall ohne KI) ───────────────────────────────────

export type Sentiment = "positive" | "negative" | "neutral";

const NEG = [
  /unzufrieden/i, /enttäusch/i, /\bschlecht/i, /\bärger/i, /beschwer/i, /\bproblem/i, /nicht (gut|zufrieden|in ordnung|ok|okay)/i,
  /\bkündig/i, /\bwiderruf/i, /\bfalsch/i, /\bfrech/i, /\bunverschämt/i, /\bnie wieder/i, /nicht erreich/i, /keine (antwort|rückmeldung)/i,
  /\bwarte (immer )?noch/i, /\bleider\b/i, /\bfehler/i, /\babzocke/i, /\bmies/i, /\bkatastroph/i, /\bnervt/i, /👎|😡|😠|😤/,
];
const POS = [/danke/i, /\bsuper\b/i, /\btop\b/i, /zufrieden/i, /\bgerne?\b/i, /\bperfekt/i, /\bklasse/i, /\bprima/i, /\btoll/i, /alles (gut|bestens|prima)/i, /👍|😊|🙂|😀|❤️|🙏/];

/** Einfache Einordnung ohne KI (Tests, fehlender API-Schlüssel). Im Zweifel nicht „positiv“. */
export function classifyHeuristic(text: string): Sentiment {
  const t = text.trim();
  if (!t) return "neutral";
  const neg = NEG.some((r) => r.test(t)) && !/nicht unzufrieden|kein problem/i.test(t);
  if (neg) return "negative";
  if (POS.some((r) => r.test(t)) && !/\?/.test(t)) return "positive";
  return "neutral";
}

// ─── Modulstand ─────────────────────────────────────────────────────────────

export type ModuleCustomer = {
  plan?: string | null;
  empfehlungEnabled: boolean;
  empfehlungMonthly: unknown;
  empfehlungTrialEndsAt: Date | null;
  empfehlungFree: boolean;
  empfehlungCancelAt: Date | null;
  empfehlungSince: Date | null;
};

export type ModuleState = "inactive" | "trial" | "active" | "free" | "cancelling";

export function moduleState(c: ModuleCustomer, now = new Date()): ModuleState {
  if (!c.empfehlungEnabled) return "inactive";
  if (c.empfehlungCancelAt) return "cancelling";
  if (c.empfehlungFree) return "free";
  if (c.empfehlungMonthly == null && c.empfehlungTrialEndsAt && c.empfehlungTrialEndsAt > now) return "trial";
  return "active";
}

/** Testphase nur einmal je Kunde (und nicht, wenn das Modul schon einmal lief). */
export const trialAvailable = (c: Pick<ModuleCustomer, "empfehlungTrialEndsAt" | "empfehlungSince">) => !c.empfehlungTrialEndsAt && !c.empfehlungSince;

export const trialEndFrom = (now: Date, days: number = PRICE_LIST.empfehlungTrialDays) => new Date(now.getTime() + days * DAY_MS);

/** Erinnerung so viele Tage vor Ende der Testphase. */
export const TRIAL_REMINDER_DAYS = 3;

export const fmtDate = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
export const eurNet = (n: number) => `${new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)} netto`;

/** Bedingungen für das Buchungsblatt (Text, der beim Buchen klar dasteht). */
export function bookingTerms(opts: { trial: boolean; annual: boolean; now?: Date }): { headline: string; lines: string[] } {
  const price = PRICE_LIST.empfehlungModuleMonthly;
  const now = opts.now ?? new Date();
  const lines: string[] = [];
  if (opts.trial) {
    lines.push(`${PRICE_LIST.empfehlungTrialDays} Tage kostenlos testen, bis zum ${fmtDate(trialEndFrom(now))}.`);
    lines.push(`Danach automatisch ${eurNet(price)} im Monat, außer Sie kündigen vorher. Wir erinnern Sie ${TRIAL_REMINDER_DAYS} Tage vor Ende der Testphase.`);
  } else {
    lines.push(`${eurNet(price)} im Monat, ab heute tagesgenau anteilig mit Ihrer nächsten Rechnung.`);
  }
  lines.push(
    opts.annual
      ? "Kündbar zum Ende des bezahlten Abrechnungsjahres, keine anteilige Erstattung."
      : "Monatlich kündbar zum Ende des Abrechnungsmonats, direkt hier im Kundenbereich.",
  );
  return { headline: opts.trial ? `${PRICE_LIST.empfehlungTrialDays} Tage kostenlos testen` : `${eurNet(price)} im Monat`, lines };
}

/** Text zum Weiterleiten auf der Seite des Empfehlenden. */
export function shareText(vertreter: string, link: string): string {
  return `Ich kann dir ${vertreter} sehr empfehlen – hat mich super beraten. Hier kannst du ganz einfach selbst Kontakt aufnehmen: ${link}`;
}

export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

// ─── Versandfenster und Empfehlungs-Sperren ─────────────────────────────────

function berlinClock(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { wd: p.weekday as string, hour: Number(p.hour) };
}
/** Versand an Endkunden nur Mo–Sa 9–19 Uhr. */
export function sendingWindow(now: Date): boolean {
  const { wd, hour } = berlinClock(now);
  return wd !== "Sun" && hour >= 9 && hour < 19;
}

/** Warum (noch) keine Bitte um Empfehlung? null = darf raus. */
export function referralBlocker(r: { status: string; sentiment: string | null }, lead: { status: string | null; followUpNote: string | null; erasedAt: Date | null }): { skip: string } | { wait: string } | null {
  if (lead.erasedAt || lead.status !== "Abschluss") return { skip: "Kein Abschluss mehr" };
  if (r.status === "off") return { skip: "Nicht anfragen" };
  if (r.sentiment === "negative") return { skip: "Kritik geäußert" };
  if (isUnhappyTask(lead.followUpNote)) return { wait: "Offene Aufgabe „unzufrieden“" };
  if (r.status !== "sent" && r.status !== "answered") return { wait: "Nachfrage noch nicht verschickt" };
  return null;
}

