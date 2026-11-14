"use client";

// Sparte „Sonstiges“: eigenes Produkt mit Provisionssätzen (Ole, 14.11.2026). Vorschläge aus den schon
// eingetragenen Produkten des Kunden; ein bekanntes Produkt belegt die Sätze vor.

import { useEigeneProdukte } from "@/components/provision-context";
import type { EigenesProdukt } from "@/lib/eigene-produkte";
import type { ProvisionOverrides } from "@/lib/provision";

export type ProduktEingabe = { productName: string; rateAbschluss: string; rateBestand: string };

const pct = (n: number) => String(Math.round(n * 10000) / 100).replace(".", ",");

/** Standard für „Sonstiges“ aus den Sätzen des Kunden (sonst 55 % Abschluss, 10 % Bestand). */
export function sonstigesStandard(rates?: ProvisionOverrides): ProduktEingabe {
  const s = rates?.sonstiges;
  const a = s && s.kind === "percent" ? s.rate : 0.55;
  const b = s && s.kind === "percent" ? (s.trail ?? 0) : 0.1;
  return { productName: "", rateAbschluss: pct(a), rateBestand: pct(b) };
}

export const produktEingabe = (p: EigenesProdukt): ProduktEingabe => ({ productName: p.name, rateAbschluss: pct(p.rateAbschluss), rateBestand: pct(p.rateBestand) });

/** Prozent-Eingabe → Anteil (für die Vorschau), leer/ungültig = null */
export const anteil = (s: string) => {
  const n = Number(s.replace(",", ".").replace("%", "").trim());
  return s.trim() === "" || !Number.isFinite(n) ? null : n / 100;
};

export function EigenesProduktFelder({ value, onChange, inputCls }: { value: ProduktEingabe; onChange: (v: ProduktEingabe) => void; inputCls: string }) {
  const products = useEigeneProdukte();
  const pick = (name: string) => {
    const known = products.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    onChange(known ? produktEingabe(known) : { ...value, productName: name });
  };
  return (
    <div className="space-y-3 rounded-[var(--radius-sm)] border border-[color:var(--border)] p-3" data-eigenes-produkt>
      <label className="block">
        <span className="text-sm text-[color:var(--muted)]">Produkt</span>
        <input
          required
          list="eigene-produkte"
          value={value.productName}
          onChange={(e) => pick(e.target.value)}
          placeholder="z. B. Hausrat, Kfz, Rechtsschutz Gewerbe"
          className={inputCls}
          data-produkt-name
        />
        <datalist id="eigene-produkte">
          {products.map((p) => (
            <option key={p.name} value={p.name} />
          ))}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">Abschluss in %</span>
          <input inputMode="decimal" value={value.rateAbschluss} onChange={(e) => onChange({ ...value, rateAbschluss: e.target.value })} className={inputCls} data-produkt-abschluss />
        </label>
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">Bestand in % pro Jahr</span>
          <input inputMode="decimal" value={value.rateBestand} onChange={(e) => onChange({ ...value, rateBestand: e.target.value })} className={inputCls} data-produkt-bestand />
        </label>
      </div>
      <p className="text-xs text-[color:var(--muted)]">Vom Jahresbeitrag. Bestand zählt ab dem 2. Jahr. Das Produkt wird gespeichert und steht beim nächsten Abschluss zur Auswahl.</p>
    </div>
  );
}
