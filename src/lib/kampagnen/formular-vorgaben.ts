// Feste Vorgaben fürs Meta-Sofortformular je Produkt (Ole, 21.11.2026). Die App erkennt Formularfelder am Wortlaut
// (lib/whatsapp/produkt-fragen.ts KFZ_FORMULAR, lib/whatsapp/gespraech.ts istFamilie), darum legt diese Datei die
// Fragen und die vorausgefüllten Meta-Standardfelder fest, statt sie dem Formular-Agenten zu überlassen.
//   Kfz:          „Worum geht es?“ + „Welchen Schutz wünschen Sie?“, dazu Straße, PLZ, Ort, Geburtsdatum
//   Privatschutz: „Für wen soll der Schutz gelten?“ + „Welche Versicherung interessiert Sie am meisten?“, dazu Straße, PLZ, Ort
// Meta liefert die Standardfelder mit den Schlüsseln unten; lib/lead-intake.ts (META_STANDARD) macht daraus
// „Straße“, „Postleitzahl“, „Ort“ und „Geburtsdatum“.

import { istKfzProdukt } from "@/lib/whatsapp/produkt-fragen";
import type { CampaignContext, FormQuestion, LeadFormDraft } from "@/lib/kampagnen/types";

export type FormularArt = "kfz" | "privatschutz";

/** Kfz (lib/whatsapp/produkt-fragen.ts istKfzProdukt) bzw. Privatschutz (Haftpflicht und Hausrat, ohne Tier-Produkte), sonst null. */
export function formularArt(product: string | null | undefined): FormularArt | null {
  const p = product ?? "";
  if (istKfzProdukt(p)) return "kfz";
  if (/privatschutz/i.test(p)) return "privatschutz";
  if (/haftpflicht|hausrat/i.test(p) && !/tier|hund|katze|pferd|gewerbe|betrieb/i.test(p)) return "privatschutz";
  return null;
}

/** Vorausgefüllte Meta-Standardfragen (Graph „leadgen_forms“, Typen ZIP, STREET_ADDRESS, CITY, DOB). */
export type StandardFeld = { type: "STREET_ADDRESS" | "ZIP" | "CITY" | "DOB"; key: "street_address" | "zip_code" | "city" | "date_of_birth" };

const ADRESSE: StandardFeld[] = [
  { type: "STREET_ADDRESS", key: "street_address" },
  { type: "ZIP", key: "zip_code" },
  { type: "CITY", key: "city" },
];

export function standardFelder(product: string | null | undefined): StandardFeld[] {
  const art = formularArt(product);
  if (art === "kfz") return [...ADRESSE, { type: "DOB", key: "date_of_birth" }];
  if (art === "privatschutz") return ADRESSE;
  return [];
}

/** Feste Fragen (Wortlaut wie docs/kfz-leadformular.md), Sie- bzw. Du-Fassung. */
export function festeFragen(product: string | null | undefined, du: boolean): FormQuestion[] {
  const art = formularArt(product);
  if (art === "kfz") {
    return [
      { key: "anlass", label: "Worum geht es?", options: ["Versicherung wechseln (jetziges Auto)", "Neues Auto versichern"] },
      { key: "schutz", label: du ? "Welchen Schutz wünschst du dir?" : "Welchen Schutz wünschen Sie?", options: ["Haftpflicht", "Teilkasko", "Vollkasko", "Weiß ich noch nicht"] },
    ];
  }
  if (art === "privatschutz") {
    // Ole, 21.11.2026: alle Bausteine wie im bestehenden Privatschutz-Formular (Wohngebäude, Unfall, Tierhalter …);
    // die App fragt je gewählter Sparte die passenden Angebotsdaten (lib/preise/rechner-angaben.ts spartenDesLeads)
    return [
      { key: "versicherte_personen", label: "Für wen soll der Schutz gelten?", options: ["Nur für mich", "Mit Partner", "Mit Familie"] },
      {
        key: "versicherungsinteresse",
        label: du ? "Welche Versicherung interessiert dich am meisten?" : "Welche Versicherung interessiert Sie am meisten?",
        options: ["Haftpflicht", "Hausrat", "Rechtsschutz", "Wohngebäude", "Unfall", "Tierhalterhaftpflicht Hund", "Tierhalterhaftpflicht Pferd", "Alles in einem Paket"],
      },
    ];
  }
  return [];
}

/** Fragen des Agenten, die Standardfelder oder die feste Frage doppeln würden. */
const DOPPELT = /postleitzahl|\bplz\b|adresse|stra(ß|ss)e|wohnort|\bort\b|geburt|für wen|wer soll|versichert werden|mitversichert|lebenssituation|familienstand|worum geht|welchen schutz|schutz wünsch|deckung/i;

/**
 * Formular des Agenten mit den festen Fragen: Kfz nur die beiden festen Fragen, Privatschutz die feste Frage zuerst und
 * danach bis zu zwei passende Fragen des Agenten. Intro, Danke-Texte und Name bleiben vom Agenten. Andere Produkte unverändert.
 */
export function mitFestenFragen(form: LeadFormDraft, product: string | null | undefined, du: boolean): LeadFormDraft {
  const feste = festeFragen(product, du);
  if (!feste.length) return form;
  if (formularArt(product) === "kfz" || formularArt(product) === "privatschutz") return { ...form, questions: feste };
  const belegt = new Set([...feste.map((q) => q.key), ...standardFelder(product).map((f) => f.key), "full_name", "phone_number", "email"]);
  const weitere = form.questions.filter((q) => !belegt.has(q.key) && !DOPPELT.test(q.label)).slice(0, 2);
  return { ...form, questions: [...feste, ...weitere] };
}

/** Hinweis für Formular-Agent und Prüfer: welche Fragen fest sind. */
export function vorgabenHinweis(product: string | null | undefined, du: boolean): string | null {
  const feste = festeFragen(product, du);
  if (!feste.length) return null;
  const felder = standardFelder(product).map((f) => ({ STREET_ADDRESS: "Straße", ZIP: "Postleitzahl", CITY: "Ort", DOB: "Geburtsdatum" })[f.type]);
  const art = formularArt(product);
  return `FESTE VORGABEN (nicht ändern, nicht bemängeln): Das Formular enthält immer ${feste.map((q) => `„${q.label}“ (${q.options.join(" · ")})`).join(" und ")}${
    art === "privatschutz" ? "; keine weiteren Fragen" : ""
  }. Vorausgefüllt fragt Meta zusätzlich Name, Telefon, E-Mail, ${felder.join(", ")} ab.`;
}

/** Du-Fassung, wenn der Kunde seine Leads duzt (Customer.leadAddress; ältere Läufe ohne: Anrede der Anzeigen). */
export const leadsDuzen = (c: Pick<CampaignContext, "leadAddress" | "anrede">): boolean => (c.leadAddress ? c.leadAddress === "du" : c.anrede === "Du");

/** mitFestenFragen mit Produkt und Ansprache aus dem Kontext (idempotent, auch beim Anlegen älterer Läufe). */
export function formularMitVorgaben(form: LeadFormDraft, c: Pick<CampaignContext, "product" | "leadAddress" | "anrede">): LeadFormDraft {
  return mitFestenFragen(form, c.product, leadsDuzen(c));
}
