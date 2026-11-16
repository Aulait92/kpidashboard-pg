"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Loader2 } from "lucide-react";
import { setPayLaterAction } from "./actions";
import { fmtTag } from "@/lib/angebot-zahlungserinnerung";

// „Ich zahle später, erinnern Sie mich am …“ (Ole, 16.11.2026): nur wenn Ole es am Angebot erlaubt hat.
// Sekundär und aufgeklappt erst auf Klick, „Zahlung einrichten“ bleibt die Hauptaktion.
export function PayLater({ token, min, max, current }: { token: string; min: string; max: string | null; current: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (current && !open) {
    return (
      <div className="mt-4 text-sm text-[color:var(--muted)]" data-pay-later-set>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <BellRing className="h-4 w-4 shrink-0" />
          <span>
            Wir erinnern Sie am <b className="text-[color:var(--foreground)]">{fmtTag(current)}</b>.
          </span>
          <button type="button" onClick={() => setOpen(true)} className="font-medium text-[color:var(--brand)] underline">
            Ändern
          </button>
        </p>
        <p className="mt-1 text-xs">Den Zugang zur Einrichtung erhalten Sie, sobald die Zahlung eingerichtet ist.</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 text-sm font-medium text-[color:var(--brand)] underline" data-pay-later>
        Ich zahle später
      </button>
    );
  }

  return (
    <form
      className="mt-4 rounded-[var(--radius-md)] border border-[#e5e7eb] bg-[#f8fafc] p-4"
      data-pay-later-form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await setPayLaterAction(token, date);
          if (res.error) {
            setError(res.error);
            return;
          }
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <label htmlFor="payLaterDate" className="block text-sm font-medium">
        Ich zahle später, erinnern Sie mich am
      </label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          id="payLaterDate"
          type="date"
          required
          min={min}
          max={max ?? undefined}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20 sm:w-60"
        />
        <button
          type="submit"
          disabled={pending || !date}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-4 text-[15px] font-semibold hover:bg-[color:var(--surface-sunken)] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
          Erinnerung speichern
        </button>
      </div>
      <p className="mt-2 text-xs text-[color:var(--muted)]">Den Zugang zur Einrichtung erhalten Sie, sobald die Zahlung eingerichtet ist.</p>
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </form>
  );
}
