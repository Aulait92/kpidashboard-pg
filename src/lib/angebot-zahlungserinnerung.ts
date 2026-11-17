// Zahlungserinnerung für angenommene, aber noch nicht bezahlte Angebote (Ole, 16.11.2026).
// Reine Funktionen ohne Datenbank (auch im Browser nutzbar): Erinnerungsplan, erlaubte Daten für
// „Ich zahle später, erinnern Sie mich am …“, Verschiebung des Starts bei Zahlung nach dem Start und die Texte.
// Versand, Aufgabe und Push: lib/angebot-zahlungserinnerung-server.ts (im WhatsApp-Cron).
//
// Plan:
// - Mit gewähltem Datum: vorher nichts, am Datum die erste Erinnerung, dann nach 3 und 7 Tagen (höchstens 3).
// - Ohne Datum: 3 Tage nach der Annahme, danach wöchentlich (höchstens 4). Sicherheitsnetz für alle.
// - Spätestens 14 Tage vor dem Startdatum, falls das früher ist als der Plan (ohne Datum frühestens am Tag
//   nach der Annahme).
// - Stopp, sobald die Zahlung bzw. das Mandat eingerichtet ist oder das Angebot nicht mehr angenommen ist
//   (abgelehnt, ersetzt, storniert), bei Testangeboten und wenn eine neuere Version existiert.
// Gesendet wird ab 9 Uhr bis 19 Uhr (Berlin); je Stufe höchstens einmal (Zähler am Angebot).

import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { fromDayKey } from "@/lib/vertrieb/dates";

export const ABSTAENDE_MIT_DATUM = [0, 3, 7] as const;
export const ABSTAENDE_OHNE_DATUM = [0, 7, 14, 21] as const;
/** Ohne Datum: erste Erinnerung so viele Tage nach der Annahme. */
export const TAGE_NACH_ANNAHME = 3;
/** Spätestens so viele Tage vor dem Startdatum erinnern (und spätestes wählbares Datum). */
export const TAGE_VOR_START = 14;
/** Mindestabstand zwischen zwei Erinnerungen, falls der Cron ausgefallen ist (kein Nachholen im Block). */
export const MIN_ABSTAND_TAGE = 2;
/** Admin-Push, falls 7 Tage nach der ersten Erinnerung noch nicht gezahlt ist. */
export const PUSH_NACH_TAGEN = 7;
export const VERSAND_AB_STUNDE = 9;
export const VERSAND_BIS_STUNDE = 19;

export type ErinnerungsAngebot = {
  status: string;
  isTest: boolean;
  paymentStatus: string;
  stripeSubscriptionId?: string | null;
  stripeScheduleId?: string | null;
  acceptedAt: Date | null;
  startDate: Date | null;
  paymentReminderAt: Date | null;
  paymentReminderCount: number;
  paymentReminderLastAt: Date | null;
  /** „Per Überweisung zahlen“ gewählt (lib/ueberweisung.ts): Rechnung läuft, ab dann übernimmt das Mahnwesen */
  zahlweise?: string | null;
};

export type NaechsteErinnerung = {
  /** 1-basiert: die wievielte Erinnerung */
  stufe: number;
  /** Berliner Kalendertag der Erinnerung */
  tag: string;
  /** Ab diesem Zeitpunkt darf gesendet werden (9 Uhr Berlin am Tag) */
  faelligAb: Date;
};

const isoOf = (d: Date) => d.toISOString().slice(0, 10);
/** Gespeichertes Datum (12:00 UTC des Berliner Tages) → YYYY-MM-DD */
export const tagIso = (d: Date | null | undefined): string | null => (d ? isoOf(d) : null);
/** YYYY-MM-DD → gespeichertes Datum (12:00 UTC, wie startDate) */
export const tagDatum = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

/**
 * Zahlung bzw. SEPA-Mandat eingerichtet (Webhook), Abo vorhanden oder Überweisung gewählt (Rechnung verschickt;
 * Erinnerung und Mahnungen kommen dann aus dem Mahnwesen, lib/mahnwesen-server.ts, keine Doppelnachrichten).
 */
export function zahlungEingerichtet(o: Pick<ErinnerungsAngebot, "paymentStatus" | "stripeSubscriptionId" | "stripeScheduleId" | "zahlweise">): boolean {
  return o.paymentStatus === "paid" || o.paymentStatus === "processing" || !!o.stripeSubscriptionId || !!o.stripeScheduleId || o.zahlweise === "ueberweisung";
}

/** Grund, nicht (mehr) zu erinnern, oder null. */
export function erinnerungGestoppt(o: ErinnerungsAngebot, opts: { ersetzt?: boolean } = {}): string | null {
  if (o.isTest) return "Testangebot";
  if (o.status !== "accepted") return `Status ${o.status}`;
  if (!o.acceptedAt) return "nicht angenommen";
  if (zahlungEingerichtet(o)) return "Zahlung eingerichtet";
  if (opts.ersetzt) return "neuere Version";
  return null;
}

/** Erinnerungstage (YYYY-MM-DD) je Stufe. */
export function erinnerungsPlan(o: Pick<ErinnerungsAngebot, "acceptedAt" | "startDate" | "paymentReminderAt">): string[] {
  if (!o.acceptedAt) return [];
  const accepted = berlinTodayIso(o.acceptedAt);
  const chosen = tagIso(o.paymentReminderAt);
  const abstaende = chosen ? ABSTAENDE_MIT_DATUM : ABSTAENDE_OHNE_DATUM;
  let first = chosen ?? addDaysIso(accepted, TAGE_NACH_ANNAHME);
  const start = tagIso(o.startDate);
  if (start) {
    const limit = addDaysIso(start, -TAGE_VOR_START);
    if (limit < first) first = limit;
  }
  // Nie am Tag der Annahme selbst (der Kunde hat die Zahlungsseite gerade gesehen)
  const earliest = addDaysIso(accepted, 1);
  if (first < earliest) first = earliest;
  return abstaende.map((d) => addDaysIso(first, d));
}

/**
 * Nächste fällige bzw. geplante Erinnerung, oder null (fertig oder gestoppt).
 * `faelligAb` kann in der Vergangenheit liegen (überfällig → jetzt senden, im Versandfenster).
 */
export function naechsteErinnerung(o: ErinnerungsAngebot, now: Date, opts: { ersetzt?: boolean } = {}): NaechsteErinnerung | null {
  void now;
  if (erinnerungGestoppt(o, opts)) return null;
  const plan = erinnerungsPlan(o);
  const n = Math.max(0, o.paymentReminderCount);
  if (n >= plan.length) return null;
  let tag = plan[n];
  if (n > 0 && o.paymentReminderLastAt) {
    const minTag = addDaysIso(berlinTodayIso(o.paymentReminderLastAt), MIN_ABSTAND_TAGE);
    if (minTag > tag) tag = minTag;
  }
  return { stufe: n + 1, tag, faelligAb: fromDayKey(tag, `${String(VERSAND_AB_STUNDE).padStart(2, "0")}:00`) };
}

/** Jetzt senden? (fällig und im Versandfenster 9 bis 19 Uhr Berlin) */
export function jetztSenden(e: NaechsteErinnerung | null, now: Date): boolean {
  if (!e || e.faelligAb.getTime() > now.getTime()) return false;
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "numeric", hourCycle: "h23" }).format(now));
  return h >= VERSAND_AB_STUNDE && h < VERSAND_BIS_STUNDE;
}

/** Push an die Admins fällig? Einmalig, 7 Tage nach der ersten Erinnerung, falls noch offen. */
export function pushFaellig(
  o: ErinnerungsAngebot & { paymentReminderPushAt: Date | null; paymentReminderTaskAt: Date | null },
  now: Date,
  opts: { ersetzt?: boolean } = {},
): boolean {
  if (o.paymentReminderPushAt || erinnerungGestoppt(o, opts)) return false;
  const first = o.paymentReminderTaskAt;
  if (!first) return false;
  return now.getTime() - first.getTime() >= PUSH_NACH_TAGEN * 86_400_000;
}

/**
 * Erlaubte Daten für „erinnern Sie mich am …“: frühestens morgen, spätestens 14 Tage vor dem Start.
 * Admin: schon heute möglich. null = keine Auswahl möglich (Start zu nah).
 */
export function erinnerungsGrenzen(todayIso: string, startIso: string | null, opts: { admin?: boolean } = {}): { min: string; max: string | null } | null {
  const min = opts.admin ? todayIso : addDaysIso(todayIso, 1);
  if (!startIso) return { min, max: null };
  const max = addDaysIso(startIso, -TAGE_VOR_START);
  // Admin kann immer setzen: Ist der Start schon zu nah, bleibt nur heute (der Plan erinnert ohnehin sofort)
  if (max < min) return opts.admin ? { min, max: min } : null;
  return { min, max };
}

/** Prüft ein Wunschdatum gegen {@link erinnerungsGrenzen}. */
export function pruefeErinnerungsDatum(
  value: string,
  todayIso: string,
  startIso: string | null,
  opts: { admin?: boolean } = {},
): { ok: true; iso: string } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`)) || isoOf(new Date(`${value}T12:00:00Z`)) !== value) {
    return { ok: false, error: "Bitte ein gültiges Datum wählen." };
  }
  const g = erinnerungsGrenzen(todayIso, startIso, opts);
  if (!g) return { ok: false, error: "Ihr Start ist zu nah, bitte richten Sie die Zahlung jetzt ein." };
  if (value < g.min) return { ok: false, error: `Bitte frühestens den ${fmtTag(g.min)} wählen.` };
  if (g.max && value > g.max) return { ok: false, error: `Bitte spätestens den ${fmtTag(g.max)} wählen (14 Tage vor Ihrem Start).` };
  return { ok: true, iso: value };
}

/**
 * Wird erst nach dem Startdatum gezahlt, beginnt das Abo am nächsten Monatsersten nach der Zahlung
 * (Zahlung an einem Monatsersten: an diesem Tag). Nichts rückwirkend. null = Start bleibt.
 */
export function verschobenerStart(startIso: string | null, zahlungIso: string): string | null {
  if (!startIso || zahlungIso <= startIso) return null;
  const [y, m, d] = zahlungIso.split("-").map(Number);
  if (d === 1) return zahlungIso;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

export const fmtTag = (iso: string) => iso.split("-").reverse().join(".");

// ─── Texte (ohne Gedankenstriche, Sie oder Du) ──────────────────────────

export function erinnerungsMail(o: { number: string; startIso: string | null; stufe: number; du: boolean }): { subject: string; paragraphs: string[]; button: string } {
  const start = o.startIso ? fmtTag(o.startIso) : null;
  if (o.du) {
    return {
      subject: o.stufe > 1 ? `Erinnerung: Zahlung für dein Angebot ${o.number}` : `Zahlung für dein Angebot ${o.number} einrichten`,
      paragraphs: [
        `du hast unser Angebot ${o.number} angenommen, vielen Dank. Es fehlt nur noch die Einrichtung der Zahlung.`,
        `${start ? `Dein Start ist am ${start}. ` : ""}Den Zugang zur Einrichtung bekommst du, sobald die Zahlung eingerichtet ist. Über den Knopf kommst du direkt zur sicheren Zahlungsseite.`,
        "Fragen? Antworte einfach auf diese E-Mail.",
      ],
      button: "Zahlung einrichten",
    };
  }
  return {
    subject: o.stufe > 1 ? `Erinnerung: Zahlung für Ihr Angebot ${o.number}` : `Zahlung für Ihr Angebot ${o.number} einrichten`,
    paragraphs: [
      `Sie haben unser Angebot ${o.number} angenommen, vielen Dank. Es fehlt nur noch die Einrichtung der Zahlung.`,
      `${start ? `Ihr Start ist am ${start}. ` : ""}Den Zugang zur Einrichtung erhalten Sie, sobald die Zahlung eingerichtet ist. Über den Knopf kommen Sie direkt zur sicheren Zahlungsseite.`,
      "Fragen? Antworten Sie einfach auf diese E-Mail.",
    ],
    button: "Zahlung einrichten",
  };
}

export function startVerschobenMail(o: { number: string; altIso: string; neuIso: string; du: boolean }): { subject: string; paragraphs: string[] } {
  const alt = fmtTag(o.altIso);
  const neu = fmtTag(o.neuIso);
  return o.du
    ? {
        subject: `Dein neues Startdatum: ${neu}`,
        paragraphs: [
          `vielen Dank, deine Zahlung für das Angebot ${o.number} ist eingerichtet.`,
          `Weil der geplante Start am ${alt} schon vorbei war, beginnt dein Abo am ${neu}. Vorher buchen wir keine Monatsgebühr ab, auch nicht rückwirkend.`,
        ],
      }
    : {
        subject: `Ihr neues Startdatum: ${neu}`,
        paragraphs: [
          `vielen Dank, Ihre Zahlung für das Angebot ${o.number} ist eingerichtet.`,
          `Weil der geplante Start am ${alt} schon vorbei war, beginnt Ihr Abo am ${neu}. Vorher buchen wir keine Monatsgebühr ab, auch nicht rückwirkend.`,
        ],
      };
}

// WhatsApp-Vorlagen (UTILITY) für die Support-Nummer, je Anrede eine
export const ZAHLUNG_TEMPLATE_SIE = "pg_vertrieb_zahlung_sie_v1";
export const ZAHLUNG_TEMPLATE_DU = "pg_vertrieb_zahlung_du_v1";
export const ZAHLUNG_TEMPLATE_PURPOSE = "vertrieb_zahlung";
export const ZAHLUNG_TEMPLATE_BODY_SIE =
  "Guten Tag {{1}}, eine kurze Erinnerung zu Ihrem Angebot {{2}} bei performancegrowth: Es fehlt nur noch die Einrichtung der Zahlung. " +
  "Hier geht es direkt dazu: {{3}} Den Zugang zur Einrichtung erhalten Sie, sobald die Zahlung eingerichtet ist. " +
  "Bei Fragen antworten Sie einfach auf diese Nachricht. Viele Grüße, Ihr Team von performancegrowth";
export const ZAHLUNG_TEMPLATE_BODY_DU =
  "Hallo {{1}}, eine kurze Erinnerung zu deinem Angebot {{2}} bei performancegrowth: Es fehlt nur noch die Einrichtung der Zahlung. " +
  "Hier geht es direkt dazu: {{3}} Den Zugang zur Einrichtung bekommst du, sobald die Zahlung eingerichtet ist. " +
  "Bei Fragen antworte einfach auf diese Nachricht. Viele Grüße, dein Team von performancegrowth";
export const ZAHLUNG_TEMPLATE_EXAMPLES = ["Max Mustermann", "PG-2026-0007", "https://app.performancegrowth.de/angebot/abc/zahlen"];

// Fassung 2 (Ole, 17.11.2026): persönlich von Ole Kannapinn statt „Ihr Team“. Fassung 1 läuft weiter, bis
// Fassung 2 bei Meta freigegeben ist (sendeZahlungWhatsApp).
export const ZAHLUNG_TEMPLATE_SIE_V2 = "pg_vertrieb_zahlung_sie_v2";
export const ZAHLUNG_TEMPLATE_DU_V2 = "pg_vertrieb_zahlung_du_v2";
export const ZAHLUNG_TEMPLATE_BODY_SIE_V2 = ZAHLUNG_TEMPLATE_BODY_SIE.replace("Viele Grüße, Ihr Team von performancegrowth", "Viele Grüße, Ole Kannapinn");
export const ZAHLUNG_TEMPLATE_BODY_DU_V2 = ZAHLUNG_TEMPLATE_BODY_DU.replace("Viele Grüße, dein Team von performancegrowth", "Viele Grüße, Ole Kannapinn");

/** Vorlage der Zahlungserinnerung: Fassung 2, sobald nutzbar, sonst Fassung 1; null, wenn keine freigegeben ist. */
export function zahlungVorlage(du: boolean, nutzbar: (name: string, version: 1 | 2) => boolean): { name: string; body: string } | null {
  const v2 = du ? { name: ZAHLUNG_TEMPLATE_DU_V2, body: ZAHLUNG_TEMPLATE_BODY_DU_V2 } : { name: ZAHLUNG_TEMPLATE_SIE_V2, body: ZAHLUNG_TEMPLATE_BODY_SIE_V2 };
  if (nutzbar(v2.name, 2)) return v2;
  const v1 = du ? { name: ZAHLUNG_TEMPLATE_DU, body: ZAHLUNG_TEMPLATE_BODY_DU } : { name: ZAHLUNG_TEMPLATE_SIE, body: ZAHLUNG_TEMPLATE_BODY_SIE };
  return nutzbar(v1.name, 1) ? v1 : null;
}
