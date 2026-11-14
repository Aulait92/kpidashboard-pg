// Drosselung für Bestandskampagnen per E-Mail (Ole, 14.11.2026): persönliche Einzelmails über das Postfach
// des Vermittlers, langsam verteilt, damit das Postfach nicht als Spam-Quelle auffällt. Rein und getestet;
// der Zustand liegt am Postfach (MailConnection.campaign*).
//
//   Zeitfenster: werktags (Mo–Fr) 8 bis 18 Uhr Berliner Zeit
//   Tageslimit je Anbieter: Gmail privat 150 (Vorgabe ca. 100 bis 400), Google Workspace 1.000 (bis 1.500),
//                           Outlook privat 100, Microsoft 365 300, SMTP 200 (konservativ)
//   Zufallsabstände: nach jeder Mail 3 bis 9 Minuten Pause, je Lauf (Cron alle 5 Min.) höchstens 3 Mails
//   Bei Fehlern bzw. Bounces: Stufe hoch (Tageslimit halbiert sich je Stufe), nach 3 Fehlern in Folge oder
//   mehr als 5 % Bounces (ab 20 Mails) Pause; dann warnen (Vermittler und Ole). Nach 2 Tagen ohne Probleme
//   geht die Stufe wieder um eins runter.

import type { MailProvider } from "@/lib/mail/postfach";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const PRIVATE_GOOGLE = /@(gmail|googlemail)\.com$/i;
const PRIVATE_MICROSOFT = /@(outlook|hotmail|live|msn)\.[a-z.]+$/i;

/** Grundlimit je Tag nach Anbieter und Adresse. */
export function providerDailyLimit(provider: MailProvider | string, email: string): number {
  if (provider === "google") return PRIVATE_GOOGLE.test(email) ? 150 : 1000;
  if (provider === "microsoft") return PRIVATE_MICROSOFT.test(email) ? 100 : 300;
  return 200;
}

export const MAX_BACKOFF = 4;
/** Höchstens so viele Mails je Cron-Lauf und Postfach. */
export const MAX_PER_RUN = 3;

/** Tageslimit mit Drosselstufe: halbiert sich je Stufe, mindestens 10. */
export function effectiveDailyLimit(base: number, backoff: number): number {
  return Math.max(10, Math.floor(base / 2 ** Math.max(0, Math.min(MAX_BACKOFF, backoff))));
}

function berlinParts(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { wd: p.weekday as string, hour: Number(p.hour) };
}

/** Werktags 8 bis 18 Uhr Berliner Zeit. */
export function inMailWindow(now: Date): boolean {
  const { wd, hour } = berlinParts(now);
  return wd !== "Sat" && wd !== "Sun" && hour >= 8 && hour < 18;
}

export type ThrottleState = {
  backoff: number;
  errors: number;
  pausedUntil: Date | null;
  nextAt: Date | null;
  issueAt: Date | null;
};

/** Wie viele Mails dürfen in diesem Lauf raus? 0 = gerade nicht (außerhalb, pausiert, Abstand, Tageslimit). */
export function mailSlots(state: ThrottleState, opts: { sentToday: number; baseLimit: number; now: Date }): number {
  if (!inMailWindow(opts.now)) return 0;
  if (state.pausedUntil && state.pausedUntil > opts.now) return 0;
  if (state.nextAt && state.nextAt > opts.now) return 0;
  const left = effectiveDailyLimit(opts.baseLimit, state.backoff) - opts.sentToday;
  return Math.max(0, Math.min(MAX_PER_RUN, left));
}

/** Zufälliger Abstand bis zur nächsten Mail (3 bis 9 Minuten). rand in [0, 1). */
export function nextGap(rand: number): number {
  return Math.round(3 * MIN + rand * 6 * MIN);
}

/** Kurze Pause zwischen Mails innerhalb eines Laufs (1 bis 4 Sekunden). */
export function innerGap(rand: number): number {
  return Math.round(1000 + rand * 3000);
}

export type SendOutcome = "ok" | "bounce" | "error";

export type ThrottleUpdate = { state: ThrottleState; warn: string | null };

/** Zustand nach einer Mail. warn = Text für die Warnung an Vermittler und Ole (null = nichts). */
export function afterSend(state: ThrottleState, outcome: SendOutcome, now: Date, rand: number): ThrottleUpdate {
  const s: ThrottleState = { ...state };
  if (outcome === "ok") {
    s.errors = 0;
    s.nextAt = new Date(now.getTime() + nextGap(rand));
    // Zwei Tage ohne Probleme: eine Stufe zurück
    if (s.backoff > 0 && s.issueAt && now.getTime() - s.issueAt.getTime() > 2 * DAY) {
      s.backoff--;
      s.issueAt = now;
    }
    return { state: s, warn: null };
  }
  s.issueAt = now;
  if (outcome === "bounce") {
    s.backoff = Math.min(MAX_BACKOFF, s.backoff + 1);
    s.nextAt = new Date(now.getTime() + 30 * MIN);
    return { state: s, warn: null };
  }
  s.errors++;
  s.nextAt = new Date(now.getTime() + 15 * MIN);
  if (s.errors >= 3) {
    s.backoff = Math.min(MAX_BACKOFF, s.backoff + 1);
    s.errors = 0;
    s.pausedUntil = new Date(now.getTime() + 2 ** s.backoff * HOUR);
    return { state: s, warn: "Der Versand über das Postfach ist dreimal hintereinander fehlgeschlagen. Die E-Mail-Kampagnen pausieren kurz und laufen danach langsamer weiter." };
  }
  return { state: s, warn: null };
}

/** Zu viele Bounces? Ab 20 Mails mehr als 5 % → 24 Stunden Pause und Warnung. */
export function bounceCheck(state: ThrottleState, sent: number, bounced: number, now: Date): ThrottleUpdate {
  if (sent < 20 || bounced / sent <= 0.05) return { state, warn: null };
  if (state.pausedUntil && state.pausedUntil > now) return { state, warn: null };
  return {
    state: { ...state, backoff: Math.min(MAX_BACKOFF, state.backoff + 1), pausedUntil: new Date(now.getTime() + DAY), issueAt: now },
    warn: `Viele E-Mails waren unzustellbar (${bounced} von ${sent}). Der Versand pausiert 24 Stunden. Bitte die E-Mail-Adressen im Bestand prüfen.`,
  };
}

/** Bounce an der Fehlermeldung des Mailservers erkennen (sofortige Ablehnung beim Senden). */
export function isBounceError(msg: string): boolean {
  return /\b55[0-4]\b|5\.1\.[0-9]|user unknown|unknown user|no such user|mailbox (unavailable|not found)|recipient (address )?rejected|does not exist|invalid recipient|address rejected/i.test(msg);
}
