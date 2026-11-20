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
import { FREE_PERIOD_REMINDER_DAYS } from "@/lib/free-periods";
import { a, anredeName, anredeZeile, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Modul „Empfehlungen & Bewertungen“ für Kunden buchbar und sichtbar? (Ole, 15.11.2026: vorerst aus, es fehlen
 * noch kritische Teile.) Aus heißt: nicht buchbar (Konto, Angebot, Halteangebot), keine Hinweise, Ankündigung,
 * Tipps oder Links. Kunden, bei denen das Modul schon aktiv ist, behalten es. Wieder an: true setzen.
 */
export const EMPFEHLUNG_MODULE_AVAILABLE = false;

/** Darf der Kunde das Modul sehen? (verfügbar oder bei ihm schon aktiv) */
export function empfehlungVisible(active: boolean): boolean {
  return EMPFEHLUNG_MODULE_AVAILABLE || active;
}

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

/** Bewertungs-Wächter auf der Modulseite: steht im Reiter „Teilen“ (Push, Heute-Karte). */
export const WAECHTER_HREF = "/buyer/empfehlungen?tab=teilen#bewertungen";
/** Liste „Heute fragen“ auf der Modulseite (Heute-Hinweis, Menü). */
export const HEUTE_FRAGEN_HREF = "/buyer/empfehlungen#heute-fragen";

/** Ab so vielen Abschlüssen in 60 Tagen lohnt sich das Modul (Heute-Hinweis, Admin-Kandidaten). */
export const CANDIDATE_MIN_CLOSINGS = 3;
export const CANDIDATE_WINDOW_DAYS = 60;

export const ANNOUNCEMENT_KEY = "empfehlung-launch";

/** Aufgabe in „Heute“ bei Kritik (Wiedervorlage am Lead). */
export const UNHAPPY_TASK = "Kunde unzufrieden, bitte heute anrufen";
export const isUnhappyTask = (note: string | null | undefined) => !!note && note.startsWith(UNHAPPY_TASK);

// Bewertungsbitte 14 Tage nach dem Abschluss (P7, Ole 17.11.2026; vorher 7), Empfehlung nach 21 Tagen
export const DEFAULT_DELAYS = { review: 14, referral: 21 } as const;
export const DELAY_LIMITS = { min: 1, max: 120 } as const;

// ─── Texte ─────────────────────────────────────────────────────────────────
// Platzhalter: {Anrede}, {Vorname}, {Link}, {Vertreter}, {Thema}. Eigene Texte gelten im offenen
// 24-h-Fenster (und für Antworten); sonst die bei Meta freigegebene Vorlage (bis Du-Fassungen eingereicht sind: Sie).
// Ansprache (Paket 1, 19.11.2026): nach Customer.leadAddress bzw. bei Bestandskunden Customer.bestandAddress,
// Standard „sie“ (lib/ansprache.ts). {Anrede} = „Guten Tag Frau Schneider“ bzw. „Hallo Julia“. Ältere eigene Texte
// mit „Hallo {Vorname},“ am Anfang bekommen dieselbe Anrede; {Vorname} mitten im Text wird zum Namen der Anrede.
// Jede Bewertungs- und Empfehlungsbitte und jeder Dank mit Link nennt STOPP (Widerspruch, UWG § 7 Abs. 3).

export const DEFAULT_TEXTS = {
  // Neutral (Anwalts-Memo 15.11.2026): an alle dieselbe Bitte um eine ehrliche Bewertung, nie um fünf Sterne, mit STOPP
  review:
    "{Anrede}, passt bei Ihrem neuen Vertrag alles? Wenn nicht, antworten Sie einfach hier, ich kümmere mich persönlich darum. Über eine ehrliche Bewertung bei Google freue ich mich: {Link} Keine Nachrichten mehr? Antworten Sie mit STOPP. Herzliche Grüße, {Vertreter}",
  thanks: "{Anrede}, vielen Dank für Ihre Rückmeldung! Das freut mich sehr. Wenn Sie etwas brauchen, schreiben Sie mir einfach hier. Herzliche Grüße, {Vertreter}",
  // Dank bei Lob MIT Empfehlungslink (Einstellung „bei Lob direkt um Empfehlung bitten“). Kein zweiter Google-Link.
  praiseReferral:
    "{Anrede}, vielen Dank, das freut mich wirklich! Wenn Ihnen jemand einfällt, dem ich genauso helfen kann, zum Beispiel aus der Familie oder dem Kollegenkreis: Leiten Sie einfach diesen Link weiter, die Person meldet sich dann selbst bei mir: {Link} Keine Nachrichten mehr? Antworten Sie mit STOPP. Herzliche Grüße, {Vertreter}",
  unhappy:
    "{Anrede}, danke, dass Sie mir das so offen schreiben. Das möchte ich gern klären und melde mich heute noch persönlich bei Ihnen. Herzliche Grüße, {Vertreter}",
  // Konkret statt „jemanden, dem ich weiterhelfen kann“: Thema des Abschlusses und Lebensereignisse als Anlass
  referral:
    "{Anrede}, hier ist {Vertreter}. Schön, dass das Thema {Thema} bei Ihnen jetzt gut geregelt ist. Wer in Ihrem Umfeld hat gerade ein neues Auto, ist umgezogen, hat Nachwuchs bekommen oder seine Verträge lange nicht angeschaut? Leiten Sie diesen Link einfach weiter, die Person meldet sich dann selbst bei mir: {Link} Danke für Ihr Vertrauen! Keine Nachrichten mehr? Antworten Sie mit STOPP.",
  // Bewusst ohne Namen, Stand oder Details der empfohlenen Person (Datenschutz), ohne Prämie
  referralThanks:
    "{Anrede}, danke, dass Sie mich weiterempfohlen haben. Das ist das schönste Lob für meine Arbeit. Ihr Link funktioniert weiterhin, falls Ihnen noch jemand einfällt: {Link} Keine Nachrichten mehr? Antworten Sie mit STOPP. Herzliche Grüße, {Vertreter}",
} as const;
export type TextKey = keyof typeof DEFAULT_TEXTS;

/** Dieselben Standardtexte für Kontakte, die geduzt werden (Customer.leadAddress bzw. bestandAddress = „du“). */
export const DEFAULT_TEXTS_DU: Record<TextKey, string> = {
  review:
    "{Anrede}, passt bei deinem neuen Vertrag alles? Wenn nicht, antworte einfach hier, ich kümmere mich persönlich darum. Über eine ehrliche Bewertung bei Google freue ich mich: {Link} Keine Nachrichten mehr? Antworte mit STOPP. Viele Grüße, {Vertreter}",
  thanks: "{Anrede}, vielen Dank für deine Rückmeldung! Das freut mich sehr. Wenn du etwas brauchst, schreib mir einfach hier. Viele Grüße, {Vertreter}",
  praiseReferral:
    "{Anrede}, vielen Dank, das freut mich wirklich! Wenn dir jemand einfällt, dem ich genauso helfen kann, zum Beispiel aus der Familie oder dem Kollegenkreis: Leite einfach diesen Link weiter, die Person meldet sich dann selbst bei mir: {Link} Keine Nachrichten mehr? Antworte mit STOPP. Viele Grüße, {Vertreter}",
  unhappy: "{Anrede}, danke, dass du mir das so offen schreibst. Das möchte ich gern klären und melde mich heute noch persönlich bei dir. Viele Grüße, {Vertreter}",
  referral:
    "{Anrede}, hier ist {Vertreter}. Schön, dass das Thema {Thema} bei dir jetzt gut geregelt ist. Wer in deinem Umfeld hat gerade ein neues Auto, ist umgezogen, hat Nachwuchs bekommen oder seine Verträge lange nicht angeschaut? Leite diesen Link einfach weiter, die Person meldet sich dann selbst bei mir: {Link} Danke für dein Vertrauen! Keine Nachrichten mehr? Antworte mit STOPP.",
  referralThanks:
    "{Anrede}, danke, dass du mich weiterempfohlen hast. Das ist das schönste Lob für meine Arbeit. Dein Link funktioniert weiterhin, falls dir noch jemand einfällt: {Link} Keine Nachrichten mehr? Antworte mit STOPP. Viele Grüße, {Vertreter}",
};

/** Standardtext je Ansprache. */
export const defaultText = (key: TextKey, an: Ansprache = "sie"): string => (an === "du" ? DEFAULT_TEXTS_DU[key] : DEFAULT_TEXTS[key]);

/**
 * Dank an Empfehlende ohne Link: wenn die Obergrenze der Empfehlungsbitten erreicht ist (REFERRAL_ASK_LIMIT). Fest,
 * damit nie ein eigener Text mit Link als erneute Bitte rausgeht.
 */
export const THANKS_NO_LINK: Record<Ansprache, string> = {
  sie: "{Anrede}, danke, dass Sie mich weiterempfohlen haben. Das ist das schönste Lob für meine Arbeit. Herzliche Grüße, {Vertreter}",
  du: "{Anrede}, danke, dass du mich weiterempfohlen hast. Das ist das schönste Lob für meine Arbeit. Viele Grüße, {Vertreter}",
};

// Einheitliche Begriffe (Paket 2, 19.11.2026): Bewertungsbitte, Empfehlungsbitte, Empfehlungslink, Lob/Kritik/Frage.
// Hinweise je ein Satz; Ausführliches steht in docs/hilfe.md.
export const TEXT_LABELS: Record<TextKey, { title: string; hint: string; needsLink: boolean }> = {
  review: {
    title: "Bewertungsbitte",
    hint: "Neutral um eine ehrliche Bewertung bitten, für alle gleich, nie um fünf Sterne; der Hinweis auf STOPP bleibt.",
    needsLink: true,
  },
  thanks: { title: "Dank bei Lob", hint: "Ohne Link, der Google-Link stand schon in der Bewertungsbitte.", needsLink: false },
  praiseReferral: {
    title: "Dank bei Lob mit Empfehlungslink",
    hint: "Ersetzt bei Lob den einfachen Dank und die spätere Empfehlungsbitte; der Hinweis auf STOPP bleibt.",
    needsLink: true,
  },
  unhappy: { title: "Antwort bei Kritik", hint: "Kurz und ehrlich, Sie bekommen zugleich die Aufgabe „Kunde anrufen“.", needsLink: false },
  referral: {
    title: "Empfehlungsbitte",
    hint: "{Thema} setzt das Thema des Abschlusses ein, keine Prämien versprechen; der Hinweis auf STOPP bleibt.",
    needsLink: true,
  },
  referralThanks: {
    title: "Dank an Empfehlende",
    hint: "Ohne Namen oder Details der empfohlenen Person, mit Link für weitere Empfehlungen und STOPP.",
    needsLink: true,
  },
};

export const MAX_TEXT = 700;

/**
 * Thema der Bitte um Empfehlung (Ole, 15.11.2026: konkret statt „jemanden, dem ich weiterhelfen kann“), aus dem
 * Produkt des Abschlusses bzw. der ersten Sparte des Bestandskunden. Für {{2}} der Vorlage referral_request.
 */
export function empfehlungsThema(source: string | null | undefined): string {
  const s = (source ?? "").trim();
  if (/\btkv\b|tier|katze|hund|pferd/i.test(s)) return "Tierversicherung";
  if (/zahn/i.test(s)) return "Zahnzusatzversicherung";
  if (/\bpkv\b|kranken|wechsel|tarifoptim/i.test(s)) return "Krankenversicherung";
  if (/privatschutz|haftpflicht|hausrat|rechtsschutz|wohngeb/i.test(s)) return "Privatschutz";
  if (/sterbegeld/i.test(s)) return "Sterbegeld";
  if (/kinderspar|sparplan/i.test(s)) return "Vorsorge für Kinder";
  if (!s || /bestandskunde|empfehlung/i.test(s) || s.length > 40) return "Absicherung";
  return s.replace(/\s*\(.*\)\s*$/, "");
}

/**
 * Thema in Texten, die Dritte sehen (Teilen-Text, Kontaktseite, Link-Vorschau): Gesundheitssparten verraten
 * Gesundheitsdaten (Art. 9 DSGVO) und werden neutral. In der Bitte an den Kunden selbst bleibt das Thema konkret.
 */
export const NEUTRAL_THEMA = "Versicherungen und Vorsorge";
const HEALTH_THEMA = /kranken|\bpkv\b|zahn|pflege|berufsunf|\bbu\b|erwerbsunf|grundf(ä|ae)hig|dread|\bleben\b|lebensvers|risikoleben|sterbegeld|gesundheit/i;
export function themaFuerDritte(thema: string | null | undefined): string {
  const t = (thema ?? "").trim();
  if (!t || HEALTH_THEMA.test(t)) return NEUTRAL_THEMA;
  return t;
}

export function renderText(
  text: string,
  vars: { vorname?: string | null; link?: string | null; vertreter: string; anrede?: AnredeKontakt | null; an?: Ansprache | null; thema?: string | null },
): string {
  // Ansprache des Kontakts (Standard Sie). Ohne Angaben zur Person: Anrede nur aus dem Vornamen („Guten Tag“ bzw. „Hallo Julia“)
  const an: Ansprache = vars.an === "du" ? "du" : "sie";
  const k: AnredeKontakt | null = vars.anrede ?? null;
  const gruss = anredeZeile(an, k ?? { firstName: vars.vorname }).replace(/,$/, "");
  const nameMitten = k ? (anredeName(an, k) ?? "") : vars.vorname?.trim() || "";
  return text
    .replace(/^\s*Hallo\s+\{Vorname\}\s*,?/, k ? "{Anrede}," : "$&")
    .split("{Anrede}")
    .join(gruss)
    .split("{Vorname}")
    .join(nameMitten)
    .split("{Link}")
    .join(vars.link ?? "")
    .split("{empfehlungslink}")
    .join(vars.link ?? "")
    .split("{Thema}")
    .join(vars.thema?.trim() || empfehlungsThema(null))
    .split("{Vertreter}")
    .join(vars.vertreter)
    .replace(/\s+,/g, ",")
    .replace(/,\s*([!.?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Bewertungsbitte gezielt positiv? (Review-Gating, Google-Richtlinien, UWG): „5 Sterne“, „gute/positive Bewertung“
 * oder die Bitte nur an Zufriedene.
 */
const GATED_REVIEW = /((5|fünf)\s*(\*|sterne|⭐)|⭐{2,}|(gute|positive|tolle|super)\s+(google-)?bewertung|wenn sie zufrieden (waren|sind)|wenn du zufrieden (warst|bist))/i;

/** Texte, die um etwas bitten und darum STOPP nennen müssen. */
export const STOPP_KEYS: readonly TextKey[] = ["review", "praiseReferral", "referral", "referralThanks"];

/** Eigener Text gültig? (Länge, Link-Platzhalter, keine Prämien-Versprechen, Bewertungsbitte neutral mit STOPP) */
export function validateText(key: TextKey, raw: string, opts: { rewardActive?: boolean } = {}): string | null {
  const t = raw.trim();
  if (!t) return null; // leer = Standard
  if (t.length > MAX_TEXT) return `Bitte höchstens ${MAX_TEXT} Zeichen.`;
  if (TEXT_LABELS[key].needsLink && !t.includes("{Link}") && !t.includes("{empfehlungslink}")) return "Bitte den Platzhalter {Link} im Text lassen.";
  // Die Nachfrage mit Google-Link bleibt immer frei von Anreizen (Google-Richtlinien)
  if (/(prämie|gutschein|belohnung|geschenk|bonus|euro|€)/i.test(t) && key !== "unhappy" && !(opts.rewardActive && key !== "review" && key !== "thanks")) {
    return "Bitte keine Prämien, Gutscheine oder Geschenke versprechen (Provisionsabgabeverbot, Google-Richtlinien).";
  }
  if (key === "review" && GATED_REVIEW.test(t)) return "Bitte neutral um eine ehrliche Bewertung bitten, nicht um fünf Sterne oder nur um gute Bewertungen.";
  // Widerspruch: jede Bitte (Bewertung, Empfehlung, Dank mit Link) nennt STOPP
  if (STOPP_KEYS.includes(key) && !/stopp/i.test(t)) return "Bitte den Hinweis auf „STOPP“ im Text lassen (z. B. „Keine Nachrichten mehr? Antworten Sie mit STOPP.“).";
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

/** Erinnerung so viele Tage vor Ende der Testphase (einheitlich für alle kostenlosen Zeiträume, AGB). */
export const TRIAL_REMINDER_DAYS = FREE_PERIOD_REMINDER_DAYS;

export const fmtDate = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
export const eurNet = (n: number) => `${new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)} netto`;

/** Bedingungen für das Buchungsblatt (Text, der beim Buchen klar dasteht). */
export function bookingTerms(opts: { trial: boolean; annual: boolean; now?: Date; prepayMonths?: number }): { headline: string; lines: string[] } {
  const price = PRICE_LIST.empfehlungModuleMonthly;
  const now = opts.now ?? new Date();
  const lines: string[] = [];
  if (opts.trial) {
    lines.push(`${PRICE_LIST.empfehlungTrialDays} Tage kostenlos testen, bis zum ${fmtDate(trialEndFrom(now))}.`);
    lines.push(`Danach automatisch ${eurNet(price)} im Monat, außer Sie beenden das Modul vorher. Während der Testphase jederzeit kostenlos beendbar.`);
    lines.push(`Wir erinnern Sie ${FREE_PERIOD_REMINDER_DAYS} Tage vor Ende der Testphase per E-Mail und im Kundenbereich.`);
  } else {
    lines.push(`${eurNet(price)} im Monat, ab heute tagesgenau anteilig mit Ihrer nächsten Rechnung.`);
  }
  lines.push(
    opts.annual
      ? `Kündbar zum Ende des bezahlten ${opts.prepayMonths === 6 ? "Zahlungszeitraums" : "Abrechnungsjahres"}, keine anteilige Erstattung.`
      : "Monatlich kündbar zum Ende des Abrechnungsmonats, direkt hier im Kundenbereich.",
  );
  return { headline: opts.trial ? `${PRICE_LIST.empfehlungTrialDays} Tage kostenlos testen` : `${eurNet(price)} im Monat`, lines };
}

/**
 * Text zum Weiterleiten auf der Seite des Empfehlenden (mit Empfehlungsangebot, falls eingestellt). Die Ansprache
 * wählt der Empfehlende selbst (Freunde und Familie: du, Kollegen und Nachbarn: Sie), Standard du. Bewusst ohne Thema
 * oder Sparte des Empfehlenden (keine Gesundheitsdaten an Dritte).
 */
export function shareText(vertreter: string, link: string, offer?: ResolvedOffer | null, an: Ansprache = "du"): string {
  if (an === "sie") {
    return offer
      ? `Ich kann Ihnen ${vertreter} sehr empfehlen, ich bin dort gut beraten. Über meinen Link bekommen Sie: ${offer.headline}. ${vertreter} meldet sich dann persönlich bei Ihnen: ${link}`
      : `Ich kann Ihnen ${vertreter} sehr empfehlen, ich bin dort gut beraten. Über meinen Link können Sie ganz einfach Kontakt aufnehmen, ${vertreter} meldet sich dann persönlich bei Ihnen: ${link}`;
  }
  return offer
    ? `Hey, ich bin bei ${vertreter} und richtig zufrieden. Falls du deine Versicherungen mal checken lassen willst, über meinen Link bekommst du: ${offer.headline}. ${vertreter} meldet sich dann persönlich bei dir: ${link}`
    : `Hey, ich bin bei ${vertreter} und richtig zufrieden. Falls du deine Versicherungen mal checken lassen willst: Über meinen Link kannst du ganz einfach Kontakt aufnehmen, ${vertreter} meldet sich dann persönlich bei dir: ${link}`;
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



// ─── Empfehlungsangebot (14.11.2026) ────────────────────────────────────────
// Die empfohlene Person bekommt einen klaren Grund, sich zu melden: einen kostenlosen
// Check statt „Kontakt aufnehmen“. Bewusst ohne Gutscheine, Prämien oder Sparzusagen
// (Provisionsabgabeverbot § 48b VAG, UWG) – das ließe sich erst nach rechtlicher Prüfung ergänzen.

export type OfferKind = "none" | "ordner" | "kfz" | "luecke" | "custom";
export const OFFER_KINDS: OfferKind[] = ["none", "ordner", "kfz", "luecke", "custom"];
/** Standard-Angebot (Ole, 14.11.2026): Versicherungs-Check über alle Verträge. */
export const DEFAULT_OFFER_KIND: OfferKind = "ordner";
export type ResolvedOffer = { kind: Exclude<OfferKind, "none">; headline: string; text: string; cta: string };

/** text = Sie-Fassung, du = Du-Fassung (Seite der empfohlenen Person). */
export const OFFER_PRESETS: Record<Exclude<OfferKind, "none" | "custom">, { label: string; headline: string; text: string; du: string; cta: string }> = {
  ordner: {
    label: "Versicherungs-Check (alle Verträge)",
    headline: "Kostenloser Versicherungs-Check",
    text: "{Vertreter} sieht Ihre bestehenden Verträge einmal in Ruhe durch und zeigt Ihnen, wo Sie doppelt versichert sind, wo etwas fehlt und wo sich Beitrag oder Leistung verbessern lassen. Kostenlos und unverbindlich.",
    du: "{Vertreter} sieht deine bestehenden Verträge einmal in Ruhe durch und zeigt dir, wo du doppelt versichert bist, wo etwas fehlt und wo sich Beitrag oder Leistung verbessern lassen. Kostenlos und unverbindlich.",
    cta: "Check anfragen",
  },
  kfz: {
    label: "Kfz-Check (ein Vertrag, schneller Einstieg)",
    headline: "Kostenloser Kfz-Check",
    text: "{Vertreter} prüft Ihre Kfz-Versicherung: Passt der Beitrag noch, stimmen die Leistungen? Sie bekommen eine klare Einschätzung, kostenlos und unverbindlich.",
    du: "{Vertreter} prüft deine Kfz-Versicherung: Passt der Beitrag noch, stimmen die Leistungen? Du bekommst eine klare Einschätzung, kostenlos und unverbindlich.",
    cta: "Kfz-Check anfragen",
  },
  luecke: {
    label: "Absicherungs-Check (Lücken sichtbar machen)",
    headline: "Kostenloser Absicherungs-Check",
    text: "In einem kurzen Gespräch zeigt Ihnen {Vertreter}, wie Sie bei Berufsunfähigkeit, im Alter und für Ihre Familie heute abgesichert sind und wo es Lücken gibt. Kostenlos und unverbindlich.",
    du: "In einem kurzen Gespräch zeigt dir {Vertreter}, wie du bei Berufsunfähigkeit, im Alter und für deine Familie heute abgesichert bist und wo es Lücken gibt. Kostenlos und unverbindlich.",
    cta: "Check anfragen",
  },
};

export const OFFER_LIMITS = { headline: 70, text: 320 } as const;
const PROMISE = /(prämie|gutschein|belohnung|geschenk|bonus|cashback|garantiert|garantie|\d\s?(euro|€)|€\s?\d)/i;
const INDEPENDENT = /(unabhängig|aller? anbieter|gesamte[rn]? markt|marktvergleich)/i;

/** Eigenes Angebot gültig? Keine Prämien, Gutscheine, Beträge oder Garantien. */
export function validateOffer(kind: string, headline: string, text: string): string | null {
  if (!OFFER_KINDS.includes(kind as OfferKind)) return "Bitte ein Angebot wählen.";
  if (kind !== "custom") return null;
  const h = headline.trim();
  const t = text.trim();
  if (!h || !t) return "Bitte Überschrift und Text für Ihr eigenes Angebot ausfüllen.";
  if (h.length > OFFER_LIMITS.headline) return `Überschrift: bitte höchstens ${OFFER_LIMITS.headline} Zeichen.`;
  if (t.length > OFFER_LIMITS.text) return `Text: bitte höchstens ${OFFER_LIMITS.text} Zeichen.`;
  if (PROMISE.test(h) || PROMISE.test(t)) return "Bitte keine Prämien, Gutscheine, Geldbeträge oder Garantien im Angebot (Provisionsabgabeverbot, Wettbewerbsrecht).";
  return null;
}

/** Hinweis (kein Fehler): „unabhängig“/„alle Anbieter“ passt nicht für gebundene Vertreter. */
export function offerWarning(headline: string, text: string, vermittlerTyp: string | null | undefined): string | null {
  if (vermittlerTyp === "makler") return null;
  return INDEPENDENT.test(`${headline} ${text}`) ? "Als gebundener Vertreter bitte nicht mit „unabhängig“ oder „Vergleich aller Anbieter“ werben." : null;
}

/** Angebot für Seiten und Teilen-Text. null = kein Angebot („Kontakt aufnehmen“). Nicht gesetzt = Standard-Angebot. */
export function resolveOffer(s: { offerKind: string | null | undefined; offerHeadline?: string | null; offerText?: string | null }, vertreter: string, an: Ansprache = "sie"): ResolvedOffer | null {
  const kind = (s.offerKind ?? DEFAULT_OFFER_KIND) as OfferKind;
  if (kind === "none" || !OFFER_KINDS.includes(kind)) return null;
  if (kind === "custom") {
    const headline = (s.offerHeadline ?? "").trim();
    const text = (s.offerText ?? "").trim();
    if (!headline || !text || validateOffer("custom", headline, text)) return null;
    return { kind, headline, text: text.split("{Vertreter}").join(vertreter), cta: "Jetzt anfragen" };
  }
  const p = OFFER_PRESETS[kind];
  return { kind, headline: p.headline, text: (an === "du" ? p.du : p.text).split("{Vertreter}").join(vertreter), cta: p.cta };
}

// ─── Anlässe: Empfehlungslink im besten Moment senden ───────────────────────
// Der beste Moment ist selten der Abschluss, sondern der erste spürbare Beweis:
// geregelter Schaden, gesparter Beitrag, gutes Jahresgespräch.

export type Occasion = "schaden" | "ersparnis" | "jahresgespraech";
/** text = Sie-Fassung (auch für ältere Aufrufer), du = Du-Fassung. Beide mit STOPP-Hinweis. */
export const OCCASIONS: Record<Occasion, { label: string; text: string; du: string }> = {
  schaden: {
    label: "Schaden geregelt",
    text: "{Anrede}, schön, dass wir Ihren Schaden gut regeln konnten. Kennen Sie jemanden, der sich so einen Ansprechpartner auch wünscht? Leiten Sie einfach diesen Link weiter, die Person meldet sich dann selbst bei mir: {Link} Keine Nachrichten mehr? Antworten Sie mit STOPP. Herzliche Grüße, {Vertreter}",
    du: "{Anrede}, schön, dass wir deinen Schaden gut regeln konnten. Kennst du jemanden, der sich so einen Ansprechpartner auch wünscht? Leite einfach diesen Link weiter, die Person meldet sich dann selbst bei mir: {Link} Keine Nachrichten mehr? Antworte mit STOPP. Viele Grüße, {Vertreter}",
  },
  ersparnis: {
    label: "Beitrag gespart / besser abgesichert",
    text: "{Anrede}, schön, dass wir bei Ihren Verträgen etwas verbessern konnten. Kennen Sie jemanden, bei dem ich genauso draufschauen soll? Leiten Sie einfach diesen Link weiter, die Person meldet sich dann selbst bei mir: {Link} Keine Nachrichten mehr? Antworten Sie mit STOPP. Herzliche Grüße, {Vertreter}",
    du: "{Anrede}, schön, dass wir bei deinen Verträgen etwas verbessern konnten. Kennst du jemanden, bei dem ich genauso draufschauen soll? Leite einfach diesen Link weiter, die Person meldet sich dann selbst bei mir: {Link} Keine Nachrichten mehr? Antworte mit STOPP. Viele Grüße, {Vertreter}",
  },
  jahresgespraech: {
    label: "Nach dem Jahresgespräch",
    text: "{Anrede}, danke für das gute Gespräch. Hier ist Ihr persönlicher Link: Leiten Sie ihn einfach an Freunde, Familie oder Kollegen weiter, die Person meldet sich dann selbst bei mir: {Link} Keine Nachrichten mehr? Antworten Sie mit STOPP. Herzliche Grüße, {Vertreter}",
    du: "{Anrede}, danke für das gute Gespräch. Hier ist dein persönlicher Link: Leite ihn einfach an Freunde, Familie oder Kollegen weiter, die Person meldet sich dann selbst bei mir: {Link} Keine Nachrichten mehr? Antworte mit STOPP. Viele Grüße, {Vertreter}",
  },
};
/** Text eines Anlasses je Ansprache. */
export const occasionText = (o: Occasion, an: Ansprache = "sie"): string => (an === "du" ? OCCASIONS[o].du : OCCASIONS[o].text);
export const isOccasion = (v: unknown): v is Occasion => typeof v === "string" && v in OCCASIONS;

/** Automatisch nach einem Termin: höchstens so oft je Kontakt. */
export const APPOINTMENT_REFERRAL_GAP_DAYS = 180;

// ─── WhatsApp-Knopf auf der Empfehlungsseite ────────────────────────────────
// Die empfohlene Person tippt einmal: Die Anfrage ist vorgeschrieben und geht an die
// WhatsApp-Nummer des Vertreters. Der kurze Code am Ende ordnet sie dem Empfehlungslink zu.

export const REF_CODE_LEN = 8;
export const refCodeOf = (token: string) => token.slice(0, REF_CODE_LEN);
const REF_RE = /\(Ref ([\w-]{8})\)/;
export function parseRefCode(body: string | null | undefined): string | null {
  return REF_RE.exec(body ?? "")?.[1] ?? null;
}
export function whatsappRequestText(o: { vertreter: string; recommender: string | null; offer: ResolvedOffer | null; token: string }): string {
  const from = o.recommender ? ` von ${o.recommender}` : "";
  const what = o.offer ? `interessiere mich für: ${o.offer.headline}` : "würde gern mit Ihnen sprechen";
  return `Hallo ${o.vertreter}, ich komme auf Empfehlung${from} und ${what}. (Ref ${refCodeOf(o.token)})`;
}
export function whatsappLink(number: string, text: string): string | null {
  const digits = number.replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

// ─── Nachfassen nach „Empfehlungslink senden“ ───────────────────────────────

export const FOLLOWUP_TASK = "Empfehlung nachfassen";
export const DEFAULT_FOLLOWUP_HOURS = 48;
export const FOLLOWUP_LIMITS = { min: 0, max: 336 } as const;
export const isFollowUpTask = (note: string | null | undefined) => !!note && note.startsWith(FOLLOWUP_TASK);
/** Aufgabe für den Vermittler (Sie-Form) mit dem Satz für den Anruf in der Ansprache des Kunden. */
export function followUpNote(vorname: string | null | undefined, an: Ansprache = "sie"): string {
  const n = vorname?.trim();
  const satz = an === "du" ? "„Hast du schon an jemanden gedacht? Zum Beispiel Kollegen oder jemand mit neuem Auto?“" : "„Haben Sie schon an jemanden gedacht? Zum Beispiel Kollegen oder jemand mit neuem Auto?“";
  return `${FOLLOWUP_TASK}: ${n || "Ihren Kunden"} anrufen. Satz: ${satz}`;
}
export function clampFollowUp(n: unknown, fallback: number = DEFAULT_FOLLOWUP_HOURS): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(FOLLOWUP_LIMITS.max, Math.max(FOLLOWUP_LIMITS.min, v));
}

// ─── Rückmeldung an Empfehlende ─────────────────────────────────────────────
// Nur, wenn die empfohlene Person auf der Empfehlungsseite eingewilligt hat. Ohne Details
// zum Anliegen, ohne Prämie. Abschluss: wie bisher der Dank (referralThanks).

export type UpdateStage = "gemeldet" | "termin";
/** Zeile der Rückmeldung. Die Vorlage referral_update ({{2}}) gibt es nur in Sie: dort ohne an aufrufen. */
export function statusUpdateLine(stage: UpdateStage, referredFirstName: string | null | undefined, an: Ansprache = "sie"): string {
  const n = referredFirstName?.trim();
  const dein = an === "du" ? "deinen" : "Ihren";
  if (stage === "termin") return n ? `Mit ${n} habe ich inzwischen einen Termin vereinbart.` : "Wir haben inzwischen einen Termin vereinbart.";
  return n ? `${n} hat sich über ${dein} Link bei mir gemeldet.` : `Über ${dein} Link hat sich jemand bei mir gemeldet.`;
}
export function statusUpdateText(stage: UpdateStage, vars: { vorname?: string | null; referred?: string | null; vertreter: string; anrede?: AnredeKontakt | null; an?: Ansprache | null }): string {
  const an: Ansprache = vars.an === "du" ? "du" : "sie";
  const text =
    an === "du"
      ? "{Anrede}, kurze Rückmeldung zu deiner Empfehlung: " + statusUpdateLine(stage, vars.referred, an) + " Vielen Dank, dass du an mich gedacht hast! Viele Grüße, {Vertreter}"
      : "{Anrede}, kurze Rückmeldung zu Ihrer Empfehlung: " + statusUpdateLine(stage, vars.referred, an) + " Vielen Dank, dass Sie an mich gedacht haben! Herzliche Grüße, {Vertreter}";
  return renderText(text, { vorname: vars.vorname, vertreter: vars.vertreter, anrede: vars.anrede, an });
}
/**
 * Zusätzliche, freiwillige Einwilligung der empfohlenen Person (eigenes, nie vorausgefülltes Häkchen, Ich-Form).
 * Deckt die Rückmeldung „gemeldet“, „Termin“ und den Dank an den Empfehlenden, sobald sie Kunde wurde.
 */
export function statusConsentText(recommender: string | null, vertreter: string): string {
  return `${recommender ?? "Die Person, die mich empfohlen hat,"} darf von ${vertreter} erfahren, ob ich mich gemeldet habe, einen Termin hatte und Kunde wurde (nur mein Vorname, keine Details). Freiwillig.`;
}

// ─── Allgemeiner Link: E-Mail-Signatur ──────────────────────────────────────

export function signatureLine(link: string, offer: ResolvedOffer | null, an: Ansprache = "sie"): string {
  const frage = an === "du" ? "PS: Kennst du jemanden, der seine Versicherungen mal prüfen lassen möchte?" : "PS: Kennen Sie jemanden, der seine Versicherungen mal prüfen lassen möchte?";
  return offer ? `${frage} Über diesen Link bekommt er: ${offer.headline}. ${link}` : `${frage} Über diesen Link kann er mich ganz einfach erreichen: ${link}`;
}

// ─── Trichter mit Diagnose ──────────────────────────────────────────────────

export type Funnel = { linksSent: number; linksOpened: number; visitors: number; leads: number; closings: number };
export type FunnelHint = { stage: "start" | "oeffnen" | "teilen" | "eintragen" | "abschluss" | "ok"; title: string; text: string };

/**
 * Wo steckt das meiste Potenzial? Erst ab einer Mindestmenge urteilen (sonst Zufall).
 * Reihenfolge = Reihenfolge im Trichter; der erste auffällige Übergang gewinnt.
 */
export function funnelHint(f: Funnel): FunnelHint {
  if (f.linksSent < 5) {
    return {
      stage: "start",
      title: "Größter Hebel: öfter fragen",
      text: "Senden Sie heute 3 Kunden unter „Heute um Empfehlung bitten“ ihren Link.",
    };
  }
  if (f.linksOpened / f.linksSent < 0.4) {
    return {
      stage: "oeffnen",
      title: "Tipp: die Seite direkt im Termin zeigen",
      text: "Zeigen Sie den QR-Code im Termin und lassen Sie den Kunden gleich dort teilen.",
    };
  }
  if (f.linksOpened >= 5 && f.visitors / f.linksOpened < 0.5) {
    return {
      stage: "teilen",
      title: "Tipp: einen konkreten Anlass zum Weiterleiten nennen",
      text: "Nennen Sie einen konkreten Anlass („Wer hat gerade ein neues Auto?“) und fassen Sie nach zwei Tagen nach.",
    };
  }
  if (f.visitors >= 10 && f.leads / f.visitors < 0.1) {
    return {
      stage: "eintragen",
      title: "Tipp: ein klares Angebot für Empfohlene",
      text: "Wählen Sie in den Einstellungen ein konkretes Angebot für Empfohlene, z. B. den Versicherungs-Check.",
    };
  }
  if (f.leads >= 5 && f.closings / f.leads < 0.3) {
    return {
      stage: "abschluss",
      title: "Tipp: Empfohlene am selben Tag anrufen",
      text: "Rufen Sie Empfohlene am selben Tag an und beginnen Sie mit dem Namen: „Herr Müller hat mir erzählt, dass …“",
    };
  }
  return { stage: "ok", title: "Läuft gut", text: "Mehr Empfehlungslinks senden bringt jetzt am meisten." };
}

// ─── Einwilligung in Nachfrage, Bewertungs- und Empfehlungsbitte (15.11.2026) ───
// Eine Bewertungs- oder Empfehlungsbitte ist Werbung (BGH VI ZR 225/17) und geht per WhatsApp nur mit Einwilligung.
// Der Vermittler holt sie im Gespräch ein und bestätigt sie je Kontakt in der App; gespeichert mit Zeitpunkt und Wortlaut.

/**
 * Wortlaut der Einwilligung (gespeichert mit Zeitpunkt und Quelle „vermittler“ in Lead.feedbackConsentText). Seit
 * 19.11.2026 mit „gelegentlich, höchstens 3-mal im Jahr“: deckt bis zu REFERRAL_ASK_LIMIT Empfehlungsbitten in 365 Tagen.
 */
export const FEEDBACK_CONSENT_TEXT =
  "Der Kunde ist einverstanden, dass ich ihn per WhatsApp nach dem Abschluss frage, ob alles gepasst hat, und ihn um eine ehrliche Google-Bewertung sowie gelegentlich (höchstens 3-mal im Jahr) um eine Empfehlung bitte. Widerspruch jederzeit mit STOPP.";
/** Wortlaut bis 18.11.2026 („einmal“): deckt genau eine Empfehlungsbitte. */
export const FEEDBACK_CONSENT_TEXT_V1 =
  "Der Kunde ist einverstanden, dass ich ihn nach dem Abschluss per WhatsApp frage, ob alles gepasst hat, und ihn einmal um eine ehrliche Google-Bewertung und um eine Empfehlung bitte. Er kann jederzeit mit STOPP widersprechen.";
/** Beschriftung des Häkchens in der App (Vermittler, Sie-Form). */
export const FEEDBACK_CONSENT_LABEL = "Kunde hat zugestimmt: Nachfrage, ehrliche Google-Bewertung, gelegentlich Empfehlungsbitte (STOPP jederzeit)";
/** Satz zum Vorlesen im Gespräch, in der Ansprache des Kunden. */
export function feedbackConsentQuestion(an: Ansprache = "sie"): string {
  return an === "du"
    ? "Ist es okay, wenn ich dir nach dem Abschluss per WhatsApp kurz schreibe, ob alles gepasst hat, und dich um eine ehrliche Google-Bewertung und gelegentlich, höchstens 3-mal im Jahr, um eine Empfehlung bitte? Mit STOPP kannst du jederzeit widersprechen."
    : "Ist es in Ordnung, wenn ich Ihnen nach dem Abschluss per WhatsApp kurz schreibe, ob alles gepasst hat, und Sie um eine ehrliche Google-Bewertung und gelegentlich, höchstens 3-mal im Jahr, um eine Empfehlung bitte? Mit STOPP können Sie jederzeit widersprechen.";
}

// ─── Obergrenze der Empfehlungsbitten (R3, 19.11.2026) ─────────────────────
// Über alle Wege zusammen (automatisch nach X Tagen, bei Lob, nach Termin, „Link senden“, Dank mit Link,
// Bestandskunden-Kampagnen): höchstens 3 Empfehlungsbitten in 365 Tagen je Person. Eine Einwilligung mit dem alten
// Wortlaut („einmal“) deckt nur eine Bitte. Gezählt wird über das Änderungsprotokoll (lib/empfehlung/requests.ts).
export const REFERRAL_ASK_LIMIT = 3;
export const REFERRAL_ASK_WINDOW_DAYS = 365;
export const REFERRAL_LIMIT_ERROR = `Obergrenze erreicht: höchstens ${REFERRAL_ASK_LIMIT} Empfehlungsbitten im Jahr je Kunde.`;
export const REFERRAL_LEGACY_ERROR = "Die Einwilligung dieses Kunden deckt nur eine Empfehlungsbitte. Für weitere bitte im Gespräch neu zustimmen lassen.";

/**
 * Darf noch eine Empfehlungsbitte raus? asks = Zeitpunkte bisheriger Bitten an diese Person. consent = Einwilligung
 * des Kontakts (Lead); null bei Bestandskunden (deren Einwilligung prüft das Bestandsmodul), dann nur die Obergrenze.
 */
export function referralAskAllowed(
  asks: Date[],
  now: Date,
  consent: { at: Date | null; text: string | null } | null,
): { ok: true } | { ok: false; error: string } {
  const since = now.getTime() - REFERRAL_ASK_WINDOW_DAYS * DAY_MS;
  if (asks.filter((d) => d.getTime() > since).length >= REFERRAL_ASK_LIMIT) return { ok: false, error: REFERRAL_LIMIT_ERROR };
  if (consent?.at && consent.text !== FEEDBACK_CONSENT_TEXT) {
    const at = consent.at.getTime();
    if (asks.some((d) => d.getTime() >= at)) return { ok: false, error: REFERRAL_LEGACY_ERROR };
  }
  return { ok: true };
}

/** Hinweis, wenn ohne Einwilligung nichts verschickt werden darf (Rückgabe von „Link senden“). */
export const NO_CONSENT_ERROR = "Ohne Zustimmung des Kunden geht keine Nachricht raus. Tippen Sie „Kunde hat zugestimmt“ oder zeigen Sie den QR-Code im Termin.";

/** Darf die automatische Nachfrage bzw. Bitte raus? */
export function feedbackAllowed(l: { feedbackConsentAt: Date | null; feedbackOptOutAt: Date | null }): boolean {
  return !!l.feedbackConsentAt && !l.feedbackOptOutAt;
}

/** Quelle der Bewertungen, die wir anzeigen (§ 5b Abs. 3 UWG). */
export const REVIEW_SOURCE_NOTE = "Bewertungen stammen von Google, keine eigene Echtheitsprüfung.";

// ─── Dankeschön für Empfehlende (Tippgeber-Vergütung) ───────────────────────
// Standardmäßig aus. Rechtlicher Rahmen (Anwalts-Memo 15.11.2026, keine Rechtsberatung):
//  • § 48b VAG gilt für Versicherer und Vermittler, das Dankeschön wird dem Vermittler zugerechnet.
//  • Geringwertig: bis 15 € je Versicherungsverhältnis und Kalenderjahr. Bis zur anwaltlichen Klärung zählen wir
//    streng: höchstens 15 € je EMPFEHLER und Kalenderjahr (Europe/Berlin), über alle seine Empfehlungen zusammen.
//  • Kein Bargeld (nur Gutschein oder Spende), nie für die empfohlene Person, nicht an einen Abschluss gekoppelt
//    (fällig, sobald ein Gespräch stattgefunden hat), keine Schein-Empfehlungen (Selbstempfehlung: nichts).
// Ausgezahlt wird von Hand (Aufgabe in der App); die App merkt sich je Dankeschön den Betrag
// (Lead.referralRewardAmount) und vergibt keins mehr, wenn die Jahresgrenze überschritten würde (Status „jahresgrenze“).

export type RewardKind = "none" | "gutschein" | "spende";
/** Nur noch „termin“ (Gespräch fand statt). „abschluss“ gab es bis 15.11.2026 und gilt jetzt als „termin“. */
export type RewardTrigger = "termin";
export const REWARD_KINDS: RewardKind[] = ["none", "gutschein", "spende"];
/** Harte Obergrenze je Empfehler und Kalenderjahr (€). */
export const REWARD_SAFE_LIMIT = 15;
export const REWARD_LIMITS = { min: 1, max: REWARD_SAFE_LIMIT, note: 60 } as const;
/** Bargeld bzw. Geldüberweisung ist ausgeschlossen. */
const CASH = /(^|[^a-zäöüß])(bar|bargeld|cash|geld|überweisung|ueberweisung|paypal|auszahlung)($|[^a-zäöüß])/i;
/** Bei „Abschluss“: frühestens so viele Tage danach übergeben (Widerrufsfrist). */
export const REWARD_WAIT_DAYS = 30;
export const REWARD_TASK = "Dankeschön für Empfehlung übergeben";
export const isRewardTask = (note: string | null | undefined) => !!note && note.startsWith(REWARD_TASK);

export type RewardSettings = { rewardKind: string | null | undefined; rewardAmount: number | null | undefined; rewardNote?: string | null; rewardTrigger?: string | null };
export type ResolvedReward = { kind: Exclude<RewardKind, "none">; amount: number; note: string; trigger: RewardTrigger };

export function resolveReward(s: RewardSettings): ResolvedReward | null {
  const kind = (s.rewardKind ?? "none") as RewardKind;
  const amount = Math.round(Number(s.rewardAmount));
  if (kind === "none" || !REWARD_KINDS.includes(kind) || !Number.isFinite(amount) || amount < REWARD_LIMITS.min || amount > REWARD_LIMITS.max) return null;
  const note = (s.rewardNote ?? "").trim();
  if (kind === "spende" && !note) return null;
  return { kind, amount, note, trigger: "termin" };
}

export function validateReward(kind: string, amountRaw: unknown, note: string, confirmed: boolean): string | null {
  if (!REWARD_KINDS.includes(kind as RewardKind)) return "Bitte eine Art wählen.";
  if (kind === "none") return null;
  const amount = Math.round(Number(amountRaw));
  if (!Number.isFinite(amount) || amount < REWARD_LIMITS.min || amount > REWARD_LIMITS.max)
    return `Bitte einen Wert zwischen ${REWARD_LIMITS.min} und ${REWARD_LIMITS.max} € eingeben (höchstens ${REWARD_SAFE_LIMIT} € je Empfehler und Kalenderjahr).`;
  if (note.trim().length > REWARD_LIMITS.note) return `Bitte höchstens ${REWARD_LIMITS.note} Zeichen.`;
  if (kind === "spende" && !note.trim()) return "Bitte angeben, an wen die Spende geht.";
  if (CASH.test(note)) return "Bitte kein Bargeld und keine Geldüberweisung, sondern einen Gutschein oder eine Spende.";
  if (!confirmed) return "Bitte bestätigen Sie, dass Sie die Zulässigkeit für sich geprüft haben.";
  return null;
}

/** Hinweis bei einem Wert über der Grenze (wird beim Speichern ohnehin abgelehnt). */
export function rewardWarning(kind: string, amountRaw: unknown): string | null {
  const amount = Math.round(Number(amountRaw));
  if (kind === "none" || !Number.isFinite(amount) || amount <= REWARD_SAFE_LIMIT) return null;
  return `Höchstens ${REWARD_SAFE_LIMIT} € je Empfehler und Kalenderjahr (§ 48b VAG). Die App zählt alle Dankeschöns eines Empfehlers im Jahr zusammen.`;
}

/** Kalenderjahr in Berlin (für die Jahresgrenze). */
export function berlinYear(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric" }).format(d));
}

/**
 * Jahresgrenze je Empfehler: bisher in diesem Kalenderjahr vorgemerkte bzw. übergebene Beträge (used) plus das
 * neue Dankeschön dürfen höchstens REWARD_SAFE_LIMIT ergeben. Kein Teilbetrag: angekündigt ist ein fester Wert.
 */
export function rewardWithinLimit(used: number, amount: number): boolean {
  return amount > 0 && used + amount <= REWARD_SAFE_LIMIT;
}

const eurInt = (n: number) => `${n} €`;
/** Was bekommt der Empfehlende? (für die Liste und Aufgaben des Vertreters) */
export function rewardLabel(r: ResolvedReward): string {
  return r.kind === "spende" ? `Spende über ${eurInt(r.amount)} an ${r.note}` : `${r.note || "Gutschein"} über ${eurInt(r.amount)}`;
}
/** Satz auf der Seite des Empfehlenden (vorher angekündigt, nicht als Überraschung). */
export function rewardSentence(r: ResolvedReward, vertreter: string, an: Ansprache = "sie"): string {
  const when = an === "du" ? "Kommt ein Gespräch mit deiner Empfehlung zustande" : "Kommt ein Gespräch mit Ihrer Empfehlung zustande";
  const limit = ` Insgesamt höchstens ${eurInt(REWARD_SAFE_LIMIT)} im Kalenderjahr, unabhängig von einem Vertragsabschluss.`;
  return r.kind === "spende"
    ? `${when}, spendet ${vertreter} als Dankeschön ${eurInt(r.amount)} an ${r.note}.${limit}`
    : `${when}, bedankt sich ${vertreter} bei ${an === "du" ? "dir" : "Ihnen"} mit ${r.note ? `einem ${r.note}` : "einem Gutschein"} über ${eurInt(r.amount)}.${limit}`;
}
export function rewardTaskNote(r: ResolvedReward, recommender: string | null | undefined): string {
  return `${REWARD_TASK}: ${rewardLabel(r)}${recommender?.trim() ? ` für ${recommender.trim()}` : ""}.`;
}
/** Selbe Nummer wie der Empfehlende = Selbstempfehlung → kein Dankeschön. */
export function isSelfReferral(recommenderPhone: string | null | undefined, referredPhone: string | null | undefined): boolean {
  const d = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").replace(/^(00)?49/, "").replace(/^0/, "");
  const a = d(recommenderPhone);
  return a.length >= 6 && a === d(referredPhone);
}

// ─── Heute fragen (Paket 2, 19.11.2026) ─────────────────────────────────────
// Arbeitsliste auf der Modulseite: Kunden, die gerade bereit für eine Empfehlung sind, mit Grund. Nur mit Einwilligung,
// ohne STOPP, ohne Kritik oder offene Aufgabe „unzufrieden“, nicht „Nicht anfragen“, nicht kürzlich gefragt und unter
// der Obergrenze (R3). Kontakte ohne Einwilligung kommen in eine eigene Liste („Einwilligung fehlt“): dort nur
// „Kunde hat zugestimmt“ oder der QR-Code im Termin, nie ein Versand.

/** Abschluss so lange her: guter Moment für die Empfehlungsbitte. */
export const CANDIDATE_MIN_CLOSED_DAYS = 21;
/** Ältere Abschlüsse zählen nicht mehr als Grund. */
export const CANDIDATE_MAX_AGE_DAYS = 365;
/** Termin so kürzlich stattgefunden: Grund „Termin gestern“. */
export const CANDIDATE_APPOINTMENT_DAYS = 14;
/** So lange nach der letzten Empfehlungsbitte (oder dem QR-Code) taucht der Kunde nicht wieder auf. */
export const CANDIDATE_ASK_GAP_DAYS = 90;
/** Sichtbare Zeilen, Rest hinter „Alle anzeigen“. */
export const HEUTE_VISIBLE = 5;
/** Modulkosten für 90 Tage (Vergleich in der Wert-Zeile). */
export const MODULE_COST_90 = PRICE_LIST.empfehlungModuleMonthly * 3;

export type CandidateReason = "lob" | "google" | "termin" | "abschluss";
const REASON_ORDER: CandidateReason[] = ["lob", "google", "termin", "abschluss"];

export type CandidateInput = {
  id: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
  closedAt: Date | null;
  followUpNote: string | null;
  feedbackConsentAt: Date | null;
  feedbackConsentText: string | null;
  feedbackOptOutAt: Date | null;
  /** Verknüpfter Bestandskunde mit STOPP oder Sperre */
  bestandBlocked: boolean;
  review: { status: string; sentiment: string | null; googleClicks: number; googleClickAt: Date | null; answeredAt: Date | null } | null;
  lastAppointmentAt: Date | null;
  /** Empfehlungsbitten an diese Person (Protokoll, automatische Bitte) */
  asks: Date[];
  /** Zuletzt Link gesendet oder QR-Code gezeigt */
  lastLinkAt: Date | null;
};

export type Candidate = {
  id: string;
  name: string;
  reason: CandidateReason | null;
  /** „Hat gestern gelobt“, „Abschluss vor 24 Tagen“ */
  reasonText: string;
  thema: string;
  consent: boolean;
  /** Anlass für den Text: nach einem Termin „Nach dem Jahresgespräch“, sonst die normale Empfehlungsbitte */
  occasion: Occasion | null;
  at: number;
};

/** „heute“, „gestern“, „vor 5 Tagen“ (Kalendertage in Berlin). */
export function relDays(at: Date, now: Date): string {
  const d = Math.round((Date.parse(berlinYmdOf(now)) - Date.parse(berlinYmdOf(at))) / DAY_MS);
  return d <= 0 ? "heute" : d === 1 ? "gestern" : `vor ${d} Tagen`;
}
function berlinYmdOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d) + "T00:00:00Z";
}

/** Bester Grund für eine Empfehlungsbitte, null = gerade kein guter Moment. */
export function candidateReason(c: CandidateInput, now: Date): { reason: CandidateReason; text: string; at: number } | null {
  const r = c.review;
  if (r?.sentiment === "positive") {
    const at = r.answeredAt ?? now;
    return { reason: "lob", text: r.answeredAt ? `Hat ${relDays(r.answeredAt, now)} gelobt` : "Hat gelobt", at: at.getTime() };
  }
  if (r && r.googleClicks > 0) {
    return { reason: "google", text: r.googleClickAt ? `Wollte ${relDays(r.googleClickAt, now)} bei Google bewerten` : "Wollte bei Google bewerten", at: (r.googleClickAt ?? now).getTime() };
  }
  if (c.lastAppointmentAt && now.getTime() - c.lastAppointmentAt.getTime() <= CANDIDATE_APPOINTMENT_DAYS * DAY_MS && c.lastAppointmentAt.getTime() <= now.getTime()) {
    return { reason: "termin", text: `Termin ${relDays(c.lastAppointmentAt, now)}`, at: c.lastAppointmentAt.getTime() };
  }
  if (c.status === "Abschluss" && c.closedAt) {
    const age = now.getTime() - c.closedAt.getTime();
    if (age >= CANDIDATE_MIN_CLOSED_DAYS * DAY_MS && age <= CANDIDATE_MAX_AGE_DAYS * DAY_MS) return { reason: "abschluss", text: `Abschluss ${relDays(c.closedAt, now)}`, at: c.closedAt.getTime() };
  }
  return null;
}

/** Nie fragen: STOPP, Sperre, „Nicht anfragen“, Kritik, offene Aufgabe „unzufrieden“, keine Handynummer. */
export function candidateExcluded(c: CandidateInput): boolean {
  return !c.phone || !!c.feedbackOptOutAt || c.bestandBlocked || c.review?.status === "off" || c.review?.sentiment === "negative" || isUnhappyTask(c.followUpNote);
}

/**
 * Liste „Heute fragen“ (ready) und „Einwilligung fehlt“ (noConsent). ready: nur mit Einwilligung, mit Grund, nicht in
 * den letzten 90 Tagen gefragt und unter der Obergrenze. noConsent: Abschlüsse ohne Einwilligung (Grund optional).
 */
export function pickReferralCandidates(rows: CandidateInput[], now: Date): { ready: Candidate[]; noConsent: Candidate[] } {
  const ready: Candidate[] = [];
  const noConsent: Candidate[] = [];
  for (const c of rows) {
    if (candidateExcluded(c)) continue;
    const reason = candidateReason(c, now);
    const base = { id: c.id, name: c.name?.trim() || "Kontakt", thema: empfehlungsThema(c.source) };
    if (!feedbackAllowed(c)) {
      if (c.status !== "Abschluss") continue;
      const closed = c.closedAt ? `Abschluss ${relDays(c.closedAt, now)}` : "Abschluss";
      noConsent.push({ ...base, reason: reason?.reason ?? null, reasonText: reason?.text ?? closed, consent: false, occasion: null, at: c.closedAt?.getTime() ?? 0 });
      continue;
    }
    if (!reason) continue;
    const last = Math.max(c.lastLinkAt?.getTime() ?? 0, ...c.asks.map((d) => d.getTime()));
    if (last && now.getTime() - last < CANDIDATE_ASK_GAP_DAYS * DAY_MS) continue;
    if (!referralAskAllowed(c.asks, now, { at: c.feedbackConsentAt, text: c.feedbackConsentText }).ok) continue;
    ready.push({ ...base, reason: reason.reason, reasonText: reason.text, consent: true, occasion: reason.reason === "termin" ? "jahresgespraech" : null, at: reason.at });
  }
  ready.sort((a, b) => REASON_ORDER.indexOf(a.reason!) - REASON_ORDER.indexOf(b.reason!) || b.at - a.at);
  noConsent.sort((a, b) => b.at - a.at);
  return { ready, noConsent };
}

/** Wert-Zeile: Vielfaches der Modulkosten (nur wenn größer 1, eine Nachkommastelle). */
export function costMultiple(provision: number, cost: number = MODULE_COST_90): string | null {
  if (cost <= 0 || provision <= cost) return null;
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(Math.floor((provision / cost) * 10) / 10)}-Fache`;
}

// ─── Öffentliche Seiten, Sofort-Anruf, Dank-Schleife (Paket 3, 20.11.2026) ───
// Texte an Empfehlende und Empfohlene in Du und Sie, ohne Gedankenstriche. Die Ansprache der Kontaktseite wählt der
// Empfehlende beim Teilen („An wen?“): Der Link trägt dann ?an=du. Ohne Angabe: Sie.

/** Ansprache aus der Adresse (?an=du), sonst Sie. */
export const anFromParam = (v: unknown): Ansprache => (v === "du" ? "du" : "sie");

/** Link zur Kontaktseite in der gewählten Ansprache (Du mit ?an=du, Sie ohne Zusatz). */
export const contactLinkIn = (link: string, an: Ansprache): string => (an === "du" ? `${link}${link.includes("?") ? "&" : "?"}an=du` : link);

/** Auswahl „An wen?“ auf der Seite des Empfehlenden. Standard: Freunde oder Familie (du). */
export const SHARE_AUDIENCES: readonly { an: Ansprache; label: string; hint: string }[] = [
  { an: "du", label: "Freunde oder Familie", hint: "per Du" },
  { an: "sie", label: "Kollegen oder Nachbarn", hint: "per Sie" },
];

/** Einleitung der Teilen-Seite: ein Satz, mit dem Grundsatz „keine Daten von anderen weitergeben“. */
export function shareIntro(an: Ansprache): string {
  return a(
    an,
    "Schick die Nachricht an jemanden, der gerade an Versicherungen denkt. Die Person meldet sich selbst, du gibst keine Daten weiter.",
    "Schicken Sie die Nachricht an jemanden, der gerade an Versicherungen denkt. Die Person meldet sich selbst, Sie geben keine Daten weiter.",
  );
}

/**
 * Einwilligung der empfohlenen Person als Satz direkt über dem Knopf, vor dem Absenden lesbar („Absenden = Einwilligung“). Enthält alle
 * Pflichtangaben: wer ({Vertreter}), Kanäle, Zweck, Widerruf; der Link zur Datenschutzerklärung steht dahinter.
 * Gespeichert wird genau dieser Wortlaut mit Zeitstempel (submitReferral).
 */
export function contactConsentText(vertreter: string, an: Ansprache): string {
  return a(
    an,
    `Mit dem Absenden bittest du ${vertreter}, dich per Telefon, WhatsApp oder E-Mail zu deiner Anfrage zu kontaktieren. Widerruf jederzeit möglich.`,
    `Mit dem Absenden bitten Sie ${vertreter}, Sie per Telefon, WhatsApp oder E-Mail zu Ihrer Anfrage zu kontaktieren. Widerruf jederzeit möglich.`,
  );
}

/**
 * Kopf der Kontaktseite: ein kurzer Satz plus „Kostenlos und unverbindlich“. Wer empfohlen hat, steht darüber
 * („Empfohlen von …“), das Angebot in der Überschrift. Der lange Angebotstext entfällt hier (390 px: Knopf ohne Scrollen).
 */
export function contactIntro(vertreter: string, an: Ansprache): string {
  return a(an, `Nummer hinterlassen, ${vertreter} ruft dich an. Kostenlos und unverbindlich.`, `Nummer hinterlassen, ${vertreter} ruft Sie an. Kostenlos und unverbindlich.`);
}

/** Hinweis beim WhatsApp-Knopf: Die Person nimmt selbst Kontakt auf (Datenschutzlink dahinter). */
export const whatsappSelfNote = (vertreter: string, an: Ansprache): string =>
  a(an, `Die Nachricht ist vorgeschrieben. Damit nimmst du selbst Kontakt zu ${vertreter} auf.`, `Die Nachricht ist vorgeschrieben. Damit nehmen Sie selbst Kontakt zu ${vertreter} auf.`);

/** Fehlermeldungen der Kontaktseite. */
export function contactErrors(an: Ansprache): Record<string, string> {
  return {
    name: a(an, "Bitte gib deinen Namen an.", "Bitte geben Sie Ihren Namen an."),
    phone: a(an, "Bitte prüf deine Handynummer.", "Bitte prüfen Sie Ihre Handynummer."),
    email: a(an, "Bitte prüf die E-Mail-Adresse.", "Bitte prüfen Sie die E-Mail-Adresse."),
    consent: a(an, "Bitte sende die Anfrage noch einmal ab.", "Bitte senden Sie die Anfrage noch einmal ab."),
    busy: a(an, "Über diesen Link kamen heute schon viele Anfragen. Bitte versuch es morgen noch einmal.", "Über diesen Link kamen heute schon viele Anfragen. Bitte versuchen Sie es morgen noch einmal."),
    unavailable: "Dieser Link ist nicht mehr aktiv.",
    invalid: a(an, "Das hat nicht geklappt. Bitte versuch es noch einmal.", "Das hat nicht geklappt. Bitte versuchen Sie es noch einmal."),
  };
}

/** Erfolgsseite: Überschrift und Satz zur Nummer des Vermittlers (ohne Zusage, wann angerufen wird). */
export function contactSuccess(vertreter: string, an: Ansprache, withPhone: boolean): { title: string; text: string } {
  return {
    title: a(an, "Danke, deine Anfrage ist angekommen!", "Danke, Ihre Anfrage ist angekommen!"),
    text: withPhone
      ? a(an, `${vertreter} meldet sich persönlich bei dir. Speicher die Nummer, dann erkennst du den Anruf:`, `${vertreter} meldet sich persönlich bei Ihnen. Speichern Sie die Nummer, dann erkennen Sie den Anruf:`)
      : a(an, `${vertreter} meldet sich persönlich bei dir.`, `${vertreter} meldet sich persönlich bei Ihnen.`),
  };
}

/** Kontaktkarte (vCard 3.0) des Vermittlers für „Nummer speichern“. Werte werden nach RFC 6350 maskiert. */
export function advisorVcard(o: { name: string; phone: string; org?: string | null; note?: string | null }): string {
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const tel = telValue(o.phone);
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(o.name)}`,
    `N:${esc(o.name)};;;;`,
    ...(o.org && o.org !== o.name ? [`ORG:${esc(o.org)}`] : []),
    `TEL;TYPE=CELL,VOICE:${tel}`,
    ...(o.note ? [`NOTE:${esc(o.note)}`] : []),
    "END:VCARD",
    "",
  ].join("\r\n");
}

/** Anzeige einer Nummer: Ziffern mit Ländervorwahl (+49 …) bzw. freier Text aus der Erstinformation. */
export function displayAdvisorPhone(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (v.replace(/\D/g, "").length < 6) return null;
  if (/^\d+$/.test(v)) {
    const cc = ["49", "43", "41"].find((c) => v.startsWith(c));
    return cc ? `+${cc} ${v.slice(cc.length, cc.length + 3)} ${v.slice(cc.length + 3)}` : `+${v}`;
  }
  return v;
}

/** Wählbare Nummer: „+49…“ bzw. reine Ziffern mit Ländervorwahl (WhatsApp) mit +, „0711 …“ als Ziffern. */
export function telValue(raw: string): string {
  const t = raw.trim();
  const d = t.replace(/\D/g, "");
  return t.startsWith("+") || (/^\d+$/.test(t) && !t.startsWith("0")) ? `+${d}` : d;
}
export const telHref = (raw: string): string => `tel:${telValue(raw)}`;

// Sofort-Anruf beim Vermittler (Sie-Form): Push und Zeile oben auf „Heute“. Keine Nummern im Push.
export const EMPFEHLUNG_PUSH_TAG = "empfehlung-lead";

/** Gesprächseinstieg für den ersten Anruf bei einer empfohlenen Person. */
export function gespraechsEinstieg(recommender: string | null | undefined): string {
  const n = firstName(recommender);
  return n ? `„${n} hat mir erzählt, dass …“` : "„Sie haben über meinen Empfehlungslink angefragt …“";
}

/** Push an den Vermittler, sobald sich eine empfohlene Person einträgt (ohne Telefonnummer, ohne Details). */
export function empfehlungPush(leadId: string, recommender: string | null | undefined): { title: string; body: string; tag: string; url: string } {
  const n = firstName(recommender);
  return {
    title: n ? `Empfehlung von ${n}: jetzt anrufen` : "Neue Empfehlung: jetzt anrufen",
    body: `Einstieg: ${gespraechsEinstieg(recommender)}`,
    tag: `${EMPFEHLUNG_PUSH_TAG}:${leadId}`,
    url: `/buyer/leads/${leadId}`,
  };
}

/** Grund in der Zeile auf „Heute“. */
export const empfehlungReason = (recommender: string | null | undefined): string => {
  const n = firstName(recommender);
  return n ? `Empfehlung von ${n}` : "Empfehlung";
};

/**
 * Nachfassen 48 h nach dem Dank mit Link: Anruf-Aufgabe für den Vermittler (Sie-Form) mit Gesprächssatz in der
 * Ansprache des Kunden. Keine zweite Nachricht.
 */
export function thanksFollowUpNote(vorname: string | null | undefined, an: Ansprache = "sie"): string {
  const n = vorname?.trim();
  const satz = a(an, "„Danke noch mal für deine Empfehlung! Fällt dir noch jemand ein, dem ich genauso helfen kann?“", "„Danke noch mal für Ihre Empfehlung! Fällt Ihnen noch jemand ein, dem ich genauso helfen kann?“");
  return `${FOLLOWUP_TASK}: ${n || "Ihren Kunden"} anrufen. Satz: ${satz}`;
}

/** Median in Stunden (für „Zeit bis zum ersten Anruf“); null ohne Werte. */
export function medianHours(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** „unter 1 Std.“, „3 Std.“, „2 Tage“ für die Auswertung. */
export function fmtHours(h: number | null): string {
  if (h == null) return "noch keine Werte";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} Min.`;
  if (h < 48) return `${Math.round(h)} Std.`;
  return `${Math.round(h / 24)} Tage`;
}
