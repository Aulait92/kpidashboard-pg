"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { requestBestandModuleAction, type RequestState } from "@/app/buyer/bestand/actions";
import { bestandTerms } from "@/lib/bestand/terms";
import { bestandPacksText, PRICE_LIST } from "@/lib/offer-pricing";
import { BESTAND_VOLUMES } from "@/lib/bestand/volumen";

const VAT_RATE = 0.19;
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const num = (n: number) => n.toLocaleString("de-DE");
const primary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60";

/**
 * Knopf „Modul anfragen“ mit Fenster wie beim Buchen (Ole, 15.11.2026): Konditionen, Kontingent,
 * Zusatzpakete und die geplante Menge. Die Anfrage geht an performancegrowth, gebucht wird von uns.
 */
export function ModuleRequestButton({
  requestedAt,
  readOnly,
  monthlyNet = PRICE_LIST.bestandModuleMonthly,
  annual = false,
  freeMonths = PRICE_LIST.annualFreeMonths,
}: {
  requestedAt: string | null;
  readOnly: boolean;
  monthlyNet?: number;
  annual?: boolean;
  freeMonths?: number;
}) {
  const terms = bestandTerms({ annual, monthlyNet, freeMonths });
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RequestState, FormData>(requestBestandModuleAction, {});
  const done = state.ok || !!requestedAt;
  if (done) {
    return (
      <p className="rounded-[var(--radius-md)] bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200" data-module-requested>
        Anfrage ist bei uns angekommen{requestedAt ? ` (${new Date(requestedAt).toLocaleDateString("de-DE")})` : ""}. Wir melden uns und schalten das Modul frei.
      </p>
    );
  }
  return (
    <>
      <button type="button" className={primary} disabled={readOnly} onClick={() => setOpen(true)} data-module-request>
        Modul anfragen
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Bestandskunden-Modul anfragen">
        <form action={action} className="max-h-[65dvh] space-y-4 overflow-y-auto px-5 py-4 text-sm" data-module-request-dialog>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt className="text-[color:var(--muted)]">Monatlich netto</dt>
            <dd className="text-right font-semibold">{eur(monthlyNet)}</dd>
            <dt className="text-[color:var(--muted)]">inkl. 19 % USt.</dt>
            <dd className="text-right">{eur(Math.round(monthlyNet * (1 + VAT_RATE) * 100) / 100)}</dd>
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-[color:var(--muted)]">
            <li>{terms.charge}</li>
            <li>{terms.cancel}</li>
            <li>
              Jeden Monat inklusive: WhatsApp-Gebühren für bis zu {num(PRICE_LIST.bestandIncludedMessages)} Kampagnen-Nachrichten und bis zu{" "}
              {num(PRICE_LIST.bestandIncludedEmails)} Kampagnen-E-Mails
            </li>
            <li>Brauchen Sie mehr Nachrichten, buchen Sie später unter Bestandskunden einfach ein Zusatzpaket dazu: {bestandPacksText()}</li>
            <li>Ab {num(PRICE_LIST.bestandPackIndividualFrom)} zusätzlichen Nachrichten im Monat machen wir Ihnen ein eigenes Angebot</li>
          </ul>
          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium">Wie viele Kampagnen-Nachrichten planen Sie im Monat?</legend>
            {BESTAND_VOLUMES.map((v) => (
              <label key={v.value} className="flex items-start gap-2">
                <input type="radio" name="volume" value={v.value} required className="mt-0.5 h-4 w-4" />
                <span>{v.label}</span>
              </label>
            ))}
            <p className="text-xs text-[color:var(--muted)]">Nur zur Planung, Sie legen sich damit auf kein Paket fest.</p>
          </fieldset>
          <p className="text-xs text-[color:var(--muted)]">
            Es gelten unsere{" "}
            <a href="/rechtliches/agb" target="_blank" rel="noreferrer" className="underline">
              AGB
            </a>{" "}
            (Abschnitt Leistungen und Vergütung, Zusatzmodule). Kosten entstehen erst, wenn wir das Modul nach Rücksprache mit Ihnen freischalten.
          </p>
          {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
          <button type="submit" className={`${primary} w-full`} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Anfrage senden
          </button>
        </form>
      </Sheet>
    </>
  );
}
