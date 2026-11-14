"use client";

// Zusatzpakete im Bestandskunden-Modul (Ole, 14.11.2026): „Paket dazubuchen“ (Auswahlfenster, auf dem
// Handy von unten), Anfrage für große Pakete und „Automatisch nachbuchen“. Nur Inhaber.

import { useActionState, useState } from "react";
import { Check, Loader2, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { bookPackAction, requestPackAction, saveAutoTopUpAction, type PackState } from "@/app/buyer/bestand/actions";

const VAT_RATE = 0.19;
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const de = (n: number) => n.toLocaleString("de-DE");
/** Kampagnen verschicken standardmäßig höchstens so viele Nachrichten am Tag (Mo bis Sa). */
const DEFAULT_DAILY = 150;

export type PackOffer = { messages: number; price: number };

export function PackBookButton({
  packs,
  months,
  individualFrom,
  readOnly,
  blocker,
  label = "Paket dazubuchen",
  variant = "primary",
}: {
  packs: readonly PackOffer[];
  months: number;
  individualFrom: number;
  readOnly: boolean;
  /** Online buchen nicht möglich (z. B. keine Online-Abrechnung): dann nur anfragen */
  blocker: string | null;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<number>(packs[0]?.messages ?? 0);
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<PackState, FormData>(bookPackAction, {});
  const [req, requestAction, requesting] = useActionState<PackState, FormData>(requestPackAction, {});
  const selected = packs.find((p) => p.messages === choice) ?? packs[0];
  const onlyRequest = !!blocker || !!state.fallback;
  const days = selected ? Math.ceil(selected.messages / DEFAULT_DAILY) : 0;

  return (
    <>
      <Button variant={variant} size="md" icon={PackagePlus} disabled={readOnly} onClick={() => setOpen(true)} data-pack-book>
        {label}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nachrichten dazubuchen" message={`Einmalig, sofort freigeschaltet, gültig ${months} Monate. Preise netto.`}>
        <div className="max-h-[70dvh] space-y-4 overflow-y-auto px-5 py-4 text-sm" data-pack-dialog>
          {state.ok ? (
            <p className="rounded-[var(--radius-md)] bg-emerald-50 px-4 py-3 font-medium text-emerald-900 ring-1 ring-emerald-200" data-pack-booked>
              {state.message}
            </p>
          ) : asking || onlyRequest ? (
            req.ok ? (
              <p className="rounded-[var(--radius-md)] bg-emerald-50 px-4 py-3 font-medium text-emerald-900 ring-1 ring-emerald-200" data-pack-requested>
                {req.message}
              </p>
            ) : (
              <form action={requestAction} className="space-y-3" data-pack-request>
                {onlyRequest ? (
                  <p className="text-[color:var(--muted)]">
                    {state.error ?? blocker} Fragen Sie das Paket hier an, wir schalten es für Sie frei.
                  </p>
                ) : (
                  <p className="text-[color:var(--muted)]">Ab {de(individualFrom)} Nachrichten im Monat machen wir Ihnen ein individuelles Angebot.</p>
                )}
                <label className="block text-xs font-medium text-[color:var(--muted)]">
                  Wie viele Nachrichten im Monat?
                  <input
                    name="messagesPerMonth"
                    inputMode="numeric"
                    defaultValue={onlyRequest ? String(selected?.messages ?? "") : String(individualFrom)}
                    className="mt-1 block h-10 w-40 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm text-[color:var(--foreground)]"
                  />
                </label>
                <label className="block text-xs font-medium text-[color:var(--muted)]">
                  Nachricht (optional)
                  <textarea name="note" rows={2} maxLength={500} className="mt-1 block w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--foreground)]" />
                </label>
                {req.error ? <p className="font-medium text-rose-700">{req.error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" size="md" disabled={requesting || readOnly}>
                    {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Anfragen
                  </Button>
                  {!onlyRequest ? (
                    <Button type="button" size="md" onClick={() => setAsking(false)}>
                      Zurück zu den Paketen
                    </Button>
                  ) : null}
                </div>
              </form>
            )
          ) : (
            <form action={action} className="space-y-4">
              <input type="hidden" name="messages" value={selected?.messages ?? 0} />
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Paket">
                {packs.map((p) => {
                  const active = p.messages === selected?.messages;
                  return (
                    <button
                      key={p.messages}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setChoice(p.messages)}
                      data-pack-option={p.messages}
                      className={cn(
                        "relative rounded-[var(--radius-md)] border px-4 py-3 text-left transition",
                        active ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] ring-1 ring-[color:var(--brand)]" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]",
                      )}
                    >
                      {active ? <Check className="absolute right-3 top-3 h-4 w-4 text-[color:var(--brand)]" /> : null}
                      <div className="text-base font-semibold">+ {de(p.messages)} Nachrichten</div>
                      <div className="text-[color:var(--muted)]">
                        {eur(p.price)} netto · {eur(Math.round((p.price / p.messages) * 100) / 100)} je Nachricht
                      </div>
                    </button>
                  );
                })}
              </div>
              {selected ? (
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                  <dt className="text-[color:var(--muted)]">Einmalig netto</dt>
                  <dd className="text-right font-semibold">{eur(selected.price)}</dd>
                  <dt className="text-[color:var(--muted)]">inkl. 19 % USt.</dt>
                  <dd className="text-right">{eur(Math.round(selected.price * (1 + VAT_RATE) * 100) / 100)}</dd>
                </dl>
              ) : null}
              <ul className="list-disc space-y-1 pl-5 text-[color:var(--muted)]">
                <li>Sofort freigeschaltet, gültig {months} Monate. Verbraucht wird zuerst Ihr Monatskontingent, dann das älteste Paket.</li>
                <li>Erscheint als eigener Posten auf Ihrer Rechnung. WhatsApp-Gebühren sind enthalten.</li>
                <li>Pausierte Kampagnen laufen danach automatisch weiter.</li>
              </ul>
              {selected && selected.messages > 500 ? (
                <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3 text-xs" data-pack-meta-hint>
                  Gut zu wissen: WhatsApp begrenzt, wie viele Menschen eine Nummer innerhalb von 24 Stunden neu anschreiben darf. Kampagnen verteilen die
                  Nachrichten deshalb automatisch über mehrere Tage. Bei {DEFAULT_DAILY} pro Tag dauern {de(selected.messages)} Nachrichten etwa {days} Versandtage
                  (Mo bis Sa).
                </p>
              ) : null}
              <label className="flex items-start gap-2">
                <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4" />
                <span>Ich buche das Paket kostenpflichtig.</span>
              </label>
              {state.error && !state.fallback ? <p className="font-medium text-rose-700">{state.error}</p> : null}
              <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending || readOnly}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {selected ? `Kostenpflichtig buchen (${eur(selected.price)} netto)` : "Kostenpflichtig buchen"}
              </Button>
              <button type="button" onClick={() => setAsking(true)} className="w-full text-center text-xs font-medium text-[color:var(--brand)] hover:underline" data-pack-individual>
                Ab {de(individualFrom)} Nachrichten im Monat: individuell, bitte anfragen
              </button>
            </form>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** „Automatisch nachbuchen“: 500er-Pakete bis höchstens X € im Monat (Standard aus). */
export function AutoTopUpForm({ max, spent, packPrice, packMessages, readOnly }: { max: number | null; spent: number; packPrice: number; packMessages: number; readOnly: boolean }) {
  const [on, setOn] = useState(max != null);
  const [state, action, pending] = useActionState<PackState, FormData>(saveAutoTopUpAction, {});
  return (
    <form action={action} className="space-y-2 text-sm" data-auto-topup>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="enabled" checked={on} onChange={(e) => setOn(e.target.checked)} disabled={readOnly} className="mt-0.5 h-4 w-4" />
        <span>
          <span className="font-medium">Automatisch nachbuchen</span>
          <span className="block text-xs text-[color:var(--muted)]">
            Ist das Kontingent aufgebraucht, buchen wir ein Paket mit {de(packMessages)} Nachrichten ({eur(packPrice)} netto) nach, damit Kampagnen weiterlaufen.
            Sie bekommen bei jeder Nachbuchung eine E-Mail.
          </span>
        </span>
      </label>
      {on ? (
        <label className="ml-6 flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
          höchstens
          <input
            name="max"
            type="number"
            min={packPrice}
            max={5000}
            step={1}
            defaultValue={max ?? packPrice * 2}
            disabled={readOnly}
            className="h-9 w-24 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-2 text-sm text-[color:var(--foreground)]"
          />
          € netto im Monat{spent > 0 ? ` (diesen Monat ${eur(spent)} nachgebucht)` : ""}
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || readOnly}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Speichern
        </Button>
        {state.message ? <span className="text-xs font-medium text-emerald-700">{state.message}</span> : null}
        {state.error ? <span className="text-xs font-medium text-rose-700">{state.error}</span> : null}
      </div>
    </form>
  );
}
