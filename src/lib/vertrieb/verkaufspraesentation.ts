// Vertriebspräsentation als Web-Präsentation (Ole, 15.11.2026): Oles aktuelle Folien (Vertreter 24, Makler 25) zum
// Präsentieren im Admin (Vertrieb → Kontakt → „Präsentation“) und zum Nachklicken für den Interessenten
// (/praesentation/<token>). Die Folien sind Bilder aus den PPTX (scripts/vertrieb-folien.mjs), außer:
// Folie 13 (Video des Assistenten), Folie 17 „Beraten mit echten Preisen“ (rechts die Live-Demo aus /demo/beratung),
// „Rechnet sich das?“ und „Ihr Paket“ (als HTML, mit Namen und Preisen aus dem Angebot des Kontakts, sonst Listenpreise).
// Keine Sprechzettel (Ole, 15.11.2026). Reine Funktionen; Laden und Links: verkaufspraesentation-server.ts.
//
// Texte gehen an Interessenten: keine Gedankenstriche (Bis-Striche in Zahlenbereichen sind ok), Minus als „−“.

import { ABSCHLUSSBONUS_STANDARD, betreuungsSatz, eurText, monthlyBudgetOf, normalizeTerm, offerAddOns, PACKAGE_LABEL, PRICE_LIST, setupForChoice, VORAUSZAHLUNG, type OfferTerm } from "@/lib/offer-pricing";
import { BESTAND_MODULE_AVAILABLE } from "@/lib/bestand/sichtbar";

export type VerkaufsAudience = "vertreter" | "makler";
export const VERKAUFS_AUDIENCES: readonly VerkaufsAudience[] = ["vertreter", "makler"];
export const isVerkaufsAudience = (v: unknown): v is VerkaufsAudience => v === "vertreter" || v === "makler";

export const BILD_BASIS = "/praesentation/vertrieb";
// Startet mit Folie 1 (Ole, 15.11.2026), nicht mehr auf dem Vergleich
export const DEMO_EINGEBETTET = "/demo/beratung?eingebettet=1";

type Art = "bild" | "video" | "demo" | "rechnung" | "paket" | "bonus";
/** nr: Position in der Präsentation; bild: Nummer des Folienbilds aus der PPTX (Bild-, Video- und Demofolien). */
export type VerkaufsFolieDef = { nr: number; titel: string; art: Art; bild: number };

const GEMEINSAM: Omit<VerkaufsFolieDef, "nr" | "bild">[] = [
  { titel: "Alles Wichtige zur Leadgenerierung", art: "bild" },
  { titel: "Wer sind wir?", art: "bild" },
  { titel: "Ole Kannapinn", art: "bild" },
  { titel: "Online-Marketer des Jahres", art: "bild" },
  { titel: "Leadgenerierung im großen Stil", art: "bild" },
  { titel: "Mirko Thurm", art: "bild" },
  { titel: "Wie sieht unsere Zusammenarbeit aus?", art: "bild" },
  { titel: "Ansprache der Leads auf Social Media", art: "bild" },
  { titel: "Welche Produkte sind möglich?", art: "bild" },
  { titel: "Warum gute Leads verloren gehen", art: "bild" },
  // Folie 11/12 getauscht (Ole, 19.11.2026): erst „Der Lead bucht selbst“, dann „Sonntag, 21:47 Uhr“
  { titel: "Der Lead bucht selbst", art: "bild" },
  { titel: "Sonntag, 21:47 Uhr", art: "bild" },
  { titel: "So arbeitet Ihr digitaler Assistent", art: "video" },
  { titel: "Kein Lead geht mehr verloren", art: "bild" },
  { titel: "Jeden Morgen wissen Sie, wen Sie anrufen", art: "bild" },
  { titel: "Perfekt vorbereitet in jeden Termin", art: "bild" },
  { titel: "Beraten mit echten Preisen", art: "demo" },
  // Folie 18 (Ole, 17.11.2026): Komplettcheck und Cross-Selling im Termin; alle Folien danach eine Nummer weiter
  { titel: "Viele wollen den Komplettcheck", art: "bild" },
  // Folie 19 (Ole, 17.11.2026, Fassung eca12945): Policen vorab per WhatsApp, Vergleichsblatt in der Terminvorbereitung
  { titel: "Policen vorab", art: "bild" },
  { titel: "Sie wissen jederzeit, ob es sich rechnet", art: "bild" },
];

const ENDE: Record<VerkaufsAudience, Omit<VerkaufsFolieDef, "nr" | "bild">[]> = {
  vertreter: [
    { titel: "Rechnet sich das?", art: "rechnung" },
    { titel: "Ihr Paket: Leads + Software", art: "paket" },
    { titel: "Und wenn es schlecht läuft?", art: "bild" },
    { titel: "Ihr Start in 3 Schritten", art: "bild" },
  ],
  // Makler: nach „Rechnet sich das?“ zusätzlich „Mit Tarifvergleich“
  makler: [
    { titel: "Rechnet sich das, als Makler?", art: "rechnung" },
    { titel: "Mit Tarifvergleich: alles zurück nach 7 Monaten", art: "bild" },
    { titel: "Ihr Paket: Leads + Software", art: "paket" },
    { titel: "Und wenn es schlecht läuft?", art: "bild" },
    { titel: "Ihr Start in 3 Schritten", art: "bild" },
  ],
};

/** Folie „Ihr Abschlussbonus“ (Ole, 16.11.2026): vorletzte Folie, vor „Ihr Start in 3 Schritten“; nicht in den PPTX. */
export const BONUS_FOLIE_TITEL = "Ihr Abschlussbonus";

/**
 * Folienliste je Zielgruppe (Vertreter 24, Makler 25 Folien aus den PPTX, Bildnummern wie dort), dazu vor
 * „Ihr Start in 3 Schritten“ die Folie zum Abschlussbonus (mitBonus, Standard an).
 */
export function folienListe(audience: VerkaufsAudience, mitBonus = true): VerkaufsFolieDef[] {
  const basis = [...GEMEINSAM, ...ENDE[audience]].map((f, i) => ({ ...f, bild: i + 1 }));
  const liste = mitBonus ? [...basis.slice(0, -1), { titel: BONUS_FOLIE_TITEL, art: "bonus" as const, bild: 0 }, ...basis.slice(-1)] : basis;
  return liste.map((f, i) => ({ ...f, nr: i + 1 }));
}

export const bildUrl = (audience: VerkaufsAudience, nr: number) => `${BILD_BASIS}/${audience}/${String(nr).padStart(2, "0")}.webp`;

// ─── Angebot → Preise ────────────────────────────────────────────────────────────────────────────

/** Angebot des Kontakts, soweit für die Folien nötig (Beträge netto als Zahl). */
export type AngebotFuerFolien = {
  number: string;
  company: string | null;
  contactName: string;
  package: string;
  vermittlerTyp: string;
  term: string;
  products: unknown;
  setupFee: number;
  monthlyFee: number;
  seats: number | null;
  seatsIncluded: number | null;
  seatMonthly: number | null;
  bestandMonthly: number | null;
  empfehlungMonthly: number | null;
  annualPrepay: boolean;
  annualFreeMonths: number | null;
  /** Jahreszahlung angeboten: Kunde wählt bei der Annahme (fehlt bei Alt-Daten = nein). */
  annualChoice?: boolean;
  customerChoosesTerm: boolean;
  setupDiscount: number | null;
  introMonthlyFee: number | null;
  introMonths: number | null;
  /** Abschlussbonus, der jetzt noch gilt (abschlussBonusJetzt); null = keiner oder abgelaufen. */
  abschlussBonus?: { betrag: number; bis: Date } | null;
  /** „Später zahlen“ erlaubt: Bonus gilt schon bei Annahme bis zur Frist */
  allowPayLater?: boolean;
};

/** Zielgruppe: Angebot (Makler/Vertreter) geht vor, sonst der Kontakt („Makler“ laut Anreicherung), sonst Vertreter. */
export function audienceFuer(contact: { insurer?: string | null } | null, angebot: Pick<AngebotFuerFolien, "vermittlerTyp"> | null): VerkaufsAudience {
  if (angebot) return angebot.vermittlerTyp === "makler" ? "makler" : "vertreter";
  return contact?.insurer === "Makler" ? "makler" : "vertreter";
}

/** Aktuelles Angebot eines Kontakts: das neueste, das nicht ersetzt, abgelehnt oder ein Testangebot ist. */
export function aktuellesAngebot<T extends { status: string; isTest?: boolean; createdAt: Date }>(offers: T[]): T | null {
  return [...offers].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).find((o) => !o.isTest && o.status !== "superseded" && o.status !== "declined") ?? null;
}

const TERM_KURZ: Record<OfferTerm, string> = { none: "Ohne Laufzeit", "3m": "Mit 3 Monaten", "6m": "Mit 6 Monaten", "12m": "Mit 12 Monaten" };
const TERM_SATZ: Record<OfferTerm, string> = { none: "ohne Vertragslaufzeit", "3m": "bei 3 Monaten Laufzeit", "6m": "bei 6 Monaten Laufzeit", "12m": "bei 12 Monaten Laufzeit" };
/** Laufzeiten auf der Folie „Setup“ (Listenpreise bzw. Kunde wählt). */
// 6 Monate nur auf Nachfrage (Ole, 18.11.2026): nicht in den Listenpreisen, nur wenn das Angebot auf 6 Monate steht
const TERM_FOLIE: OfferTerm[] = ["none", "3m", "12m"];
const termFolie = (term: OfferTerm): OfferTerm[] => (term === "6m" ? ["none", "3m", "6m", "12m"] : TERM_FOLIE);
const geschenkt = (n: number) => `${n} ${n === 1 ? "Monat" : "Monate"} geschenkt`;
/** Vorauszahlung als Satz (Listenpreise): beide Varianten. */
const VORAUS_LISTE = `Jährlich im Voraus: ${geschenkt(VORAUSZAHLUNG["12m"].freeMonths)}`;

export type PaketDaten = {
  quelle: "angebot" | "liste";
  /** z. B. „Agentur Lohmann“ (Firma, sonst Ansprechpartner) */
  name: string | null;
  angebotNr: string | null;
  software: boolean;
  setup: { label: string; betrag: number; markiert: boolean }[];
  setupMarke: string;
  setupHinweis: string | null;
  monatlich: { label: string; detail?: string; betrag: string; summe?: boolean }[];
  /** Monatlich netto für die Rechnung (Betreuung + Software inkl. Zusätze); Liste: 990 € (Werbebudget bis 3.000 €, PRICE_LIST.tiers). */
  monatlichNetto: number;
  jaehrlich: string | null;
  startpreis: string | null;
  /** Setup für die Rechnung (netto) und wie es zustande kommt */
  setupRechnung: { betrag: number; satz: string };
  produkte: { name: string; tagesbudget: number }[];
  /** Satz zur Preisstufe bzw. zum vereinbarten Preis (nur mit Angebot, wie auf der Angebotsseite). */
  betreuungsSatz: string | null;
  team: string;
  pause: string;
  /** Abschlussbonus: Setup vorher/nachher (netto); bis = Frist, null = „heute“ (Listenpreise, noch kein Angebot). */
  bonus: { betrag: number; setupVorher: number; setupNachher: number; bis: Date | null; spaeter?: boolean } | null;
};

// Beträge wie im ganzen Angebot (ganze Euro ohne „,00“, sonst mit Cent)
const eur0 = eurText;

function produkteVon(raw: unknown): { name: string; tagesbudget: number }[] {
  return (Array.isArray(raw) ? raw : []).flatMap((p) => {
    const r = (p ?? {}) as { name?: unknown; dailyBudget?: unknown };
    const name = typeof r.name === "string" ? r.name.trim() : "";
    return name ? [{ name, tagesbudget: Math.max(0, Number(r.dailyBudget) || 0) }] : [];
  });
}

/** Preise für „Ihr Paket“ und „Rechnet sich das?“: aus dem Angebot, sonst Listenpreise. */
export function paketDaten(angebot: AngebotFuerFolien | null, audience: VerkaufsAudience): PaketDaten {
  const team = `${PRICE_LIST.seatsIncluded} Berater inklusive, jeder weitere ${PRICE_LIST.seatMonthly} € netto im Monat.`;
  if (!angebot) {
    const terms = TERM_FOLIE;
    return {
      quelle: "liste",
      name: null,
      angebotNr: null,
      software: true,
      setup: terms.map((t) => ({ label: TERM_KURZ[t], betrag: setupForChoice(t, 1), markiert: t === "12m" })),
      setupMarke: "Empfohlen",
      setupHinweis: null,
      monatlich: [
        ...PRICE_LIST.tiers.map((t, i) => ({
          label: `Werbebudget ${t.label}`,
          detail: i === 0 ? `≈ ${Math.round(t.monthly / PRICE_LIST.daysPerMonth)} € pro Tag` : undefined,
          betrag: `${eur0(t.monthly)} netto`,
        })),
        { label: `Werbebudget ab ${eur0(PRICE_LIST.individualFrom)}`, betrag: "individuelles Angebot" },
      ],
      monatlichNetto: PRICE_LIST.tiers[0].monthly,
      jaehrlich: VORAUS_LISTE,
      startpreis: null,
      setupRechnung: audience === "makler" ? { betrag: PRICE_LIST.setup12m, satz: TERM_SATZ["12m"] } : { betrag: PRICE_LIST.setupNoTerm, satz: TERM_SATZ.none },
      produkte: [],
      betreuungsSatz: null,
      team,
      pause: `Anzeigen stoppen automatisch. Sie zahlen dann nur ${PRICE_LIST.softwareFee} € netto für die Software.`,
      bonus: (() => {
        const vorher = audience === "makler" ? PRICE_LIST.setup12m : PRICE_LIST.setupNoTerm;
        const betrag = Math.min(ABSCHLUSSBONUS_STANDARD, vorher);
        return betrag > 0 ? { betrag, setupVorher: vorher, setupNachher: vorher - betrag, bis: null } : null;
      })(),
    };
  }

  const term = normalizeTerm(angebot.term);
  const produkte = produkteVon(angebot.products);
  const software = angebot.package !== "service";
  const add = offerAddOns({
    monthlyFee: angebot.monthlyFee,
    seats: angebot.seats,
    seatsIncluded: angebot.seatsIncluded,
    seatMonthly: angebot.seatMonthly,
    bestandMonthly: angebot.bestandMonthly,
    empfehlungMonthly: angebot.empfehlungMonthly,
    // Vorauszahlung zur Wahl: Betrag trotzdem nennen (Wahl bei der Annahme); Zeitraum nach Laufzeit (6 bzw. 12 Monate)
    annualPrepay: angebot.annualPrepay || !!angebot.annualChoice,
    annualFreeMonths: angebot.annualFreeMonths,
    term,
  });
  const rabatt = angebot.setupDiscount != null && angebot.setupDiscount > 0 ? angebot.setupDiscount : null;
  const setup = angebot.customerChoosesTerm
    ? termFolie(term).map((t) => ({ label: TERM_KURZ[t], betrag: setupForChoice(t, Math.max(1, produkte.length), rabatt), markiert: t === term }))
    : [{ label: TERM_KURZ[term], betrag: angebot.setupFee, markiert: true }];
  const monatlich: PaketDaten["monatlich"] = [
    {
      label: PACKAGE_LABEL[software ? "software" : "service"],
      detail: produkte.length ? produkte.map((p) => `${p.name}${p.tagesbudget ? ` (${eur0(p.tagesbudget)} pro Tag)` : ""}`).join(", ") : undefined,
      betrag: `${eur0(angebot.monthlyFee)} netto`,
    },
  ];
  if (add.extraSeats > 0) monatlich.push({ label: `Weitere Berater (${add.extraSeats} × ${eur0(add.seatMonthly)})`, betrag: `${eur0(add.seatsFee)} netto` });
  if (add.bestandActive) monatlich.push({ label: "Bestandskunden-Modul", betrag: add.bestandFee ? `${eur0(add.bestandFee)} netto` : "inklusive" });
  if (add.empfehlungActive) monatlich.push({ label: "Empfehlungen & Bewertungen", betrag: add.empfehlungFee ? `${eur0(add.empfehlungFee)} netto` : "inklusive" });
  if (monatlich.length > 1) monatlich.push({ label: "Monatlich gesamt", betrag: `${eur0(add.monthlyTotal)} netto`, summe: true });
  const intro =
    angebot.introMonthlyFee != null && angebot.introMonths
      ? `Startpreis: ${eur0(Math.round((angebot.introMonthlyFee + add.monthlyTotal - angebot.monthlyFee) * 100) / 100)} netto in den ersten ${angebot.introMonths} Monaten`
      : null;
  const seats = add.hasSeats ? add.seats : PRICE_LIST.seatsIncluded;
  const inkl = add.hasSeats ? add.seatsIncluded : PRICE_LIST.seatsIncluded;
  return {
    quelle: "angebot",
    name: angebot.company?.trim() || angebot.contactName.trim() || null,
    angebotNr: angebot.number,
    software,
    setup,
    setupMarke: angebot.customerChoosesTerm ? "Ihr Angebot" : "Vereinbart",
    setupHinweis: rabatt ? `inklusive ${eur0(rabatt)} Empfehlungsrabatt` : null,
    monatlich,
    monatlichNetto: add.monthlyTotal,
    jaehrlich: add.annual && add.annualTotal != null
      ? `${angebot.annualChoice && !angebot.annualPrepay ? "Wahlweise " : ""}${add.prepayMonths === 6 ? "6 Monate im Voraus" : `${angebot.annualChoice && !angebot.annualPrepay ? "j" : "J"}ährlich im Voraus`}: ${eur0(add.annualTotal)} netto für ${add.prepayMonths} Monate, ${geschenkt(add.freeMonths)}`
      : angebot.customerChoosesTerm
        ? VORAUS_LISTE
        : term === "12m"
          ? `Jährlich im Voraus: ${geschenkt(VORAUSZAHLUNG["12m"].freeMonths)}`
          : term === "6m"
            ? `6 Monate im Voraus: ${geschenkt(VORAUSZAHLUNG["6m"].freeMonths)}`
            : null,
    startpreis: intro,
    setupRechnung: { betrag: angebot.setupFee, satz: TERM_SATZ[term] },
    produkte,
    betreuungsSatz: betreuungsSatz({
      package: angebot.package,
      monthlyBudget: monthlyBudgetOf(produkte.map((x) => ({ name: x.name, dailyBudget: x.tagesbudget }))),
      productCount: produkte.length,
      monthlyFee: angebot.monthlyFee,
    }),
    team: software ? `Ihr Angebot: ${seats} Berater, davon ${inkl} inklusive. Jeder weitere ${eur0(add.hasSeats ? add.seatMonthly : PRICE_LIST.seatMonthly)} netto im Monat.` : team,
    pause: software ? `Anzeigen stoppen automatisch. Sie zahlen dann nur ${PRICE_LIST.softwareFee} € netto für die Software.` : "Anzeigen stoppen automatisch, die Betreuung pausiert mit.",
    bonus: angebot.abschlussBonus
      ? { betrag: angebot.abschlussBonus.betrag, setupVorher: angebot.setupFee, setupNachher: Math.round((angebot.setupFee - angebot.abschlussBonus.betrag) * 100) / 100, bis: angebot.abschlussBonus.bis, spaeter: !!angebot.allowPayLater }
      : null,
  };
}

// ─── Rechnungen (Beispiel aus echten Ergebnissen, Preise aus dem Angebot bzw. der Liste) ────────────────

const MWST = 1 + PRICE_LIST.vatRate;
const r0 = (n: number) => Math.round(n);

/** Vertreter: 200 Leads, ≈ 800 € Werbebudget, 5.000 € Provision im Monat (echtes Ergebnis, Katzenversicherung). */
export function vertreterRechnung(monatNetto: number, setupNetto: number) {
  const provision = 5000;
  const werbe = r0(800 * MWST);
  const betreuung = r0(monatNetto * MWST);
  const ueberschuss = provision - werbe - betreuung;
  const setupBrutto = r0(setupNetto * MWST);
  // Setup wieder drin nach … Monaten (auf halbe Monate aufgerundet); 0 = kein Setup
  const setupMonate = setupBrutto <= 0 ? 0 : ueberschuss > 0 ? Math.ceil((setupBrutto / ueberschuss) * 2) / 2 : null;
  const jahr = ueberschuss * 12 - setupBrutto;
  return { leads: 200, werbeNetto: 800, beitragsvolumen: 8600, provision, werbe, betreuung, ueberschuss, setupBrutto, setupMonate, jahr, jahrRund: Math.floor(jahr / 1000) * 1000 };
}

/**
 * Makler: 300 Leads (40 € pro Tag, ≈ 1.200 € netto), 12 % Verträge (36 Katzen + 36 Zusatzverträge im Monat),
 * 12 Monate Kampagne, Courtage 22,5 % auf 358 € bzw. 300 € Jahresbeitrag, monatlich, 10 % Storno pro Jahr,
 * Betrachtung bis 5 Jahre nach der Kampagne (72 Monate), nicht abgezinst. Kosten inkl. 19 % USt.
 */
export function maklerRechnung(monatNetto: number, setupNetto: number, quote = 0.12) {
  const neuProMonat = Math.round(300 * quote);
  const storno = Math.pow(0.9, 1 / 12);
  const proVertrag = { katze: (358 * 0.225) / 12, zusatz: (300 * 0.225) / 12 };
  const kostenMonat = (monatNetto + 1200) * MWST;
  const setup = setupNetto * MWST;
  const kostenGesamt = kostenMonat * 12 + setup;
  const lauf = (mitZusatz: boolean) => {
    let summe = 0;
    let kumKosten = setup;
    let selbstAb: number | null = null;
    let zurueckNach: number | null = null;
    let courtage = 0;
    for (let m = 1; m <= 72; m++) {
      let bestand = 0;
      for (let s = 0; s < Math.min(m, 12); s++) bestand += neuProMonat * Math.pow(storno, m - 1 - s);
      const ein = bestand * (proVertrag.katze + (mitZusatz ? proVertrag.zusatz : 0));
      courtage += ein;
      summe += ein;
      if (m <= 12) kumKosten += kostenMonat;
      if (selbstAb == null && ein >= kostenMonat) selbstAb = m;
      if (zurueckNach == null && summe >= kumKosten) zurueckNach = m;
    }
    return { courtage, selbstAb, zurueckNach };
  };
  const mit = lauf(true);
  const ohne = lauf(false);
  const katze = ohne.courtage;
  const zusatz = mit.courtage - ohne.courtage;
  const h = (n: number) => Math.round(n / 100) * 100;
  return {
    leads: 300,
    werbeNetto: 1200,
    neuProMonat,
    kostenGesamt: h(kostenGesamt),
    courtageKatze: h(katze),
    courtageZusatz: h(zusatz),
    zusammen: h(katze) + h(zusatz),
    faktor: Math.round(mit.courtage / kostenGesamt),
    selbstAb: mit.selbstAb,
    zurueckNach: mit.zurueckNach,
    selbstAbOhne: ohne.selbstAb,
    zurueckNachOhne: ohne.zurueckNach,
  };
}

// ─── Folien (HTML, 1280×720) ─────────────────────────────────────────────────────────────────────

export type VerkaufsFolie = { id: string; titel: string; html: string };

const e = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const zahl = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
const euro = eurText;
const monate = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n)} ${n === 1 ? "Monat" : "Monaten"}`;
const MINUS = "−";

export function verkaufsCss(): string {
  return `
.vk{width:1280px;height:720px;position:relative;overflow:hidden;box-sizing:border-box;background:linear-gradient(140deg,#e9f0ff 0%,#f6f8ff 45%,#eef3fd 100%);color:#0b1220;font-family:var(--font-geist-sans),Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:24px 34px}
.vk *{box-sizing:border-box}
.vk-bild{padding:0;background:#0f172a}.vk-bild>img,.vk-bild>video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.vk-kopf{display:flex;justify-content:space-between;align-items:center;height:28px}
.vk-logo{display:flex;align-items:center;gap:9px;font-weight:600;font-size:17px;letter-spacing:-.01em}.vk-logo b{color:#2563eb;font-weight:600}
.vk-logo i{width:24px;height:24px;border-radius:6px;background:#2563eb;display:inline-flex;align-items:center;justify-content:center}
.vk-rubrik{font-size:12.5px;color:#64748b}
.vk-chips{display:flex;gap:8px;margin-top:24px;flex-wrap:wrap}
.vk-chip{display:inline-flex;align-items:center;gap:6px;background:#dbe6ff;color:#1d4ed8;font-size:12.5px;font-weight:500;padding:4px 11px;border-radius:99px}
.vk-chip::before{content:"";width:5px;height:5px;border-radius:99px;background:#2563eb}
.vk-chip.gruen{background:#dcfce7;color:#15803d}.vk-chip.gruen::before{background:#16a34a}
.vk h2{font-size:44px;line-height:1.08;letter-spacing:-.025em;margin:10px 0 0;font-weight:700}
.vk h2 small{font-size:17px;font-weight:400;color:#64748b;letter-spacing:0;margin-left:8px}
.vk-karte{background:#fff;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.05),0 8px 24px rgba(37,99,235,.06);padding:18px 22px}
.vk-label{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;font-weight:600}
.vk-nr{position:absolute;right:34px;bottom:20px;font-size:12.5px;color:#64748b}
.vk-fuss{position:absolute;left:34px;right:120px;bottom:16px;font-size:11.5px;line-height:1.45;color:#64748b}
.vk-zeile{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:11px 0;border-bottom:1px solid #eef2f7;font-size:18px}
.vk-zeile:last-child{border-bottom:0}.vk-zeile b{font-weight:700;white-space:nowrap;text-align:right}.vk-zeile small{display:block;font-size:11px;color:#64748b;font-weight:400}
.vk-zeile .det{display:block;font-size:12.5px;color:#64748b;margin-top:2px}
.vk-zeile.summe{border-top:2px solid #e2e8f0;border-bottom:0;margin-top:2px;font-weight:700}
.vk-gruen{background:#ecfdf3;color:#15803d;font-weight:600;font-size:14px;border-radius:8px;padding:8px 12px;margin-top:10px}
.vk-hinweis{background:#eff6ff;color:#1e40af;font-size:13px;border-radius:8px;padding:7px 12px;margin-top:8px}
.vk-haken{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:9px}.vk-haken li{display:flex;align-items:center;gap:10px;font-size:16px}
.vk-haken li::before{content:"✓";width:20px;height:20px;border-radius:99px;background:#2563eb;color:#fff;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex:0 0 20px}
.vk-setup{display:grid;gap:10px;margin-top:12px}
.vk-setup>div{border:1px solid #e2e8f0;border-radius:12px;padding:12px 12px 10px;position:relative}
.vk-setup span{display:block;font-size:12.5px;color:#64748b}.vk-setup b{display:block;font-size:30px;letter-spacing:-.02em;margin-top:2px}.vk-setup small{font-size:11.5px;color:#64748b}
.vk-setup-4{gap:8px}.vk-setup-4>div{padding:10px 8px 8px}.vk-setup-4 b{font-size:22px}.vk-setup-4 span{font-size:11.5px}
.vk-setup .an{background:#2563eb;border-color:#2563eb;color:#fff}.vk-setup .an span,.vk-setup .an small{color:rgba(255,255,255,.85)}
.vk-setup .marke{font-style:normal;position:absolute;top:-9px;right:10px;background:#047857;color:#fff;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:99px}
.vk-kacheln{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.vk-kacheln .vk-karte{padding:16px 20px}.vk-kacheln b{display:block;font-size:16px;margin-bottom:6px}.vk-kacheln span{font-size:14px;line-height:1.5;color:#475569}
.vk-werte{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:22px}
.vk-wert{padding:16px 20px}.vk-wert span{display:block;font-size:13.5px;color:#64748b}.vk-wert b{display:block;font-size:34px;letter-spacing:-.02em;margin-top:2px;line-height:1.1}.vk-wert small{display:block;font-size:11px;color:#64748b;margin-top:2px}
.vk-wert.blau{background:#2563eb;color:#fff}.vk-wert.blau span,.vk-wert.blau small{color:rgba(255,255,255,.85)}
.vk-plus{color:#16a34a}
.vk-box{display:flex;gap:12px}.vk-box i{flex:0 0 26px;height:26px;border-radius:99px;background:#eff6ff;color:#2563eb;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:14px}
.vk-box b{display:block;font-size:18px;margin-bottom:8px}.vk-box span{font-size:15px;line-height:1.55;color:#475569}
.vk-demo{position:absolute;left:545px;top:70px;width:712px;height:634px;background:linear-gradient(140deg,#eef3ff,#f7f9ff);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:8px}
.vk-demo-kopf{display:flex;align-items:center;gap:10px;font-size:14px;color:#334155}
.vk-live{display:inline-flex;align-items:center;gap:6px;background:#2563eb;color:#fff;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:99px;padding:3px 10px}
.vk-live::before{content:"";width:6px;height:6px;border-radius:99px;background:#86efac}
.vk-demo iframe{flex:1;width:100%;border:0;border-radius:12px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.12)}
`;
}

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  uhr: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'),
  trend: svg('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
  team: svg('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-5-6"/>'),
};

const LOGO = `<span class="vk-logo"><i><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></i><span>performance<b>growth</b></span></span>`;

function rahmen(rubrik: string, inhalt: string, nr: number, gesamt: number, fuss = ""): string {
  return `<section class="vk"><div class="vk-kopf">${LOGO}<span class="vk-rubrik">${e(rubrik)}</span></div>${inhalt}${fuss ? `<div class="vk-fuss">${fuss}</div>` : ""}${nr > 0 ? `<div class="vk-nr">${nr} / ${gesamt}</div>` : ""}</section>`;
}

const angebotChip = (p: PaketDaten) =>
  p.quelle === "angebot" ? `<span class="vk-chip gruen">Ihr Angebot ${e(p.angebotNr ?? "")}${p.name ? ` für ${e(p.name)}` : ""}</span>` : "";

/** „Ihr Paket: Leads + Software“ mit Angebots- bzw. Listenpreisen. */
export function paketFolie(p: PaketDaten, audience: VerkaufsAudience, nr: number, gesamt: number): string {
  const budget =
    p.quelle === "angebot" && p.produkte.some((x) => x.tagesbudget > 0)
      ? `zahlen Sie direkt an Meta. Laut Angebot: ${p.produkte.map((x) => `${euro(x.tagesbudget)} pro Tag`).join(" und ")}.${p.betreuungsSatz ? ` ${p.betreuungsSatz}` : ""}`
      : audience === "makler"
        ? "zahlen Sie direkt an Meta. Empfehlung für Makler: ab 40 € pro Tag."
        : "zahlen Sie direkt an Meta. Empfehlung: 20–50 € pro Tag und Produkt.";
  const setup = `<div class="vk-setup${p.setup.length > 3 ? " vk-setup-4" : ""}" style="grid-template-columns:repeat(${p.setup.length},1fr)">${p.setup
    .map((s) => `<div class="${s.markiert ? "an" : ""}">${s.markiert && p.setup.length > 1 ? `<em class="marke">${e(p.setupMarke)}</em>` : ""}<span>${e(s.label)}</span><b>${e(euro(s.betrag))}</b><small>netto</small></div>`)
    .join("")}</div>`;
  const inhalt = `<div class="vk-chips"><span class="vk-chip">Ihr Paket</span>${angebotChip(p)}</div>
<h2>Ihr Paket: Leads + ${p.software ? "Software" : "Betreuung"}</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px">
<div class="vk-karte"><div class="vk-label">Einmalig: Setup</div>${setup}${p.setupHinweis ? `<div class="vk-hinweis">${e(p.setupHinweis)}</div>` : ""}
<ul class="vk-haken"><li>Kampagne, Werbemittel und Lead-Formular</li>${p.software ? "<li>Einrichtung Ihrer Software</li><li>WhatsApp und Kalender verbinden</li>" : "<li>Laufende Betreuung Ihrer Kampagne</li>"}</ul></div>
<div class="vk-karte"><div class="vk-label">Monatlich: ${p.software ? "Betreuung + Software" : "Betreuung"}</div><div style="margin-top:6px">${p.monatlich
    .map((z) => `<div class="vk-zeile${z.summe ? " summe" : ""}"><span>${e(z.label)}${z.detail ? `<span class="det">${e(z.detail)}</span>` : ""}</span><b>${e(z.betrag)}</b></div>`)
    .join("")}</div>${p.startpreis ? `<div class="vk-hinweis">${e(p.startpreis)}</div>` : ""}${p.jaehrlich ? `<div class="vk-gruen">${e(p.jaehrlich)}</div>` : ""}</div>
</div>
<div class="vk-kacheln" style="margin-top:18px">
<div class="vk-karte"><b>Pause oder Urlaub: jederzeit</b><span>${e(p.pause)}</span></div>
<div class="vk-karte"><b>Werbebudget</b><span>${e(budget)}</span></div>
<div class="vk-karte"><b>Für Ihr ganzes Team</b><span>${e(p.team)}</span></div>
</div>`;
  // Bestandskunden-Modul nur, solange es für alle verfügbar ist (lib/bestand/sichtbar.ts)
  const modul = BESTAND_MODULE_AVAILABLE ? ` <b style="color:#0b1220">Bestandskunden-Modul:</b> ${PRICE_LIST.bestandModuleMonthly} € monatlich.` : "";
  const fuss = `<b style="color:#0b1220">WhatsApp-Gebühren inklusive.</b> Jedes weitere Produkt: ${PRICE_LIST.extraProductMonthly} € monatlich, ohne Setup.${modul} Alle Preise zzgl. 19 % USt.`;
  return rahmen("Ihr Paket", inhalt, nr, gesamt, fuss);
}

const FRIST_FMT = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Frist als Text: „morgen bis 23:59 Uhr“ (ohne Angebot, Ole 16.11.2026) bzw. „bis Montag, 16. November, 23:59 Uhr“. */
export function bonusFristText(bis: Date | null): string {
  return bis ? `bis ${FRIST_FMT.format(bis).replace(" um ", ", ")} Uhr` : "morgen bis 23:59 Uhr";
}

/** „Ihr Abschlussbonus“ (Ole, 16.11.2026): Setup günstiger bei Annahme und Zahlung am selben Tag, Start frei wählbar. */
export function bonusFolie(p: PaketDaten, b: NonNullable<PaketDaten["bonus"]>, nr: number, gesamt: number, opts: { fristText?: string } = {}): string {
  // fristText: feste Fassung für die Unterlagen (PPTX/PDF zur Angebotsmail), dort passt kein „morgen“
  const frist = opts.fristText ?? bonusFristText(b.bis);
  const schritt = (n: number, titel: string, text: string) =>
    `<div class="vk-karte vk-box" style="padding:18px 22px"><i style="font-weight:800">${n}</i><div><b>${e(titel)}</b><span>${e(text)}</span></div></div>`;
  const inhalt = `<div class="vk-chips"><span class="vk-chip gruen">Einmaliges Angebot</span>${angebotChip(p)}</div>
<h2>Ihr Abschlussbonus: ${e(euro(b.betrag))} weniger Setup</h2>
<div style="display:grid;grid-template-columns:1.1fr 1fr;gap:16px;margin-top:22px">
<div style="display:grid;gap:12px">
${schritt(1, "Angebot annehmen", `Mit einem Klick auf Ihrer Angebotsseite, ${frist}.`)}
${b.spaeter
  ? schritt(2, "Setup bezahlen, gern auch später", "Direkt per Karte oder Lastschrift oder zu einem späteren Tag. Der Bonus bleibt Ihnen sicher.")
  : schritt(2, "Setup bezahlen", "Direkt im Anschluss per Karte oder Lastschrift. Der Bonus ist schon abgezogen.")}
${schritt(3, "Start frei wählen", "Sie bestimmen, wann Ihre Kampagne live geht, zum Beispiel erst nach dem Urlaub oder zum Monatsanfang.")}
</div>
<div class="vk-karte" style="padding:22px 26px"><div class="vk-label">Einmalig: Setup</div>
<div class="vk-zeile" style="margin-top:8px"><span>Setup regulär</span><b style="color:#64748b;text-decoration:line-through">${e(euro(b.setupVorher))}</b></div>
<div class="vk-zeile"><span>${MINUS} Abschlussbonus</span><b class="vk-plus">${MINUS} ${e(euro(b.betrag))}</b></div>
<div class="vk-zeile summe" style="font-size:20px;padding-top:12px"><span>Ihr Setup</span><b style="font-size:34px;color:#2563eb">${e(euro(b.setupNachher))}</b></div>
<div class="vk-gruen">Sie sparen ${e(euro(b.betrag))}, wenn Sie ${e(frist)} annehmen${b.spaeter ? "" : " und bezahlen"}.</div>
<div class="vk-hinweis">Warum? Wir planen Ihre Einrichtung sofort fest ein. Wann es losgeht, entscheiden Sie.</div>
</div>
</div>`;
  const fuss = `Gilt bei Annahme des Angebots${b.spaeter ? "" : " und Zahlung des Setups"} ${e(frist)}. Danach gilt automatisch das reguläre Setup. Monatliche Preise bleiben unverändert. Alle Preise zzgl. 19 % USt.`;
  return rahmen("Ihr Vorteil", inhalt, nr, gesamt, fuss);
}

/** „Rechnet sich das?“ (Vertreter) bzw. „Rechnet sich das, als Makler?“ mit Angebots- bzw. Listenpreisen. */
export function rechnungFolie(p: PaketDaten, audience: VerkaufsAudience, nr: number, gesamt: number): string {
  return audience === "makler" ? maklerFolie(p, nr, gesamt) : vertreterFolie(p, nr, gesamt);
}

function vertreterFolie(p: PaketDaten, nr: number, gesamt: number): string {
  const r = vertreterRechnung(p.monatlichNetto, p.setupRechnung.betrag);
  const setupTitel =
    r.setupMonate === 0
      ? "Ohne Setup: ab dem ersten Monat im Plus"
      : r.setupMonate != null && r.setupMonate <= 1
        ? "Setup schon im ersten Monat wieder drin"
        : r.setupMonate != null
          ? `Setup nach ${monate(r.setupMonate)} wieder drin`
          : "Setup: im Beispiel noch nicht wieder drin";
  const setupText =
    r.setupMonate === 0
      ? "Für die Einrichtung zahlen Sie nichts extra."
      : `${p.quelle === "angebot" ? `Mit Ihrem Angebot, ${p.setupRechnung.satz}` : `Selbst ${p.setupRechnung.satz}`} (Setup ${euro(p.setupRechnung.betrag)} + USt. = ${euro(r.setupBrutto)}) haben Sie die Einrichtung ${r.setupMonate == null ? "mit diesem Beispiel noch nicht verdient" : r.setupMonate <= 1 ? "schon im ersten Monat verdient" : `nach spätestens ${monate(r.setupMonate)} verdient`}.`;
  const inhalt = `<div class="vk-chips"><span class="vk-chip">Echtes Ergebnis · Allianz-Vertreter mit Katzenversicherung</span>${angebotChip(p)}</div>
<h2>Rechnet sich das?</h2>
<div class="vk-werte">
<div class="vk-karte vk-wert"><span>Leads pro Monat</span><b>${zahl(r.leads)}</b></div>
<div class="vk-karte vk-wert"><span>Werbekosten (netto)</span><b>≈ ${euro(r.werbeNetto)}</b></div>
<div class="vk-karte vk-wert"><span>Beitragsvolumen</span><b>${euro(r.beitragsvolumen)}</b></div>
<div class="vk-karte vk-wert blau"><span>Provision</span><b>${euro(r.provision)}</b></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px">
<div class="vk-karte" style="padding:22px 26px"><div class="vk-label">Ihre Rechnung pro Monat, inkl. 19 % USt.</div><div style="margin-top:8px">
<div class="vk-zeile"><span>Provision</span><b>${euro(r.provision)}</b></div>
<div class="vk-zeile"><span>${MINUS} Werbebudget an Meta <small style="display:inline">(${euro(r.werbeNetto)} + USt.)</small></span><b>${MINUS} ${euro(r.werbe)}</b></div>
<div class="vk-zeile"><span>${MINUS} ${p.software ? "Betreuung + Software" : "Betreuung"} <small style="display:inline">(${euro(p.monatlichNetto)} + USt.)</small></span><b>${MINUS} ${euro(r.betreuung)}</b></div>
<div class="vk-zeile summe" style="font-size:19px;padding-top:12px"><span>Überschuss pro Monat</span><b class="${r.ueberschuss > 0 ? "vk-plus" : ""}" style="font-size:28px">${r.ueberschuss > 0 ? "+ " : ""}${euro(r.ueberschuss)}</b></div>
</div></div>
<div style="display:grid;gap:16px">
<div class="vk-karte vk-box" style="padding:22px 26px"><i>${ICON.uhr}</i><div><b>${e(setupTitel)}</b><span>${e(setupText)}</span></div></div>
<div class="vk-karte vk-box" style="padding:22px 26px"><i>${ICON.trend}</i><div><b>Im ersten Jahr: ≈ ${euro(Math.max(0, r.jahrRund))} Überschuss*</b><span>Noch nicht eingerechnet: Bestandsprovision, Cross-Selling und Weiterempfehlungen.</span></div></div>
</div>
</div>`;
  const fuss = `* bei gleichbleibend 200 Leads pro Monat, nach Abzug von Werbebudget, ${p.software ? "Betreuung + Software" : "Betreuung"} und Setup ${e(p.setupRechnung.satz)}, jeweils inkl. 19 % USt., da Versicherungsvertreter die Vorsteuer in der Regel nicht abziehen können. Beispielrechnung auf Basis eines realen Ergebnisses. Ergebnisse können je nach Produkt, Region und Nachbearbeitung abweichen.`;
  return rahmen("Ihre Zahlen", inhalt, nr, gesamt, fuss);
}

function maklerFolie(p: PaketDaten, nr: number, gesamt: number): string {
  const r = maklerRechnung(p.monatlichNetto, p.setupRechnung.betrag);
  const r20 = maklerRechnung(p.monatlichNetto, p.setupRechnung.betrag, 0.2);
  const nach = (n: number | null) => (n != null ? `${n} Monaten` : "mehr als 6 Jahren");
  const ohne =
    r.zurueckNachOhne != null
      ? ` Und ganz ohne Cross-Selling? Dann ${r.selbstAbOhne != null ? `ab Monat ${r.selbstAbOhne} und ` : ""}nach ${r.zurueckNachOhne} Monaten, es rechnet sich auch so.`
      : "";
  const inhalt = `<div class="vk-chips"><span class="vk-chip">Echtes Ergebnis · Katzenversicherung · 4 € pro Lead, 12 % Verträge</span>${angebotChip(p)}</div>
<h2>Rechnet sich das, als Makler?<small>Bei 40 € Budget pro Tag, mit Cross-Selling.</small></h2>
<div class="vk-werte" style="margin-top:16px">
<div class="vk-karte vk-wert"><span>Leads pro Monat</span><b>${zahl(r.leads)}</b></div>
<div class="vk-karte vk-wert"><span>Werbebudget (netto)</span><b>≈ ${euro(r.werbeNetto)}</b></div>
<div class="vk-karte vk-wert"><span>Neue Verträge pro Monat</span><b>${r.neuProMonat} + ${r.neuProMonat}</b><small>Katze + Cross-Selling</small></div>
<div class="vk-karte vk-wert blau"><span>Alles Investierte zurück nach</span><b>${e(nach(r.zurueckNach))}</b></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px">
<div class="vk-karte" style="padding:14px 20px"><div class="vk-label">12 Monate Kampagne + 5 Jahre, inkl. 19 % USt.</div>
<div class="vk-zeile"><span>Kosten gesamt<span class="det">12 × ${euro(p.monatlichNetto)} ${p.software ? "Betreuung + Software" : "Betreuung"}, 12 × ${euro(r.werbeNetto)} Werbebudget an Meta, ${euro(p.setupRechnung.betrag)} Setup, je + 19 % USt.</span></span><b>${MINUS} ${euro(r.kostenGesamt)}</b></div>
<div class="vk-zeile"><span>Courtage Katzenversicherung</span><b>${euro(r.courtageKatze)}</b></div>
<div class="vk-zeile"><span>Courtage Cross-Selling <small style="display:inline">(1 Zusatzvertrag je Kunde)</small></span><b>${euro(r.courtageZusatz)}</b></div>
<div class="vk-zeile summe"><span>Zusammen</span><b class="vk-plus" style="font-size:24px">${euro(r.zusammen)} <small style="display:inline;color:#16a34a;font-size:15px">(≈ ${r.faktor} ×)</small></b></div>
</div>
<div style="display:grid;gap:12px">
<div class="vk-karte vk-box"><i>${ICON.uhr}</i><div><b>${r.selbstAb != null ? `Ab Monat ${r.selbstAb} zahlt sich die Kampagne selbst` : "Die Kampagne trägt sich mit dem Bestand"}</b><span>${r.zurueckNach != null ? `Nach ${r.zurueckNach} Monaten ist alles Investierte zurück, danach ist es Gewinn.` : ""}${ohne}</span></div></div>
<div class="vk-karte vk-box"><i>${ICON.team}</i><div><b>Ihr Bestand nach 12 Monaten: ≈ 820 Verträge</b><span>≈ 410 Katzen + ≈ 410 Zusatzverträge: ≈ 61.000 € Courtage jedes Jahr. Das Cross-Selling passiert direkt im Abschlussgespräch.</span></div></div>
</div>
</div>
<div class="vk-gruen" style="font-weight:500;font-size:13px">Und als Makler liegen Sie eher darüber: Unsere 12 % erzielen Vertreter, die nur einen Versicherer anbieten können. Mit Tarifvergleich sind 20 % realistisch, dann ist alles nach ${e(nach(r20.zurueckNach))} zurück (nächste Seite).</div>`;
  const fuss = `Annahmen: 22,5 % Bestandscourtage auf ≈ 358 € (Katze) bzw. 300 € Jahresbeitrag (Zusatzvertrag direkt beim Abschluss, Erfahrungswert eines großen Versicherers), monatlich ausgezahlt; 10 % Storno pro Jahr; nicht abgezinst; Kosten inkl. 19 % USt. (Makler meist ohne Vorsteuerabzug). Setup ${euro(p.setupRechnung.betrag)} ${e(p.setupRechnung.satz)}. Leadpreis real bei ≈ 800 € Budget, bei mehr Budget kann er steigen; Ergebnisse können abweichen.`;
  return rahmen("Ihre Zahlen", inhalt, nr, gesamt, fuss);
}

/** Alle Folien einer Zielgruppe. demoSrc: Adresse der eingebetteten Live-Demo (gleiche Herkunft). */
export function verkaufsFolien(audience: VerkaufsAudience, p: PaketDaten, demoSrc = DEMO_EINGEBETTET): VerkaufsFolie[] {
  const liste = folienListe(audience, p.bonus != null);
  const gesamt = liste.length;
  return liste.map((f) => {
    const id = `folie-${f.nr}`;
    const bild = `<img src="${bildUrl(audience, f.bild)}" alt="${e(f.titel)}" draggable="false">`;
    switch (f.art) {
      case "video":
        return { id, titel: f.titel, html: `<section class="vk vk-bild"><video src="${BILD_BASIS}/assistent.mp4" poster="${bildUrl(audience, f.bild)}" autoplay muted playsinline controls preload="metadata"></video></section>` };
      case "demo":
        return {
          id,
          titel: f.titel,
          html: `<section class="vk vk-bild">${bild}<div class="vk-demo" data-live-demo><div class="vk-demo-kopf"><span class="vk-live">Live</span>Demo mit Beispieldaten: Tarif auswählen, Bausteine an und aus</div><iframe src="${e(demoSrc)}" title="Live-Demo der Beratungspräsentation"></iframe></div></section>`,
        };
      case "rechnung":
        return { id, titel: f.titel, html: rechnungFolie(p, audience, f.nr, gesamt) };
      case "paket":
        return { id, titel: f.titel, html: paketFolie(p, audience, f.nr, gesamt) };
      case "bonus":
        return { id, titel: f.titel, html: p.bonus ? bonusFolie(p, p.bonus, f.nr, gesamt) : "" };
      default:
        return { id, titel: f.titel, html: `<section class="vk vk-bild">${bild}</section>` };
    }
  });
}
