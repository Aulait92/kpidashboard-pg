"use client";

// Sparte „Sonstiges“: eigenes Produkt mit Provisionssätzen (Ole, 14.11.2026). Vorschläge aus den schon
// eingetragenen Produkten des Kunden; ein bekanntes Produkt belegt die Sätze vor.

import { useEigeneProdukte } from "@/components/provision-context";
import { abschlussAnzeige, abschlussAusEingabe, artInfo, PRODUKT_ARTEN, type EigenesProdukt, type ProduktArt } from "@/lib/eigene-produkte";
import type { ProvisionOverrides } from "@/lib/provision";

/** Eingabe eines eigenen Produkts; rateAbschluss in der Einheit der Art (%, ‰ oder Monatsbeiträge), Bestand in %. */
export type ProduktEingabe = { productName: string; rateAbschluss: string; rateBestand: string; art?: ProduktArt };

const pct = (n: number) => String(Math.round(n * 10000) / 100).replace(".", ",");

/** Standard für „Sonstiges“ aus den Sätzen des Kunden (sonst 55 % Abschluss, 10 % Bestand). */
export function sonstigesStandard(rates?: ProvisionOverrides): ProduktEingabe {
  const s = rates?.sonstiges;
  const a = s && s.kind === "percent" ? s.rate : 0.55;
  const b = s && s.kind === "percent" ? (s.trail ?? 0) : 0.1;
  return { productName: "", rateAbschluss: pct(a), rateBestand: pct(b), art: "sach" };
}

/** Vorbelegung je Art beim Umschalten (übliche Werte: Leben 25 ‰ + 1,5 %, Kranken 6 Monatsbeiträge + 2 %). */
export function artStandard(art: ProduktArt, rates?: ProvisionOverrides): Pick<ProduktEingabe, "rateAbschluss" | "rateBestand" | "art"> {
  if (art === "leben") {
    const s = rates?.leben_bu;
    return { art, rateAbschluss: String(s && s.kind === "beitragssumme" ? s.promille : 25).replace(".", ","), rateBestand: pct(s && s.kind === "beitragssumme" ? s.trail : 0.015) };
  }
  if (art === "kranken") {
    const s = rates?.krankenzusatz;
    return { art, rateAbschluss: String(s && s.kind === "monthly" ? s.months : 6).replace(".", ","), rateBestand: pct(s && s.kind === "monthly" ? (s.trail ?? 0) : 0.02) };
  }
  const { rateAbschluss, rateBestand } = sonstigesStandard(rates);
  return { art, rateAbschluss, rateBestand };
}

export const produktEingabe = (p: EigenesProdukt): ProduktEingabe => ({ productName: p.name, art: p.art, rateAbschluss: abschlussAnzeige(p.art, p.rateAbschluss), rateBestand: pct(p.rateBestand) });

/** Abschluss-Satz der Eingabe in der gespeicherten Einheit (für die Vorschau), leer/ungültig = null */
export const abschlussWert = (v: ProduktEingabe) => {
  const n = abschlussAusEingabe(v.art ?? "sach", v.rateAbschluss);
  return n === "invalid" ? null : n;
};

/** Prozent-Eingabe → Anteil (für die Vorschau), leer/ungültig = null */
export const anteil = (s: string) => {
  const n = Number(s.replace(",", ".").replace("%", "").trim());
  return s.trim() === "" || !Number.isFinite(n) ? null : n / 100;
};

export function EigenesProduktFelder({ value, onChange, inputCls, rates }: { value: ProduktEingabe; onChange: (v: ProduktEingabe) => void; inputCls: string; rates?: ProvisionOverrides }) {
  const products = useEigeneProdukte();
  const art = value.art ?? "sach";
  const info = artInfo(art);
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
      {/* Rechenart (Ole, 17.11.2026): Sach, Leben oder Kranken, damit die Provision passend gerechnet wird */}
      <div role="radiogroup" aria-label="Rechnet wie" className="grid grid-cols-3 gap-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-1" data-produkt-art>
        {PRODUKT_ARTEN.map((a) => (
          <button
            key={a.key}
            type="button"
            role="radio"
            aria-checked={art === a.key}
            onClick={() => art !== a.key && onChange({ ...value, ...artStandard(a.key, rates) })}
            className={`h-9 rounded-[var(--radius-sm)] text-sm font-medium ${art === a.key ? "bg-white shadow-sm" : "text-[color:var(--muted)]"}`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">Abschluss in {info.kurz === "MB" ? "Monatsbeiträgen" : info.kurz}</span>
          <input inputMode="decimal" value={value.rateAbschluss} onChange={(e) => onChange({ ...value, rateAbschluss: e.target.value })} className={inputCls} data-produkt-abschluss />
        </label>
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">Bestand in % pro Jahr</span>
          <input inputMode="decimal" value={value.rateBestand} onChange={(e) => onChange({ ...value, rateBestand: e.target.value })} className={inputCls} data-produkt-bestand />
        </label>
      </div>
      <p className="text-xs text-[color:var(--muted)]">
        {art === "leben"
          ? "Abschluss in ‰ der Beitragssumme (Monatsbeitrag × 12 × Laufzeit), Bestand vom Jahresbeitrag."
          : art === "kranken"
            ? "Abschluss in Monatsbeiträgen, Bestand vom Jahresbeitrag."
            : "Vom Jahresbeitrag. Bestand zählt ab dem 2. Jahr."}{" "}
        Das Produkt wird gespeichert und steht beim nächsten Abschluss zur Auswahl.
      </p>
    </div>
  );
}
