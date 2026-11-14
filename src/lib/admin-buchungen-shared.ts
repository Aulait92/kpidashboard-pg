// Admin → Zahlen → Buchungen: Typen und Beschriftungen (auch im Browser nutzbar, ohne Datenbank).
// Die Zeilen baut lib/admin-buchungen.ts.

export const BUCHUNG_ARTEN = ["angebot", "produkt", "produkt_anfrage", "modul", "paket", "plaetze", "budget", "pause", "kuendigung", "rabatt", "preis"] as const;
export type BuchungArt = (typeof BUCHUNG_ARTEN)[number];

export const ART_LABEL: Record<BuchungArt, string> = {
  angebot: "Angebot angenommen",
  produkt: "Produkt / Sparte",
  produkt_anfrage: "Produkt-Anfrage (außerhalb Katalog)",
  modul: "Modul",
  paket: "Nachrichten-Paket",
  plaetze: "Verkäufer-Plätze",
  budget: "Budget",
  pause: "Pause",
  kuendigung: "Kündigung",
  rabatt: "Rabatt / Gutschrift",
  preis: "Monatspreis (von Hand)",
};

export const BUCHUNG_STATUS = ["angefragt", "aktiv", "geplant", "abgelehnt", "beendet", "zurueckgenommen"] as const;
export type BuchungStatus = (typeof BUCHUNG_STATUS)[number];

export const STATUS_LABEL: Record<BuchungStatus, string> = {
  angefragt: "angefragt",
  aktiv: "aktiv",
  geplant: "geplant",
  abgelehnt: "abgelehnt",
  beendet: "beendet",
  zurueckgenommen: "zurückgenommen",
};

/** Diese Status zählen in den Summen (Anfragen, Abgelehntes und Zurückgenommenes nicht). */
export const COUNTED_STATUS: readonly BuchungStatus[] = ["aktiv", "geplant", "beendet"];

export type BuchungTask = {
  /** Aufgabe noch offen (sonst erledigt) */
  open: boolean;
  title: string;
  href: string;
};

export type BuchungRow = {
  /** Eindeutig über alle Quellen, z. B. „offer:abc“, „audit:xyz“ */
  id: string;
  /** Herkunft der Zeile (Tabelle bzw. „audit“) und deren id */
  source: "offer" | "productBooking" | "budgetChange" | "pause" | "pack" | "referral" | "audit" | "customer";
  sourceId: string;
  at: Date;
  customerId: string | null;
  customerName: string;
  art: BuchungArt;
  title: string;
  detail: string | null;
  /** Einmalig netto (negativ = Rabatt/Gutschrift); null = kein Betrag */
  oneOff: number | null;
  /** Änderung des monatlichen Betrags netto; null = keine bzw. unbekannt */
  monthly: number | null;
  status: BuchungStatus;
  /** Bei „geplant“: ab wann */
  statusFrom: Date | null;
  task: BuchungTask | null;
  /** Klick auf die Zeile: Kundenakte → Abrechnung (ohne Kundenakte: Vertriebskontakt) */
  href: string;
};

export type BuchungSums = { monthly: number; oneOff: number; open: number; count: number };

const fmtDay = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/** „geplant ab 01.12.2026“ bzw. Status-Wort. */
export function statusText(r: Pick<BuchungRow, "status" | "statusFrom">): string {
  if (r.status === "geplant" && r.statusFrom) return `geplant ab ${fmtDay(r.statusFrom)}`;
  return STATUS_LABEL[r.status];
}

export function isOpen(r: Pick<BuchungRow, "status" | "task">): boolean {
  return r.status === "angefragt" || !!r.task?.open;
}
