"use client";

import { createContext, useContext } from "react";
import type { ProvisionOverrides } from "@/lib/provision";

// Wirksame Provisionssätze des angemeldeten (bzw. angesehenen) Kunden für
// Client-Komponenten (Abschluss-Dialoge, Pipeline). Ohne Provider: Standard.
const Ctx = createContext<ProvisionOverrides | undefined>(undefined);

export function ProvisionRatesProvider({ rates, children }: { rates: ProvisionOverrides; children: React.ReactNode }) {
  return <Ctx.Provider value={rates}>{children}</Ctx.Provider>;
}

export function useProvisionRates(): ProvisionOverrides | undefined {
  return useContext(Ctx);
}
