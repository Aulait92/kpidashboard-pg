// Reine Rechnungen für die Diagnose q=cash (ohne Datenbank, getestet in tests/unit/cash-rechnung.test.ts).
// Kategorien für Ein- und Ausgänge, Bewegungen je Zeitraum, Kosten je Monat und die Umsatzsteuer-Schätzung
// aus den Kontoauszügen. Gegenpartei und Verwendungszweck werden nur zum Einordnen gelesen, nie ausgegeben.

import { netCost } from "@/lib/bank/rules";

const DAY = 86_400_000;

export type KontoArt = "commerzbank" | "amex";

export type Buchung = {
  accountKey: string;
  bookingDate: Date;
  /** Ausgaben negativ, EUR brutto */
  amount: number;
  status: string; // neu | zugeordnet | ignoriert
  costPurpose: string | null;
  vatIncluded: boolean;
  counterparty: string | null;
  purpose: string | null;
};

/** Eigene Regel mit „ignorieren“ (CostRule), z. B. „ole kannapinn“ nur in der Gegenpartei. */
export type IgnoreRegel = { pattern: string; label: string | null; counterpartyOnly: boolean };

/** Euro auf 2 Nachkommastellen (ohne -0). */
export const r2 = (x: number) => {
  const v = Math.round(x * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const hay = (b: Pick<Buchung, "counterparty" | "purpose">) => `${norm(b.counterparty)} | ${norm(b.purpose)}`;

/** Konto-Art aus dem Konto-Schlüssel: „csv:amex“ (und Varianten) ist die Kreditkarte, alles andere das Geschäftskonto. */
export function kontoArt(accountKey: string): KontoArt {
  return /amex|american/i.test(accountKey) ? "amex" : "commerzbank";
}

/** Fehlertext ohne IBANs, Schlüssel oder lange Kennungen, gekürzt. */
export function kurzerFehler(msg: unknown): string | null {
  if (msg == null || msg === "") return null;
  const s = (msg instanceof Error ? msg.message : String(msg))
    .replace(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g, "…")
    .replace(/(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/g, "…")
    .replace(/Bearer\s+\S+/gi, "Bearer …")
    .replace(/[A-Za-z0-9_\-.]{24,}/g, "…")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

// ─── Ausgaben ────────────────────────────────────────────────────────────

export const AUSGABE_ZWECKE = ["ppl", "software", "akquise", "betrieb", "ignoriert", "neu"] as const;
export type AusgabeZweck = (typeof AUSGABE_ZWECKE)[number];
const KOSTEN_ZWECKE = ["ppl", "software", "akquise", "betrieb"] as const;
type KostenZweck = (typeof KOSTEN_ZWECKE)[number];

/** Zweck einer Ausgabe: „ki“ zählt in „software“ (wie monthlyBankCosts), ohne Zweck = unzugeordnet („neu“). */
export function ausgabeZweck(b: Pick<Buchung, "status" | "costPurpose">): AusgabeZweck {
  if (b.status === "ignoriert") return "ignoriert";
  if (b.status !== "zugeordnet" || !b.costPurpose) return "neu";
  if (b.costPurpose === "ki") return "software";
  return (KOSTEN_ZWECKE as readonly string[]).includes(b.costPurpose) ? (b.costPurpose as KostenZweck) : "betrieb";
}

// ─── Steuern ─────────────────────────────────────────────────────────────

export type SteuerArt = "ust" | "sonstige" | "unklar";

const BEHOERDE = /finanzamt|bundeskasse|landeskasse|landeshauptkasse|stadtkasse|gemeindekasse|steuerkasse|(^|[^a-z0-9äöüß])fa [a-zäöü]/;
const STEUERNUMMER = /steuer-?nr|steuernummer|(^|[^a-z0-9])st\.? ?-?nr\b|\b\d{2,3}\/\d{3,4}\/\d{4,5}\b/;
const UST_VORAUS = /umsatzsteuer-? ?(voraus|voranmeld)/;
const UST = /(^|[^a-z0-9äöüß])(ust|u-st|ustva|ust-?va|uva|umsatzsteuer\w*|umsatzst|vorsteuer\w*)([^a-z0-9äöüß]|$)/;
const SONSTIGE_STEUER =
  /einkommensteuer|einkommenst|lohnsteuer|körperschaftsteuer|koerperschaftsteuer|gewerbesteuer|kirchensteuer|solidarit|kfz-?steuer|kraftfahrzeugsteuer|säumnis|saeumnis|(^|[^a-z0-9äöüß])(est|kst|lst|gewst|soli)([^a-z0-9äöüß]|$)/;

/**
 * Zahlung an das Finanzamt (bzw. Erstattung von dort)? Nur mit Behörde, Steuernummer oder „Umsatzsteuer-Vorauszahlung“
 * im Text, damit Lieferanten-Rechnungen mit „inkl. USt“ nicht als Steuerzahlung zählen.
 * „ust“: Umsatzsteuer erkennbar; „sonstige“: andere Steuerart erkennbar; „unklar“: Finanzamt ohne erkennbare Art.
 */
export function steuerArt(b: Pick<Buchung, "counterparty" | "purpose">): SteuerArt | null {
  const h = hay(b);
  if (!BEHOERDE.test(h) && !STEUERNUMMER.test(h) && !UST_VORAUS.test(h)) return null;
  const ust = UST.test(h) || UST_VORAUS.test(h);
  const sonst = SONSTIGE_STEUER.test(h);
  if (ust && !sonst) return "ust";
  if (sonst && !ust) return "sonstige";
  return "unklar";
}

// ─── Eingänge ────────────────────────────────────────────────────────────

export const EINGANGS_ARTEN = ["kunde_stripe", "kunde_direkt", "einlage", "einlage_vermutet", "umbuchung", "steuererstattung", "kartenausgleich", "erstattung"] as const;
export type EingangsArt = (typeof EINGANGS_ARTEN)[number];

const PRIVAT_REGEL = /privat|kannapinn|einlage|darlehen|umbuch|eigen|gesellschafter/;
const EINLAGE_VERMUTET = /kannapinn|einlage|darlehen|gesellschafter|umbuchung|übertrag|uebertrag|performance ?growth/;
const ERSTATTUNG = /erstattung|refund|storno|rücklastschrift|ruecklastschrift|retoure|rückzahlung|rueckzahlung/;
const KARTENAUSGLEICH = /zahlung erhalten|payment received|zahlung.{0,20}danke|lastschrift/;

/**
 * Art eines Eingangs. Reihenfolge: eigene Gegenbuchung (Umbuchung) → Finanzamt → Stripe-Auszahlung → Amex
 * → Einlage per Regel („ignorieren“, nur Gegenpartei, Bezeichnung „Privat“ o. ä.) → Einlage vermutet (Name/Stichwort)
 * → Erstattung von Anbietern → sonst Kundenzahlung direkt.
 */
export function eingangsArt(b: Buchung, ctx: { regeln: IgnoreRegel[]; gegenbuchung?: boolean }): EingangsArt {
  const h = hay(b);
  if (kontoArt(b.accountKey) === "amex") return KARTENAUSGLEICH.test(h) ? "kartenausgleich" : "erstattung";
  if (ctx.gegenbuchung) return "umbuchung";
  if (steuerArt(b)) return "steuererstattung";
  if (h.includes("stripe")) return "kunde_stripe";
  if (/american express|(^|[^a-z])amex([^a-z]|$)/.test(h)) return "umbuchung";
  const cp = norm(b.counterparty);
  if (
    cp &&
    ctx.regeln.some((r) => r.counterpartyOnly && norm(r.pattern) && cp.includes(norm(r.pattern)) && PRIVAT_REGEL.test(norm(`${r.label ?? ""} ${r.pattern}`)))
  )
    return "einlage";
  if (EINLAGE_VERMUTET.test(h)) return "einlage_vermutet";
  if (ERSTATTUNG.test(h)) return "erstattung";
  return "kunde_direkt";
}

/**
 * Umbuchungen zwischen eigenen Geschäftskonten: Eingang, dem am selben Tag eine Ausgabe gleicher Höhe auf einem
 * anderen eigenen Konto gegenübersteht (jede Ausgabe zählt nur einmal). Gibt die betroffenen Eingänge zurück.
 */
export function gegenbuchungen(buchungen: Buchung[]): Set<Buchung> {
  const key = (b: Buchung) => `${b.bookingDate.toISOString().slice(0, 10)}|${Math.round(Math.abs(b.amount) * 100)}`;
  const aus = new Map<string, Buchung[]>();
  for (const b of buchungen) {
    if (b.amount >= 0 || kontoArt(b.accountKey) !== "commerzbank") continue;
    aus.set(key(b), [...(aus.get(key(b)) ?? []), b]);
  }
  const out = new Set<Buchung>();
  for (const b of buchungen) {
    if (b.amount <= 0 || kontoArt(b.accountKey) !== "commerzbank") continue;
    const list = aus.get(key(b));
    const i = list?.findIndex((x) => x.accountKey !== b.accountKey) ?? -1;
    if (list && i >= 0) {
      list.splice(i, 1);
      out.add(b);
    }
  }
  return out;
}

// ─── Bewegungen und Kosten je Monat ──────────────────────────────────────

/** UTC-Mitternacht des Tages, der n Tage vor „jetzt“ liegt (Buchungsdaten sind reine Daten). */
export function tageZurueck(jetzt: Date, n: number): Date {
  const d = new Date(jetzt.getTime() - n * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function bewegungen(buchungen: Buchung[], von: Date) {
  let eingaenge = 0;
  let ausgaben = 0;
  const nachZweck = Object.fromEntries(AUSGABE_ZWECKE.map((z) => [z, 0])) as Record<AusgabeZweck, number>;
  for (const b of buchungen) {
    if (b.bookingDate.getTime() < von.getTime()) continue;
    if (b.amount > 0) eingaenge += b.amount;
    else if (b.amount < 0) {
      ausgaben += -b.amount;
      nachZweck[ausgabeZweck(b)] += -b.amount;
    }
  }
  return {
    eingaenge: r2(eingaenge),
    ausgaben: r2(ausgaben),
    saldo: r2(eingaenge - ausgaben),
    ausgabenNachZweck: Object.fromEntries(AUSGABE_ZWECKE.map((z) => [z, r2(nachZweck[z])])) as Record<AusgabeZweck, number>,
  };
}

/** Monat (YYYY-MM) in Berliner Zeit. */
export function berlinMonat(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

/** Die n vollen Monate vor dem laufenden (älteste zuerst). */
export function vorigeMonate(jetzt: Date, n = 3): string[] {
  const [y, m] = berlinMonat(jetzt).split("-").map(Number);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Durchschnitt je Monat der zugeordneten Ausgaben (netto, wo „inkl. USt“) je Zweck über die gegebenen Monate. */
export function kostenJeMonat(buchungen: Buchung[], monate: string[]) {
  const sum = Object.fromEntries(KOSTEN_ZWECKE.map((z) => [z, 0])) as Record<KostenZweck, number>;
  const set = new Set(monate);
  for (const b of buchungen) {
    if (b.amount >= 0 || b.status !== "zugeordnet" || !b.costPurpose) continue;
    if (!set.has(b.bookingDate.toISOString().slice(0, 7))) continue;
    const z = ausgabeZweck(b) as KostenZweck;
    sum[z] += netCost(b.amount, b.vatIncluded);
  }
  const n = Math.max(1, monate.length);
  const jeZweck = Object.fromEntries(KOSTEN_ZWECKE.map((z) => [z, r2(sum[z] / n)])) as Record<KostenZweck, number>;
  return { monate, jeZweck, summe: r2(KOSTEN_ZWECKE.reduce((a, z) => a + sum[z], 0) / n) };
}

// ─── Umsatzsteuer-Schätzung ──────────────────────────────────────────────

/** Enthaltene Umsatzsteuer (19 %) eines Bruttobetrags. */
export const ustAusBrutto = (brutto: number) => r2((brutto * 19) / 119);

/**
 * Möglicherweise doppelt erfasste Geschäftskonto-Buchungen: gleiche Buchung per CSV und per Bankverbindung
 * (gleicher Tag, Betrag und Richtung, einmal „csv:…“, einmal Enable Banking). Wird nur gemeldet, nicht abgezogen.
 */
export function moeglicheDoppelte(buchungen: Buchung[]): { anzahl: number; eingaenge: number } {
  const key = (b: Buchung) => `${b.bookingDate.toISOString().slice(0, 10)}|${Math.round(b.amount * 100)}`;
  const api = new Map<string, number>();
  for (const b of buchungen) {
    if (kontoArt(b.accountKey) !== "commerzbank" || b.accountKey.startsWith("csv:")) continue;
    api.set(key(b), (api.get(key(b)) ?? 0) + 1);
  }
  let anzahl = 0;
  let eingaenge = 0;
  for (const b of buchungen) {
    if (kontoArt(b.accountKey) !== "commerzbank" || !b.accountKey.startsWith("csv:")) continue;
    const n = api.get(key(b)) ?? 0;
    if (!n) continue;
    api.set(key(b), n - 1);
    anzahl++;
    if (b.amount > 0) eingaenge += b.amount;
  }
  return { anzahl, eingaenge: r2(eingaenge) };
}

export function ustSchaetzung(alle: Buchung[], opts: { jahr: number; regeln: IgnoreRegel[] }) {
  const { jahr, regeln } = opts;
  const imJahr = alle.filter((b) => b.bookingDate.getUTCFullYear() === jahr);
  const umb = gegenbuchungen(imJahr);

  const eingang = Object.fromEntries(EINGANGS_ARTEN.map((a) => [a, { anzahl: 0, summe: 0 }])) as Record<EingangsArt, { anzahl: number; summe: number }>;
  const steuer = { ust: 0, ustErstattet: 0, sonstige: 0, unklar: 0, erstattetSonstigeOderUnklar: 0 };
  const aus = { mitUst: 0, ohneUst: 0, unzugeordnet: 0, unzugeordnetAnzahl: 0, ignoriert: 0 };

  for (const b of imJahr) {
    if (b.amount > 0) {
      const art = eingangsArt(b, { regeln, gegenbuchung: umb.has(b) });
      eingang[art].anzahl++;
      eingang[art].summe += b.amount;
      if (art === "steuererstattung") {
        if (steuerArt(b) === "ust") steuer.ustErstattet += b.amount;
        else steuer.erstattetSonstigeOderUnklar += b.amount;
      }
      continue;
    }
    if (b.amount === 0) continue;
    const betrag = -b.amount;
    const s = steuerArt(b);
    if (s) {
      steuer[s] += betrag;
      continue;
    }
    const z = ausgabeZweck(b);
    if (z === "ignoriert") aus.ignoriert += betrag;
    else if (z === "neu") {
      aus.unzugeordnet += betrag;
      aus.unzugeordnetAnzahl++;
    } else if (b.vatIncluded) aus.mitUst += betrag;
    else aus.ohneUst += betrag;
  }

  const kundenBrutto = eingang.kunde_stripe.summe + eingang.kunde_direkt.summe;
  const ausgangsUst = ustAusBrutto(kundenBrutto);
  const vorsteuer = ustAusBrutto(aus.mitUst);
  const bereitsGezahltUst = r2(steuer.ust - steuer.ustErstattet);
  const zahllastGeschaetzt = r2(ausgangsUst - vorsteuer - bereitsGezahltUst);

  return {
    jahr,
    zahllastGeschaetzt,
    zahllastWennUnklarUst: r2(zahllastGeschaetzt - steuer.unklar),
    ausgangsUst,
    vorsteuer,
    bereitsGezahltUst,
    kundenzahlungen: { brutto: r2(kundenBrutto), stripeAuszahlungen: r2(eingang.kunde_stripe.summe), direkt: r2(eingang.kunde_direkt.summe), anzahl: eingang.kunde_stripe.anzahl + eingang.kunde_direkt.anzahl },
    ausgaben: { mitUstBrutto: r2(aus.mitUst), ohneUstBrutto: r2(aus.ohneUst), ignoriertBrutto: r2(aus.ignoriert) },
    finanzamt: {
      ustZahlungen: r2(steuer.ust),
      ustErstattungen: r2(steuer.ustErstattet),
      sonstigeSteuern: r2(steuer.sonstige),
      unklar: r2(steuer.unklar),
      sonstigeErstattungen: r2(steuer.erstattetSonstigeOderUnklar),
    },
    nichtAlsUmsatz: {
      einlagenPerRegel: r2(eingang.einlage.summe),
      einlagenVermutet: r2(eingang.einlage_vermutet.summe),
      umbuchungen: r2(eingang.umbuchung.summe),
      steuererstattungen: r2(eingang.steuererstattung.summe),
      erstattungenAnbieter: r2(eingang.erstattung.summe),
      kartenausgleichAmex: r2(eingang.kartenausgleich.summe),
    },
    unzugeordnet: { anzahl: aus.unzugeordnetAnzahl, brutto: r2(aus.unzugeordnet), vorsteuerHoechstens: ustAusBrutto(aus.unzugeordnet) },
    anzahlVermuteteEinlagen: eingang.einlage_vermutet.anzahl,
    moeglicheDoppelte: moeglicheDoppelte(imJahr),
  };
}

export type Zeitraum = { art: KontoArt; erste: Date | null; letzte: Date | null };

/** Hinweise auf Lücken in den Daten des Jahres (spät begonnen, lange nichts Neues, gar nichts). */
export function datenHinweise(zeitraeume: Zeitraum[], jahr: number, jetzt: Date): string[] {
  const out: string[] = [];
  const name: Record<KontoArt, string> = { commerzbank: "Geschäftskonto", amex: "Amex" };
  const jahresStart = Date.UTC(jahr, 0, 1);
  const tag = (d: Date) => d.toISOString().slice(0, 10);
  for (const art of ["commerzbank", "amex"] as KontoArt[]) {
    const z = zeitraeume.find((x) => x.art === art);
    if (!z?.erste || !z.letzte || z.letzte.getTime() < jahresStart || z.erste.getUTCFullYear() > jahr) {
      out.push(`${name[art]}: keine Buchungen für ${jahr}, Schätzung unvollständig.`);
      continue;
    }
    if (z.erste.getTime() > jahresStart + 7 * DAY) out.push(`${name[art]}: Buchungen erst ab ${tag(z.erste)}, davor fehlen Ein- und Ausgänge für ${jahr}.`);
    const jahresEnde = Math.min(Date.UTC(jahr, 11, 31), jetzt.getTime());
    if (z.letzte.getTime() < jahresEnde - 10 * DAY) out.push(`${name[art]}: letzte Buchung am ${tag(z.letzte)}, neuere fehlen.`);
  }
  return out;
}

/** Feste Annahmen der Schätzung (kurze Sätze). */
export function ustAnnahmen(jahr: number): string[] {
  return [
    "Schätzung aus den Kontoauszügen, kein Ersatz für die Voranmeldung: Steuerberater prüft.",
    `Ist-Versteuerung: Umsatzsteuer entsteht mit dem Zahlungseingang auf dem Geschäftskonto im Jahr ${jahr}.`,
    "Alle Kundenzahlungen enthalten 19 % Umsatzsteuer (19/119 vom Eingang); Kunden im Ausland oder ohne Umsatzsteuer gibt es praktisch nicht.",
    "Stripe-Auszahlungen zählen als Kundenzahlungen; über Stripe bezahlte Rechnungen kommen nur als Auszahlung aufs Konto, nicht zusätzlich einzeln. Auszahlungen sind nach Stripe-Gebühren, die Ausgangs-USt ist daher leicht zu niedrig (siehe stripe.bezahltImJahr).",
    "Nicht als Umsatz: Umbuchungen zwischen eigenen Konten (gleicher Tag und Betrag), Einlagen und Darlehen von Ole (Regel „Privat“; vermutete separat), Erstattungen vom Finanzamt und von Anbietern, Amex-Ausgleich.",
    "Vorsteuer: 19/119 der zugeordneten Ausgaben mit „inkl. USt“ (Geschäftskonto und Amex); 7 % und gemischte Sätze nicht berücksichtigt.",
    "Ausgaben ohne „inkl. USt“ (Reverse Charge wie Meta, Google, OpenAI, Anthropic, Railway, oder steuerfrei) ändern die Zahllast nicht; ignorierte Ausgaben ohne Vorsteuer.",
    `Bereits gezahlt: USt-Zahlungen an das Finanzamt ${jahr} minus USt-Erstattungen. Darin können Zahlungen für ${jahr - 1} stecken; die Voranmeldung für Dezember ${jahr} wird erst ${jahr + 1} fällig.`,
    "Finanzamt-Zahlungen ohne erkennbare Steuerart (unklar) sind nicht abgezogen; zahllastWennUnklarUst zieht sie als USt ab.",
  ];
}
