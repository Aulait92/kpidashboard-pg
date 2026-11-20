"use client";

import { useState } from "react";

// Lead-Eingang → Formular zuordnen: Ziel (Kunde oder Vertrieb) und Produkt. Beim Vertrieb (Oles eigene Vermittler-Leads)
// gibt es kein Produkt, das Feld verschwindet. Wert „Vertrieb“ = VERTRIEB_ZIEL aus app/admin/lead-eingang/daten.ts.

export function ZielWahl({
  customers,
  productOptions,
  vertriebWert,
  inputClass,
  listId,
  erweitert,
}: {
  customers: { id: string; name: string }[];
  productOptions: string[];
  vertriebWert: string;
  inputClass: string;
  listId: string;
  /** Lead-Preis (Pay-per-Lead): nur bei Kunden */
  erweitert?: React.ReactNode;
}) {
  const [ziel, setZiel] = useState("");
  const vertrieb = ziel === vertriebWert;
  return (
    <>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-[color:var(--muted)]">Ziel</span>
        <select name="customerId" required className={inputClass} value={ziel} onChange={(e) => setZiel(e.target.value)}>
          <option value="" disabled>
            Kunde oder Vertrieb wählen
          </option>
          <option value={vertriebWert}>Vertrieb (eigene Vermittler-Leads)</option>
          <optgroup label="Kunden">
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {vertrieb ? (
        <p className="self-end pb-2.5 text-xs text-[color:var(--muted)]">Leads landen unter Verkaufen → Kontakte → Meta-Leads, mit Anruf-Aufgabe und Push.</p>
      ) : (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[color:var(--muted)]">Produkt</span>
          <input name="productKey" required list={listId} placeholder="z. B. Privatschutz" className={inputClass} />
          <datalist id={listId}>
            {productOptions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
      )}
      {vertrieb ? null : erweitert}
    </>
  );
}
