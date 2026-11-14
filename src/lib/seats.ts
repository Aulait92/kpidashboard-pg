// Plätze im Team: „3 aktive Verkäufer inklusive“ (Ole, 14.11.2026).
//
// Aktiv ist ein Mitglied, das Leads bekommt (Schalter „bekommt Leads“ an) oder am
// laufenden Tag (Berliner Zeit) einen Lead zugewiesen bekommen hat: Verteilung,
// Zuteilen von Hand oder Terminbuchung. Mitglieder ohne Leads (z. B. Inhaber, der
// nur steuert, Assistenz) sind kostenlos. Berechnet wird je aktivem Verkäufer über
// den inklusiven hinaus, im Stripe-Abo tagesgenau (Proration).
//
// Bisherige Regel (bis 14.11.2026): jeder Login zählte. Die neue Regel zählt eine
// Teilmenge davon (aktive ⊆ Logins); seatsToBill() deckelt zusätzlich ausdrücklich
// auf die alte Regel, damit niemand durch die Umstellung mehr zahlt.
//
// Bewusst ohne Importe (reine Logik): läuft im Browser, in Tests und im
// Trockenlauf-Skript scripts/plaetze-trockenlauf.mjs (node --experimental-strip-types).

export type SeatMember = { receivesLeads: boolean; leadReceivedAt: Date | null };

/** Tagesbeginn (00:00 Berliner Zeit) des Tages von `now` als UTC-Zeitpunkt. */
export function berlinDayStart(now: Date): Date {
  const parts = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).formatToParts(d);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), mi: g("minute") };
  };
  const t = parts(now);
  const midnightAsUtc = Date.UTC(t.y, t.m - 1, t.d);
  // Versatz zur Mitternacht selbst bestimmen (Sommer-/Winterzeit-Wechsel in der Nacht)
  const offsetNow = Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi) - Math.floor(now.getTime() / 60_000) * 60_000;
  const guess = new Date(midnightAsUtc - offsetNow);
  const g = parts(guess);
  const offsetGuess = Date.UTC(g.y, g.m - 1, g.d, g.h, g.mi) - guess.getTime();
  return new Date(midnightAsUtc - offsetGuess);
}

/** Zählt das Mitglied heute als aktiver Verkäufer? */
export function isActiveSeller(m: SeatMember, dayStart: Date): boolean {
  return m.receivesLeads || (!!m.leadReceivedAt && m.leadReceivedAt.getTime() >= dayStart.getTime());
}

export function countActiveSellers(members: SeatMember[], dayStart: Date): number {
  return members.filter((m) => isActiveSeller(m, dayStart)).length;
}

/** Bisherige Regel: jeder Login über den inklusiven hinaus (nur zum Vergleich). */
export function legacySeatsToBill(o: { logins: number; included: number; price: number }): number {
  return o.price > 0 ? Math.max(0, o.logins - o.included) : 0;
}

/**
 * Weitere Verkäufer, die berechnet werden: aktive über den inklusiven hinaus.
 * Nie mehr als nach der bisherigen Regel (alle Logins), auch wenn die Zählung
 * einmal mehr aktive als Logins liefern sollte.
 */
export function seatsToBill(o: { active: number; logins: number; included: number; price: number }): number {
  if (!(o.price > 0)) return 0;
  return Math.min(Math.max(0, o.active - o.included), legacySeatsToBill(o));
}

/** Entsteht durch einen weiteren aktiven Verkäufer ein Aufpreis? */
export function addsSeatCost(o: { active: number; included: number; price: number }): boolean {
  return o.price > 0 && o.active + 1 > o.included;
}

// ─── Texte (Sie-Form, ohne Gedankenstriche) ──────────────────────────────

export function fmtSeatPrice(n: number): string {
  return `${n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })} netto`;
}

/** „3 aktive Verkäufer sind inklusive“ bzw. „1 aktiver Verkäufer ist inklusive“. */
export function includedPhrase(included: number): string {
  return included === 1 ? "1 aktiver Verkäufer ist inklusive" : `${included} aktive Verkäufer sind inklusive`;
}

/** Hinweis auf der Team-Seite. */
export function seatSummary(o: { included: number; active: number; price: number }): string {
  const extra = Math.max(0, o.active - o.included);
  const price = fmtSeatPrice(o.price);
  const cost =
    extra === 0
      ? `Jeder weitere Verkäufer kostet ${price} im Monat.`
      : extra === 1
        ? `1 weiterer Verkäufer kostet ${price} im Monat.`
        : `${extra} weitere Verkäufer kosten je ${price} im Monat.`;
  return `${includedPhrase(o.included)}, Sie haben ${o.active}. Mitglieder ohne Leads (z. B. Inhaber, der nur steuert) sind kostenlos. ${cost}`;
}

/** Kostenhinweis, bevor ein weiterer aktiver Verkäufer dazukommt (Einladen, Umschalten, Zuteilen). */
export function addSeatCostHint(price: number, who = "Dieser Verkäufer"): string {
  return `${who} kostet zusätzlich ${fmtSeatPrice(price)} im Monat, tagesgenau abgerechnet.`;
}

// ─── Änderungsliste für bestehende Kunden (Trockenlauf) ─────────────────

export type SeatChangeInput = {
  customerId: string;
  name: string;
  included: number;
  price: number;
  /** Zurzeit im Abo berechnete weitere Logins (Customer.seatsBilled) */
  billed: number;
  logins: number;
  active: number;
};

export type SeatChange = SeatChangeInput & {
  /** nach bisheriger Regel (alle Logins) */
  legacy: number;
  /** nach neuer Regel (aktive Verkäufer), nie über `legacy` */
  next: number;
  /** weniger: wird gesenkt · gleich · nachberechnung: bisher zu wenig berechnet (Fehler), nie über der alten Regel */
  kind: "weniger" | "gleich" | "nachberechnung";
};

export function seatChange(i: SeatChangeInput): SeatChange {
  const legacy = legacySeatsToBill(i);
  const next = seatsToBill(i);
  const kind = next < i.billed ? "weniger" : next === i.billed ? "gleich" : "nachberechnung";
  return { ...i, legacy, next, kind };
}
