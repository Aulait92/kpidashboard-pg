// Bedingungen des Bestandskunden-Moduls je Zahlweise (rein, auch im Browser nutzbar).
// Monatlich: anteilig ab heute, kündbar zum Ende des Abrechnungsmonats.
// Jährliche Vorauszahlung: Jahresbetrag (12 − Freimonate) anteilig bis zum Ende des
// bezahlten Jahres; Kündigung wirkt zum Ende des bezahlten Jahres, keine anteilige Erstattung.

export type BestandTerms = { charge: string; cancel: string; cancelDialog: string };

export function bestandTerms(opts: { annual: boolean; monthlyNet: number; freeMonths: number }): BestandTerms {
  const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  if (!opts.annual) {
    return {
      charge: "Anteilig ab heute, danach monatlich mit Ihrer Rechnung",
      cancel: "Monatlich kündbar zum Ende des Abrechnungsmonats",
      cancelDialog: "Das Modul läuft bis zum Ende des aktuellen Abrechnungsmonats weiter und wird danach nicht mehr berechnet.",
    };
  }
  const yearly = Math.round(opts.monthlyNet * (12 - opts.freeMonths) * 100) / 100;
  return {
    charge: `Jährliche Vorauszahlung: ${eur(yearly)} netto im Jahr (${opts.freeMonths} Monate geschenkt), anteilig bis zum Ende Ihres Abrechnungsjahres`,
    cancel: "Kündbar zum Ende des bezahlten Abrechnungsjahres, keine anteilige Erstattung",
    cancelDialog:
      "Sie zahlen jährlich im Voraus: Das Modul läuft bis zum Ende Ihres bezahlten Abrechnungsjahres weiter und wird danach nicht mehr berechnet. Eine anteilige Erstattung gibt es nicht.",
  };
}
