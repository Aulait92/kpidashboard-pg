// Halteangebote beim Kündigen (Ole, 15.11.2026, freigegeben): Regeln, Texte, Einstellungen und Statistik.
// Rein, ohne Datenbank (auch im Browser nutzbar), getestet in tests/unit/halteangebote.test.ts.
// Server-Teil (Annahme, Stripe, Aufgaben, Push, E-Mail): lib/halteangebote-server.ts.
//
// Angebote je Grund (Auswahl in lib/anti-churn.offersFor):
// - Zu teuer: Nachlass (Standard 50 % auf 2 Monatsrechnungen), Bedingung: danach mindestens 3 weitere Monate
//   Laufzeit (commitEndIso); Alternative: kleineres Paket (Werbebudget senken, vorhandene Preisstufen).
// - Zu wenige Leads: Kampagnen-Neustart durch uns + 1 Monat Betreuung kostenlos.
// - Leads passen nicht: kostenlose Neuausrichtung + Prüfung einer Gutschrift für Leads mit falschen Daten (30 Tage).
// - Zu wenige Abschlüsse: kein Coaching, sondern kostenloser Wechsel auf die Sparte mit der besten Abschlussquote
//   über alle Kunden (suggestSparte, mit Mindest-Stichprobe).
// - Keine Zeit: bis zu 3 Monate Pause ohne Kosten (vorhandene Pause, Abrechnung ruht ganz).
// - App passt nicht: Einrichtung für ihn, 30 Minuten per Bildschirmfreigabe (Hilfetermin).
// - Höre auf / wechsle: Paket „Nur Bestand“ (Ole, 15.11.2026: 149 € netto im Monat = Bestandskunden-Modul ohne Leads und
//   Betreuung, mit Daten und demselben Kontingent wie das Modul; Empfehlungen optional + 59 €) + Hinweis „Kollegen empfehlen“.
// - Alle Gründe: Rückkehrangebot per E-Mail 30 Tage nach Vertragsende (ohne neue Einrichtungsgebühr, lib/ruhend.ts).
// Regeln: Rabatt-Angebote (Nachlass, kostenloser Betreuungsmonat, Gutschrift, Pause ohne Kosten) höchstens einmal in
// 12 Monaten und erst ab 3 Monaten Kundendauer; nicht bei jährlicher Vorauszahlung (dort wäre der Nachlass auf die
// Jahresrechnung falsch). Jedes Angebot ist im Admin abschaltbar.

import type { HalteKind } from "@/lib/anti-churn";
import { fmtIso, nextDayIso, periodEndIso } from "@/lib/vertrag-laufzeit";
import { PRICE_LIST } from "@/lib/offer-pricing";

// ─── Einstellungen ───────────────────────────────────────────────────────

export type HalteSettings = {
  rabattOn: boolean;
  rabattPercent: number;
  rabattMonths: number;
  /** Mindestlaufzeit nach dem Nachlass (Monate) */
  rabattCommitMonths: number;
  /** Kleineres Paket (Werbebudget senken) bei „zu teuer“ */
  paketOn: boolean;
  neustartOn: boolean;
  /** Kostenlose Betreuungsmonate beim Neustart (0 = ohne) */
  neustartFreeMonths: number;
  neuausrichtungOn: boolean;
  gutschriftOn: boolean;
  gutschriftDays: number;
  produktwechselOn: boolean;
  /** Mindestzahl Leads je Sparte für die Abschlussquote */
  produktwechselMinLeads: number;
  pauseOn: boolean;
  pauseMaxMonths: number;
  einrichtungOn: boolean;
  einrichtungMinutes: number;
  nurBestandOn: boolean;
  nurBestandPrice: number;
  rueckkehrOn: boolean;
  /** Tage nach Vertragsende */
  rueckkehrDays: number;
  minTenureMonths: number;
  cooldownMonths: number;
};

export const HALTE_DEFAULTS: HalteSettings = {
  rabattOn: true,
  rabattPercent: 50,
  rabattMonths: 2,
  rabattCommitMonths: 3,
  paketOn: true,
  neustartOn: true,
  neustartFreeMonths: 1,
  neuausrichtungOn: true,
  gutschriftOn: true,
  gutschriftDays: 30,
  produktwechselOn: true,
  produktwechselMinLeads: 30,
  pauseOn: true,
  pauseMaxMonths: 3,
  einrichtungOn: true,
  einrichtungMinutes: 30,
  nurBestandOn: true,
  nurBestandPrice: PRICE_LIST.bestandModuleMonthly,
  rueckkehrOn: true,
  rueckkehrDays: 30,
  minTenureMonths: 3,
  cooldownMonths: 12,
};

const LIMITS: Partial<Record<keyof HalteSettings, [number, number]>> = {
  rabattPercent: [5, 100],
  rabattMonths: [1, 6],
  rabattCommitMonths: [0, 12],
  neustartFreeMonths: [0, 3],
  gutschriftDays: [7, 90],
  produktwechselMinLeads: [5, 1000],
  pauseMaxMonths: [1, 6],
  einrichtungMinutes: [15, 60],
  nurBestandPrice: [0, 1000],
  rueckkehrDays: [7, 180],
  minTenureMonths: [0, 24],
  cooldownMonths: [0, 36],
};

/** Gespeicherte Werte (JSON) mit Standard ergänzen und auf sinnvolle Grenzen begrenzen. */
export function normalizeHalteSettings(raw: unknown): HalteSettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...HALTE_DEFAULTS } as Record<keyof HalteSettings, number | boolean>;
  for (const key of Object.keys(HALTE_DEFAULTS) as (keyof HalteSettings)[]) {
    const def = HALTE_DEFAULTS[key];
    const v = src[key];
    if (typeof def === "boolean") {
      if (typeof v === "boolean") out[key] = v;
      continue;
    }
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
    if (!Number.isFinite(n)) continue;
    const [min, max] = LIMITS[key] ?? [0, 1000];
    out[key] = key === "nurBestandPrice" ? Math.round(Math.min(max, Math.max(min, n)) * 100) / 100 : Math.round(Math.min(max, Math.max(min, n)));
  }
  return out as HalteSettings;
}

/** Schalter je Angebot für lib/anti-churn.offersFor */
export function enabledKinds(s: HalteSettings): Partial<Record<HalteKind | "budget", boolean>> {
  return {
    rabatt: s.rabattOn,
    budget: s.paketOn,
    neustart: s.neustartOn,
    neuausrichtung: s.neuausrichtungOn,
    produktwechsel: s.produktwechselOn,
    pause_gratis: s.pauseOn,
    einrichtung: s.einrichtungOn,
    nur_bestand: s.nurBestandOn,
  };
}

/** Zählt als Rabatt (höchstens einmal in 12 Monaten): mit Geld verbunden. */
export function isDiscountOffer(kind: HalteKind, s: HalteSettings, discountOk: boolean): boolean {
  if (kind === "rabatt" || kind === "pause_gratis") return true;
  if (kind === "neustart") return discountOk && s.neustartFreeMonths > 0;
  if (kind === "neuausrichtung") return discountOk && s.gutschriftOn;
  return false;
}

// ─── Rabatt-Regeln ───────────────────────────────────────────────────────

/** YYYY-MM-DD + Monate (gleicher Kalendertag, sonst Monatsletzter + 1 wie bei Fristen). */
export const addMonthsIso = (iso: string, months: number) => (months <= 0 ? iso : nextDayIso(periodEndIso(iso, months)));

export type DiscountCheck = { ok: true } | { ok: false; why: "kein_start" | "kundendauer" | "zuletzt" | "jahreszahlung"; text: string };

/**
 * Rabatt-Angebote erlaubt? Erst ab `minTenureMonths` Kundendauer (ab Start) und höchstens einmal in `cooldownMonths`
 * (letzter angenommener Rabatt), nicht bei jährlicher Vorauszahlung.
 */
export function discountEligibility(o: { startIso: string | null; todayIso: string; lastDiscountIso: string | null; annual?: boolean; s: Pick<HalteSettings, "minTenureMonths" | "cooldownMonths"> }): DiscountCheck {
  if (o.annual) return { ok: false, why: "jahreszahlung", text: "Jährliche Vorauszahlung" };
  if (!o.startIso || o.startIso > o.todayIso) return { ok: false, why: "kein_start", text: "Vertrag ohne bekannten Start" };
  if (addMonthsIso(o.startIso, o.s.minTenureMonths) > o.todayIso) return { ok: false, why: "kundendauer", text: `Erst ab ${o.s.minTenureMonths} Monaten Kundendauer (ab ${fmtIso(addMonthsIso(o.startIso, o.s.minTenureMonths))})` };
  if (o.lastDiscountIso && addMonthsIso(o.lastDiscountIso, o.s.cooldownMonths) > o.todayIso) {
    return { ok: false, why: "zuletzt", text: `Letzter Rabatt am ${fmtIso(o.lastDiscountIso)}, wieder ab ${fmtIso(addMonthsIso(o.lastDiscountIso, o.s.cooldownMonths))}` };
  }
  return { ok: true };
}

/**
 * Letzter Tag der Mindestlaufzeit nach dem Nachlass. Der Nachlass gilt für die nächsten `months` Abrechnungsmonate
 * nach dem laufenden (der laufende ist schon berechnet), danach `commitMonths` volle Abrechnungsmonate.
 * Mit Start: Abrechnungsmonate ab dem Starttag (wie AGB „Fristen“); ohne Start: Kalendermonate.
 */
export function commitEndIso(o: { startIso: string | null; todayIso: string; months: number; commitMonths: number }): string {
  const extra = o.months + o.commitMonths;
  if (o.startIso && o.startIso <= o.todayIso) {
    for (let k = 1; k < 1200; k++) {
      if (periodEndIso(o.startIso, k) >= o.todayIso) return periodEndIso(o.startIso, k + extra);
    }
  }
  const [y, m] = o.todayIso.split("-").map(Number);
  const total = m - 1 + extra;
  const ty = y + Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** Kündigungstermin unter Beachtung der Bindung nach dem Nachlass (später der beiden). */
export const laterIso = (a: string, b: string | null) => (b && b > a ? b : a);

// ─── Spartenwechsel: beste Abschlussquote über alle Kunden ───────────────

export type SparteRate = { key: string; label: string; leads: number; closes: number };
export type SparteSuggestion = { key: string; label: string; rate: number; leads: number };

/**
 * Sparte mit der höchsten Abschlussquote (Abschlüsse ÷ Leads, alle Kunden), mindestens `minLeads` Leads, nicht schon
 * beim Kunden. Muss besser sein als die beste eigene Sparte (gleiche Zahlen über alle Kunden), sonst null (Ersatztext).
 */
export function suggestSparte(rows: SparteRate[], current: string[], minLeads: number, exclude: string[] = []): SparteSuggestion | null {
  const rate = (r: SparteRate) => (r.leads > 0 ? r.closes / r.leads : 0);
  const sample = rows.filter((r) => r.leads >= minLeads && !exclude.includes(r.key));
  const own = sample.filter((r) => current.includes(r.key));
  const bar = own.length ? Math.max(...own.map(rate)) : 0;
  const best = sample
    .filter((r) => !current.includes(r.key) && r.closes > 0 && rate(r) > bar)
    .sort((a, b) => rate(b) - rate(a) || b.leads - a.leads || a.label.localeCompare(b.label, "de"))[0];
  return best ? { key: best.key, label: best.label, rate: rate(best), leads: best.leads } : null;
}

// ─── Texte für das Kündigungsfenster ─────────────────────────────────────

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const pct = (x: number) => `${Math.round(x * 1000) / 10}`.replace(".", ",");

export type OfferView = {
  key: string;
  title: string;
  text: string;
  cta: string;
  anchor?: string;
  /** simple = ein Knopf, termin/einrichtung = Terminwahl, pause = Zeitraum, note = Wunsch als Text */
  form: "simple" | "termin" | "einrichtung" | "pause" | "note";
  /** Pflicht-Häkchen vor der Annahme (Bindung nach dem Nachlass) */
  confirm?: string;
  hint?: { text: string; href: string; label: string };
  /** Pause: frühester Start und spätestes Ende (YYYY-MM-DD) */
  pauseFrom?: string;
  pauseMaxUntil?: string;
};

export type HalteTextContext = {
  s: HalteSettings;
  discountOk: boolean;
  /** Letzter Tag der Bindung, falls der Nachlass jetzt angenommen wird */
  commitIso: string;
  suggestion: SparteSuggestion | null;
  todayIso: string;
  einrichtungSlots: boolean;
  referralHint: string | null;
};

/** Titel, Text und Knopf eines Halteangebots mit den aktuellen Werten (Sie-Form, ohne Gedankenstriche). */
export function halteOfferView(kind: HalteKind, c: HalteTextContext): OfferView {
  const s = c.s;
  switch (kind) {
    case "rabatt":
      return {
        key: kind,
        title: `${s.rabattPercent} % Nachlass auf ${s.rabattMonths === 1 ? "eine Monatsrechnung" : `${s.rabattMonths} Monatsrechnungen`}`,
        text: `Sie zahlen die nächsten ${s.rabattMonths === 1 ? "Monatsrechnung" : `${s.rabattMonths} Monatsrechnungen`} mit ${s.rabattPercent} % Nachlass auf die monatliche Vergütung.${s.rabattCommitMonths > 0 ? ` Bedingung: Ihr Vertrag läuft danach noch mindestens ${s.rabattCommitMonths} Monate weiter, also mindestens bis zum ${fmtIso(c.commitIso)}.` : ""} Die Bestätigung kommt per E-Mail.`,
        cta: "Nachlass annehmen",
        form: "simple",
        ...(s.rabattCommitMonths > 0 ? { confirm: `Einverstanden: Mein Vertrag läuft mindestens bis zum ${fmtIso(c.commitIso)}.` } : {}),
      };
    case "neustart": {
      const free = c.discountOk && s.neustartFreeMonths > 0;
      return {
        key: kind,
        title: "Neustart Ihrer Kampagne durch uns",
        text: `Wir bauen Ihre Kampagne neu auf: neue Anzeigen und neue Zielgruppen.${free ? ` Dazu ist Ihre Betreuung ${s.neustartFreeMonths === 1 ? "einen Monat" : `${s.neustartFreeMonths} Monate`} kostenlos.` : ""} Wir melden uns innerhalb von zwei Werktagen.`,
        cta: "Neustart anfordern",
        form: "simple",
      };
    }
    case "neuausrichtung": {
      const credit = c.discountOk && s.gutschriftOn;
      return {
        key: kind,
        title: "Kostenlose Neuausrichtung",
        text: `Wir richten Ihre Kampagne kostenlos neu aus: andere Sparte, andere Region oder angepasste Fragen im Formular.${credit ? ` Außerdem prüfen wir Leads mit falschen Daten aus den letzten ${s.gutschriftDays} Tagen und schreiben Ihnen für bestätigte Fälle eine Gutschrift gut.` : ""}`,
        cta: "Neuausrichtung anfordern",
        form: "note",
      };
    }
    case "produktwechsel":
      return {
        key: kind,
        title: "Kostenloser Wechsel der Sparte",
        text: c.suggestion
          ? `Über alle unsere Kunden hat zurzeit ${c.suggestion.label} die beste Abschlussquote (${pct(c.suggestion.rate * 100)} % der Leads, aus ${c.suggestion.leads} Leads). Wir stellen Ihre Kampagne kostenlos darauf um, ohne neue Einrichtungsgebühr.`
          : "Wir schlagen Ihnen eine Sparte mit besserer Abschlussquote vor und stellen Ihre Kampagne kostenlos um, ohne neue Einrichtungsgebühr. Wir melden uns innerhalb von zwei Werktagen.",
        cta: "Wechsel anfordern",
        form: "simple",
      };
    case "pause_gratis":
      return {
        key: kind,
        title: `Bis zu ${s.pauseMaxMonths === 1 ? "einen Monat" : `${s.pauseMaxMonths} Monate`} kostenlos pausieren`,
        text: "Anzeigen und die gesamte Abrechnung ruhen, Ihre Daten, Leads und Einstellungen bleiben erhalten. Zum gewählten Datum geht es automatisch weiter, ohne neue Einrichtung.",
        cta: "Pause eintragen",
        form: "pause",
        pauseFrom: c.todayIso,
        pauseMaxUntil: addMonthsIso(c.todayIso, s.pauseMaxMonths),
      };
    case "einrichtung":
      return {
        key: kind,
        title: "Wir richten die App für Sie ein",
        text: `${s.einrichtungMinutes} Minuten per Video mit Bildschirmfreigabe: Wir stellen die App gemeinsam so ein, wie Sie arbeiten, kostenlos.${c.einrichtungSlots ? "" : " Wir melden uns innerhalb eines Werktags für einen Termin."}`,
        cta: c.einrichtungSlots ? "Termin buchen" : "Termin anfragen",
        form: c.einrichtungSlots ? "einrichtung" : "simple",
      };
    case "nur_bestand":
      return {
        key: kind,
        title: `Paket „Nur Bestand“ für ${eur(s.nurBestandPrice)} netto im Monat`,
        text: `Sie behalten Ihre Daten und das Bestandskunden-Modul mit demselben Kontingent (${PRICE_LIST.bestandIncludedMessages.toLocaleString("de-DE")} Kampagnen-Nachrichten im Monat). Keine neuen Leads und keine Betreuung. Das Modul „Empfehlungen & Bewertungen“ können Sie für ${eur(PRICE_LIST.empfehlungModuleMonthly)} netto im Monat dazu behalten. Wir stellen Ihren Vertrag zum nächstmöglichen Termin um und bestätigen Ihnen das.`,
        cta: "Paket wählen",
        form: "simple",
        ...(c.referralHint ? { hint: { text: c.referralHint, href: "/buyer/empfehlen", label: "Kollegen empfehlen" } } : {}),
      };
  }
}

// ─── Statistik (Admin → Zahlen → Kündigung & Rückkehr) ───────────────────

export type HalteRow = { reason: string | null; kind: string; mrrSaved: number | null; cancelledLaterAt: Date | null; createdAt: Date };
export type HalteGroup = { key: string; accepted: number; savedMrr: number; cancelledLater: number; stillSavedMrr: number };
export type HalteStats = { accepted: number; savedMrr: number; cancelledLater: number; stillSavedMrr: number; byReason: HalteGroup[]; byKind: HalteGroup[] };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Angenommene Angebote je Grund und Angebot, geretteter Monatsbetrag, später trotzdem gekündigt. */
export function halteStats(rows: HalteRow[]): HalteStats {
  const group = (keyOf: (r: HalteRow) => string) => {
    const m = new Map<string, HalteGroup>();
    for (const r of rows) {
      const k = keyOf(r);
      const g = m.get(k) ?? { key: k, accepted: 0, savedMrr: 0, cancelledLater: 0, stillSavedMrr: 0 };
      g.accepted++;
      g.savedMrr = r2(g.savedMrr + (r.mrrSaved ?? 0));
      if (r.cancelledLaterAt) g.cancelledLater++;
      else g.stillSavedMrr = r2(g.stillSavedMrr + (r.mrrSaved ?? 0));
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.accepted - a.accepted || a.key.localeCompare(b.key));
  };
  const savedMrr = r2(rows.reduce((s, r) => s + (r.mrrSaved ?? 0), 0));
  const stillSavedMrr = r2(rows.filter((r) => !r.cancelledLaterAt).reduce((s, r) => s + (r.mrrSaved ?? 0), 0));
  return { accepted: rows.length, savedMrr, cancelledLater: rows.filter((r) => r.cancelledLaterAt).length, stillSavedMrr, byReason: group((r) => r.reason ?? ""), byKind: group((r) => r.kind) };
}

/** Kurzbezeichnung eines Angebots für Admin und Statistik. */
export const HALTE_LABEL: Record<HalteKind, string> = {
  rabatt: "Nachlass mit Mindestlaufzeit",
  neustart: "Kampagnen-Neustart",
  neuausrichtung: "Neuausrichtung",
  produktwechsel: "Spartenwechsel",
  pause_gratis: "Pause ohne Kosten",
  einrichtung: "Einrichtung per Bildschirmfreigabe",
  nur_bestand: "Paket „Nur Bestand“",
};
