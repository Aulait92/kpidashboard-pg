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
  // Dank bei Lob MIT Empfehlungslink (Einstellung „bei Lob direkt um Empfehlung bitten“). Kein zweiter Google-Link.
  praiseReferral:
    "Vielen Dank für Ihre Rückmeldung, {Vorname}! Das freut mich sehr. Falls Sie jemanden kennen, dem ich genauso weiterhelfen kann: Über Ihren persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen: {Link} Herzliche Grüße, {Vertreter}",
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
  praiseReferral: {
    title: "Dank bei Lob mit Empfehlungslink",
    hint: "Geht statt des einfachen Danks raus, wenn „bei Lob direkt um Empfehlung bitten“ an ist. Die spätere Bitte um Empfehlung entfällt dann.",
    needsLink: true,
  },
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
export function validateText(key: TextKey, raw: string, opts: { rewardActive?: boolean } = {}): string | null {
  const t = raw.trim();
  if (!t) return null; // leer = Standard
  if (t.length > MAX_TEXT) return `Bitte höchstens ${MAX_TEXT} Zeichen.`;
  if (TEXT_LABELS[key].needsLink && !t.includes("{Link}") && !t.includes("{empfehlungslink}")) return "Bitte den Platzhalter {Link} im Text lassen.";
  // Die Nachfrage mit Google-Link bleibt immer frei von Anreizen (Google-Richtlinien)
  if (/(prämie|gutschein|belohnung|geschenk|bonus|euro|€)/i.test(t) && key !== "unhappy" && !(opts.rewardActive && key !== "review" && key !== "thanks")) {
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

/** Text zum Weiterleiten auf der Seite des Empfehlenden (mit Empfehlungsangebot, falls eingestellt). */
export function shareText(vertreter: string, link: string, offer?: ResolvedOffer | null): string {
  if (offer) return `Ich kann dir ${vertreter} sehr empfehlen – hat mich super beraten. Über meinen Link bekommst du: ${offer.headline}. Einfach hier eintragen: ${link}`;
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



// ─── Empfehlungsangebot (14.11.2026) ────────────────────────────────────────
// Die empfohlene Person bekommt einen klaren Grund, sich zu melden: einen kostenlosen
// Check statt „Kontakt aufnehmen“. Bewusst ohne Gutscheine, Prämien oder Sparzusagen
// (Provisionsabgabeverbot § 48b VAG, UWG) – das ließe sich erst nach rechtlicher Prüfung ergänzen.

export type OfferKind = "none" | "ordner" | "kfz" | "luecke" | "custom";
export const OFFER_KINDS: OfferKind[] = ["none", "ordner", "kfz", "luecke", "custom"];
/** Standard-Angebot (Ole, 14.11.2026): Versicherungs-Check über alle Verträge. */
export const DEFAULT_OFFER_KIND: OfferKind = "ordner";
export type ResolvedOffer = { kind: Exclude<OfferKind, "none">; headline: string; text: string; cta: string };

export const OFFER_PRESETS: Record<Exclude<OfferKind, "none" | "custom">, { label: string; headline: string; text: string; cta: string }> = {
  ordner: {
    label: "Versicherungs-Check (alle Verträge)",
    headline: "Kostenloser Versicherungs-Check",
    text: "{Vertreter} sieht Ihre bestehenden Verträge einmal in Ruhe durch und zeigt Ihnen, wo Sie doppelt versichert sind, wo etwas fehlt und wo sich Beitrag oder Leistung verbessern lassen. Kostenlos und unverbindlich.",
    cta: "Check anfragen",
  },
  kfz: {
    label: "Kfz-Check (ein Vertrag, schneller Einstieg)",
    headline: "Kostenloser Kfz-Check",
    text: "{Vertreter} prüft Ihre Kfz-Versicherung: Passt der Beitrag noch, stimmen die Leistungen? Sie bekommen eine klare Einschätzung – kostenlos und unverbindlich.",
    cta: "Kfz-Check anfragen",
  },
  luecke: {
    label: "Absicherungs-Check (Lücken sichtbar machen)",
    headline: "Kostenloser Absicherungs-Check",
    text: "In einem kurzen Gespräch zeigt Ihnen {Vertreter}, wie Sie bei Berufsunfähigkeit, im Alter und für Ihre Familie heute abgesichert sind – und wo es Lücken gibt. Kostenlos und unverbindlich.",
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
export function resolveOffer(s: { offerKind: string | null | undefined; offerHeadline?: string | null; offerText?: string | null }, vertreter: string): ResolvedOffer | null {
  const kind = (s.offerKind ?? DEFAULT_OFFER_KIND) as OfferKind;
  if (kind === "none" || !OFFER_KINDS.includes(kind)) return null;
  if (kind === "custom") {
    const headline = (s.offerHeadline ?? "").trim();
    const text = (s.offerText ?? "").trim();
    if (!headline || !text || validateOffer("custom", headline, text)) return null;
    return { kind, headline, text: text.split("{Vertreter}").join(vertreter), cta: "Jetzt anfragen" };
  }
  const p = OFFER_PRESETS[kind];
  return { kind, headline: p.headline, text: p.text.split("{Vertreter}").join(vertreter), cta: p.cta };
}

// ─── Anlässe: Empfehlungslink im besten Moment senden ───────────────────────
// Der beste Moment ist selten der Abschluss, sondern der erste spürbare Beweis:
// geregelter Schaden, gesparter Beitrag, gutes Jahresgespräch.

export type Occasion = "schaden" | "ersparnis" | "jahresgespraech";
export const OCCASIONS: Record<Occasion, { label: string; text: string }> = {
  schaden: {
    label: "Schaden geregelt",
    text: "Hallo {Vorname}, schön, dass wir Ihren Schaden gut regeln konnten. Falls Sie jemanden kennen, der sich so einen Ansprechpartner auch wünscht: Über Ihren persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen: {Link} Herzliche Grüße, {Vertreter}",
  },
  ersparnis: {
    label: "Beitrag gespart / besser abgesichert",
    text: "Hallo {Vorname}, schön, dass wir bei Ihren Verträgen etwas verbessern konnten. Falls Sie jemanden kennen, bei dem ich genauso draufschauen soll: Über Ihren persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen: {Link} Herzliche Grüße, {Vertreter}",
  },
  jahresgespraech: {
    label: "Nach dem Jahresgespräch",
    text: "Hallo {Vorname}, danke für das gute Gespräch. Wie besprochen hier Ihr persönlicher Link: Darüber können Freunde, Familie oder Kollegen ganz einfach selbst Kontakt mit mir aufnehmen: {Link} Herzliche Grüße, {Vertreter}",
  },
};
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
export function followUpNote(vorname: string | null | undefined): string {
  const n = vorname?.trim();
  return `${FOLLOWUP_TASK}: Hat ${n || "Ihr Kunde"} den Link weitergeleitet? Kurz nachfragen und erzählen, ob sich schon jemand gemeldet hat.`;
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
export function statusUpdateLine(stage: UpdateStage, referredFirstName: string | null | undefined): string {
  const n = referredFirstName?.trim();
  if (stage === "termin") return n ? `Mit ${n} habe ich inzwischen einen Termin vereinbart.` : "Wir haben inzwischen einen Termin vereinbart.";
  return n ? `${n} hat sich über Ihren Link bei mir gemeldet.` : "Über Ihren Link hat sich jemand bei mir gemeldet.";
}
export function statusUpdateText(stage: UpdateStage, vars: { vorname?: string | null; referred?: string | null; vertreter: string }): string {
  return renderText("Hallo {Vorname}, kurze Rückmeldung zu Ihrer Empfehlung: " + statusUpdateLine(stage, vars.referred) + " Vielen Dank, dass Sie an mich gedacht haben! Herzliche Grüße, {Vertreter}", {
    vorname: vars.vorname,
    vertreter: vars.vertreter,
  });
}
/** Zusätzliche, freiwillige Einwilligung der empfohlenen Person. */
export function statusConsentText(recommender: string | null, vertreter: string): string {
  return `${recommender ?? "Die Person, die mich empfohlen hat,"} darf von ${vertreter} erfahren, dass ich mich gemeldet habe und ob ein Termin zustande gekommen ist (mit meinem Vornamen, ohne Details zu meinem Anliegen). Freiwillig.`;
}

// ─── Allgemeiner Link: E-Mail-Signatur ──────────────────────────────────────

export function signatureLine(link: string, offer: ResolvedOffer | null): string {
  return offer
    ? `PS: Sie waren zufrieden? Über diesen Link bekommen Freunde und Familie von mir: ${offer.headline}. ${link}`
    : `PS: Sie waren zufrieden? Über diesen Link können Sie mich ganz einfach weiterempfehlen: ${link}`;
}

// ─── Trichter mit Diagnose ──────────────────────────────────────────────────

export type Funnel = { linksSent: number; linksOpened: number; visitors: number; leads: number; closings: number };
export type FunnelHint = { stage: "start" | "oeffnen" | "teilen" | "eintragen" | "abschluss" | "ok"; title: string; text: string };

/**
 * Wo geht am meisten verloren? Erst ab einer Mindestmenge urteilen (sonst Zufall).
 * Reihenfolge = Reihenfolge im Trichter; der erste auffällige Übergang gewinnt.
 */
export function funnelHint(f: Funnel): FunnelHint {
  if (f.linksSent < 5) {
    return {
      stage: "start",
      title: "Noch zu wenige Links unterwegs",
      text: "Unter 5 Empfehlungslinks in diesem Zeitraum. Der größte Hebel ist, überhaupt zu fragen: nach jedem guten Gespräch den Link senden oder den QR-Code zeigen.",
    };
  }
  if (f.linksOpened / f.linksSent < 0.4) {
    return {
      stage: "oeffnen",
      title: "Viele Kunden öffnen ihren Link nicht",
      text: "Zeigen Sie die Seite direkt im Termin (QR-Code im Kontakt) und lassen Sie den Kunden gleich dort teilen. Was nicht sofort passiert, passiert meist gar nicht.",
    };
  }
  if (f.linksOpened >= 5 && f.visitors / f.linksOpened < 0.5) {
    return {
      stage: "teilen",
      title: "Der Link wird geöffnet, aber selten weitergeleitet",
      text: "Nennen Sie im Gespräch einen konkreten Anlass („Wer aus Ihrem Umfeld hat seine Verträge lange nicht angeschaut?“) und fassen Sie nach zwei Tagen nach.",
    };
  }
  if (f.visitors >= 10 && f.leads / f.visitors < 0.1) {
    return {
      stage: "eintragen",
      title: "Besucher tragen sich nicht ein",
      text: "Das Angebot für Empfohlene überzeugt noch nicht. Wählen Sie in den Einstellungen ein konkretes Empfehlungsangebot, z. B. den Kfz-Check oder den Versicherungs-Check.",
    };
  }
  if (f.leads >= 5 && f.closings / f.leads < 0.3) {
    return {
      stage: "abschluss",
      title: "Aus Empfehlungen werden zu selten Kunden",
      text: "Empfohlene am selben Tag anrufen und den Namen des Empfehlenden nennen. Prüfen Sie auch, ob das Angebot zu Ihren Sparten passt.",
    };
  }
  return { stage: "ok", title: "Der Trichter läuft rund", text: "Kein Übergang fällt auf. Mehr Links ausgeben bringt jetzt am meisten." };
}

// ─── Dankeschön für Empfehlende (Tippgeber-Vergütung) ───────────────────────
// Standardmäßig aus. Rechtlicher Rahmen (Stand 11/2026, keine Rechtsberatung):
//  • § 48b VAG verbietet Sondervergütungen an Versicherungsnehmer; Tippgeber sind laut BaFin im
//    Regelfall nicht erfasst. Ist der Tippgeber zugleich Kunde, ist die Zahlung trotzdem daran zu messen.
//  • Geringwertig und damit unkritisch: bis 15 € je Versicherungsverhältnis und Kalenderjahr.
//  • Nie für die empfohlene Person, nie für einen eigenen Vertrag, keine Schein-Empfehlungen.
// Deshalb: Vertreter bestätigt die Prüfung, über 15 € gibt es einen deutlichen Hinweis,
// Selbstempfehlungen bekommen kein Dankeschön, ausgezahlt wird von Hand (Aufgabe in der App).

export type RewardKind = "none" | "gutschein" | "spende";
export type RewardTrigger = "termin" | "abschluss";
export const REWARD_KINDS: RewardKind[] = ["none", "gutschein", "spende"];
export const REWARD_SAFE_LIMIT = 15;
export const REWARD_LIMITS = { min: 1, max: 500, note: 60 } as const;
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
  return { kind, amount, note, trigger: s.rewardTrigger === "abschluss" ? "abschluss" : "termin" };
}

export function validateReward(kind: string, amountRaw: unknown, note: string, confirmed: boolean): string | null {
  if (!REWARD_KINDS.includes(kind as RewardKind)) return "Bitte eine Art wählen.";
  if (kind === "none") return null;
  const amount = Math.round(Number(amountRaw));
  if (!Number.isFinite(amount) || amount < REWARD_LIMITS.min || amount > REWARD_LIMITS.max) return `Bitte einen Wert zwischen ${REWARD_LIMITS.min} und ${REWARD_LIMITS.max} € eingeben.`;
  if (note.trim().length > REWARD_LIMITS.note) return `Bitte höchstens ${REWARD_LIMITS.note} Zeichen.`;
  if (kind === "spende" && !note.trim()) return "Bitte angeben, an wen die Spende geht.";
  if (!confirmed) return "Bitte bestätigen Sie, dass Sie die Zulässigkeit für sich geprüft haben.";
  return null;
}

/** Hinweis über der Geringwertigkeitsgrenze (kein Fehler). */
export function rewardWarning(kind: string, amountRaw: unknown): string | null {
  const amount = Math.round(Number(amountRaw));
  if (kind === "none" || !Number.isFinite(amount) || amount <= REWARD_SAFE_LIMIT) return null;
  return `Über ${REWARD_SAFE_LIMIT} € ist das nur als Vergütung für den Tipp zulässig, nicht als Vorteil für einen eigenen Vertrag. Empfiehlt ein Bestandskunde, ist die Rechtslage nicht eindeutig: bitte mit Ihrem Versicherer oder Ihrer Rechtsberatung klären. Bis ${REWARD_SAFE_LIMIT} € im Jahr sind Sie auf der sicheren Seite.`;
}

const eurInt = (n: number) => `${n} €`;
/** Was bekommt der Empfehlende? (für die Liste und Aufgaben des Vertreters) */
export function rewardLabel(r: ResolvedReward): string {
  return r.kind === "spende" ? `Spende über ${eurInt(r.amount)} an ${r.note}` : `${r.note || "Gutschein"} über ${eurInt(r.amount)}`;
}
/** Satz auf der Seite des Empfehlenden (vorher angekündigt, nicht als Überraschung). */
export function rewardSentence(r: ResolvedReward, vertreter: string): string {
  const when = r.trigger === "abschluss" ? "Wird aus Ihrer Empfehlung ein Kunde" : "Kommt ein Gespräch mit Ihrer Empfehlung zustande";
  return r.kind === "spende"
    ? `${when}, spendet ${vertreter} als Dankeschön ${eurInt(r.amount)} an ${r.note}.`
    : `${when}, bedankt sich ${vertreter} bei Ihnen mit ${r.note ? `einem ${r.note}` : "einem Gutschein"} über ${eurInt(r.amount)}.`;
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
