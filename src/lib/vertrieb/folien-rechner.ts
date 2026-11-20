// Rechen-Folien zum Mitrechnen im Call (Ole, 20.11.2026): Pay-per-Lead „Rechnen Sie mit Ihren Zahlen“ und Vertreter
// „Rechnet sich das?“ haben in der Web-Präsentation echte Eingabefelder. Ole tippt mit dem Interessenten dessen Zahlen ein,
// die Ergebnisse rechnen sofort neu (im Browser, ohne Server). Dieselben Funktionen füllen die Folie beim ersten Anzeigen,
// damit Server und Browser gleich rechnen. Makler bleibt fest: dort hängen Storno, Courtage und 72 Monate Verlauf zusammen.
//
// HTML-Vertrag: Container mit data-rechner="ppl|vertreter" und data-fest (JSON mit festen Werten, z. B. Software-Preis),
// darin <input data-feld="…"> und Ausgaben <… data-r="…"> (Text, optional data-ton für die Farbe).
// Texte gehen an Interessenten: keine Gedankenstriche, keine Zusagen.

import { eurText, PRICE_LIST } from "@/lib/offer-pricing";

export type RechnerArt = "ppl" | "vertreter";
export type RechnerWerte = Record<string, number | null>;
export type RechnerFest = Record<string, number | string>;
export type RechnerAusgabe = { text: Record<string, string>; ton: Record<string, string> };

const MINUS = "−";
const zahlFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const zahl = (n: number) => zahlFmt.format(n);
const euro = eurText;
const euro0 = (n: number) => eurText(Math.round(n));
const monate = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n)} ${n === 1 ? "Monat" : "Monaten"}`;

/** Eingabe im deutschen Format lesen: „1.200“, „35,50 €“, „8“; leer oder ungültig = null. Keine negativen Werte. */
export function zahlLesen(s: string | null | undefined): number | null {
  if (s == null) return null;
  let t = s.replace(/[€%\s ]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Wert für das Eingabefeld: „1.200“, „35,5“, mit euro „35,50“; null = leer. */
export const zahlFeld = (n: number | null, euro = false): string =>
  n == null ? "" : euro && Math.round(n * 100) % 100 !== 0 ? new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : zahl(n);

// ─── Pay-per-Lead + Software ─────────────────────────────────────────────────────────────────────

export const PPL_BEISPIEL = { leads: 20, preis: 35, termine: 8, abschluesse: 4, provision: null } as const;

/** Kosten im Monat, pro Termin und pro Abschluss; null, wo etwas fehlt (nie durch 0 teilen). */
export function pplRechnung(w: RechnerWerte, software: number) {
  const leads = w.leads ?? null;
  const preis = w.preis ?? null;
  const leadKosten = leads != null && preis != null ? leads * preis : null;
  const monat = leadKosten != null ? leadKosten + software : null;
  const proTermin = monat != null && w.termine ? monat / w.termine : null;
  const proAbschluss = monat != null && w.abschluesse ? monat / w.abschluesse : null;
  const provision = w.provision ?? null;
  const abstand = proAbschluss != null && provision != null ? provision - proAbschluss : null;
  const gewinn = monat != null && provision != null && w.abschluesse != null ? w.abschluesse * provision - monat : null;
  return { leadKosten, monat, proTermin, proAbschluss, provision, abstand, gewinn };
}

function pplAusgabe(w: RechnerWerte, f: RechnerFest): RechnerAusgabe {
  const software = Number(f.software) || 0;
  const r = pplRechnung(w, software);
  const fehlt = "bitte eintragen";
  let fazit = "Tragen Sie Ihre Provision je Abschluss ein: Liegt sie darüber, rechnet es sich in diesem Beispiel.";
  let ton = "info";
  if (r.provision != null && r.proAbschluss == null) fazit = "Tragen Sie Leads, Preis und Abschlüsse ein, dann sehen Sie den Vergleich mit Ihrer Provision.";
  else if (r.abstand != null) {
    const d = Math.round(r.abstand);
    const p = euro(r.provision!);
    if (d > 0) [fazit, ton] = [`Ihre Provision ${p} liegt ${euro(d)} über den Kosten pro Abschluss.`, "plus"];
    else if (d < 0) [fazit, ton] = [`Ihre Provision ${p} liegt ${euro(-d)} unter den Kosten pro Abschluss.`, "minus"];
    else fazit = `Ihre Provision ${p} entspricht etwa den Kosten pro Abschluss.`;
    // Gewinn im Monat (Ole, 20.11.2026): Abschlüsse × Provision − Kosten im Monat
    if (r.gewinn != null) {
      const g = Math.round(r.gewinn);
      const satz = `${g >= 0 ? "Gewinn" : "Verlust"} im Monat: ${euro(Math.abs(g))} (${zahl(w.abschluesse!)} × ${p} − ${euro(r.monat!)}).`;
      fazit = `${satz} ${fazit}`;
    }
  }
  return {
    text: {
      leads: r.leadKosten != null ? `${zahl(w.leads!)} × ${euro(w.preis!)} = ${euro(r.leadKosten)}` : fehlt,
      software: euro(software),
      monat: r.monat != null ? euro(r.monat) : fehlt,
      terminRechnung: r.proTermin != null ? `${euro(r.monat!)} ÷ ${zahl(w.termine!)}` : "",
      termin: r.proTermin != null ? euro0(r.proTermin) : r.monat != null ? "Termine eintragen" : "",
      abschlussRechnung: r.proAbschluss != null ? `${euro(r.monat!)} ÷ ${zahl(w.abschluesse!)}` : "",
      abschluss: r.proAbschluss != null ? euro0(r.proAbschluss) : r.monat != null ? "Abschlüsse eintragen" : "",
      fazit,
    },
    ton: {
      leads: r.leadKosten != null ? "" : "leer",
      monat: r.monat != null ? "" : "leer",
      termin: r.proTermin != null ? "" : "leer",
      abschluss: r.proAbschluss != null ? "" : "leer",
      fazit: ton,
    },
  };
}

// ─── Vertreter „Rechnet sich das?“ ───────────────────────────────────────────────────────────────

const MWST = 1 + PRICE_LIST.vatRate;
const r0 = (n: number) => Math.round(n);

/** Echtes Ergebnis (Allianz-Vertreter, Katzenversicherung): 200 Leads, ≈ 800 € Werbebudget netto, 8.600 € Beitragsvolumen, 5.000 € Provision. */
export const VERTRETER_BEISPIEL = { leads: 200, werbe: 800, volumen: 8600, provision: 5000 } as const;

/** Vertreter: Überschuss pro Monat (inkl. 19 % USt.), Setup wieder drin nach … Monaten, erstes Jahr. */
export function vertreterRechnung(monatNetto: number, setupNetto: number, opts: { provision?: number; werbeNetto?: number } = {}) {
  const provision = opts.provision ?? VERTRETER_BEISPIEL.provision;
  const werbeNetto = opts.werbeNetto ?? VERTRETER_BEISPIEL.werbe;
  const werbe = r0(werbeNetto * MWST);
  const betreuung = r0(monatNetto * MWST);
  const ueberschuss = r0(provision - werbe - betreuung);
  const setupBrutto = r0(setupNetto * MWST);
  // Setup wieder drin nach … Monaten (auf halbe Monate aufgerundet); 0 = kein Setup
  const setupMonate = setupBrutto <= 0 ? 0 : ueberschuss > 0 ? Math.ceil((setupBrutto / ueberschuss) * 2) / 2 : null;
  const jahr = ueberschuss * 12 - setupBrutto;
  return { leads: VERTRETER_BEISPIEL.leads, werbeNetto, beitragsvolumen: VERTRETER_BEISPIEL.volumen, provision, werbe, betreuung, ueberschuss, setupBrutto, setupMonate, jahr, jahrRund: Math.floor(jahr / 1000) * 1000 };
}

/** Feste Werte der Vertreter-Folie: monat/setup netto, software 1/0, angebot 1/0, satz (z. B. „ohne Mindestlaufzeit“). */
function vertreterAusgabe(w: RechnerWerte, f: RechnerFest): RechnerAusgabe {
  const monat = Number(f.monat) || 0;
  const setup = Number(f.setup) || 0;
  const satz = String(f.satz ?? "");
  const provision = w.provision ?? 0;
  const werbeNetto = w.werbe ?? 0;
  const r = vertreterRechnung(monat, setup, { provision, werbeNetto });
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
      : `${Number(f.angebot) ? `Mit Ihrem Angebot, ${satz}` : `Selbst ${satz}`} (Setup ${euro(setup)} + USt. = ${euro(r.setupBrutto)}) haben Sie die Einrichtung ${r.setupMonate == null ? "mit diesem Beispiel noch nicht verdient" : r.setupMonate <= 1 ? "schon im ersten Monat verdient" : `nach spätestens ${monate(r.setupMonate)} verdient`}.`;
  const beispiel =
    (w.leads ?? null) === VERTRETER_BEISPIEL.leads && werbeNetto === VERTRETER_BEISPIEL.werbe && (w.volumen ?? null) === VERTRETER_BEISPIEL.volumen && provision === VERTRETER_BEISPIEL.provision;
  return {
    text: {
      chip: beispiel ? "Echtes Ergebnis · Allianz-Vertreter mit Katzenversicherung" : "Ihre Zahlen · Beispielrechnung",
      provision: euro(provision),
      werbeNetto: euro(werbeNetto),
      werbe: `${MINUS} ${euro(r.werbe)}`,
      ueberschuss: r.ueberschuss > 0 ? `+ ${euro(r.ueberschuss)}` : r.ueberschuss < 0 ? `${MINUS} ${euro(-r.ueberschuss)}` : euro(0),
      setupTitel,
      setupText,
      jahr: `Im ersten Jahr: ≈ ${euro(Math.max(0, r.jahrRund))} Überschuss*`,
      fussLeads: w.leads != null ? zahl(w.leads) : String(VERTRETER_BEISPIEL.leads),
    },
    ton: { ueberschuss: r.ueberschuss > 0 ? "plus" : "" },
  };
}

/** Alle Ausgaben einer Rechen-Folie (Texte und Farbe je data-r). */
export function rechnerAusgabe(art: string, werte: RechnerWerte, fest: RechnerFest): RechnerAusgabe | null {
  if (art === "ppl") return pplAusgabe(werte, fest);
  if (art === "vertreter") return vertreterAusgabe(werte, fest);
  return null;
}

/** Im Browser: Felder lesen, neu rechnen, Ausgaben (data-r) setzen. Ohne Bezüge auf React. */
export function rechnerAnwenden(root: HTMLElement): void {
  let fest: RechnerFest = {};
  try {
    fest = JSON.parse(root.dataset.fest ?? "{}") as RechnerFest;
  } catch {
    /* fest bleibt leer */
  }
  const werte: RechnerWerte = {};
  root.querySelectorAll<HTMLInputElement>("input[data-feld]").forEach((i) => (werte[i.dataset.feld!] = zahlLesen(i.value)));
  const aus = rechnerAusgabe(root.dataset.rechner ?? "", werte, fest);
  if (!aus) return;
  root.querySelectorAll<HTMLElement>("[data-r]").forEach((el) => {
    const k = el.dataset.r!;
    if (k in aus.text && el.textContent !== aus.text[k]) el.textContent = aus.text[k];
    if (k in aus.ton) el.dataset.ton = aus.ton[k];
  });
}

// ─── Quoten mitziehen (Ole, 20.11.2026) ──────────────────────────────────────────────────────────
// Ändert man auf der Pay-per-Lead-Folie die Leads, ziehen Termine und Abschlüsse mit, solange die Quoten gleich
// bleiben (Termine ÷ Leads, Abschlüsse ÷ Termine). Ändert man Termine oder Abschlüsse selbst, gilt ab dann diese
// neue Quote. Die Quoten liegen ungerundet am Folien-Element (data-q-termin, data-q-abschluss), damit wiederholtes
// Runden sie nicht verschiebt.

export type Quoten = { termin: number | null; abschluss: number | null };

/** Quoten aus den aktuellen Werten (null, wo nicht berechenbar). */
export function quotenAus(w: RechnerWerte): Quoten {
  const l = w.leads ?? null;
  const t = w.termine ?? null;
  const a = w.abschluesse ?? null;
  return {
    termin: l != null && l > 0 && t != null ? t / l : null,
    abschluss: t != null && t > 0 && a != null ? a / t : null,
  };
}

/**
 * Rein: neue Werte nach Änderung eines Felds. leads → Termine und Abschlüsse mit den Quoten; termine → neue
 * Terminquote, Abschlüsse mit der Abschlussquote; abschluesse → neue Abschlussquote. Ergebnisse ganzzahlig.
 */
export function quotenNachziehen(feld: string, w: RechnerWerte, q: Quoten): { werte: RechnerWerte; quoten: Quoten } {
  const werte = { ...w };
  const quoten = { ...q };
  const rund = (n: number) => Math.round(n);
  if (feld === "leads" && werte.leads != null && quoten.termin != null) {
    const t = werte.leads * quoten.termin;
    werte.termine = rund(t);
    if (quoten.abschluss != null) werte.abschluesse = rund(t * quoten.abschluss);
  } else if (feld === "termine") {
    if (werte.leads != null && werte.leads > 0 && werte.termine != null) quoten.termin = werte.termine / werte.leads;
    if (werte.termine != null && quoten.abschluss != null) werte.abschluesse = rund(werte.termine * quoten.abschluss);
  } else if (feld === "abschluesse") {
    if (werte.termine != null && werte.termine > 0 && werte.abschluesse != null) quoten.abschluss = werte.abschluesse / werte.termine;
  }
  return { werte, quoten };
}

/** Im Browser: nach einer Eingabe Termine/Abschlüsse mitziehen. Gibt die geänderten Felder zurück. */
export function rechnerQuoten(root: HTMLElement, feld: string): string[] {
  if (root.dataset.rechner !== "ppl" || !["leads", "termine", "abschluesse"].includes(feld)) return [];
  const inputs = new Map<string, HTMLInputElement>();
  root.querySelectorAll<HTMLInputElement>("input[data-feld]").forEach((i) => inputs.set(i.dataset.feld!, i));
  const werte: RechnerWerte = {};
  inputs.forEach((i, k) => (werte[k] = zahlLesen(i.value)));
  const num = (s: string | undefined) => (s != null && s !== "" && Number.isFinite(Number(s)) ? Number(s) : null);
  let q: Quoten = { termin: num(root.dataset.qTermin), abschluss: num(root.dataset.qAbschluss) };
  if (q.termin == null && q.abschluss == null) q = quotenAus(PPL_BEISPIEL);
  const { werte: neu, quoten } = quotenNachziehen(feld, werte, q);
  if (quoten.termin != null) root.dataset.qTermin = String(quoten.termin);
  if (quoten.abschluss != null) root.dataset.qAbschluss = String(quoten.abschluss);
  const geaendert: string[] = [];
  for (const k of ["termine", "abschluesse"]) {
    if (k === feld) continue;
    const i = inputs.get(k);
    if (i && neu[k] != null && neu[k] !== werte[k]) {
      i.value = zahlFeld(neu[k]);
      geaendert.push(k);
    }
  }
  return geaendert;
}
