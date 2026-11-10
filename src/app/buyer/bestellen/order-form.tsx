"use client";

import { useActionState, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { orderAction, type OrderFormState } from "./actions";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export function OrderForm(p: {
  subscriptionId: string;
  price: number;
  credit: number;
  min: number;
  defaultQty: number;
  canOrderThisWeek: boolean;
  weekLabels: { this: string; next: string };
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<OrderFormState, FormData>(orderAction, {});
  const [qty, setQty] = useState(Math.max(p.min, p.defaultQty));
  const [week, setWeek] = useState<"0" | "1">("1");
  const gross = qty * p.price;
  const credit = Math.min(p.credit, gross);
  const step = qty >= 50 ? 10 : 5;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="subscriptionId" value={p.subscriptionId} />
      <input type="hidden" name="week" value={week} />
      <div className="font-medium">Bestellen</div>
      {p.canOrderThisWeek ? (
        <div className="inline-flex rounded-full bg-[color:var(--surface-sunken,#f1f5f9)] p-1 text-sm">
          {(["0", "1"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeek(w)}
              className={`rounded-full px-3 py-1.5 font-medium transition ${week === w ? "bg-white shadow-sm" : "text-[color:var(--muted)]"}`}
            >
              {w === "0" ? `Ab sofort (${p.weekLabels.this})` : `Nächste Woche (${p.weekLabels.next})`}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[color:var(--muted)]">Für nächste Woche ({p.weekLabels.next})</p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white">
          <button type="button" aria-label="Weniger" onClick={() => setQty((q) => Math.max(p.min, q - step))} className="flex h-10 w-10 items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
            <Minus className="h-4 w-4" />
          </button>
          <input
            name="quantity"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
            className="h-10 w-16 border-x border-[color:var(--border)] text-center text-base font-semibold tabular-nums outline-none"
            aria-label="Anzahl Leads"
          />
          <button type="button" aria-label="Mehr" onClick={() => setQty((q) => q + step)} className="flex h-10 w-10 items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="text-sm">
          <div className="text-lg font-semibold tabular-nums">{eur(gross - credit)}</div>
          <div className="text-[color:var(--muted)]">
            {qty} × {eur(p.price)}
            {credit > 0 ? ` − ${eur(credit)} Gutschrift` : ""} · zzgl. USt.
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="autoRenew" defaultChecked className="h-4 w-4" />
        Jede Woche wiederholen (bis ich es ändere)
      </label>
      {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
      <Button type="submit" variant="primary" size="md" disabled={pending || p.disabled || qty < p.min}>
        {pending ? "Wird bestellt …" : `Bestellen und ${eur(gross - credit)} bezahlen`}
      </Button>
    </form>
  );
}
