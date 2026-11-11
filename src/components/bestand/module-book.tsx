"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { bookBestandModuleAction, cancelBestandModuleAction, type BookState } from "@/app/buyer/bestand/actions";
import { ModuleRequestButton } from "@/components/bestand/module-request";
import { bestandTerms } from "@/lib/bestand/terms";

const VAT_RATE = 0.19;
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const fmtDate = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

const primary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60";
const secondary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-4 text-sm font-medium transition hover:bg-[color:var(--surface-sunken)] disabled:opacity-60";

/**
 * Bestandskunden-Modul selbst buchen: Knopf + Bestätigungsfenster.
 * Ohne Voraussetzungen (reason gesetzt) bleibt es bei „Modul anfragen“.
 */
export function ModuleBookButton({
  monthlyNet,
  includedMessages,
  canBook,
  reason,
  requestedAt,
  readOnly,
  annual = false,
  freeMonths = 2,
}: {
  monthlyNet: number;
  includedMessages: number;
  canBook: boolean;
  reason: string | null;
  requestedAt: string | null;
  readOnly: boolean;
  /** Jährliche Vorauszahlung: Modul läuft bis zum Ende des bezahlten Jahres. */
  annual?: boolean;
  freeMonths?: number;
}) {
  const terms = bestandTerms({ annual, monthlyNet, freeMonths });
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<BookState, FormData>(bookBestandModuleAction, {});

  if (!canBook || state.fallback) {
    return (
      <div className="space-y-2" data-module-fallback>
        {reason || state.error ? (
          <p className="text-sm text-[color:var(--muted)]">
            {state.error ?? reason} Fragen Sie das Modul hier an, wir melden uns.
          </p>
        ) : null}
        <ModuleRequestButton requestedAt={requestedAt} readOnly={readOnly} />
      </div>
    );
  }
  if (state.ok) {
    return (
      <p className="rounded-[var(--radius-md)] bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200" data-module-booked>
        Gebucht – das Modul ist freigeschaltet. Eine Bestätigung kommt per E-Mail.
      </p>
    );
  }
  return (
    <>
      <button type="button" className={primary} disabled={readOnly} onClick={() => setOpen(true)} data-module-book>
        Jetzt buchen – {eur(monthlyNet)} netto im Monat
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Bestandskunden-Modul buchen">
        <form action={action} className="max-h-[65dvh] space-y-4 overflow-y-auto px-5 py-4 text-sm" data-module-book-dialog>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt className="text-[color:var(--muted)]">Monatlich netto</dt>
            <dd className="text-right font-semibold">{eur(monthlyNet)}</dd>
            <dt className="text-[color:var(--muted)]">inkl. 19 % USt.</dt>
            <dd className="text-right">{eur(Math.round(monthlyNet * (1 + VAT_RATE) * 100) / 100)}</dd>
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-[color:var(--muted)]">
            <li>{terms.charge}</li>
            <li>{terms.cancel}</li>
            <li>WhatsApp-Gebühren für bis zu {includedMessages} Kampagnen-Nachrichten im Monat inklusive</li>
          </ul>
          <p className="text-xs text-[color:var(--muted)]">
            Es gelten unsere{" "}
            <a href="/rechtliches/agb" target="_blank" rel="noreferrer" className="underline">
              AGB
            </a>{" "}
            (Abschnitt Leistungen und Vergütung, Zusatzmodule).
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4" />
            <span>Ich buche das Bestandskunden-Modul kostenpflichtig.</span>
          </label>
          {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
          <button type="submit" className={`${primary} w-full`} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Kostenpflichtig buchen
          </button>
        </form>
      </Sheet>
    </>
  );
}

/** Modul kündigen (zum Ende des Abrechnungszeitraums) bzw. Kündigung zurücknehmen. */
export function ModuleCancelButton({ cancelAt, readOnly, annual = false }: { cancelAt: string | null; readOnly: boolean; annual?: boolean }) {
  const terms = bestandTerms({ annual, monthlyNet: 0, freeMonths: 0 });
  const [open, setOpen] = useState(false);
  const [cancelState, cancelAction, cancelling] = useActionState<BookState, FormData>(cancelBestandModuleAction, {});
  const [bookState, bookAction, booking] = useActionState<BookState, FormData>(bookBestandModuleAction, {});
  const until = bookState.ok ? null : (cancelState.until ?? cancelAt);

  if (until) {
    return (
      <form action={bookAction} className="flex flex-wrap items-center gap-3" data-module-cancelled>
        <span className="text-sm">Gekündigt zum {fmtDate(until)} – bis dahin nutzbar.</span>
        <input type="hidden" name="confirm" value="on" />
        <button type="submit" className={secondary} disabled={readOnly || booking}>
          {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Kündigung zurücknehmen
        </button>
        {bookState.error ? <span className="text-sm font-medium text-rose-700">{bookState.error}</span> : null}
      </form>
    );
  }
  return (
    <>
      <button type="button" className={secondary} disabled={readOnly} onClick={() => setOpen(true)} data-module-cancel>
        Modul kündigen (zum Ende des Abrechnungszeitraums)
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Bestandskunden-Modul kündigen">
        <form action={cancelAction} className="max-h-[65dvh] space-y-4 overflow-y-auto px-5 py-4 text-sm" data-module-cancel-dialog>
          <p>
            {terms.cancelDialog} Laufende Kampagnen stoppen dann. Ihre hochgeladene Kundenliste bleibt gespeichert.
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4" />
            <span>Ich kündige das Bestandskunden-Modul zum Ende des Abrechnungszeitraums.</span>
          </label>
          {cancelState.error ? <p className="font-medium text-rose-700">{cancelState.error}</p> : null}
          <button type="submit" className={`${secondary} h-11 w-full`} disabled={cancelling}>
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Kündigen
          </button>
        </form>
      </Sheet>
    </>
  );
}
