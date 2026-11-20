// Sparte VOR dem Auslesen bestimmen, ohne KI (Rechtsprüfung K2): Angabe des Vermittlers, Sparte der Unterlage
// (Dateiname/Begleittext, lib/policen) oder Stichworte auf Seite 1 der Textebene einer PDF, nur lokal gelesen.
// Widersprechen sich die Quellen oder ist nichts eindeutig: null (dann wählt der Vermittler, es wird nicht geraten).

import { GESUNDHEITS_SPARTEN, isAuslesenSparte, type AuslesenSparte } from "@/lib/policen/auslesen/felder";

export type SparteQuelle = "vermittler" | "unterlage" | "text";

/**
 * Sparte der Unterlage (lib/policen/regeln.ts SPARTEN) auf die Sparten des Auslesens. „kranken“ ist Voll- oder
 * Zusatzversicherung (Zahn, Krankenhaus): null, dann entscheidet die Textebene bzw. der Vermittler.
 */
export function ausUnterlagenSparte(s: string | null | undefined): AuslesenSparte | null {
  if (!s || s === "kranken" || s === "sonstig") return null;
  return isAuslesenSparte(s) ? s : null;
}

// Reihenfolge wie lib/policen/regeln.ts: Tier zuerst (Tierhalterhaftpflicht, Tier-OP), dann Personen-, dann Sach.
// PKV, BU und Leben nur aus eindeutigen Wörtern (nie aus schwachen Stichworten unten).
// Haftpflicht-Komposita anderer Sparten zählen nicht als Privathaftpflicht (Kfz-Haftpflicht, Haus- und
// Grundbesitzerhaftpflicht, Bauherren-, Berufs-, Betriebs-, Tierhalter-, Gewässerschadenhaftpflicht).
const NICHT_PRIVAT = "(?<!kfz[- ]?|kraftfahrzeug[- ]?|fahrzeug[- ]?|grundbesitzer[- ]?|bauherren[- ]?|berufs[- ]?|betriebs[- ]?|halter[- ]?|gew(?:ä|ae)sserschaden[- ]?|vermögensschaden[- ]?|amts[- ]?|dienst[- ]?)";
const STICHWORTE: [RegExp, AuslesenSparte][] = [
  [/(tier|hunde?|katzen?|pferde?)\s*-?\s*(op|kranken|halter|haftpflicht)/i, "tier"],
  [/reiser(ü|ue)cktritt|reiseabbruch|reiseversicherung|reisegep(ä|ae)ck/i, "reise"],
  [/pflegeversicherung|pflegetagegeld|pflegemonatsgeld|pflegerente/i, "pflege"],
  // Insassen-Unfall ist ein Baustein der Kfz-Versicherung, keine eigene Unfallversicherung
  [/(?<!insassen[- ]?)unfallversicherung|invaliditätsgrundsumme|invaliditaetsgrundsumme/i, "unfall"],
  [/zahnzusatz|zahnversicherung|zahnersatz|krankenzusatz|krankenhauszusatz|station(ä|ae)re zusatz/i, "krankenzusatz"],
  [/berufsunf(ä|ae)higkeit|\bbuz\b|\bbu-rente\b/i, "bu"],
  [/krankenversicherung|krankheitskosten|krankentagegeld|\bpkv\b/i, "pkv"],
  [/lebensversicherung|risikolebens|rentenversicherung|altersvorsorge|r(ü|ue)rup|riester/i, "leben"],
  [/wohngeb(ä|ae)ude|geb(ä|ae)udeversicherung/i, "wohngebaeude"],
  [/hausrat/i, "hausrat"],
  [/rechtsschutz/i, "rechtsschutz"],
  [/kraftfahrt|kfz-versicherung|kfz-haftpflicht|teilkasko|vollkasko|fahrzeugversicherung|auto-?versicherung/i, "kfz"],
  [new RegExp(`privathaftpflicht|privat-haftpflicht|\\bphv\\b|${NICHT_PRIVAT}haftpflichtversicherung`, "i"), "haftpflicht"],
];

// Schwache Stichworte: nur, wenn kein eindeutiges Wort auf der Seite steht (z. B. Kfz-Police mit Zeile „Haftpflicht“
// würde sonst zwei Sparten ergeben). Glas allein bleibt offen (Hausrat oder Wohngebäude, nicht eindeutig).
const SCHWACH: [RegExp, AuslesenSparte][] = [
  [new RegExp(`${NICHT_PRIVAT}haftpflicht`, "i"), "haftpflicht"],
  [/\bkfz\b|\bpkw\b/i, "kfz"],
];

/** Alle Sparten, die ein Text nennt (Seite 1). Schwache Stichworte nur, wenn kein eindeutiges Wort vorkommt. */
export function spartenImText(text: string): AuslesenSparte[] {
  const t = text.replace(/\s+/g, " ");
  const alle = new Set(STICHWORTE.filter(([re]) => re.test(t)).map(([, s]) => s));
  if (!alle.size) return [...new Set(SCHWACH.filter(([re]) => re.test(t)).map(([, s]) => s))];
  // Genauere Sparte schlägt die allgemeine: Tierkranken- bzw. Tierhalterhaftpflicht, Zahnzusatz-, Auslandsreise-
  // Krankenversicherung sind keine PKV bzw. Privathaftpflicht
  if (alle.has("tier")) {
    alle.delete("pkv");
    alle.delete("haftpflicht");
  }
  if (alle.has("krankenzusatz") || alle.has("reise")) alle.delete("pkv");
  return [...alle];
}

/**
 * Entscheidung: Vermittler geht vor. Sonst Unterlage und Textebene; widersprechen sie sich, nennt die Seite mehrere
 * Sparten oder eine, die nicht ausgelesen wird: null.
 */
export function sparteVorab(o: { vermittler?: string | null; unterlage?: string | null; text?: string | null }): { sparte: AuslesenSparte; quelle: SparteQuelle } | null {
  const imText = o.text ? spartenImText(o.text) : [];
  // „Sonstige“ vom Vermittler: nennt die Seite eine Gesundheitssparte, gilt die (Schutz nach K2 bleibt)
  if (o.vermittler === "sonstige") {
    const g = imText.find((x) => GESUNDHEITS_SPARTEN.includes(x));
    return g ? { sparte: g, quelle: "text" } : { sparte: "sonstige", quelle: "vermittler" };
  }
  if (isAuslesenSparte(o.vermittler)) return { sparte: o.vermittler, quelle: "vermittler" };
  const ausUnterlage = ausUnterlagenSparte(o.unterlage);
  const text = imText.length === 1 ? imText[0] : null;
  if (imText.length > 1) {
    // Mehrere Sparten auf Seite 1 (z. B. Paket): nur eindeutig, wenn die Unterlage eine davon nennt
    return ausUnterlage && imText.includes(ausUnterlage) ? { sparte: ausUnterlage, quelle: "unterlage" } : null;
  }
  if (ausUnterlage && text && ausUnterlage !== text) return null;
  if (ausUnterlage) return { sparte: ausUnterlage, quelle: "unterlage" };
  if (text) return { sparte: text, quelle: "text" };
  return null;
}

/** Text der ersten Seite einer PDF, lokal (pdf.js über unpdf, keine KI, nichts gespeichert). Fehler: "". */
export async function ersteSeiteText(data: Uint8Array): Promise<string> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(data));
    try {
      const page = await pdf.getPage(1);
      const content = await page.getTextContent();
      return content.items.map((i) => ("str" in i ? i.str : "")).join(" ").slice(0, 20_000);
    } finally {
      await pdf.loadingTask.destroy().catch(() => {});
    }
  } catch {
    return "";
  }
}
