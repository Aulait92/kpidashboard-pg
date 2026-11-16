// Erstanschreiben je Produkt (Ole, 15.11.2026): keine Erlaubnisfrage, kein „Später“, sondern direkt eine erste,
// leichte Frage mit Knöpfen. Welche Vorlage ein Lead bekommt, ergibt sich aus dem Produkt im Leadformular
// (Lead.source). Der Assistent (bot.ts) nimmt die Antwort per Knopf als Antwort auf Frage 1 und stellt dann Frage 2,
// danach bietet er Termine an. Rein, ohne Datenbank.

import { displayProduct } from "@/lib/products";
import type { NoticePurpose } from "@/lib/whatsapp/templates";

export type OutreachProdukt = {
  purpose: NoticePurpose;
  /** Wert für {{Produkt}}, passend zum Text („zur Tierkrankenversicherung“, „zum Thema Privatschutz“). */
  produkt: string;
  /** Frage 1 (steht in der Vorlage) und ihre Knöpfe. */
  frage1: string;
  knoepfe: string[];
  /** Frage 2, die der Assistent nach der Antwort stellt (neutral, ohne Gesundheitsfragen, ohne Tarife). */
  frage2: string;
  /** Feld in record_qualification für die Antwort auf Frage 1. */
  feld1: string;
};

const TIER = /\btkv\b|tierkranken|tier-?op|katze|hund|pferd/i;
const ZAHN = /zahn/i;
const PKV = /\bpkv\b|private?n? kranken|krankenvoll|wechsel|tarifoptim|neugesch/i;
const PRIVATSCHUTZ = /privatschutz|haftpflicht|hausrat|rechtsschutz|wohngeb(ä|a)ude/i;

/** Welches Erstanschreiben passt zum Produkt? null = allgemeine Fassung „outreach“ (Telefonat: Heute/Morgen/schriftlich). */
export function outreachProdukt(source: string | null | undefined): OutreachProdukt | null {
  const s = (source ?? "").trim();
  if (!s) return null;
  // Tierhalter-Haftpflicht und Futter sind keine Tierkrankenversicherung
  if (TIER.test(s) && !/privatschutz|halter|futter/i.test(s)) {
    const produkt = /katze/i.test(s) ? "Katzenversicherung" : /hund/i.test(s) ? "Hundekrankenversicherung" : /pferd/i.test(s) ? "Pferdeversicherung" : "Tierkrankenversicherung";
    return {
      purpose: "outreach_tkv",
      produkt,
      frage1: "Für welches Tier suchen Sie den Schutz?",
      knoepfe: ["Hund", "Katze"],
      frage2: "Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung? (angaben.tarifwunsch, neutral fragen, nichts empfehlen)",
      feld1: "tier",
    };
  }
  if (ZAHN.test(s)) {
    // Art. 9 DSGVO (Rechtsprüfung Nachtrag 16.11.2026): gefragt wird nach dem gewünschten Tarifbaustein, nie nach dem
    // eigenen Bedarf. Die bei Meta freigegebene v4 trägt noch „Zahnersatz/Prophylaxe/Beides“; beide Fassungen werden
    // mit neutralZahnAngaben auf dieselben neutralen Werte gebracht.
    return {
      purpose: "outreach_zahn",
      produkt: "Zahnzusatzversicherung",
      frage1: "Welcher Tarifbaustein ist Ihnen am wichtigsten?",
      knoepfe: ["Starker Zahnersatz", "Mit Zahnreinigung", "Beides vergleichen"],
      frage2:
        "Sind Sie gesetzlich krankenversichert? (angaben.vorhanden; keine Fragen zu Befunden, Behandlungen, Beschwerden oder dem Gebiss, auch nicht, ob jemand Zahnersatz braucht)",
      feld1: "tarifwunsch",
    };
  }
  if (PKV.test(s) && !/kinderwunsch/i.test(s)) {
    return {
      purpose: "outreach_pkv",
      produkt: "privaten Krankenversicherung",
      frage1: "Wie sind Sie aktuell beruflich aufgestellt?",
      knoepfe: ["Angestellt", "Selbstständig", "Beamter"],
      frage2: "Sind Sie aktuell gesetzlich oder schon privat krankenversichert? (angaben.vorhanden)",
      feld1: "beruf",
    };
  }
  if (PRIVATSCHUTZ.test(s) && !/tier|hund|katze|pferd/i.test(s)) {
    return {
      purpose: "outreach_privatschutz",
      produkt: /privatschutz/i.test(s) ? "Privatschutz" : displayProduct(s),
      frage1: "Worum geht es Ihnen vor allem?",
      knoepfe: ["Haftpflicht", "Hausrat", "Mehreres"],
      frage2: "Wer soll versichert werden: nur Sie, mit Partner oder die ganze Familie? (angaben.versichern; bei „Mehreres“ vorher kurz, welche Bereiche)",
      feld1: "interesse",
    };
  }
  return null;
}

/** Allgemeines Erstanschreiben: Frage 1 und Knöpfe (siehe TEMPLATE_BODY.outreach). */
export const OUTREACH_ALLGEMEIN = {
  frage1: "Wann erreicht der Berater Sie am besten für ein kurzes Telefonat?",
  knoepfe: ["Heute", "Morgen", "Lieber schriftlich"],
} as const;

/**
 * Prompt-Block für den Assistenten: Die erste Frage stand schon im Erstanschreiben, eine Antwort per Knopf (oder
 * frei) ist die Antwort auf Frage 1. Danach Frage 2, dann Termine.
 */
export function ersteFrageRegel(source: string | null | undefined, advisorName: string): string {
  const p = outreachProdukt(source);
  if (!p) {
    return [
      `Erste Frage (stand schon in unserer ersten WhatsApp): „Wann erreicht ${advisorName} Sie am besten für ein kurzes Telefonat?“ mit den Knöpfen ${OUTREACH_ALLGEMEIN.knoepfe.map((k) => `„${k}“`).join(", ")}.`,
      "- Antwortet der Lead „Heute“ oder „Morgen“ (Knopf oder frei): halte das als Wunsch fest (angaben.wunsch), hole mit get_available_slots freie Zeiten und biete zwei Zeiten an diesem Tag an (gibt es keine, die nächsten). Frag vor der Buchung, ob Telefon oder Video.",
      "- „Lieber schriftlich“: kein Problem, mach im Chat weiter: frag in einem Satz, worum es genau geht, und biete erst danach einen Termin an.",
    ].join("\n");
  }
  const zahn =
    p.purpose === "outreach_zahn"
      ? [
          `- Ältere Fassung derselben Frage hatte die Knöpfe ${ZAHN_KNOEPFE_V4.map((k) => `„${k}“`).join(", ")}: das ist die gleiche Antwort auf Frage 1 (gewünschter Tarifbaustein), kein Befund.`,
          "- Frag nie, ob der Lead selbst Zahnersatz, eine Behandlung oder eine Zahnreinigung braucht, und nie nach Befunden oder Beschwerden. Erzählt er von sich aus etwas zu seinen Zähnen, halte es nicht fest und sag: „Das klären wir am besten im Gespräch.“",
        ]
      : [];
  return [
    `Erste Frage (stand schon in unserer ersten WhatsApp): „${p.frage1}“ mit den Knöpfen ${p.knoepfe.map((k) => `„${k}“`).join(", ")}.`,
    ...zahn,
    `- Die nächste Nachricht des Leads (per Knopf oder frei, z. B. „${p.knoepfe[0]}“) ist die Antwort auf diese Frage 1: nicht erneut fragen, sondern mit record_qualification festhalten (angaben.${p.feld1}) und kurz bestätigen.`,
    `- Dann Frage 2: ${p.frage2}`,
    "- Nach Frage 2 setze qualifiziert=true und biete direkt zwei konkrete Termine an (get_available_slots). Weitere Angaben fürs Angebot fragst du erst nach der Buchung ab.",
  ].join("\n");
}

/** Knöpfe der bei Meta noch freigegebenen v4 (Zahnzusatz), Antworten darauf gelten als dieselbe Frage 1. */
export const ZAHN_KNOEPFE_V4 = ["Zahnersatz", "Prophylaxe", "Beides"] as const;

const ZAHN_NEUTRAL: Record<string, string> = {
  zahnersatz: "Tarif mit starkem Zahnersatz-Baustein",
  "starker zahnersatz": "Tarif mit starkem Zahnersatz-Baustein",
  prophylaxe: "Tarif mit Zahnreinigung",
  "mit zahnreinigung": "Tarif mit Zahnreinigung",
  beides: "Beides vergleichen",
  "beides vergleichen": "Beides vergleichen",
};

/**
 * Antwort auf Frage 1 bei Zahnzusatz neutral als Produktinteresse speichern (Art. 9 DSGVO): „Zahnersatz“ wird zu
 * „Tarif mit starkem Zahnersatz-Baustein“ usw. Gilt für alle Felder, in denen die KI die Knopfantwort ablegt.
 * Andere Angaben bleiben unverändert (rein, testbar).
 */
export function neutralZahnAngaben(angaben: unknown): unknown {
  if (!angaben || typeof angaben !== "object" || Array.isArray(angaben)) return angaben;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(angaben as Record<string, unknown>)) {
    const n = typeof v === "string" ? ZAHN_NEUTRAL[v.trim().toLowerCase().replace(/[.!]+$/, "")] : undefined;
    out[n && (k === "interesse" || k === "bedarf") ? "tarifwunsch" : k] = n ?? v;
  }
  return out;
}

/** Ist der Lead ein Zahnzusatz-Lead (Erstanschreiben outreach_zahn)? */
export function istZahnLead(source: string | null | undefined): boolean {
  return outreachProdukt(source)?.purpose === "outreach_zahn";
}
