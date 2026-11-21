"use client";

// Aktionen je Kundenzeile im Bestand-Cockpit (Paket 3, 20.11.2026): höchstens ein beschrifteter Knopf, und nur wenn er
// etwas bringt („Einwilligung“ bei Kunden ohne Einwilligung). Alles andere liegt im „…“-Menü.

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ConsentRowAction, type ConsentRowProps } from "@/components/bestand/consent-actions";
import { CustomerRowActions } from "@/components/bestand/customer-actions";

export function KundeAktionen({
  consent,
  needsConsent,
  hasPhone,
  referral,
  blocked,
}: {
  consent: Omit<ConsentRowProps, "trigger" | "open" | "onOpenChange">;
  /** Noch ohne Einwilligung und nicht abgemeldet oder gesperrt: beschrifteter Knopf „Einwilligung“ */
  needsConsent: boolean;
  hasPhone: boolean;
  referral: boolean;
  blocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ConsentRowAction {...consent} trigger={needsConsent ? "label" : "none"} open={open} onOpenChange={setOpen} />
      <CustomerRowActions
        existingCustomerId={consent.existingCustomerId}
        name={consent.name}
        hasPhone={hasPhone}
        readOnly={consent.readOnly}
        referral={referral}
        blocked={blocked}
        extraActions={needsConsent ? [] : [{ label: "Einwilligung und Nachweis", icon: ShieldCheck, onSelect: () => setOpen(true) }]}
      />
    </div>
  );
}
