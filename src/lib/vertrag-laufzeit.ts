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
import { ersteWocheVertragszeile, type ErsteWocheWahl } from "@/lib/ppl/erste-woche-shared";

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
  /**
   * Vorauszahlung mit der Annahme fällig (Ole, 19.11.2026; offene und ab dann angenommene Angebote,
   * lib/offer-pricing.ts vorauszahlungMitAnnahme). Fehlt = wie vorher: zum Start.
   */
  prepayAtAcceptance?: boolean;
  /** Zahlung nachträglich für den abgelaufenen Leistungsmonat (Offer.paymentInArrears, nur monatlich). */
  paymentInArrears?: boolean;
  /** Paket des Angebots (Offer.package); „ppl_software“ = Pay-per-Lead + Software: Paketzeile und Hinweis zu den Leads. */
  paket?: string | null;
  /** Erste Woche (nur Pay-per-Lead + Software mit Lead-Produkt): Produkt, Preis netto, Anzahl, jede Woche wiederholen. */
  ersteWoche?: ErsteWocheWahl | null;
};

/** Schlusssatz der Zusammenfassung; Pay-per-Lead + Software: Steuer der Software, Leads stehen mit eigener Steuer davor. */
export const KUENDIGUNG_SATZ = "Kündigen können Sie jederzeit im Kundenbereich unter Konto & Rechnungen oder in Textform.";

/** Hinweis im Angebot, in der Annahme und in der Auftragsbestätigung: Leads gehören nicht zur Monatsgebühr. */
export const PPL_LEADS_SEPARAT =
  "Leads bestellen Sie wie gewohnt per Stück (Pay-per-Lead), ohne Mindestabnahme. Sie werden separat zum Preis je Lead laut Bestellung abgerechnet und sind nicht Teil der Monatsgebühr.";

/**
 * Erster Abrechnungstag: ab hier zählen Startpreis-Monate, Mindestlaufzeit und Abrechnungsmonate
 * (= Start, wenn kein eigener Abrechnungstag vereinbart ist).
 */
export const billingStartIso = (i: Pick<ContractSummaryInput, "startIso" | "billingDay"> & Partial<Pick<ContractSummaryInput, "annual" | "term">>): string | null =>
  abrechnungsplan({ startIso: i.startIso, billingDay: i.billingDay, annual: !!i.annual && !!i.term && prepayPossible(i.term) })?.firstIso ?? i.startIso;

/** Gleicher Tag `months` Monate später, in kürzeren Monaten der Monatsletzte (wie die Abbuchung bei Stripe). */
export function addMonthsIso(startIso: string, months: number): string {
  const [y, m, d] = parts(startIso);
  const total = m - 1 + months;
  const ty = y + Math.floor(total / 12);
  // auch rückwärts (months < 0)
  const tm = (((total % 12) + 12) % 12) + 1;
  return iso(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

// ─── Zahlung nachträglich (Ole, 19.11.2026, Offer.paymentInArrears) ───
// Bezahlt wird jeweils nachträglich für den abgelaufenen Leistungsmonat: Leistungsmonat k läuft vom Start + (k − 1)
// Monate bis zum Tag vor Start + k Monate, abgebucht am Start + k Monate (gleicher Tag wie der Start, wie Stripe).
// Damit die Tage nie abgeschnitten werden, ist der Start dann der 1. bis 28. eines Monats.

/** Letzter erlaubter Starttag im Monat bei nachträglicher Zahlung. */
export const NACHTRAEGLICH_MAX_STARTTAG = 28;

/** Starttag bei nachträglicher Zahlung erlaubt (1. bis 28.)? */
export const nachtraeglichStartOk = (startIso: string | null | undefined) => !startIso || parts(startIso)[2] <= NACHTRAEGLICH_MAX_STARTTAG;

/** Erste nachträgliche Abbuchung (Start + 1 Monat). */
export const nachtraeglichErsteIso = (startIso: string) => addMonthsIso(startIso, 1);

/** Leistungsmonat, für den am Abbuchungstag `chargeIso` nachträglich bezahlt wird (Vormonat bis Vortag). */
export function nachtraeglichLeistungsmonat(chargeIso: string): { fromIso: string; toIso: string } {
  const [y, m, d] = parts(chargeIso);
  return { fromIso: addMonthsIso(chargeIso, -1), toIso: iso(y, m, d - 1) };
}

/**
 * Nächste nachträgliche Abbuchung ab heute (inklusive) mit dem Leistungsmonat, für den sie gilt.
 * endIso = letzter Vertragstag (gekündigt): danach kommt nur noch die Zahlung für den letzten Monat.
 */
export function naechsteNachtraeglicheAbbuchung(startIso: string, todayIso: string, endIso?: string | null): { chargeIso: string; fromIso: string; toIso: string } | null {
  for (let k = 1; k < 1200; k++) {
    const chargeIso = addMonthsIso(startIso, k);
    if (chargeIso < todayIso) continue;
    const lm = nachtraeglichLeistungsmonat(chargeIso);
    if (endIso && lm.fromIso > endIso) return null;
    return { chargeIso, ...lm };
  }
  return null;
}

/**
 * Nächste reguläre Rechnung (Konto, Ole 19.11.2026): erster Tag anchor + k × monate (k ≥ ab) ab heute (inklusive),
 * gleicher Tag wie bei Stripe (addMonthsIso). Nach dem letzten Vertragstag (endIso) keine mehr: null.
 * Monatlich im Voraus: anchor = erster Abrechnungstag, ab 0. Vorauszahlung: anchor = Start, ab 1 (der erste Zeitraum ist bezahlt).
 */
export function naechsteRegulaereRechnung(o: { anchorIso: string; monate: number; ab: number; todayIso: string; endIso?: string | null }): string | null {
  if (!(o.monate > 0)) return null;
  for (let k = o.ab; k < 1200; k++) {
    const chargeIso = addMonthsIso(o.anchorIso, k * o.monate);
    if (chargeIso < o.todayIso) continue;
    return o.endIso && chargeIso > o.endIso ? null : chargeIso;
  }
  return null;
}

/** Fester Satz zur letzten Zahlung (Sie-Form, ohne Gedankenstriche). */
export const NACHTRAEGLICH_LETZTE_ZAHLUNG = "Auch danach zahlen Sie nachträglich, die Zahlung für den letzten Monat folgt nach Vertragsende.";

/**
 * Vorauszahlung mit Annahme fällig (Ole, 19.11.2026): fester Satz für Angebot, Annahmeseite, Angebotsmail und Hilfe
 * (Sie-Form, ohne Gedankenstriche; passt auch zur Du-Form, weil ohne Anrede).
 */
export const VORAUSZAHLUNG_MIT_ANNAHME = "Die Vorauszahlung wird mit Annahme fällig, die Laufzeit beginnt mit dem Start der Kampagne.";

/**
 * Erster Zahlungszeitraum einer Vorauszahlung, die mit der Annahme fällig wird (Ole, 19.11.2026). Der Zeitraum beginnt
 * mit dem Start; liegt der schon zurück, wie beim Bezahlen nach dem Start am nächsten Monatsersten (heute, wenn heute
 * der 1. ist; lib/angebot-zahlungserinnerung.ts verschobenerStart), ohne Start heute. renewalIso = Beginn des nächsten
 * Zeitraums (gleicher Tag `months` Monate später, wie Stripe), toIso = Tag davor (letzter bezahlter Tag).
 */
export function ersterVorauszahlungszeitraum(startIso: string | null, months: number, todayIso: string): { fromIso: string; toIso: string; renewalIso: string } {
  let fromIso = startIso ?? todayIso;
  if (fromIso < todayIso) {
    const [y, m, d] = parts(todayIso);
    fromIso = d === 1 ? todayIso : iso(y, m + 1, 1);
  }
  const renewalIso = addMonthsIso(fromIso, months);
  const [ry, rm, rd] = parts(renewalIso);
  return { fromIso, toIso: iso(ry, rm, rd - 1), renewalIso };
}

/**
 * Fälligkeit der Vorauszahlung (ein eigener Abrechnungstag gilt dafür nicht). Ohne Punkt am Ende.
 * - mitAnnahme (Annahme ab 19.11.2026): „jedes Jahr am 18.11. fällig, das erste Mal mit der Annahme, dann am
 *   18.11.2027“ bzw. „alle 6 Monate fällig, das erste Mal mit der Annahme, dann am 18.05.2027“
 * - sonst (Ole, 18.11.2026, voller Betrag zum Start): „jedes Jahr am 18.11. fällig, das erste Mal zum Start am
 *   18.11.2026“ bzw. „alle 6 Monate fällig, das erste Mal zum Start am 18.11.2026, dann am 18.05.2027“
 */
export function vorauszahlungFaellig(startIso: string | null, months: number, opts: { mitAnnahme?: boolean } = {}): string {
  if (opts.mitAnnahme) {
    if (!startIso) return months === 6 ? "fällig mit der Annahme, danach alle 6 Monate" : "fällig mit der Annahme, danach jedes Jahr";
    const next = fmtIso(addMonthsIso(startIso, months));
    return months === 6
      ? `alle 6 Monate fällig, das erste Mal mit der Annahme, dann am ${next}`
      : `jedes Jahr am ${fmtIso(startIso).slice(0, 6)} fällig, das erste Mal mit der Annahme, dann am ${next}`;
  }
  if (!startIso) return months === 6 ? "fällig zum Start, danach alle 6 Monate" : "fällig zum Start, danach jedes Jahr";
  if (months !== 6) return `jedes Jahr am ${fmtIso(startIso).slice(0, 6)} fällig, das erste Mal zum Start am ${fmtIso(startIso)}`;
  // Nächste Abbuchung wie bei Stripe: gleicher Tag 6 Monate später, in kürzeren Monaten der Monatsletzte
  return `alle 6 Monate fällig, das erste Mal zum Start am ${fmtIso(startIso)}, dann am ${fmtIso(addMonthsIso(startIso, months))}`;
}

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
  // Eigener Abrechnungstag: Beträge und Fristen zählen ab dem ersten Abrechnungstag (lib/abrechnungstag.ts);
  // bei Vorauszahlung gilt er nicht (voller Betrag zum Start, Zeitraum ab Start)
  const plan = abrechnungsplan({ startIso: i.startIso, billingDay: i.billingDay, freeStart: i.freeStart, annual });
  const billIso = plan?.firstIso ?? i.startIso;
  const start = billIso ? fmtIso(billIso) : null;
  // Zahlung nachträglich (Ole, 19.11.2026): nur monatlich, ohne eigenen Abrechnungstag
  const arrears = !!i.paymentInArrears && !annual;
  const ersteNachtraeglich = arrears && i.startIso ? `am ${fmtIso(nachtraeglichErsteIso(i.startIso))}` : "einen Monat nach dem Start";
  const ppl = i.paket === "ppl_software";
  if (ppl) lines.push("Paket: Pay-per-Lead + Software (Software ohne Betreuung und ohne eigene Kampagnen), ohne Einrichtungsgebühr.");
  if (i.setup > 0) lines.push(`Einrichtung: ${eur(i.setup)} netto, fällig mit der Annahme.`);
  else if (ppl) {
    // Paketzeile nennt schon „ohne Einrichtungsgebühr“
  } else if (arrears) lines.push(`Bei Annahme fällig: ${eur(0)}, ohne Einrichtungsgebühr.`);
  if (arrears) {
    if (hasPriceStep(i)) {
      const d = priceStepDates(i.startIso, i.intro!.months);
      lines.push(
        d
          ? `Startpreis: ${eur(i.intro!.monthly)} netto im Monat vom ${start} bis ${fmtIso(d.introEndIso)} (${i.intro!.months} ${i.intro!.months === 1 ? "Monat" : "Monate"}).`
          : `Startpreis: ${eur(i.intro!.monthly)} netto im Monat in den ersten ${i.intro!.months} Monaten.`,
      );
      lines.push(`Danach automatisch ${eur(i.monthlyTotal)} netto im Monat${d ? ` ab ${fmtIso(d.regularFromIso)}` : ""}.`);
      lines.push(`Bezahlt wird jeweils nachträglich für den abgelaufenen Monat, erstmals ${ersteNachtraeglich}.`);
    } else {
      lines.push(`Monatlich: ${eur(i.monthlyTotal)} netto, jeweils nachträglich für den abgelaufenen Monat, erstmals ${ersteNachtraeglich}.`);
    }
    if (i.term === "none") {
      lines.push("Ohne Mindestlaufzeit, kündbar zum Ende des jeweiligen Leistungsmonats. Die Zahlung für den letzten Monat folgt nach Vertragsende.");
    } else {
      const months = TERM_MONTHS[i.term];
      const end = i.startIso ? periodEndIso(i.startIso, months) : null;
      lines.push(`Mindestlaufzeit ${months} Monate${end ? ` bis ${fmtIso(end)}` : " ab Start"}, danach monatlich kündbar zum Ende des jeweiligen Leistungsmonats. ${NACHTRAEGLICH_LETZTE_ZAHLUNG}`);
    }
  } else if (annual) {
    lines.push(`${pm === 6 ? "6 Monate im Voraus" : "Jährlich im Voraus"}: ${eur(prepayTotal)} netto, ${vorauszahlungFaellig(billIso, pm, { mitAnnahme: i.prepayAtAcceptance })}.`);
    if (i.prepayAtAcceptance) lines.push(VORAUSZAHLUNG_MIT_ANNAHME);
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
  if (plan?.differs && !arrears) {
    const firstNet = hasPriceStep(i) ? i.intro!.monthly : i.monthlyTotal;
    lines.push(abrechnungstagSaetze(plan, { firstNet }).join(" "));
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
  } else if (arrears) {
    // Laufzeit steht schon oben (nachträgliche Zahlung)
  } else if (i.term === "none") {
    lines.push("Ohne Mindestlaufzeit, kündbar zum Ende des jeweiligen Abrechnungsmonats.");
  } else {
    const months = TERM_MONTHS[i.term];
    const end = billIso ? periodEndIso(billIso, months) : null;
    lines.push(`Mindestlaufzeit ${months} Monate${end ? ` bis ${fmtIso(end)}` : " ab Start"}, danach kündbar zum Ende des jeweiligen Abrechnungsmonats.`);
  }
  if (ppl && i.ersteWoche) lines.push(ersteWocheVertragszeile(i.ersteWoche));
  if (ppl) lines.push(PPL_LEADS_SEPARAT);
  // Pay-per-Lead + Software: 19 % gelten für die Software; die Steuer der Leads steht an der ersten Woche bzw. an der Bestellung
  lines.push(`${KUENDIGUNG_SATZ} ${ppl ? "Preise der Software zzgl. 19 % USt." : "Alle Preise zzgl. 19 % USt."}`);
  return lines;
}
