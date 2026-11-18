// Sparte VOR dem Auslesen bestimmen, ohne KI (Rechtsprüfung K2): Angabe des Vermittlers, Sparte der Unterlage
// (Dateiname/Begleittext, lib/policen) oder Stichworte auf Seite 1 der Textebene einer PDF, nur lokal gelesen.
// Widersprechen sich die Quellen oder ist nichts eindeutig: null (dann wählt der Vermittler, es wird nicht geraten).

import { isAuslesenSparte, type AuslesenSparte } from "@/lib/policen/auslesen/felder";

export type SparteQuelle = "vermittler" | "unterlage" | "text";

/** Sparte der Unterlage (lib/policen/regeln.ts SPARTEN) auf die Sparten des Auslesens; Pflege, Unfall, Tier: null. */
export function ausUnterlagenSparte(s: string | null | undefined): AuslesenSparte | null {
  if (!s) return null;
  if (s === "kranken") return "pkv";
  return isAuslesenSparte(s) ? s : null;
}

// Reihenfolge wie lib/policen/regeln.ts: Tier zuerst (Tierhalterhaftpflicht, Tier-OP), dann Personen-, dann Sach
const STICHWORTE: [RegExp, AuslesenSparte | "andere"][] = [
  [/(tier|hunde?|katzen?|pferde?)\s*-?\s*(op|kranken|halter|haftpflicht)/i, "andere"],
  [/pflegeversicherung|pflegetagegeld|unfallversicherung|zahnzusatz/i, "andere"],
  [/berufsunf(ä|ae)higkeit|\bbuz\b|\bbu-rente\b/i, "bu"],
  [/krankenversicherung|krankheitskosten|krankentagegeld|\bpkv\b/i, "pkv"],
  [/lebensversicherung|risikolebens|rentenversicherung|altersvorsorge|r(ü|ue)rup|riester/i, "leben"],
  [/wohngeb(ä|ae)ude|geb(ä|ae)udeversicherung/i, "wohngebaeude"],
  [/hausrat/i, "hausrat"],
  [/rechtsschutz/i, "rechtsschutz"],
  [/kraftfahrt|kfz-versicherung|kfz-haftpflicht|teilkasko|vollkasko|fahrzeugversicherung/i, "kfz"],
  [/privathaftpflicht|haftpflichtversicherung|privat-haftpflicht/i, "haftpflicht"],
];

/** Alle Sparten, die ein Text nennt (Seite 1). */
export function spartenImText(text: string): (AuslesenSparte | "andere")[] {
  const t = text.replace(/\s+/g, " ");
  return [...new Set(STICHWORTE.filter(([re]) => re.test(t)).map(([, s]) => s))];
}

/**
 * Entscheidung: Vermittler geht vor. Sonst Unterlage und Textebene; widersprechen sie sich, nennt die Seite mehrere
 * Sparten oder eine, die nicht ausgelesen wird: null.
 */
export function sparteVorab(o: { vermittler?: string | null; unterlage?: string | null; text?: string | null }): { sparte: AuslesenSparte; quelle: SparteQuelle } | null {
  if (isAuslesenSparte(o.vermittler)) return { sparte: o.vermittler, quelle: "vermittler" };
  const ausUnterlage = ausUnterlagenSparte(o.unterlage);
  const imText = o.text ? spartenImText(o.text) : [];
  // Unterlage als Pflege/Unfall/Tier eingeordnet: nicht auslesen
  if (o.unterlage && !ausUnterlage && o.unterlage !== "sonstig") return null;
  if (imText.includes("andere")) return null;
  const text = imText.length === 1 ? (imText[0] as AuslesenSparte) : null;
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
