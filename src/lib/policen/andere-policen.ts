// „Andere Policen“ in der Bitte an Kfz-Leads (Ole, 22.11.2026): Klar sagen, dass der Lead AUCH seine anderen Policen
// schicken soll, mit Grund (Komplettcheck: ob er etwas doppelt zahlt), und die Verträge nennen, die er auf die
// Vertragsfrage genannt hat („Haftpflicht bei Allianz“) statt fester Beispiele. Nie das angefragte Produkt (Kfz) als
// „andere“ Police. Nur, wenn der Lead Ja zum Komplettcheck gesagt oder Verträge genannt hat. Rein, ohne Datenbank.

import { a, type Ansprache } from "@/lib/ansprache";
import { gesundheitInText } from "@/lib/policen/regeln";
import { vorvertraegeAus, zuErsetzendeVertraege, type VertragSparte } from "@/lib/whatsapp/vorvertraege";

/** Feste Beispiele, wenn der Lead keine Verträge genannt hat (das angefragte Produkt fällt weg). */
const BEISPIELE: VertragSparte[] = ["Haftpflicht", "Hausrat", "Rechtsschutz", "Kfz"];
const MAX = 3;

/**
 * Genannte Verträge für den Text („Haftpflicht bei Allianz“, „Hausrat“), ohne das angefragte Produkt (Sparte aus der
 * Quelle bzw. Kfz), ohne „Sonstige“ und ohne Gesundheitssparten, wenn Kranken/BU/Leben nicht freigegeben ist.
 */
export function andereVertraege(raw: unknown, o: { source?: string | null; kfz?: boolean; gesundheitAn?: boolean }): string[] {
  const v = vorvertraegeAus(raw);
  if (!v?.liste.length) return [];
  const angefragt = new Set(zuErsetzendeVertraege(v, [o.source, o.kfz ? "Kfz" : null]));
  const out = v.liste
    .filter((x) => !angefragt.has(x) && x.sparte !== "Sonstige" && (o.gesundheitAn || !gesundheitInText(x.sparte)))
    .map((x) => {
      const sparte = x.sparte === "Private Krankenversicherung" ? "private Krankenversicherung" : x.sparte;
      return x.gesellschaft ? `${sparte} bei ${x.gesellschaft}` : sparte;
    });
  return [...new Set(out)].slice(0, MAX);
}

/** Beispiele ohne genannte Verträge, ohne das angefragte Produkt („Haftpflicht oder Hausrat“). */
function festeBeispiele(ausgenommen: readonly string[]): string {
  const frei = BEISPIELE.filter((s) => !ausgenommen.includes(s)).slice(0, 2);
  return frei.join(" oder ");
}

/**
 * Satz zu den anderen Policen, null = nicht nennen (kein Komplettcheck und keine Verträge genannt).
 * verb: „hochladen“ (Formular) bzw. „schicken“ (Bitte ohne Formular, Dateien in den Chat). wer = er/sie bzw. Name.
 */
export function anderePolicenSatz(
  an: Ansprache,
  wer: string,
  o: { vertraege?: readonly string[] | null; komplettcheck?: boolean | null; verb: "hochladen" | "schicken"; ausgenommen?: readonly string[] },
): string | null {
  const vertraege = [...new Set((o.vertraege ?? []).map((v) => v.trim()).filter(Boolean))].slice(0, MAX);
  if (!vertraege.length && o.komplettcheck !== true) return null;
  const beispiel = !vertraege.length
    ? festeBeispiele(o.ausgenommen ?? ["Kfz"])
    : vertraege.length === 1
      ? a(an, `deine ${vertraege[0]}`, `Ihre ${vertraege[0]}`)
      : `${vertraege.slice(0, -1).join(", ")} und ${vertraege.at(-1)}`;
  const aufruf =
    o.verb === "hochladen"
      ? a(an, "*Lade gern auch deine anderen Policen hoch*", "*Laden Sie gern auch Ihre anderen Policen hoch*")
      : a(an, "*Schick gern auch deine anderen Policen*", "*Schicken Sie gern auch Ihre anderen Policen*");
  const wo = o.komplettcheck === true ? " im Komplettcheck" : "";
  // „ob … doppelt“ statt „wo … doppelt“ (keine Unterstellung, Paket 4 K8 in flow/texte.ts)
  const grund = a(an, `Dann sieht ${wer}${wo}, ob du etwas doppelt zahlst.`, `Dann sieht ${wer}${wo}, ob Sie etwas doppelt zahlen.`);
  return `${aufruf}, zum Beispiel ${beispiel}. ${grund}`;
}
