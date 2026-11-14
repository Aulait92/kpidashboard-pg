// Kostenlose Zeiträume (Testphasen, Prämien, Aktionen) einheitlich nach AGB „Testphasen und kostenlose
// Zeiträume“ (Ole, 14.11.2026): Hinweis spätestens 7 Tage vor Ende per E-Mail und im Kundenbereich,
// jederzeit vorher kostenlos beendbar. Reine Funktionen (auch im Browser nutzbar).

export const FREE_PERIOD_REMINDER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type FreePeriodNotice = {
  key: "empfehlung" | "bestand";
  title: string;
  text: string;
  /** Wo der Kunde die Leistung beendet */
  href: string;
  endsAt: Date;
};

export type FreePeriodCustomer = {
  empfehlungEnabled?: boolean | null;
  empfehlungMonthly?: unknown;
  empfehlungFree?: boolean | null;
  empfehlungCancelAt?: Date | null;
  empfehlungTrialEndsAt?: Date | null;
  bestandFreeUntil?: Date | null;
  bestandMonthly?: unknown;
  bestandCancelAt?: Date | null;
};

const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const eur = (n: number) => `${new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)} netto`;

const within = (end: Date | null | undefined, now: Date) => !!end && end.getTime() > now.getTime() && end.getTime() - now.getTime() <= FREE_PERIOD_REMINDER_DAYS * DAY_MS;

/** Hinweise für den Kundenbereich: kostenlose Zeiträume, die in höchstens 7 Tagen enden. */
export function freePeriodNotices(c: FreePeriodCustomer, opts: { empfehlungPrice: number; now?: Date }): FreePeriodNotice[] {
  const now = opts.now ?? new Date();
  const out: FreePeriodNotice[] = [];
  if (c.empfehlungEnabled && c.empfehlungMonthly == null && !c.empfehlungFree && !c.empfehlungCancelAt && within(c.empfehlungTrialEndsAt, now)) {
    out.push({
      key: "empfehlung",
      title: `Testphase „Empfehlungen & Bewertungen“ endet am ${fmt(c.empfehlungTrialEndsAt!)}`,
      text: `Danach läuft das Modul automatisch für ${eur(opts.empfehlungPrice)} im Monat weiter. Bis dahin können Sie es kostenlos beenden.`,
      href: "/buyer/konto?modul=empfehlung#zusatzmodule",
      endsAt: c.empfehlungTrialEndsAt!,
    });
  }
  const bestandPrice = c.bestandMonthly != null ? Number(c.bestandMonthly) : 0;
  if (bestandPrice > 0 && !c.bestandCancelAt && within(c.bestandFreeUntil, now)) {
    out.push({
      key: "bestand",
      title: `Gratiszeit Bestandskunden-Modul endet am ${fmt(c.bestandFreeUntil!)}`,
      text: `Danach läuft das Modul automatisch für ${eur(bestandPrice)} im Monat weiter. Bis dahin können Sie es kostenlos beenden.`,
      href: "/buyer/konto#zusatzmodule",
      endsAt: c.bestandFreeUntil!,
    });
  }
  return out;
}
