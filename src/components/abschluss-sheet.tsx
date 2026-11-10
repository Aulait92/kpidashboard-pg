"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { closeValueField, type ProvisionOverrides } from "@/lib/provision";
import { useProvisionRates } from "@/components/provision-context";

/** Braucht der Abschluss eine Eingabe? (nein bei festem Provisionsbetrag) */
export function asksCloseValue(source: string | null | undefined, rates?: ProvisionOverrides): boolean {
  return closeValueField(source, rates) !== null;
}

/**
 * Abschluss speichern, je nach Produkt mit Monatsbeitrag (PKV), Jahresbeitrag
 * (Privatschutz, TKV) oder freiem Wert (sonstige). Bei festem Satz gar nicht
 * öffnen, sondern direkt speichern (asksCloseValue).
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
  onSave: (value: number | null) => void;
}) {
  const [value, setValue] = useState("");
  const rates = useProvisionRates();
  const field = closeValueField(source, rates) ?? { label: "Wert des Abschlusses (optional)", hint: "", placeholder: "z. B. 1.200" };
  return (
    <Sheet
      open={open}
      onClose={() => {
        setValue("");
        onClose();
      }}
      title={title}
      message={field.label}
    >
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number.parseFloat(value.replace(/\./g, "").replace(",", "."));
          setValue("");
          onSave(Number.isFinite(n) && n > 0 ? n : null);
        }}
      >
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 focus-within:border-[color:var(--brand)]">
          <input
            autoFocus
            inputMode="decimal"
            aria-label={field.label}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
          />
          <span className="text-sm text-[color:var(--muted)]">€</span>
        </div>
        {field.hint ? <p className="text-sm text-[color:var(--muted)]">{field.hint}</p> : null}
        <Button type="submit" variant="primary" size="md" icon={Trophy} className="w-full">
          Abschluss speichern
        </Button>
      </form>
    </Sheet>
  );
}
