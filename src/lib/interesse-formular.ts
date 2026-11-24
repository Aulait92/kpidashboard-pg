// Versicherungsinteresse aus dem Leadformular erkennen (Ole, 24.11.2026): Das Meta-Sofortformular beschriftet das
// Interesse-Feld je nach Fassung unterschiedlich – „Versicherungsinteresse“, „Welche Versicherungen interessieren
// Sie?“ (feste Frage ab 21.11.2026, lib/kampagnen/formular-vorgaben.ts) oder, im älteren Lohmann-Formular, „Welche
// Versicherung interessiert Sie am meisten?“ bzw. „An welchen Versicherungen bist Du interessiert?“.
//
// Ein zu enges Muster (/versicherungsinteresse/i) übersieht die neueren Beschriftungen. Dann hält der WhatsApp-Assistent
// jeden Privatschutz-Lead für „Haftpflicht und Hausrat“ und fragt nach der falschen Sparte (Produktionsfehler
// 24.11.2026: Ein Lead mit Interesse Rechtsschutz wurde nach Hausrat und Haftpflicht gefragt). Dieselbe Erkennung nutzt
// die Angebots-Sparten (lib/preise/rechner-angaben.ts spartenDesLeads), damit Assistent und Seitenleiste dasselbe
// Interesse sehen. Eine Stelle für alle, damit es nicht wieder auseinanderläuft.

/** Beschriftungen des Interesse-Felds im Leadformular (alle Fassungen). */
export const INTERESSE_LABEL_RE =
  /versicherungsinteresse|^interesse\b|sparte|welche versicherung|an welchen versicherungen|interessiert (sie|dich)/i;

type Feld = { label?: string | null; value?: string | null };

/** Wert des Interesse-Felds aus dem Leadformular (getrimmt), sonst null. */
export function interesseAusFormular(formular: readonly Feld[] | null | undefined): string | null {
  const hit = (formular ?? []).find((f) => typeof f?.label === "string" && INTERESSE_LABEL_RE.test(f.label.trim()) && (f.value ?? "").trim());
  return hit ? (hit.value ?? "").trim() : null;
}
