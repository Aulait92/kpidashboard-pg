// „Bestehende Verträge“ laut Lead (Komplettcheck im WhatsApp-Assistenten, Ole 17.11.2026, lib/whatsapp/vorvertraege.ts):
// eine Zeile je Vertrag, darunter neutral „noch nicht genannt: …“ gegenüber den gängigen Sparten der Lebenssituation.
// Gleiche Darstellung in der Terminvorbereitung (Karte „Das will der Kunde“) und im Kontakt.

import { nochNichtGenannt, vertragZeile, type Vorvertraege } from "@/lib/whatsapp/vorvertraege";

export function BestehendeVertraege({ v, lebenssituation, className }: { v: Vorvertraege | null; lebenssituation: string | null; className?: string }) {
  if (!v || (!v.liste.length && !v.keine)) return null;
  const offen = nochNichtGenannt(v, lebenssituation);
  return (
    <div className={className} data-bestehende-vertraege>
      <h3 className="text-[13px] font-semibold text-[color:var(--muted)]">Bestehende Verträge</h3>
      {v.liste.length ? (
        <ul className="mt-1 space-y-0.5">
          {v.liste.map((x) => (
            <li key={vertragZeile(x)}>{vertragZeile(x)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">Laut Kunde keine</p>
      )}
      {offen.length ? <p className="mt-1 text-[color:var(--muted)]">Noch nicht genannt: {offen.join(", ")}</p> : null}
    </div>
  );
}
