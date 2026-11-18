// Laufzeit, Kündigungstermin und Zusammenfassung der Konditionen (Anwalts-Memo, Ole 15.11.2026).
// Reine Funktionen (auch im Browser): Angebotsseite (direkt am Knopf), Auftragsbestätigung,
// „Vertrag hier kündigen“ im Kundenbereich. Daten als YYYY-MM-DD (Kalendertage in Berlin).
//
// Fristen wie §§ 187 Abs. 2, 188 Abs. 2 und 3 BGB: Ein Zeitraum von n Monaten ab dem Starttag endet mit
// dem Tag vor dem Tag desselben Datums n Monate später; fehlt dieses Datum (z. B. 31.), mit dem
// Monatsletzten. Abrechnungsmonate zählen immer vom Starttag (kein Verschieben durch kurze Monate).
// AGB „Laufzeit und Kündigung“ nennt dieselben Regeln mit Beispiel.

import { eur, prepayMonthsFor, prepayPossible, TERM_MONTHS, type OfferTerm } from "@/lib/offer-pricing";
import { abrechnungsplan, abrechnungstagSaetze } from "@/lib/abrechnungstag";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
const parts = (s: string) => s.split("-").map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Letzter Tag eines Zeitraums von `months` Monaten, der am Starttag beginnt (inklusive). */
export function periodEndIso(startIso: string, months: number): string {
  const [y, m, d] = parts(startIso);
  const total = m - 1 + months;
  const ty = y + Math.floor(total / 12);
  const tm = (total % 12) + 1;
  // Fehlt der Tag im Zielmonat, endet die Frist mit dem Monatsletzten (§ 188 Abs. 3 BGB)
  if (d > daysInMonth(ty, tm)) return iso(ty, tm, daysInMonth(ty, tm));
  return iso(ty, tm, d - 1);
}

export const nextDayIso = (s: string) => {
  const [y, m, d] = parts(s);
  return iso(y, m, d + 1);
};

/** Ende eines Kalendertags in Berlin = 00:00 Uhr Berliner Zeit am Folgetag (als UTC-Zeitpunkt). */
export function berlinEndOfDay(dayIso: string): Date {
  const next = nextDayIso(dayIso);
  const [y, m, d] = parts(next);
  // Berlin ist UTC+1 oder UTC+2: den Kandidaten nehmen, der in Berlin genau 00:00 am Folgetag ist
  for (const offset of [1, 2]) {
    const t = new Date(Date.UTC(y, m - 1, d, -offset));
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
    if (local === `${next} 00:00`) return t;
  }
  return new Date(Date.UTC(y, m - 1, d, -1));
}

/** TT.MM.JJJJ */
export const fmtIso = (s: string) => s.split("-").reverse().join(".");

// halteangebot: Mindestlaufzeit nach angenommenem Nachlass (lib/halteangebote.ts, Customer.retentionCommitUntil)
export type CancelReason = "mindestlaufzeit" | "abrechnungsmonat" | "zahlungsjahr" | "kalendermonat" | "halteangebot";

export type CancelDate = {
  /** Letzter Vertragstag (inklusive) */
  effectiveIso: string;
  reason: CancelReason;
  /** Ende der Mindestlaufzeit bzw. des ersten Zahlungsjahres (nur zur Anzeige) */
  minTermEndIso: string | null;
  /** Jahreszahlung: bis wann die Kündigung für das genannte Ende eingehen musste */
  deadlineIso: string | null;
  /** Jahreszahlung: Frist für das laufende Jahr verpasst, Ende erst nach dem folgenden Jahr */
  missedDeadline: boolean;
  /** Vorauszahlung: Monate je Zahlungszeitraum (6 oder 12); fehlt = 12 */
  prepayMonths?: number;
};

/**
 * Nächstmöglicher Kündigungstermin, wenn die Kündigung heute eingeht (AGB „Laufzeit und Kündigung“).
 * - ohne Laufzeit: Ende des laufenden Abrechnungsmonats
 * - 3/6/12 Monate: Ende der Mindestlaufzeit, danach Ende des laufenden Abrechnungsmonats
 * - Vorauszahlung (jährlich bzw. 6 Monate): Ende des Zahlungszeitraums, Kündigung mindestens 1 Monat vorher, sonst
 *   einen Zeitraum später (Verlängerung um jeweils 12 bzw. 6 Monate)
 * Ohne bekannten Start (Altverträge): Ende des laufenden Kalendermonats.
 * prepayMonths: Monate je Zahlungszeitraum (Standard aus der Laufzeit: 6m → 6, sonst 12).
 */
export function cancelDate(o: { startIso: string | null; term: OfferTerm; annual: boolean; todayIso: string; prepayMonths?: number }): CancelDate {
  const today = o.todayIso;
  if (!o.startIso) {
    const [y, m] = parts(today);
    return { effectiveIso: iso(y, m, daysInMonth(y, m)), reason: "kalendermonat", minTermEndIso: null, deadlineIso: null, missedDeadline: false };
  }
  const start = o.startIso;
  if (o.annual) {
    const pm = o.prepayMonths ?? prepayMonthsFor(o.term);
    let first: string | null = null;
    for (let k = 1; k < 200; k++) {
      const end = periodEndIso(start, pm * k);
      first ??= end;
      const deadline = periodEndIso(start, pm * k - 1);
      if (today <= deadline) {
        return { effectiveIso: end, reason: "zahlungsjahr", minTermEndIso: first, deadlineIso: deadline, missedDeadline: k > 1 && today <= periodEndIso(start, pm * (k - 1)), prepayMonths: pm };
      }
    }
  }
  const minMonths = o.annual ? 12 : (TERM_MONTHS[o.term] ?? 0);
  const minEnd = minMonths ? periodEndIso(start, minMonths) : null;
  if (minEnd && today <= minEnd) return { effectiveIso: minEnd, reason: "mindestlaufzeit", minTermEndIso: minEnd, deadlineIso: null, missedDeadline: false };
  for (let k = 1; k < 1200; k++) {
    const end = periodEndIso(start, k);
    if (end >= today) return { effectiveIso: end, reason: "abrechnungsmonat", minTermEndIso: minEnd, deadlineIso: null, missedDeadline: false };
  }
  return { effectiveIso: today, reason: "abrechnungsmonat", minTermEndIso: minEnd, deadlineIso: null, missedDeadline: false };
}

/** Ein Satz zum Kündigungstermin für Kundenbereich und Bestätigungsmail (Sie-Form). */
export function cancelDateText(c: CancelDate, startIso: string | null): string {
  const end = fmtIso(c.effectiveIso);
  switch (c.reason) {
    case "mindestlaufzeit":
      return `Ihr Vertrag endet am ${end}, zum Ende der Mindestlaufzeit${startIso ? ` (Start ${fmtIso(startIso)})` : ""}.`;
    case "zahlungsjahr":
      // 6 Monate im Voraus: „Zahlungszeitraum“ statt „Zahlungsjahr“
      if (c.prepayMonths === 6) {
        return c.missedDeadline
          ? `Ihr Vertrag endet am ${end}. Für den laufenden Zahlungszeitraum von 6 Monaten ist die Kündigungsfrist von einem Monat schon abgelaufen, deshalb endet er mit dem folgenden Zahlungszeitraum.`
          : `Ihr Vertrag endet am ${end}, zum Ende des Zahlungszeitraums von 6 Monaten (Kündigung bis ${fmtIso(c.deadlineIso!)} möglich).`;
      }
      return c.missedDeadline
        ? `Ihr Vertrag endet am ${end}. Für das laufende Zahlungsjahr ist die Kündigungsfrist von einem Monat schon abgelaufen, deshalb endet er mit dem folgenden Zahlungsjahr.`
        : `Ihr Vertrag endet am ${end}, zum Ende des Zahlungsjahres (Kündigung bis ${fmtIso(c.deadlineIso!)} möglich).`;
    case "abrechnungsmonat":
      return `Ihr Vertrag endet am ${end}, zum Ende des laufenden Abrechnungsmonats.`;
    case "halteangebot":
      return `Ihr Vertrag endet am ${end}, zum Ende der Mindestlaufzeit, die Sie mit dem Nachlass vereinbart haben.`;
    default:
      return `Ihr Vertrag endet am ${end}, zum Ende des laufenden Monats.`;
  }
}

// ─── Konditionen direkt am Annahme-Knopf und in der Auftragsbestätigung ───

export type ContractSummaryInput = {
  term: OfferTerm;
  startIso: string | null;
  setup: number;
  /** Monatlich gesamt inkl. Zusätze (netto) */
  monthlyTotal: number;
  /** Startpreis: Monate und Monatsbetrag gesamt inkl. Zusätze (netto); null = kein Startpreis */
  intro: { months: number; monthly: number } | null;
  /** Im Voraus (nur mit 6 oder 12 Monaten: 6 Monate bzw. jährlich) */
  annual: boolean;
  freeMonths: number;
  /** Abrechnungstag (lib/abrechnungstag.ts): null/fehlt = wie Start; freeStart = Zeit davor kostenlos */
  billingDay?: number | null;
  freeStart?: boolean;
};

/**
 * Erster Abrechnungstag: ab hier zählen Startpreis-Monate, Mindestlaufzeit und Abrechnungsmonate
 * (= Start, wenn kein eigener Abrechnungstag vereinbart ist).
 */
export const billingStartIso = (i: Pick<ContractSummaryInput, "startIso" | "billingDay">): string | null =>
  abrechnungsplan({ startIso: i.startIso, billingDay: i.billingDay })?.firstIso ?? i.startIso;

/** Startpreis mit Übergang in die reguläre Vergütung? Dann ist ein eigenes Häkchen Pflicht. */
export const hasPriceStep = (i: Pick<ContractSummaryInput, "intro" | "monthlyTotal">) =>
  !!i.intro && i.intro.months > 0 && i.intro.monthly < i.monthlyTotal;

/** Ende des Startpreises und Tag, ab dem der reguläre Preis gilt (null ohne Startdatum). */
export function priceStepDates(startIso: string | null, months: number): { introEndIso: string; regularFromIso: string } | null {
  if (!startIso) return null;
  const introEndIso = periodEndIso(startIso, months);
  return { introEndIso, regularFromIso: nextDayIso(introEndIso) };
}

/** Wortlaut des Pflicht-Häkchens beim Startpreis. */
export function priceStepAckText(i: ContractSummaryInput): string {
  const d = i.intro ? priceStepDates(billingStartIso(i), i.intro.months) : null;
  return `Mir ist bewusst: Nach dem Startpreis gilt ${d ? `ab dem ${fmtIso(d.regularFromIso)}` : `ab Monat ${(i.intro?.months ?? 0) + 1}`} automatisch die reguläre Vergütung von ${eur(i.monthlyTotal)} netto im Monat.`;
}

/** Zeilen „Das vereinbaren Sie“ (netto zzgl. USt.), Sie-Form, ohne Gedankenstriche. */
export function contractSummaryLines(i: ContractSummaryInput): string[] {
  const lines: string[] = [];
  const annual = i.annual && prepayPossible(i.term);
  // Vorauszahlung: 6 Monate (6m) bzw. 12 Monate (12m) je Zeitraum
  const pm = prepayMonthsFor(i.term);
  const prepayTotal = Math.round(i.monthlyTotal * (pm - i.freeMonths) * 100) / 100;
  // Eigener Abrechnungstag: Beträge und Fristen zählen ab dem ersten Abrechnungstag (lib/abrechnungstag.ts)
  const plan = abrechnungsplan({ startIso: i.startIso, billingDay: i.billingDay, freeStart: i.freeStart, annual, prepayMonths: pm });
  const billIso = plan?.firstIso ?? i.startIso;
  const start = billIso ? fmtIso(billIso) : null;
  if (i.setup > 0) lines.push(`Einrichtung: ${eur(i.setup)} netto, fällig mit der Annahme.`);
  if (annual) {
    lines.push(`${pm === 6 ? "6 Monate im Voraus" : "Jährlich im Voraus"}: ${eur(prepayTotal)} netto${start ? ` ab ${start}` : " ab Start"}.`);
  } else if (hasPriceStep(i)) {
    const d = priceStepDates(billIso, i.intro!.months);
    lines.push(
      d
        ? `Startpreis: ${eur(i.intro!.monthly)} netto im Monat vom ${start} bis ${fmtIso(d.introEndIso)} (${i.intro!.months} ${i.intro!.months === 1 ? "Monat" : "Monate"}).`
        : `Startpreis: ${eur(i.intro!.monthly)} netto im Monat in den ersten ${i.intro!.months} Monaten.`,
    );
    lines.push(`Danach automatisch ${eur(i.monthlyTotal)} netto im Monat${d ? ` ab ${fmtIso(d.regularFromIso)}` : ""}.`);
  } else {
    lines.push(`Monatlich: ${eur(i.monthlyTotal)} netto${start ? ` ab ${start}` : " ab Start"}, im Voraus.`);
  }
  if (plan?.differs) {
    const firstNet = annual ? prepayTotal : hasPriceStep(i) ? i.intro!.monthly : i.monthlyTotal;
    lines.push(abrechnungstagSaetze(plan, { firstNet, annual, prepayMonths: pm }).join(" "));
  }
  if (annual) {
    // Verlängerung um jeweils einen Zahlungszeitraum (6 bzw. 12 Monate), Kündigung einen Monat vor Ende
    const end = billIso ? periodEndIso(billIso, pm) : null;
    const deadline = billIso ? periodEndIso(billIso, pm - 1) : null;
    lines.push(
      end && deadline
        ? `Laufzeit bis ${fmtIso(end)}. Sie verlängert sich um jeweils ${pm} Monate, wenn Sie nicht bis ${fmtIso(deadline)} kündigen.`
        : `Laufzeit ${pm} Monate ab Start. Sie verlängert sich um jeweils ${pm} Monate, wenn Sie nicht einen Monat vor Ende kündigen.`,
    );
  } else if (i.term === "none") {
    lines.push("Ohne Mindestlaufzeit, kündbar zum Ende des jeweiligen Abrechnungsmonats.");
  } else {
    const months = TERM_MONTHS[i.term];
    const end = billIso ? periodEndIso(billIso, months) : null;
    lines.push(`Mindestlaufzeit ${months} Monate${end ? ` bis ${fmtIso(end)}` : " ab Start"}, danach kündbar zum Ende des jeweiligen Abrechnungsmonats.`);
  }
  lines.push("Kündigen können Sie jederzeit im Kundenbereich unter Konto & Rechnungen oder in Textform. Alle Preise zzgl. 19 % USt.");
  return lines;
}
