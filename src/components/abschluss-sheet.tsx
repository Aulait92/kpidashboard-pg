"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { closeValueField, premiumFieldForSparte, sparteForSource, SPARTEN, type ProvisionOverrides, type SparteKey } from "@/lib/provision";
import { useProvisionRates } from "@/components/provision-context";

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
  onSave: (value: number | null, sparte: SparteKey | null) => void;
}) {
  const [value, setValue] = useState("");
  const [sparte, setSparte] = useState<SparteKey | "">("");
  const rates = useProvisionRates();
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
  };
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
          const n = Number.parseFloat(value.replace(/\./g, "").replace(",", "."));
          const chosen = needsSparte && sparte ? sparte : null;
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
              value={sparte}
              onChange={(e) => setSparte(e.target.value as SparteKey)}
              className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base"
              data-abschluss-sparte
            >
              <option value="">Bitte wählen</option>
              {SPARTEN.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
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
        <Button type="submit" variant="primary" size="md" icon={Trophy} className="w-full" disabled={needsSparte && !sparte}>
          Abschluss speichern
        </Button>
      </form>
    </Sheet>
  );
}
