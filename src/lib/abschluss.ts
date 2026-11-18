// Abschluss erkennen und melden (P4, Ole 17.11.2026; Plan docs/plan-lead-verlauf.md, Punkte 9 und 12a, Ergänzung D).
// Regeln und Texte ohne Datenbank (auch für Client-Komponenten); Datenbank-Teil in lib/abschluss-server.ts.
//
//   Abschluss mit einem Tipp   Ein Tipp speichert sofort: Sparte aus dem Produkt, Beitrag aus dem Angebot der
//                              Terminvorbereitung, sonst der typische Beitrag der Sparte (provision.ts). Danach eine
//                              Zeile „Privatschutz · 612 €/Jahr aus Ihrem Angebot · Provision ≈ 337 €“ mit Stimmt/Ändern.
//   Glückwunsch                Nicht automatisch, nicht per Mail: Haken „Glückwunsch per WhatsApp senden“ beim
//                              Eintragen, vorausgewählt nur, wenn der Termin höchstens 3 Tage zurückliegt.
//   Vorabend-Push              „Hat Frau Becker abgeschlossen?“ am Abend vor dem nächsten Nachfassen zum Angebot bzw.
//                              am Abend eines stattgefundenen Termins, mit Deep-Link auf das Entscheidungsblatt.

import { a, type Ansprache } from "@/lib/ansprache";
import { contractLabel, contractProvision, PROVISION_PRODUCTS, sparteInfo, sparteKind, type ProvisionOverrides, type RateSpec } from "@/lib/provision";

/** Herkunft des Beitrags am Vertrag (LeadContract.premiumSource). */
export type PremiumSource = "angebot" | "vermittler" | "standard";

export function asPremiumSource(v: unknown): PremiumSource | null {
  return v === "angebot" || v === "vermittler" || v === "standard" ? v : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function specFor(sparte: string, rates?: ProvisionOverrides): RateSpec {
  const key = sparteInfo(sparte).rateKey;
  return rates?.[key] ?? PROVISION_PRODUCTS.find((p) => p.key === key)!.standard;
}

/**
 * Einheitlicher Jahresbeitrag (LeadContract.premiumYear): gespeichert ist bei PKV und Kranken-Zusatz der Monatsbeitrag
 * (× 12), bei Leben/BU schon der Jahresbeitrag; die Tarifoptimierung hat keinen Beitrag (Ersparnis des Kunden).
 */
export function premiumYearFor(sparte: string, premium: unknown): number | null {
  const p = premium == null ? NaN : Number(premium);
  if (!Number.isFinite(p) || p <= 0) return null;
  const kind = sparteKind(sparte);
  if (kind === "honorar") return null;
  return r2(kind === "monthly" ? p * 12 : p);
}

/** Beitrag am Vertrag aus dem Monatsbeitrag des Angebots (Terminvorbereitung): Jahresbeitrag bzw. bei PKV/Kranken der Monatsbeitrag. */
export function premiumAusAngebot(sparte: string, monat: number | null | undefined): number | null {
  if (monat == null || !Number.isFinite(monat) || monat <= 0) return null;
  const kind = sparteKind(sparte);
  if (kind === "honorar" || kind === "fixed") return null;
  return r2(kind === "monthly" ? monat : monat * 12);
}

/** Typischer Beitrag der Sparte in der gespeicherten Einheit (null = keiner bekannt: PKV-Neugeschäft, Tarifoptimierung, fester Betrag). */
export function standardPremium(sparte: string, rates?: ProvisionOverrides): number | null {
  const s = specFor(sparte, rates);
  if (s.kind === "percent") return s.defaultPremium > 0 ? s.defaultPremium : null;
  if (s.kind === "beitragssumme") return r2(s.defaultMonthly * 12);
  if (s.kind === "monthly") return s.defaultMonthly ?? null;
  // Tarifoptimierung: kein Beitrag (Ersparnis des Kunden), fester Betrag: nichts zu schätzen
  return null;
}

/** Eingabe-Einheit der Sparte: Jahresbeitrag (Sach) oder Monatsbeitrag (Leben/BU, PKV, Kranken), bzw. Ersparnis. */
export function beitragEinheit(sparte: string): { faktor: number; suffix: "/Jahr" | "/Monat"; ersparnis: boolean } {
  const kind = sparteKind(sparte);
  if (kind === "beitragssumme") return { faktor: 12, suffix: "/Monat", ersparnis: false };
  if (kind === "monthly") return { faktor: 1, suffix: "/Monat", ersparnis: false };
  if (kind === "honorar") return { faktor: 1, suffix: "/Monat", ersparnis: true };
  return { faktor: 1, suffix: "/Jahr", ersparnis: false };
}

const schoen = (n: number) => (n >= 300 ? Math.round(n / 50) * 50 : n >= 100 ? Math.round(n / 10) * 10 : Math.max(5, Math.round(n / 5) * 5));

/**
 * Drei typische Beiträge der Sparte für die Chips (Eingabe-Einheit, z. B. 350 · 600 · 900 €/Jahr bei Privatschutz):
 * etwas darunter, der Standard aus „Meine Provisionen“, etwas darüber. Leer, wenn kein Standard bekannt ist.
 */
export function beitragsChips(sparte: string, rates?: ProvisionOverrides): number[] {
  const std = standardPremium(sparte, rates);
  if (std == null) return [];
  const e = std / beitragEinheit(sparte).faktor;
  // Mitte = genau der Standard (das speichert auch „nichts antippen“)
  const list = [schoen(e * 0.6), Math.round(e), schoen(e * 1.5)];
  return [...new Set(list)].filter((x) => x > 0);
}

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

export type AbschlussVertrag = {
  sparte: string;
  premium: number | null;
  premiumSource: PremiumSource | null;
  productName?: string | null;
  rateAbschluss?: number | null;
  rateBestand?: number | null;
  provisionValue?: number | null;
};

/** Beitrag als Text in der Eingabe-Einheit („612 €/Jahr“, „80 €/Monat“, „Ersparnis 120 €/Monat“), geschätzte mit „≈“. */
export function beitragText(c: Pick<AbschlussVertrag, "sparte" | "premium" | "premiumSource">): string | null {
  if (c.premium == null || !(c.premium > 0)) return null;
  const e = beitragEinheit(c.sparte);
  const wert = `${c.premiumSource === "standard" ? "≈ " : ""}${eur(c.premium / e.faktor)}${e.suffix}`;
  return e.ersparnis ? `Ersparnis ${wert}` : wert;
}

/**
 * Zeile nach dem Tipp: „Privatschutz/Haftpflicht · 612 €/Jahr aus Ihrem Angebot · Provision ≈ 337 €“, mit typischem
 * Beitrag „Hausrat · ≈ 120 €/Jahr (typisch) · Provision ≈ 66 €“. Provision = im 1. Jahr verdient (wie überall).
 */
export function abschlussZeile(c: AbschlussVertrag, rates?: ProvisionOverrides): string {
  const p = contractProvision({ ...c, status: "aktiv" }, rates);
  const parts = [contractLabel(c)];
  const b = beitragText(c);
  if (b) parts.push(c.premiumSource === "angebot" ? `${b} aus Ihrem Angebot` : c.premiumSource === "standard" ? `${b} (typisch)` : b);
  if (p.firstYear > 0) parts.push(`${p.honorar ? "Honorar" : "Provision"} ≈ ${eur(p.firstYear)}`);
  else if (p.trailPerYear > 0) parts.push(`Bestand ≈ ${eur(p.trailPerYear)}/Jahr`);
  return parts.join(" · ");
}

// ─── Glückwunsch (Ergänzung D) ─────────────────────────────────────────────

/** Vorausgewählt nur, wenn der Termin höchstens so viele Kalendertage zurückliegt. */
export const GLUECKWUNSCH_TAGE = 3;

const berlinYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);

/** Kalendertage (Berlin) zwischen zwei Zeitpunkten (0 = am selben Tag). */
export function kalenderTage(von: Date, bis: Date): number {
  const t = (d: Date) => Date.parse(`${berlinYmd(d)}T00:00:00Z`);
  return Math.round((t(bis) - t(von)) / 86_400_000);
}

/** Haken „Glückwunsch per WhatsApp senden“ vorausgewählt? Nur mit Termin, der höchstens 3 Tage zurückliegt. */
export function glueckwunschVorausgewaehlt(terminAt: Date | null | undefined, now = new Date()): boolean {
  if (!terminAt || terminAt.getTime() > now.getTime()) return false;
  return kalenderTage(terminAt, now) <= GLUECKWUNSCH_TAGE;
}

/**
 * Text an den Lead (Ole, Ergänzung D): „Schön, dass Sie sich für Ihren neuen Schutz entschieden haben, Frau Becker! Bei
 * Fragen erreichen Sie Herrn Kannapinn jederzeit hier.“ Du: „…, Julia! Bei Fragen erreichst du Ole jederzeit hier.“
 * name = anredeName des Leads (Sie „Frau Becker“, Du Vorname), vermittler = Akkusativ („Herrn Kannapinn“, Du „Ole“).
 */
export function glueckwunschText(o: { an: Ansprache; name: string | null; vermittler: string }): string {
  const n = o.name ? `, ${o.name}` : "";
  return a(
    o.an,
    `Schön, dass du dich für deinen neuen Schutz entschieden hast${n}! Bei Fragen erreichst du ${o.vermittler} jederzeit hier.`,
    `Schön, dass Sie sich für Ihren neuen Schutz entschieden haben${n}! Bei Fragen erreichen Sie ${o.vermittler} jederzeit hier.`,
  );
}

// ─── Vorabend-Push und Entscheidungsblatt ───────────────────────────────────

/** Vorabend-Push zwischen 18 und 21 Uhr (Berlin), je Lead höchstens einmal am Tag. */
export const VORABEND_VON = 18;
export const VORABEND_BIS = 21;

export function blattUrl(leadIds: string[]): string {
  return `/buyer/abschluss?l=${leadIds.map(encodeURIComponent).join(",")}`;
}

/** „Hat Frau Becker abgeschlossen?“ bzw. bei mehreren „Haben Frau Becker und Herr Kurz abgeschlossen?“. */
export function abschlussFrage(labels: string[]): string {
  if (labels.length <= 1) return `Hat ${labels[0] ?? "Ihr Kontakt"} abgeschlossen?`;
  if (labels.length === 2) return `Haben ${labels[0]} und ${labels[1]} abgeschlossen?`;
  return `Haben ${labels[0]}, ${labels[1]} und ${labels.length - 2} ${labels.length - 2 === 1 ? "weiterer Kontakt" : "weitere Kontakte"} abgeschlossen?`;
}

export type VorabendGrund = "angebot" | "termin";

/** Push am Vorabend (Vermittler-Oberfläche, Sie-Form). */
export function vorabendPush(items: { leadId: string; label: string; grund: VorabendGrund }[], day: string): { title: string; body: string; url: string; tag: string } {
  const angebot = items.some((i) => i.grund === "angebot");
  return {
    title: abschlussFrage(items.map((i) => i.label)),
    body:
      items.length === 1
        ? angebot
          ? "Morgen fasst der Assistent zum Angebot nach. Mit einem Tipp eintragen oder pausieren."
          : "Heute war der Termin. Mit einem Tipp eintragen, sonst läuft alles weiter."
        : angebot
          ? "Morgen fasst der Assistent nach. Mit einem Tipp eintragen oder pausieren."
          : "Mit einem Tipp eintragen, sonst läuft alles weiter.",
    url: blattUrl(items.map((i) => i.leadId)),
    tag: `abschluss-frage:${day}`,
  };
}

/** Pause des Nachfassens zum Angebot über „Nachfassen pausieren“ im Blatt. */
export const NACHFASSEN_PAUSE_TAGE = 7;
