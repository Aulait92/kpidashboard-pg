// Erinnerung vor Ende einer Vorauszahlung (Ole, 18.11.2026): 30 Tage vor Ende eines Zahlungszeitraums (6 Monate im
// Voraus bei Laufzeit 6 Monate, jährlich bei 12 Monaten) bekommt der Kunde eine kurze Mail: Ende, was danach gilt
// (Verlängerung um einen weiteren Zeitraum, Abbuchung) und bis wann er kündigen kann (AGB „Laufzeit und Kündigung“,
// lib/vertrag-laufzeit.ts cancelDate). Genau einmal je Zeitraum: Customer.prepayReminderFor = Ende des Zeitraums,
// gesetzt vor dem Versand (bedingtes Update, kein Doppelversand bei parallelen Läufen). Läuft im täglichen Cron.
// Keine Mail, wenn schon gekündigt, beendet, archiviert oder Testkunde. Texte in Sie-Form, ohne Gedankenstriche.

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { customerGreeting } from "@/lib/offer-links";
import { berlinTodayIso, eur, isPrepaid, normalizeRhythmus, RHYTHMUS_MONATE, rhythmusFaktor } from "@/lib/offer-pricing";
import { fmtIso, periodEndIso } from "@/lib/vertrag-laufzeit";

/** So viele Tage vor Ende des Zahlungszeitraums geht die Erinnerung raus. */
export const VORAUSZAHLUNG_ERINNERUNG_TAGE = 30;

const dayNum = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/**
 * Laufender Zahlungszeitraum: Ende (letzter bezahlter Tag) und letzter Tag für eine Kündigung zu diesem Ende
 * (ein Monat vorher). null ohne Start oder vor dem Start.
 */
export function laufenderZeitraum(startIso: string | null, months: number, todayIso: string): { endIso: string; deadlineIso: string; k: number } | null {
  if (!startIso || months <= 0 || todayIso < startIso) return null;
  for (let k = 1; k < 400; k++) {
    const endIso = periodEndIso(startIso, months * k);
    if (endIso >= todayIso) return { endIso, deadlineIso: periodEndIso(startIso, months * k - 1), k };
  }
  return null;
}

/**
 * Erinnerung fällig? Ende des laufenden Zeitraums höchstens {@link VORAUSZAHLUNG_ERINNERUNG_TAGE} Tage entfernt
 * und für dieses Ende noch nicht erinnert.
 */
export function erinnerungFaellig(o: { startIso: string | null; months: number; todayIso: string; remindedForIso: string | null }): { endIso: string; deadlineIso: string } | null {
  const z = laufenderZeitraum(o.startIso, o.months, o.todayIso);
  if (!z) return null;
  const tage = dayNum(z.endIso) - dayNum(o.todayIso);
  if (tage > VORAUSZAHLUNG_ERINNERUNG_TAGE) return null;
  if (o.remindedForIso === z.endIso) return null;
  return { endIso: z.endIso, deadlineIso: z.deadlineIso };
}

/** Absätze der Mail (Sie-Form, ohne Gedankenstriche). */
export function erinnerungAbsaetze(o: {
  months: number;
  endIso: string;
  deadlineIso: string;
  todayIso: string;
  /** Betrag des nächsten Zeitraums netto (null = unbekannt, dann ohne Betrag) */
  betrag: number | null;
  ueberweisung: boolean;
}): string[] {
  const zeitraum = o.months === 12 ? "12 Monate" : `${o.months} Monate`;
  const zahlung = o.ueberweisung ? "kommt dann wie gewohnt per Rechnung" : "wird dann wie gewohnt abgebucht";
  const absaetze = [
    `Ihre Vorauszahlung läuft am ${fmtIso(o.endIso)} aus. Danach verlängert sich Ihr Vertrag automatisch um weitere ${zeitraum}${
      o.betrag != null ? `, der Betrag von ${eur(o.betrag)} netto für die nächsten ${zeitraum} ${zahlung}` : ""
    }.`,
  ];
  if (o.todayIso <= o.deadlineIso) {
    absaetze.push(
      `Möchten Sie nicht verlängern, kündigen Sie bitte bis zum ${fmtIso(o.deadlineIso)} im Kundenbereich unter „Konto & Rechnungen“. Ihr Vertrag endet dann am ${fmtIso(o.endIso)}.`,
    );
  } else {
    absaetze.push(
      `Die Kündigungsfrist von einem Monat für dieses Ende ist bereits abgelaufen. Eine Kündigung wirkt deshalb zum Ende des folgenden Zeitraums.`,
    );
  }
  absaetze.push("Lieber monatlich zahlen oder Fragen zum Vertrag? Antworten Sie einfach auf diese E-Mail.");
  return absaetze;
}

const berlinIso = (d: Date) => berlinTodayIso(d);
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Täglich im Cron: Erinnerungen verschicken. Gibt die Zahl der verschickten Erinnerungen zurück. */
export async function remindPrepayEnd(now = new Date()): Promise<{ sent: number; failed: number }> {
  const todayIso = berlinIso(now);
  const kunden = await prisma.customer.findMany({
    where: {
      billingInterval: { in: ["year", "halfyear"] },
      isTest: false,
      archived: false,
      cancelRequestedAt: null,
      OR: [{ retainerEnd: null }, { retainerEnd: { gt: now } }],
    },
    select: {
      id: true,
      billingInterval: true,
      retainerStart: true,
      billingDay: true,
      billingStart: true,
      prepayReminderFor: true,
      retainerMonthly: true,
      seatsBilled: true,
      seatMonthly: true,
      bestandMonthly: true,
      empfehlungMonthly: true,
      zahltPerUeberweisung: true,
      salesContact: { select: { id: true } },
      onboarding: { select: { offerId: true, salesContactId: true } },
      users: { where: { role: "BUYER", teamRole: "owner" }, select: { email: true } },
    },
  });
  let sent = 0;
  let failed = 0;
  for (const c of kunden) {
    if (!isPrepaid(c.billingInterval)) continue;
    const rhythmus = normalizeRhythmus(c.billingInterval);
    const months = RHYTHMUS_MONATE[rhythmus];
    // Zeiträume zählen ab dem ersten Abrechnungstag (lib/abrechnungstag.ts), sonst ab dem Start
    const start = (c.billingDay != null ? c.billingStart : null) ?? c.retainerStart;
    const due = erinnerungFaellig({
      startIso: start ? berlinIso(start) : null,
      months,
      todayIso,
      remindedForIso: c.prepayReminderFor ? berlinIso(c.prepayReminderFor) : null,
    });
    if (!due) continue;
    const to = [...new Set(c.users.map((u) => u.email).filter(Boolean))];
    if (!to.length) continue;
    // Merkfeld zuerst setzen (bedingt): parallele Läufe verschicken nicht doppelt
    const marke = new Date(`${due.endIso}T12:00:00Z`);
    const claimed = await prisma.customer.updateMany({
      where: { id: c.id, OR: [{ prepayReminderFor: null }, { prepayReminderFor: { not: marke } }] },
      data: { prepayReminderFor: marke },
    });
    if (claimed.count === 0) continue;
    const offer = c.onboarding?.offerId
      ? await prisma.offer.findUnique({ where: { id: c.onboarding.offerId }, select: { annualFreeMonths: true, contactName: true } })
      : null;
    const monthly = num(c.retainerMonthly) + c.seatsBilled * num(c.seatMonthly) + num(c.bestandMonthly) + num(c.empfehlungMonthly);
    const betrag = monthly > 0 ? Math.round(monthly * rhythmusFaktor(rhythmus, offer?.annualFreeMonths) * 100) / 100 : null;
    let url: string | null = null;
    try {
      url = `${getAppUrl()}/buyer/konto`;
    } catch {
      url = null;
    }
    const res = await sendCustomerMail({
      to,
      subject: `Ihre Vorauszahlung läuft am ${fmtIso(due.endIso)} aus`,
      greeting: await customerGreeting({ salesContactId: c.salesContact?.id ?? c.onboarding?.salesContactId ?? null, contactName: offer?.contactName ?? null }),
      paragraphs: erinnerungAbsaetze({ months, endIso: due.endIso, deadlineIso: due.deadlineIso, todayIso, betrag, ueberweisung: !!c.zahltPerUeberweisung }),
      ...(url ? { button: { label: "Zu Konto & Rechnungen", url } } : {}),
    }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (res.ok) {
      sent++;
    } else {
      // Kein zweiter Versuch (genau einmal je Zeitraum); Fehler sieht Ole im Monitoring
      failed++;
      reportError(new Error(res.error), "vorauszahlung-erinnerung", { customer: c.id });
    }
  }
  return { sent, failed };
}
