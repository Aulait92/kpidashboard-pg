// Garantien auf der Empfehlungsseite /empfehlen/[code] passend zum Empfehler (Usability-Check 18.11.2026): Die Garantien
// gelten laut AGB für die Katzenversicherung (TKV) und im Angebot genannte Produkte (lib/garantien.ts isGuaranteeProduct).
// Arbeitet der Empfehler mit einem solchen Produkt, nennt die Seite es; arbeitet er mit anderen Produkten, sagt sie
// ausdrücklich, dass die Garantien dafür nur mit Nennung im Angebot gelten. Makler sehen die Vertrags-Garantie statt der
// Break-even-Garantie (wie im Angebot). Rein, ohne Datenbank.

import { isGuaranteeProduct } from "@/lib/garantien";
import { GARANTIE_FRISTEN, VERTRAGS_GARANTIE_MIN_VERTRAEGE, type RechnerConfig } from "@/lib/rechner";

export type EmpfehlerProdukt = { person: string; makler: boolean; produkte: string[] };
export type GarantieKarte = { title: string; text: string };

const VERTRAGS_GARANTIE: GarantieKarte = {
  title: "Vertrags-Garantie (für Makler)",
  text: `Haben Sie nach ${GARANTIE_FRISTEN.vertragTage} aktiven Tagen weniger als ${VERTRAGS_GARANTIE_MIN_VERTRAEGE} Verträge abgeschlossen, betreuen wir Sie ohne Gebühr für Betreuung und Software weiter, auf Wunsch mit einem anderen Produkt, bis Sie sie haben (längstens ${GARANTIE_FRISTEN.maxFreiMonate} Monate). Voraussetzung: mindestens 20 € Budget pro Tag, mindestens 80 % der gebuchten Termine wahrgenommen und Ergebnisse in der App eingetragen.`,
};

const liste = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} und ${xs[xs.length - 1]}`);

export function garantienFuerEmpfehlung(g: RechnerConfig["guarantees"], e: EmpfehlerProdukt): { satz: string; karten: GarantieKarte[] } {
  const karten: GarantieKarte[] = [];
  if (g.leads.enabled) karten.push({ title: g.leads.title, text: g.leads.text });
  if (g.breakEven.enabled) karten.push(e.makler ? VERTRAGS_GARANTIE : { title: g.breakEven.title, text: g.breakEven.text });
  if (g.productSwap.enabled) karten.push({ title: g.productSwap.title, text: g.productSwap.text });
  const produkte = [...new Set(e.produkte.map((p) => p.trim()).filter(Boolean))].slice(0, 4);
  const mit = produkte.filter(isGuaranteeProduct);
  const ohne = produkte.filter((p) => !isGuaranteeProduct(p));
  const satz = mit.length
    ? `Gelten für ${liste(mit)}, ${mit.length > 1 ? "die Produkte, mit denen" : "das Produkt, mit dem"} auch ${e.person} arbeitet. Für weitere Produkte nur, wenn sie im Angebot ausdrücklich genannt sind.`
    : ohne.length
      ? `Gelten für die Katzenversicherung (TKV-Katze). Für ${liste(ohne)} (${ohne.length > 1 ? "die Produkte" : "das Produkt"} von ${e.person}) nur, wenn ${ohne.length > 1 ? "sie" : "es"} im Angebot ausdrücklich genannt ${ohne.length > 1 ? "sind" : "ist"}.`
      : "Gelten für die Katzenversicherung (TKV-Katze). Für weitere Produkte nur, wenn sie im Angebot ausdrücklich genannt sind.";
  return { satz, karten };
}
