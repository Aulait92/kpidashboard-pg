// „Bestehende Verträge“ laut Lead (Komplettcheck im WhatsApp-Assistenten, Ole 17.11.2026, lib/whatsapp/vorvertraege.ts):
// eine Zeile je Vertrag, darunter neutral „noch nicht genannt: …“ gegenüber den gängigen Sparten der Lebenssituation.
// Gleiche Darstellung in der Terminvorbereitung (Karte „Das will der Kunde“) und im Kontakt.

import { nochNichtGenannt, vertragZeile, type Vorvertraege } from "@/lib/whatsapp/vorvertraege";

// ausgelesen (Policen auslesen, Paket 3): Sparten, die aus Unterlagen ausgelesen vorliegen. Deren Chat-Angaben stehen
// nicht noch einmal hier (die Unterlage ersetzt sie) und zählen auch nicht als „noch nicht genannt“.
export function BestehendeVertraege({ v, lebenssituation, className, ausgelesen = [] }: { v: Vorvertraege | null; lebenssituation: string | null; className?: string; ausgelesen?: readonly string[] }) {
  if (!v || (!v.liste.length && !v.keine)) return null;
  const weg = new Set(ausgelesen);
  const offen = nochNichtGenannt(v, lebenssituation).filter((s) => !weg.has(s));
  const liste = v.liste.filter((x) => !weg.has(x.sparte));
  if (!liste.length && !v.keine && !offen.length) return null;
  return (
    <div className={className} data-bestehende-vertraege>
      <h3 className="text-[13px] font-semibold text-[color:var(--muted)]">Bestehende Verträge</h3>
      {liste.length ? (
        <ul className="mt-1 space-y-0.5">
          {liste.map((x) => (
            <li key={vertragZeile(x)}>{vertragZeile(x)}</li>
          ))}
        </ul>
      ) : v.keine ? (
        <p className="mt-1">Laut Kunde keine</p>
      ) : null}
      {offen.length ? <p className="mt-1 text-[color:var(--muted)]">Noch nicht genannt: {offen.join(", ")}</p> : null}
    </div>
  );
}
