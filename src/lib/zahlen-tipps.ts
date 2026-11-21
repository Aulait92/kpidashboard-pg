// Karte „So holen Sie mehr raus“ (Ole, 14.11.2026): erscheint unter „Kosten & Ertrag“, wenn der Gewinn
// im Zeitraum oder in der Hochrechnung für den Monat negativ ist. Höchstens 3 Tipps, nach geschätzter
// Wirkung sortiert, nur was der Kunde noch nicht nutzt bzw. wo seine Quote unter dem Schnitt aller
// Kunden liegt (nur anonym aggregiert). Wegklicken für 30 Tage; erledigte Tipps fallen von selbst weg.
// Vermittler-Oberfläche: Sie-Form. Kein Garantie-Hinweis, keine nicht freigegebenen Funktionen.
// pickTips ist rein (getestet); Daten lädt lib/zahlen-tipps-server.

import { EMPFEHLUNG_MODULE_AVAILABLE } from "@/lib/empfehlung/shared";
import { CROSS_SELL_HREF } from "@/lib/cross-sell-offen";
/**
 * Tipp „Kollegen empfehlen“ zeigen? Ole bewirbt das Programm vorerst nicht aktiv (14.11.2026):
 * Standard aus. Gilt auch für den Monatsbericht, sobald er Tipps zeigt.
 */
export const KOLLEGEN_TIPP_AKTIV = false;

/** Hinweis zur Rückmeldung an Meta (lib/capi), gleicher Satz im Abschluss-Dialog und in der Einrichtung. */
export const META_LERNT = "Je vollständiger Sie Abschlüsse mit Beitrag eintragen, desto besser lernt Meta, welche Leads abschließen, und desto bessere Leads bekommen Sie.";

export const TIP_DISMISS_DAYS = 30;
export const MAX_TIPS = 3;

export type TipKey =
  | "empfehlung_an"
  | "empfehlung_fragen"
  | "kollegen"
  | "bestand"
  | "cross_sell"
  | "erreichbarkeit"
  | "terminquote"
  | "abschlussquote"
  | "beitrag"
  | "naechster_schritt"
  | "meta_lernen"
  | "kein_whatsapp";

/**
 * kurz: Fassung für „Ihre 3 Hebel diese Woche“ auf Wachstum (Ole, 18.11.2026): Titel mit Anzahl, ein kurzer Satz,
 * eigener Knopf. Ohne kurz zeigt die Karte title/text.
 */
export type Tip = { key: TipKey; title: string; text: string; href: string; cta: string; impact: number; kurz?: { title: string; text: string; cta?: string } };

export type TipSignals = {
  /** Durchschnittliche Provision (1. Jahr) je Kunde mit Abschluss; ohne Daten ein vorsichtiger Standard. */
  avgProvision: number;
  /** Bezahlte Leads pro Monat (Schnitt der letzten 3 Monate). */
  paidLeadsPerMonth: number;
  closedCustomers: number;
  empfehlungEnabled: boolean;
  /** Kunden mit Abschluss, die noch nicht nach einer Empfehlung gefragt wurden (Modul an). */
  notAskedForReferral: number;
  /** Prämie für Kollegen-Empfehlungen (netto); null = Monatspreis bzw. unbekannt. */
  kollegenPraemie: number | null;
  kollegenEnabled: boolean;
  /** Eigener Bestand importiert (nicht nur aus Abschlüssen übernommen). */
  bestandImported: boolean;
  bestandCampaigns: number;
  /**
   * Bestandskunden-Modul beim Kunden freigeschaltet (Customer.existingCustomersEnabled); ohne Angabe kein Bestand-Tipp.
   * Nur sichtbar (Schalter, Vorschau) reicht nicht (Ole, 17.11.2026).
   */
  bestandEnabled?: boolean;
  /** Kunden mit Abschluss seit 3 Wochen ohne weiteren Vertrag (lib/cross-sell-offen, gleich dem Listen-Filter). */
  withoutCrossSell: number;
  /** Abschlüsse ohne eingetragenen Beitrag. */
  missingPremium: number;
  /** Offene Leads ohne nächsten Schritt (lib/lead-next-step.ts) und Quote „mit nächstem Schritt“ (0..1). */
  withoutNextStep?: number;
  nextStepRate?: number | null;
  /** Rückmeldung an Meta aktiv (lib/capi: in den letzten 30 Tagen gesendet) und Meta-Leads über 14 Tage ohne Ergebnis. */
  capiActive?: boolean;
  staleMetaLeads?: number;
  /** Offene, nicht erreichte Leads ohne WhatsApp (lib/whatsapp/kein-whatsapp): stehen oben auf der Anrufliste. Nur Wachstum. */
  keinWhatsApp?: number;
  /** Eigene Quoten (bezahlte Leads) und Schnitt aller Kunden; null = zu wenig Daten. */
  rates: {
    reach: { own: number | null; avg: number | null };
    termin: { own: number | null; avg: number | null };
    close: { own: number | null; avg: number | null };
  };
};

const eur0 = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)} %`;

/** Mindestabstand zum Schnitt, ab dem eine Quote als schwach gilt (Prozentpunkte). */
const WEAK_GAP = 0.03;

function weak(r: { own: number | null; avg: number | null }): number | null {
  // Nur echte Quoten vergleichen (Termine sind nicht immer Teil von „Erreicht“, dann über 100 %)
  if (r.own == null || r.avg == null || r.own > 1 || r.avg > 1) return null;
  const gap = r.avg - r.own;
  return gap > WEAK_GAP ? gap : null;
}

/** Alle passenden Tipps mit geschätzter Wirkung (€ pro Monat, grob). */
export function candidateTips(s: TipSignals): Tip[] {
  const out: Tip[] = [];
  const prov = s.avgProvision > 0 ? s.avgProvision : 150;
  const closing = (s.rates.close.own ?? s.rates.close.avg ?? 0.2) * (s.rates.termin.own ?? s.rates.termin.avg ?? 0.4);
  if (EMPFEHLUNG_MODULE_AVAILABLE && !s.empfehlungEnabled && s.closedCustomers > 0) {
    out.push({
      key: "empfehlung_an",
      title: "Empfehlungen anschalten",
      text: "Zufriedene Kunden empfehlen Freunde. Diese Leads kosten Sie nichts und zählen voll in Ihren Gewinn.",
      href: "/buyer/empfehlungen",
      cta: "Empfehlungen ansehen",
      impact: Math.max(1, s.closedCustomers) * 0.1 * prov,
      kurz: { title: "Empfehlungen anschalten", text: "Leads von zufriedenen Kunden kosten Sie nichts." },
    });
  }
  if (s.empfehlungEnabled && s.notAskedForReferral >= 3) {
    out.push({
      key: "empfehlung_fragen",
      title: "Nach Empfehlungen fragen",
      text: `${s.notAskedForReferral} Kunden mit Abschluss haben Sie noch nicht nach Empfehlungen gefragt.`,
      href: "/buyer/empfehlungen",
      cta: "Jetzt fragen",
      impact: s.notAskedForReferral * 0.1 * prov,
      kurz: { title: `${s.notAskedForReferral} Kunden nach Empfehlungen fragen`, text: "Empfehlungen kosten Sie keinen Lead." },
    });
  }
  if (s.withoutCrossSell >= 1) {
    out.push({
      key: "cross_sell",
      title: "Weiteres Produkt anbieten",
      text: `${s.withoutCrossSell} ${s.withoutCrossSell === 1 ? "Kunde hat" : "Kunden haben"} noch kein weiteres Produkt angeboten bekommen. Ein zweiter Vertrag kostet keinen neuen Lead.`,
      href: CROSS_SELL_HREF,
      cta: "Kunden ansehen",
      impact: s.withoutCrossSell * 0.15 * prov,
      kurz: { title: `${s.withoutCrossSell} ${s.withoutCrossSell === 1 ? "Kunde" : "Kunden"}: weiteres Produkt anbieten`, text: "Ein zweiter Vertrag kostet keinen neuen Lead." },
    });
  }
  // Nächster Schritt (Ole, 14.11.2026): Leads ohne Wiedervorlage, Termin oder Ergebnis gehen verloren.
  const noStep = s.withoutNextStep ?? 0;
  if (noStep >= 3 && s.nextStepRate != null && s.nextStepRate < 0.9) {
    out.push({
      key: "naechster_schritt",
      title: "Jedem Lead einen nächsten Schritt geben",
      text: `${noStep} offene Leads haben keinen nächsten Schritt (${pct(s.nextStepRate)} mit Schritt, Ziel 100 %). Legen Sie eine Wiedervorlage oder einen Termin fest oder tragen Sie Abschluss bzw. Verloren ein.`,
      href: "/buyer/kontakte?ansicht=ohne-schritt",
      cta: "Leads ansehen",
      impact: noStep * 0.3 * Math.max(closing, 0.05) * prov,
      kurz: { title: `${noStep} Leads ohne nächsten Schritt`, text: "Mit Wiedervorlage oder Termin gehen weniger Leads verloren.", cta: "Jetzt planen" },
    });
  }
  // Kein WhatsApp (Ole, 18.11.2026): diese Leads erreicht nur ein Anruf
  const ohneWa = s.keinWhatsApp ?? 0;
  if (ohneWa >= 1) {
    out.push({
      key: "kein_whatsapp",
      title: "Leads ohne WhatsApp anrufen",
      text: `${ohneWa} ${ohneWa === 1 ? "Lead ist" : "Leads sind"} nicht per WhatsApp erreichbar. Sie stehen oben auf Ihrer Anrufliste.`,
      href: "/buyer#anrufen",
      cta: "Zur Anrufliste",
      impact: ohneWa * 0.5 * Math.max(closing, 0.05) * prov,
      kurz: { title: `${ohneWa} ${ohneWa === 1 ? "Lead" : "Leads"} ohne WhatsApp anrufen`, text: ohneWa === 1 ? "Steht oben auf Ihrer Anrufliste." : "Stehen oben auf Ihrer Anrufliste." },
    });
  }
  if (s.missingPremium >= 1) {
    out.push({
      key: "beitrag",
      title: "Abschlüsse vollständig eintragen",
      text: `Bei ${s.missingPremium} ${s.missingPremium === 1 ? "Abschluss fehlt" : "Abschlüssen fehlt"} der Beitrag. Tragen Sie ihn ein, sonst rechnen wir zu niedrig.${s.capiActive ? ` ${META_LERNT}` : ""}`,
      href: "/buyer/leads",
      cta: "Abschlüsse ergänzen",
      impact: s.missingPremium * 0.3 * prov,
      kurz: { title: `${s.missingPremium} ${s.missingPremium === 1 ? "Abschluss" : "Abschlüsse"} ohne Beitrag`, text: "Mit Beitrag rechnen wir Ihre Provision genau." },
    });
  }
  // Rückmeldung an Meta (Ole, 15.11.2026): offene Meta-Leads ohne Ergebnis bremsen das Lernen von Meta
  const stale = s.staleMetaLeads ?? 0;
  if (s.capiActive && stale >= 5) {
    out.push({
      key: "meta_lernen",
      title: "Ergebnisse eintragen",
      text: `${stale} Leads aus Meta warten seit über 14 Tagen auf ein Ergebnis. Tragen Sie Abschluss oder Verloren ein. ${META_LERNT}`,
      href: "/buyer/leads",
      cta: "Leads ansehen",
      impact: stale * 0.1 * Math.max(closing, 0.05) * prov,
      kurz: { title: `${stale} Leads ohne Ergebnis`, text: "Mit Ergebnis lernt Meta, welche Leads abschließen." },
    });
  }
  if (s.bestandEnabled === true && (!s.bestandImported || s.bestandCampaigns === 0)) {
    out.push({
      key: "bestand",
      title: "Bestand nutzen",
      text: s.bestandImported
        ? "Bieten Sie Ihren Bestandskunden ein weiteres Produkt an. Diese Kontakte kosten keine Werbung."
        : "Importieren Sie Ihren Bestand und bieten Sie ein weiteres Produkt an. Diese Kontakte kosten keine Werbung.",
      href: "/buyer/bestand",
      cta: s.bestandImported ? "Kunden anschreiben" : "Bestand importieren",
      impact: prov,
      kurz: { title: "Bestand nutzen", text: "Kontakte aus Ihrem Bestand kosten keine Werbung." },
    });
  }
  const reachGap = weak(s.rates.reach);
  if (reachGap != null) {
    out.push({
      key: "erreichbarkeit",
      title: "Leads schneller erreichen",
      text: `Sie erreichen ${pct(s.rates.reach.own!)} Ihrer Leads, im Schnitt aller Kunden sind es ${pct(s.rates.reach.avg!)}. Rufen Sie neue Leads möglichst sofort an und nutzen Sie den WhatsApp-Assistenten.`,
      href: "/buyer",
      cta: "Zu Heute",
      impact: s.paidLeadsPerMonth * reachGap * closing * prov,
      kurz: { title: "Neue Leads schneller anrufen", text: "Sie erreichen weniger Leads als andere Vermittler im Schnitt." },
    });
  }
  const terminGap = weak(s.rates.termin);
  if (terminGap != null) {
    out.push({
      key: "terminquote",
      title: "Mehr Termine vereinbaren",
      text: `Aus ${pct(s.rates.termin.own!)} der erreichten Leads wird ein Termin (Schnitt ${pct(s.rates.termin.avg!)}). Schicken Sie Ihren Terminlink mit und fassen Sie nach.`,
      href: "/buyer/kalender",
      cta: "Terminlink ansehen",
      impact: s.paidLeadsPerMonth * (s.rates.reach.own ?? 0.5) * terminGap * (s.rates.close.own ?? 0.2) * prov,
      kurz: { title: "Mehr Termine vereinbaren", text: "Schicken Sie Ihren Terminlink mit und fassen Sie nach." },
    });
  }
  const closeGap = weak(s.rates.close);
  if (closeGap != null) {
    out.push({
      key: "abschlussquote",
      title: "Angebote nachfassen",
      text: `Aus ${pct(s.rates.close.own!)} der Termine wird ein Abschluss (Schnitt ${pct(s.rates.close.avg!)}). Fassen Sie offene Angebote nach ein paar Tagen nach.`,
      href: "/buyer/kanban",
      cta: "Offene Angebote",
      impact: s.paidLeadsPerMonth * (s.rates.reach.own ?? 0.5) * (s.rates.termin.own ?? 0.4) * closeGap * prov,
      kurz: { title: "Offene Angebote nachfassen", text: "Ein kurzer Anruf nach ein paar Tagen bringt mehr Abschlüsse." },
    });
  }
  if (KOLLEGEN_TIPP_AKTIV && s.kollegenEnabled) {
    out.push({
      key: "kollegen",
      title: "Kollegen empfehlen",
      text: s.kollegenPraemie
        ? `Empfehlen Sie uns Kollegen: Für jeden, der Kunde wird, schreiben wir Ihnen ${eur0(s.kollegenPraemie)} netto auf Ihre nächste Rechnung gut.`
        : "Empfehlen Sie uns Kollegen: Für jeden, der Kunde wird, gibt es eine Prämie auf Ihre Rechnung.",
      href: "/buyer/empfehlen",
      cta: "Kollegen empfehlen",
      impact: (s.kollegenPraemie ?? 300) * 0.1,
    });
  }
  return out;
}

/** Weggeklickt in den letzten 30 Tagen? dismissed = { tippSchlüssel: ISO-Datum }. */
export function isDismissed(dismissed: unknown, key: string, now: Date): boolean {
  if (!dismissed || typeof dismissed !== "object") return false;
  const at = (dismissed as Record<string, unknown>)[key];
  const t = typeof at === "string" ? Date.parse(at) : NaN;
  return Number.isFinite(t) && now.getTime() - t < TIP_DISMISS_DAYS * 86_400_000;
}

/** Bis zu 3 Tipps nach Wirkung, ohne weggeklickte. */
export function pickTips(s: TipSignals, dismissed: unknown, now = new Date()): Tip[] {
  return candidateTips(s)
    .filter((t) => !isDismissed(dismissed, t.key, now))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, MAX_TIPS);
}

/** Wegklicken speichern (alte Einträge über 30 Tage fallen raus). */
export function withDismissed(dismissed: unknown, key: string, now = new Date()): Record<string, string> {
  const out: Record<string, string> = {};
  if (dismissed && typeof dismissed === "object") {
    for (const [k, v] of Object.entries(dismissed as Record<string, unknown>)) if (typeof v === "string" && isDismissed(dismissed, k, now)) out[k] = v;
  }
  out[key] = now.toISOString();
  return out;
}

/** Satz für die ersten Monate: am Anfang normal, Bestand wächst mit. */
export function earlyHint(monthsSinceStart: number | null, bestandInYears: number): string | null {
  if (monthsSinceStart == null || monthsSinceStart >= 3) return null;
  return bestandInYears > 0
    ? `In den ersten Monaten ist das normal: Die Einrichtung fällt an, Abschlüsse brauchen etwas Zeit. Ihre Bestandsprovision wächst mit, in 5 Jahren rechnen wir mit ${eur0(bestandInYears)}.`
    : "In den ersten Monaten ist das normal: Die Einrichtung fällt an, Abschlüsse brauchen etwas Zeit. Mit jedem Abschluss wächst auch Ihre Bestandsprovision.";
}
