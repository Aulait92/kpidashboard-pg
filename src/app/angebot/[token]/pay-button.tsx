"use client";

import { useState, useTransition } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { startPaymentAction } from "./actions";
import { ZahlartAuswahl } from "@/components/zahlart-auswahl";
import { ZAHLART_STANDARD, type Zahlart } from "@/lib/zahlart";

export function PayButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [zahlart, setZahlart] = useState<Zahlart>(ZAHLART_STANDARD);
  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <ZahlartAuswahl value={zahlart} onChange={setZahlart} />
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await startPaymentAction(token, zahlart);
            if (res.url) window.location.href = res.url;
            else setError(res.error ?? "Fehler");
          })
        }
        className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white shadow-[var(--shadow-sm)] hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Zahlung einrichten
      </button>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
