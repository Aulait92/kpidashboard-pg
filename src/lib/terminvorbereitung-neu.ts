// Neue Terminvorbereitung (Ole, 15.11.2026, Entwurf docs/ux/2026-11-15-aufraeumen-und-terminvorbereitung.md Teil 2):
// Schalter und reine Funktionen für Kopf, „Das will der Kunde“ und „Noch klären im Termin“.
//
// Schalter: vorerst nur Admin-Vorschau und Oles Testkunde „Ole Agentur“ (plus TERMINVORBEREITUNG_NEU_KUNDEN, durch
// Komma getrennte Kunden-IDs). Für alle an: TERMINVORBEREITUNG_NEU_FUER_ALLE = true (dann erscheint auch die Neuigkeit).

import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { abschnitte, offenePunkte, spartenAus, tierWunsch, type VorbereitungDaten } from "@/lib/termin-vorbereitung";
import { sparteAusText, spartenAusFormular, type Katalog } from "@/lib/tarifkatalog";

/** Neue Terminvorbereitung für alle Kunden? (Ole, 15.11.2026: erst Admin und Testkunde) */
export const TERMINVORBEREITUNG_NEU_FUER_ALLE = true;

/** Oles Testkunde „Ole Agentur“ */
const TESTKUNDEN = ["cmwhmxr7w03g436lb34w6xtsk"];

/** Neuigkeit zur neuen Terminvorbereitung: erscheint erst, wenn der Schalter für alle an ist (lib/neuigkeiten.ts). */
export const NEUIGKEIT_TERMINVORBEREITUNG = "upd_2611_terminvorbereitung_katalog";

export function neueTerminvorbereitung(ctx: { customerId: string; preview?: boolean }, env: string | undefined = process.env.TERMINVORBEREITUNG_NEU_KUNDEN): boolean {
  if (TERMINVORBEREITUNG_NEU_FUER_ALLE || ctx.preview) return true;
  const extra = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...TESTKUNDEN, ...extra].includes(ctx.customerId);
}

/** Neuigkeit ausblenden, solange die neue Seite nicht für alle an ist. */
export const neuigkeitVersteckt = (id: string) => id === NEUIGKEIT_TERMINVORBEREITUNG && !TERMINVORBEREITUNG_NEU_FUER_ALLE;

const formWert = (d: VorbereitungDaten, re: RegExp) => d.formular.find((f) => re.test(f.label))?.value?.trim() || null;
const angaben = (d: VorbereitungDaten) => Object.fromEntries(qualificationPoints(d.angaben).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;

/** Tierart für die Tierkranken-Sparten: Pferd, Hund, sonst Katze. */
const tierartAus = (t: string): "pferd" | "hund" | "katze" => (/pferd/i.test(t) ? "pferd" : /hund/i.test(t) ? "hund" : "katze");

/** Gefragte Sparten (Schlüssel im Tarifkatalog) aus Produkt, Formular und Angaben des Assistenten. */
export function spartenFuerTermin(d: VorbereitungDaten, k?: Pick<Katalog, "sparten"> | null): string[] {
  const q = angaben(d);
  const kat = produktCheckliste(d.lead.produkt)?.key ?? null;
  const tierText = [formWert(d, /tierart/i), q.tier, d.lead.produkt].filter(Boolean).join(" ");
  const tierArt = tierartAus(tierText);
  const op = /\bop\b|op-|operation/i.test([q.tarifwunsch, d.lead.produkt].filter(Boolean).join(" ")) && !/voll|kranken(voll|schutz)/i.test(q.tarifwunsch ?? "");
  if (kat === "tier") return [`${tierArt}-${op ? "op" : "kranken"}`];
  if (kat === "privatschutz") {
    const interesse = [formWert(d, /versicherungsinteresse|interesse/i), q.interesse].filter(Boolean).join(" ");
    const sp = spartenAus(interesse);
    // Wort aus dem Leadformular je Sparte (schema.json formularMatch), ergänzend zu den festen Mustern
    const ausKatalog = k ? spartenAusFormular(k, interesse, "privatschutz") : [];
    const out: string[] = [];
    for (const s of sp.length || ausKatalog.length ? sp : (["haftpflicht", "hausrat"] as const)) {
      if (s !== "tier") {
        out.push(s);
        continue;
      }
      const tw = tierWunsch(q.interesse ?? null);
      const t = [interesse, q.tier].filter(Boolean).join(" ");
      if (tw.kranken) out.push(`${tierartAus(t)}-${op ? "op" : "kranken"}`);
      if (tw.halter) out.push(/pferd/i.test(t) ? "tierhalter-pferd" : "tierhalter-hund");
    }
    return [...new Set([...out, ...ausKatalog])];
  }
  const s = sparteAusText(d.lead.produkt);
  return s ? [s] : [];
}

/** „Das will der Kunde“: höchstens 5 Punkte aus Formular und Chat, dazu die Quelle in einer Zeile. */
export function kundeWill(d: VorbereitungDaten): { punkte: string[]; quelle: string | null } {
  const q = angaben(d);
  const ausFormular = new Set<string>();
  const p: string[] = [];
  const dazu = (x: string | null | undefined, formular = false) => {
    const t = x?.replace(/\s+/g, " ").trim();
    if (!t || p.some((y) => y.toLowerCase() === t.toLowerCase())) return;
    p.push(t);
    if (formular) ausFormular.add(t);
  };
  const interesseF = formWert(d, /versicherungsinteresse|interesse/i);
  dazu(q.interesse ?? interesseF ?? d.lead.produkt, !q.interesse && !!interesseF);
  const tier = [formWert(d, /tierart/i), formWert(d, /name des tieres|tiername/i), formWert(d, /rasse/i)].filter(Boolean).join(", ");
  dazu(q.tier ?? (tier || null), !q.tier && !!tier);
  const lebenF = formWert(d, /lebenssituation/i);
  dazu(q.lebenssituation ?? lebenF, !q.lebenssituation && !!lebenF);
  if (q.versichern) dazu(`Versichert werden soll: ${q.versichern}`);
  if (q.vorhanden) dazu(`Bisher: ${q.vorhanden}`);
  if (q.anlass) dazu(`Anlass: ${q.anlass}`);
  if (q.tarifwunsch) dazu(`Wunsch: ${q.tarifwunsch}`);
  if (q.einwaende) dazu(`Bedenken: ${q.einwaende}`);
  if (p.length < 3 && d.zusammenfassung) for (const satz of d.zusammenfassung.split(/(?<=[.!?])\s+/).slice(0, 3 - p.length)) dazu(satz);
  const punkte = p.slice(0, 5);
  const chat = punkte.some((x) => !ausFormular.has(x)) && (qualificationPoints(d.angaben).length > 0 || !!d.zusammenfassung);
  const formular = punkte.some((x) => ausFormular.has(x)) || d.formular.length > 0;
  const quelle = chat && formular ? "Aus Formular und WhatsApp-Chat" : chat ? "Aus dem WhatsApp-Chat" : formular ? "Aus dem Formular" : null;
  return { punkte, quelle };
}

/** Offene Angabe (Bezeichnung in abschnitte) → gemeinsamer Punkt; gleiche Frage aus mehreren Rechnern nur einmal. */
const PUNKT: [RegExp, string][] = [
  [/^(wer versichert werden soll|zu versichernde personen)$/i, "versichern"],
  [/^geburtsdatum/i, "geburt"],
  [/^(adresse \/ plz|postleitzahl)$/i, "plz"],
  [/^(bestehende verträge|vorversicherung|bestehende tierversicherung)/i, "vorhanden"],
  [/schäden|rechtsstreit/i, "vorschaeden"],
  [/öffentlicher dienst|beruf und riskante/i, "beruf"],
  [/^wohnfläche/i, "wohnflaeche"],
  [/^lebensbereiche$/i, "bereiche"],
  [/^gebäude/i, "gebaeude"],
];
const TEXT: Record<string, string> = {
  versichern: "Wer wird mitversichert?",
  geburt: "Geburtsdaten",
  plz: "Adresse und PLZ",
  vorhanden: "Bestehende Verträge",
  vorschaeden: "Schäden in den letzten 5 Jahren",
  beruf: "Beruf: öffentlicher Dienst, selbstständig?",
  wohnflaeche: "Wohnfläche, Haus oder Wohnung",
  bereiche: "Lebensbereiche: Privat, Beruf, Verkehr, Wohnen",
  gebaeude: "Gebäude: Fläche, Baujahr, Bauweise, Technik",
};

/**
 * „Noch klären im Termin“: offene Angaben zusammengeführt und ohne Doppelungen (Wer und Geburtsdaten als ein Punkt).
 * Alle Punkte; die Seite zeigt höchstens 5, der Rest steht unter „Mehr zum Kunden“.
 */
export function klaerenPunkte(d: VorbereitungDaten): string[] {
  const offen = offenePunkte(abschnitte(d));
  const keys: string[] = [];
  for (const label of offen) {
    const k = PUNKT.find(([re]) => re.test(label))?.[1] ?? `label:${label}`;
    if (!keys.includes(k)) keys.push(k);
  }
  const out: string[] = [];
  for (const k of keys) {
    if (k === "geburt" && keys.includes("versichern")) continue;
    if (k === "versichern" && keys.includes("geburt")) out.push(`${TEXT.versichern} ${TEXT.geburt}`);
    else out.push(TEXT[k] ?? k.replace(/^label:/, ""));
  }
  return out;
}

export const KLAEREN_MAX = 5;
export const KUNDE_WILL_MAX = 5;
