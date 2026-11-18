// Abrechnungstag im Angebot (Ole, 18.11.2026): Start und Abrechnung können auseinanderfallen, z. B. Start 1.1.,
// Abbuchung immer am 15. Die Zeit vom Start bis zum Tag vor dem ersten Abrechnungstag ist entweder kostenlos
// („kostenloser Start“, nie „Testphase“) oder wird anteilig mit der ersten Abbuchung berechnet.
// Reine Funktionen (auch im Browser): Admin-Formular, Angebotsseite, Auftragsbestätigung, Stripe-Zeitplan.
//
// Regeln:
// - Abrechnungstag 1 bis 28 (gibt es in jedem Monat); null = wie der Starttag (Verhalten wie bisher, auch bei
//   Start am 29. bis 31.: Stripe bucht dann in kürzeren Monaten am Monatsletzten ab).
// - Erster Abrechnungstag = der erste Tag mit diesem Tag im Monat am oder nach dem Start.
// - Mindestlaufzeit, Startpreis-Monate und Abrechnungsmonate zählen ab dem ersten Abrechnungstag, die Zeit
//   davor kommt dazu. So endet der Vertrag immer mit einem bezahlten Abrechnungsmonat.
// - Leads, Assistent und Kampagne starten weiter am Starttag; Monatsziele und Berichte bleiben beim Kalendermonat.

export const ABRECHNUNGSTAG_MIN = 1;
export const ABRECHNUNGSTAG_MAX = 28;

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
const parts = (s: string) => s.split("-").map(Number) as [number, number, number];
const dayMs = 24 * 60 * 60 * 1000;
const daysBetween = (a: string, b: string) => Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / dayMs);
const ymd = (s: string): [number, number, number] => {
  const [y, m, d] = parts(s);
  return [y, m - 1, d];
};

/** Eingabe prüfen: 1 bis 28, leer = wie Start (null). Ungültig → Fehlertext. */
export function parseAbrechnungstag(v: unknown): { ok: true; day: number | null } | { ok: false; error: string } {
  if (v == null || v === "" || v === 0) return { ok: true, day: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < ABRECHNUNGSTAG_MIN || n > ABRECHNUNGSTAG_MAX) {
    return { ok: false, error: `Der Abrechnungstag muss zwischen ${ABRECHNUNGSTAG_MIN} und ${ABRECHNUNGSTAG_MAX} liegen.` };
  }
  return { ok: true, day: n };
}

/** Erster Abrechnungstag (YYYY-MM-DD) am oder nach dem Start; ohne Abrechnungstag = Start. */
export function ersterAbrechnungstag(startIso: string, billingDay: number | null | undefined): string {
  if (!billingDay) return startIso;
  const [y, m, d] = parts(startIso);
  if (d === billingDay) return startIso;
  return d < billingDay ? isoOf(y, m, billingDay) : isoOf(y, m + 1, billingDay);
}

export type Abrechnungsplan = {
  startIso: string;
  /** Erster Abrechnungstag (= Start, wenn kein eigener Abrechnungstag) */
  firstIso: string;
  /** Tag im Monat, an dem abgebucht wird */
  day: number;
  /** Abrechnungstag weicht vom Start ab (sonst alles wie bisher) */
  differs: boolean;
  /** Zeit bis zum ersten Abrechnungstag kostenlos */
  free: boolean;
  /** Letzter Tag vor dem ersten Abrechnungstag (nur wenn differs) */
  stubEndIso: string | null;
  /** Anteil des ersten Abrechnungszeitraums, der auf die Zeit davor entfällt (0 ohne Abweichung oder gratis) */
  ratio: number;
};

/**
 * Plan aus Start, Abrechnungstag und „kostenloser Start“. annual: Jahreszahlung (anteilig über das Jahr).
 * null ohne Start.
 */
export function abrechnungsplan(o: { startIso: string | null; billingDay?: number | null; freeStart?: boolean; annual?: boolean }): Abrechnungsplan | null {
  if (!o.startIso) return null;
  const firstIso = ersterAbrechnungstag(o.startIso, o.billingDay);
  const differs = firstIso !== o.startIso;
  const free = differs && !!o.freeStart;
  let ratio = 0;
  if (differs && !free) {
    // Zeitraum, den die erste volle Abbuchung abdecken würde, rückwärts vom ersten Abrechnungstag
    const [y, m, d] = parts(firstIso);
    const prevIso = o.annual ? isoOf(y - 1, m, d) : isoOf(y, m - 1, d);
    ratio = daysBetween(o.startIso, firstIso) / daysBetween(prevIso, firstIso);
  }
  const [fy, fm, day] = parts(firstIso);
  return { startIso: o.startIso, firstIso, day, differs, free, stubEndIso: differs ? isoOf(fy, fm, day - 1) : null, ratio };
}

/** Anteiliger Betrag in Cent für die Zeit bis zum ersten Abrechnungstag. */
export const anteilCent = (totalCent: number, plan: Pick<Abrechnungsplan, "ratio">) => Math.round(totalCent * plan.ratio);

/**
 * Anteil auf Positionen verteilen (Cent je Position), Summe = {@link anteilCent} der Gesamtsumme.
 * Rest nach dem Abrunden geht an die größte Position.
 */
export function anteilVerteilen(lineCents: number[], plan: Pick<Abrechnungsplan, "ratio">): number[] {
  const total = anteilCent(lineCents.reduce((s, c) => s + c, 0), plan);
  const out = lineCents.map((c) => Math.floor(c * plan.ratio));
  const rest = total - out.reduce((s, c) => s + c, 0);
  if (rest !== 0 && out.length) out[lineCents.indexOf(Math.max(...lineCents))] += rest;
  return out;
}

/** TT.MM.JJJJ bzw. TT.MM. */
const lang = (s: string) => s.split("-").reverse().join(".");
const kurz = (s: string) => {
  const [, m, d] = parts(s);
  return `${pad(d)}.${pad(m)}.`;
};
const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/**
 * Sätze für die Kundenseite (Sie-Form, ohne Gedankenstriche). Leer, wenn der Abrechnungstag dem Start entspricht.
 * firstNet: Betrag der ersten vollen Abbuchung netto (Monatsbeitrag, Startpreis bzw. Jahresbeitrag).
 */
export function abrechnungstagSaetze(plan: Abrechnungsplan | null, o: { firstNet: number; annual?: boolean }): string[] {
  if (!plan?.differs) return [];
  const beitrag = o.annual ? "Jahresbeitrag" : "Monatsbeitrag";
  const rhythmus = o.annual ? `danach jedes Jahr am ${kurz(plan.firstIso)}` : `jeweils am ${plan.day}.`;
  const saetze = [`Start am ${lang(plan.startIso)}. Ihr ${beitrag} wird ab dem ${lang(plan.firstIso)} ${rhythmus} abgebucht.`];
  if (plan.free) saetze.push(`Die Zeit vom ${kurz(plan.startIso)} bis ${kurz(plan.stubEndIso!)} ist für Sie kostenlos.`);
  else {
    const anteil = anteilCent(Math.round(o.firstNet * 100), plan) / 100;
    saetze.push(`Für die Zeit vom ${kurz(plan.startIso)} bis ${kurz(plan.stubEndIso!)} berechnen wir anteilig ${euro(anteil)} netto, zusammen mit der ersten Abbuchung.`);
  }
  return saetze;
}

/** Kurzform für den Admin (Formular, Kundenakte). */
export function abrechnungstagKurz(plan: Abrechnungsplan | null): string {
  if (!plan) return "wie Start";
  if (!plan.differs) return `am ${plan.day}. (wie Start)`;
  return `am ${plan.day}., erste Abbuchung ${lang(plan.firstIso)}, ${plan.free ? `kostenloser Start bis ${kurz(plan.stubEndIso!)}` : `${kurz(plan.startIso)} bis ${kurz(plan.stubEndIso!)} anteilig`}`;
}
