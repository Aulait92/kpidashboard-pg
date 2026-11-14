"use client";

import { createContext, useContext } from "react";
import type { ProvisionOverrides } from "@/lib/provision";
import type { EigenesProdukt } from "@/lib/eigene-produkte";

// Wirksame Provisionssätze des angemeldeten (bzw. angesehenen) Kunden für
// Client-Komponenten (Abschluss-Dialoge, Pipeline). Ohne Provider: Standard.
const Ctx = createContext<ProvisionOverrides | undefined>(undefined);

const ProdukteCtx = createContext<EigenesProdukt[]>([]);

export function ProvisionRatesProvider({ rates, products = [], children }: { rates: ProvisionOverrides; products?: EigenesProdukt[]; children: React.ReactNode }) {
  return (
    <Ctx.Provider value={rates}>
      <ProdukteCtx.Provider value={products}>{children}</ProdukteCtx.Provider>
    </Ctx.Provider>
  );
}

/** Eigene Produkte des Kunden (Sparte „Sonstiges“) für Auswahl und Vorbelegung. */
export function useEigeneProdukte(): EigenesProdukt[] {
  return useContext(ProdukteCtx);
}

export function useProvisionRates(): ProvisionOverrides | undefined {
  return useContext(Ctx);
}
