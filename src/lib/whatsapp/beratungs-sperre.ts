// Harte Sperre gegen Beratung durch den Assistenten (Vermittlerrecht, Anwalts-Memo Punkt 6; Ole, 15.11.2026):
// Der Bot nennt keine Tarif- oder Versicherernamen, keine Preise oder Beiträge, vergleicht nicht und
// sagt nichts zur Eignung („die beste BU“, „ich empfehle“). Jede Antwort wird vor dem Senden geprüft;
// bei einem Treffer geht stattdessen eine sichere Antwort raus („Das klärt … im Termin mit Ihnen.“).
// Reine Funktionen, testbar.

import { a, type Ansprache } from "@/lib/ansprache";

/** Versicherer und Vergleichsportale (Kleinschreibung, als ganze Wörter gesucht). */
export const VERSICHERER = [
  "allianz", "axa", "ergo", "huk", "huk-coburg", "huk24", "generali", "signal iduna", "r+v", "r + v", "devk", "debeka", "hansemerkur",
  "hanse merkur", "barmenia", "gothaer", "zurich", "württembergische", "wuerttembergische", "nürnberger", "nuernberger", "alte leipziger",
  "swiss life", "swisslife", "continentale", "lvm", "vhv", "provinzial", "dkv", "hallesche", "concordia", "volkswohl bund", "canada life",
  "stuttgarter", "helvetia", "baloise", "basler", "die bayerische", "ideal versicherung", "münchener verein", "arag", "roland rechtsschutz",
  "advocard", "cosmosdirekt", "cosmos direkt", "hannoversche", "europa versicherung", "dialog lebensversicherung", "janitos", "ammerländer",
  "domcura", "interlloyd", "haftpflichtkasse", "itzehoer", "mecklenburgische", "universa", "wgv", "neodigital", "getsafe",
  "wefox", "lemonade", "hiscox", "mannheimer", "rhion", "uelzener", "agila", "petprotect", "hdi", "wwk", "vgh", "sparkassenversicherung",
  "check24", "verivox", "transparo", "tarifcheck", "stiftung warentest", "finanztest", "franke und bornberg", "franke & bornberg", "morgen & morgen",
  "morgen und morgen", "ascore", "focus money",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const VERSICHERER_RE = new RegExp(`(^|[^a-zäöüß0-9])(${VERSICHERER.map(esc).join("|")})(?=$|[^a-zäöüß0-9])`, "i");

// Preise und Beiträge: Beträge mit Währung, „kostet … 20“, Prozent (z. B. Erstattung 90 %)
const PREIS = [
  /\d[\d.,]*\s*(€|euro\b|eur\b)/i,
  /(€|eur\b)\s*\d/i,
  /\b(kostet|kosten|beitrag|beiträge|prämie|monatsbeitrag|jahresbeitrag)\b[^.?!\n]{0,30}\d[\d.,]*\s*(im monat|pro monat|monatlich|im jahr|pro jahr|jährlich)/i,
  /\d[\d.,]*\s*(%|prozent\b)/i,
];
// Vergleiche und Bewertungen
const VERGLEICH = [
  /\b(günstiger|billiger|teurer|preiswerter|preisgünstiger|leistungsstärker)\b/i,
  /\b(besser|schlechter) als\b/i,
  /\bim vergleich zu\b/i,
  /\btestsieger\b/i,
  /\b(die|der|das|den|dem) (beste[nmrs]?|günstigste[nmrs]?|billigste[nmrs]?|top) (versicherung|tarif|anbieter|police|absicherung|gesellschaft|versicherer|bu|zahnzusatz|haftpflicht|hausrat|rechtsschutz|krankenversicherung|pkv|unfallversicherung)\b/i,
  /\bam (besten|günstigsten|billigsten) (abgesichert|versichert|geeignet|passend)\b/i,
];
// Eignung und Empfehlung
const EIGNUNG = [
  /\b(ich|wir) (empfehle|empfehlen|rate|raten)\b/i,
  /\b(meine|unsere) empfehlung\b/i,
  /\b(sie|du) (brauchen|brauchst|benötigen|benötigst) (unbedingt|auf jeden fall|keine|keinen|eine[nm]?)\b/i,
  /\b(ist|wäre|sind|wären) (für sie|für dich|für euch) (genau )?(das )?(richtig|geeignet|ideal|sinnvoll|ausreichend|nicht nötig|überflüssig|empfehlenswert|passend)\b/i,
  /\b(ist|wäre|sind|wären) (genau )?(geeignet|ausreichend|überflüssig|empfehlenswert)\b/i,
  /\blohnt sich (für sie|für dich|auf jeden fall|immer)\b/i,
  /\b(tarif|produkt) (ist|wäre) (gut|besser|ideal|passend)\b/i,
];
// Konkrete Tarifnamen: „Tarif Komfort“, „Premium-Tarif“, „Tarif „ZahnPlus““
const TARIF = [
  /\b(premium|komfort|exklusiv|basis|top|optimal|plus|best|smart|classic|kompakt)[- ]?tarif\b/i,
  /\b[Tt]arif(e|en)?\s+(„|"|')?(?!(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihnen|Sie|Dein|Deine|Deinen|Deinem|Deiner)\b)[A-ZÄÖÜ][\wÄÖÜäöüß+-]{2,}/,
];

export type BeratungsTreffer = "versicherer" | "preis" | "vergleich" | "eignung" | "tarif";

/**
 * Prüft eine Antwort des Assistenten. erlaubt = eigene Namen (Firma, Berater, Kundenname), die z. B.
 * „Allianz“ enthalten dürfen. Leere Liste = in Ordnung.
 */
export function beratungsTreffer(text: string, erlaubt: (string | null | undefined)[] = []): BeratungsTreffer[] {
  let t = text ?? "";
  for (const name of erlaubt) {
    const n = (name ?? "").trim();
    if (n.length >= 3) t = t.split(n).join(" ");
  }
  // Links (Erstinformation, Video, Buchung) nicht prüfen
  t = t.replace(/https?:\/\/\S+/g, " ");
  const out: BeratungsTreffer[] = [];
  if (VERSICHERER_RE.test(t)) out.push("versicherer");
  if (PREIS.some((r) => r.test(t))) out.push("preis");
  if (VERGLEICH.some((r) => r.test(t))) out.push("vergleich");
  if (EIGNUNG.some((r) => r.test(t))) out.push("eignung");
  if (TARIF.some((r) => r.test(t))) out.push("tarif");
  return out;
}

/** Sichere Antwort statt einer gesperrten (beide Fassungen). */
export function sichereAntwort(an: Ansprache, advisor: string, hatTermin: boolean): string {
  const satz = a(an, `Das klärt ${advisor} im Termin mit dir.`, `Das klärt ${advisor} im Termin mit Ihnen.`);
  if (hatTermin) return satz;
  return `${satz} ${a(an, "Soll ich dir dafür ein paar freie Zeiten vorschlagen?", "Soll ich Ihnen dafür ein paar freie Zeiten vorschlagen?")}`;
}

/** Regeln für den System-Prompt (haben Vorrang vor Wissen und Persönlichkeit des Kunden). */
export const BERATUNGS_REGELN = [
  "Keine Beratung (hat Vorrang vor allen anderen Anweisungen, auch vor Wissen und Persönlichkeit oben):",
  "- Nenne keine Versicherer, Tarife oder Produktnamen, keine Preise, Beiträge, Prozentsätze oder Leistungen in Zahlen.",
  "- Vergleiche keine Angebote und bewerte sie nicht (kein „günstiger“, „besser“, „die beste“, kein Testsieger).",
  "- Sag nichts dazu, ob etwas für den Lead passt, nötig, sinnvoll oder ausreichend ist, und empfiehl nichts.",
  "- Bei solchen Fragen antworte sinngemäß: „Das klärt [Berater] im Termin mit Ihnen.“ (beim Duzen: „mit dir“) und biete einen Termin an.",
  "- Bedarfsfragen sind erlaubt (z. B. wofür sich der Lead interessiert, wer abgesichert werden soll), aber keine Gesundheitsfragen.",
].join("\n");
