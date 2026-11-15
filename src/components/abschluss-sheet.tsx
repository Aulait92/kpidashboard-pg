"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { closeValueField, contractProvision, premiumFieldForSparte, sparteForSource, spartenAuswahl, type ProvisionOverrides, type SparteKey } from "@/lib/provision";
import { encodeSparte } from "@/lib/eigene-produkte";
import { anteil, EigenesProduktFelder, produktEingabe, sonstigesStandard, type ProduktEingabe } from "@/components/eigenes-produkt-felder";
import { useEigeneProdukte, useProvisionRates } from "@/components/provision-context";

/** Braucht der Abschluss eine Eingabe? (nein bei festem Provisionsbetrag) */
export function asksCloseValue(source: string | null | undefined, rates?: ProvisionOverrides): boolean {
  return closeValueField(source, rates) !== null;
}

/** Muss beim Abschluss die Sparte gewählt werden? (Empfehlung, Bestandskunde, unbekanntes Produkt) */
export function asksSparteFor(source: string | null | undefined): boolean {
  return sparteForSource(source) == null;
}

/**
 * Abschluss speichern, je nach Produkt mit Monatsbeitrag (PKV, Leben/BU), monatlicher Ersparnis
 * (PKV-Tarifoptimierung) oder Jahresbeitrag. Bei Empfehlungen,
 * Bestandskunden und unbekannten Produkten zuerst die Sparte wählen (Ole, 14.11.2026): dann rechnet
 * die App mit dem Satz dieser Sparte. Bei festem Satz gar nicht öffnen (asksCloseValue).
 */
export function AbschlussSheet({
  open,
  title,
  source,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  source: string | null | undefined;
  onClose: () => void;
  /** sparte: Schlüssel, bei „Sonstiges“ mit eigenem Produkt als ein Wert (lib/eigene-produkte.encodeSparte) */
  onSave: (value: number | null, sparte: string | null) => void;
}) {
  const [value, setValue] = useState("");
  const [sparte, setSparte] = useState<SparteKey | "">("");
  const [produkt, setProdukt] = useState<ProduktEingabe>({ productName: "", rateAbschluss: "", rateBestand: "" });
  const rates = useProvisionRates();
  const products = useEigeneProdukte();
  const known = sparte === "sonstiges" ? products.find((p) => p.name.toLowerCase() === produkt.productName.trim().toLowerCase()) : undefined;
  const choose = (v: string) => {
    if (v.startsWith("eigen:")) {
      const p = products.find((x) => x.name === v.slice(6));
      if (p) {
        setSparte("sonstiges");
        setProdukt(produktEingabe(p));
        return;
      }
    }
    setSparte(v as SparteKey);
    setProdukt(v === "sonstiges" ? sonstigesStandard(rates) : { productName: "", rateAbschluss: "", rateBestand: "" });
  };
  const needsSparte = asksSparteFor(source);
  const field = needsSparte
    ? sparte
      ? premiumFieldForSparte(sparte, rates)
      : { label: "Beitrag netto (optional)", hint: "Bitte zuerst die Sparte wählen.", placeholder: "z. B. 400", factor: 1 }
    : (closeValueField(source, rates) ?? { label: "Wert des Abschlusses (optional)", hint: "", placeholder: "z. B. 1.200", factor: 1 });
  const label = needsSparte && sparte ? `${field.label} (optional)` : field.label;
  const reset = () => {
    setValue("");
    setSparte("");
    setProdukt({ productName: "", rateAbschluss: "", rateBestand: "" });
  };
  const n0 = Number.parseFloat(value.replace(/\./g, "").replace(",", "."));
  const vorschau =
    sparte === "sonstiges" && produkt.productName.trim()
      ? contractProvision(
          { sparte, premium: Number.isFinite(n0) && n0 > 0 ? n0 : null, productName: produkt.productName, rateAbschluss: anteil(produkt.rateAbschluss), rateBestand: anteil(produkt.rateBestand) },
          rates,
        )
      : null;
  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={title}
      message={needsSparte ? "Welche Sparte wurde abgeschlossen?" : field.label}
    >
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (needsSparte && !sparte) return;
          if (sparte === "sonstiges" && produkt.productName.trim().length < 2) return;
          const n = Number.parseFloat(value.replace(/\./g, "").replace(",", "."));
          const chosen = needsSparte && sparte ? encodeSparte(sparte, sparte === "sonstiges" ? produkt : null) : null;
          reset();
          // Leben/BU: Monatsbeitrag eingegeben, gespeichert wird der Jahresbeitrag (factor 12)
          onSave(Number.isFinite(n) && n > 0 ? Math.round(n * field.factor * 100) / 100 : null, chosen);
        }}
      >
        {needsSparte ? (
          <label className="block">
            <span className="text-sm text-[color:var(--muted)]">Sparte</span>
            <select
              required
              value={known ? `eigen:${known.name}` : sparte}
              onChange={(e) => choose(e.target.value)}
              className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base"
              data-abschluss-sparte
            >
              <option value="">Bitte wählen</option>
              {spartenAuswahl(sparte).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.key === "sonstiges" ? "Anderes Produkt (neu anlegen)" : s.label}
                </option>
              ))}
              {products.length ? (
                <optgroup label="Ihre Produkte">
                  {products.map((p) => (
                    <option key={p.name} value={`eigen:${p.name}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
        ) : null}
        {needsSparte && sparte === "sonstiges" ? (
          <EigenesProduktFelder value={produkt} onChange={setProdukt} inputCls="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base" />
        ) : null}
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 focus-within:border-[color:var(--brand)]">
          <input
            autoFocus={!needsSparte}
            inputMode="decimal"
            aria-label={label}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
          />
          <span className="text-sm text-[color:var(--muted)]">€</span>
        </div>
        {field.hint ? <p className="text-sm text-[color:var(--muted)]">{field.hint}</p> : null}
        {vorschau && (vorschau.abschluss > 0 || vorschau.trailPerYear > 0) ? (
          <p className="text-sm text-[color:var(--muted)]" data-abschluss-vorschau>
            ≈ {Math.round(vorschau.abschluss).toLocaleString("de-DE")} € Abschlussprovision, ≈ {Math.round(vorschau.trailPerYear).toLocaleString("de-DE")} € Bestand pro Jahr ab dem 2. Jahr
            {vorschau.premiumMissing ? " (mit Standardbeitrag, solange kein Beitrag eingetragen ist)" : ""}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="md" icon={Trophy} className="w-full" disabled={(needsSparte && !sparte) || (sparte === "sonstiges" && produkt.productName.trim().length < 2)}>
          Abschluss speichern
        </Button>
      </form>
    </Sheet>
  );
}
