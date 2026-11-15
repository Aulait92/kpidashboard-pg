"use client";

// „Vertrag hier kündigen“ (Konto & Rechnungen): Knopf → (freiwillig) Grund und passende Alternativen
// (Anti-Churn, lib/anti-churn.ts) → Bestätigungsseite mit Termin → „Jetzt kündigen“ → Bestätigung auf der
// Seite und per E-Mail. Nach dem Vorbild von § 312k BGB, freiwillig auch für Unternehmer: „Direkt zur
// Kündigung“ bzw. „Trotzdem kündigen“ steht auf jedem Schritt, die Abfrage ist keine Hürde.

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button, buttonClass } from "@/components/ui";
import { CHURN_OFFERS, CHURN_REASONS, churnReasonLabel, offersFor, type ChurnOffer, type ChurnReason } from "@/lib/anti-churn";
import { cancelContractAction, churnHelpCallAction, churnIntentAction, churnOfferAction, type CancelContractState, type ChurnState } from "./actions";

const fmt = (iso: string) => iso.split("-").reverse().join(".");

export function VertragKuendigen({
  requested,
  nextText,
  customerName,
  email,
  readOnly,
  slots = [],
  hasModules = true,
  canPause = true,
}: {
  requested: { atIso: string; effectiveIso: string } | null;
  /** „Ihr Vertrag endet am …“ (nächstmöglicher Termin, vom Server berechnet) */
  nextText: string;
  customerName: string;
  email: string;
  readOnly: boolean;
  /** Freie 15-Minuten-Termine im Teamkalender (leer: Termin-Angebot entfällt) */
  slots?: { start: string }[];
  hasModules?: boolean;
  canPause?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"grund" | "angebot" | "kuendigen">("grund");
  const [reason, setReason] = useState<ChurnReason | null>(null);
  const [note, setNote] = useState("");
  const [state, action, pending] = useActionState<CancelContractState, FormData>(cancelContractAction, {});
  const [intent, intentAction, intentPending] = useActionState<ChurnState, FormData>(churnIntentAction, {});
  const [offerState, offerAction, offerPending] = useActionState<ChurnState, FormData>(churnOfferAction, {});
  const [callState, callAction, callPending] = useActionState<ChurnState, FormData>(churnHelpCallAction, {});
  // Nach dem gespeicherten Grund zu den Alternativen (bleibt beim erneuten Öffnen dort)
  const view = step === "grund" && intent.ok && intent.intentId ? "angebot" : step;
  const offers = offersFor(reason, { hasModules, canPause }).filter((o) => o !== "termin" || slots.length > 0);
  const saved = offerState.ok && offerState.message ? offerState.message : callState.ok ? callState.message : null;
  const close = () => {
    setOpen(false);
    setStep("grund");
  };
  /** Pause, Budget, Module: Auswahl merken, Fenster schließen, zur Karte springen */
  const jump = (offer: ChurnOffer) => {
    const anchor = CHURN_OFFERS[offer].anchor;
    // erst nach dem Absenden schließen (die Auswahl wird gespeichert), dann zur Karte springen
    setTimeout(() => {
      close();
      if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }, 0);
  };
  const reasonText = [reason ? churnReasonLabel(reason) : null, note.trim() || null].filter(Boolean).join(": ");
  const done = state.ok && state.effectiveIso ? { effectiveIso: state.effectiveIso } : requested;

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200" data-vertrag-gekuendigt>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">Gekündigt zum {fmt(done.effectiveIso)}</div>
          <p className="mt-1">
            {requested ? `Eingegangen am ${fmt(requested.atIso)}. ` : "Die Bestätigung ist per E-Mail unterwegs. "}
            Bis dahin läuft alles wie gewohnt weiter. Haben Sie es sich anders überlegt? Schreiben Sie uns einfach.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button disabled={readOnly} onClick={() => setOpen(true)} data-vertrag-kuendigen>
        Vertrag hier kündigen
      </Button>
      <Sheet open={open} onClose={close} title="Vertrag kündigen">
        {view === "grund" ? (
          <form action={intentAction} className="max-h-[70dvh] space-y-4 overflow-y-auto px-5 py-4 text-sm" data-churn-grund>
            <p className="text-[15px]">Schade, dass Sie gehen möchten. Was ist der Hauptgrund? Die Angabe ist freiwillig und hilft uns, besser zu werden.</p>
            <fieldset className="space-y-2">
              {CHURN_REASONS.map((r) => (
                <label key={r.key} className="flex items-start gap-2">
                  <input type="radio" name="reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} className="mt-0.5 h-4 w-4" />
                  <span>{r.label}</span>
                </label>
              ))}
            </fieldset>
            <label className="block">
              <span className="text-[color:var(--muted)]">Was sollten wir wissen? (freiwillig)</span>
              <textarea
                name="note"
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20"
              />
            </label>
            {intent.error ? <p className="font-medium text-rose-700">{intent.error}</p> : null}
            <button type="submit" className={buttonClass("primary", "md", "h-11 w-full")} disabled={intentPending || readOnly || !reason} data-churn-weiter>
              {intentPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Weiter
            </button>
            <button type="button" className={buttonClass("secondary", "md", "h-11 w-full")} onClick={() => setStep("kuendigen")} data-churn-direkt>
              Direkt zur Kündigung
            </button>
          </form>
        ) : view === "angebot" ? (
          <div className="max-h-[70dvh] space-y-4 overflow-y-auto px-5 py-4 text-sm" data-churn-angebot>
            {saved ? (
              <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200" data-churn-gerettet>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{saved} Ihr Vertrag läuft unverändert weiter.</p>
              </div>
            ) : (
              <>
                <p className="text-[15px]">Danke für Ihre Offenheit. Vielleicht hilft eine dieser Möglichkeiten:</p>
                <ul className="space-y-3">
                  {offers.map((o) => (
                    <li key={o} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4" data-churn-offer={o}>
                      <div className="font-semibold">{CHURN_OFFERS[o].title}</div>
                      <p className="mt-1 text-[color:var(--muted)]">{CHURN_OFFERS[o].text}</p>
                      {o === "termin" ? (
                        <form action={callAction} className="mt-3 flex flex-wrap gap-2">
                          <input type="hidden" name="intentId" value={intent.intentId ?? ""} />
                          <select name="start" required className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 py-2">
                            {slots.map((sl) => (
                              <option key={sl.start} value={sl.start}>
                                {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(sl.start))} Uhr
                              </option>
                            ))}
                          </select>
                          <button type="submit" className={buttonClass("primary", "md")} disabled={callPending}>
                            {callPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {CHURN_OFFERS.termin.cta}
                          </button>
                          {callState.error ? <p className="w-full font-medium text-rose-700">{callState.error}</p> : null}
                        </form>
                      ) : (
                        <form action={offerAction} className="mt-3" onSubmit={() => (CHURN_OFFERS[o].anchor ? jump(o) : undefined)}>
                          <input type="hidden" name="intentId" value={intent.intentId ?? ""} />
                          <input type="hidden" name="offer" value={o} />
                          <button type="submit" className={buttonClass("primary", "md")} disabled={offerPending}>
                            {offerPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {CHURN_OFFERS[o].cta}
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                {offerState.error ? <p className="font-medium text-rose-700">{offerState.error}</p> : null}
              </>
            )}
            <button type="button" className={buttonClass("secondary", "md", "h-11 w-full")} onClick={() => setStep("kuendigen")} data-churn-trotzdem>
              Trotzdem kündigen
            </button>
          </div>
        ) : (
        <form action={action} className="max-h-[70dvh] space-y-4 overflow-y-auto px-5 py-4 text-sm" data-vertrag-kuendigen-dialog>
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
            <dt className="text-[color:var(--muted)]">Vertrag</dt>
            <dd>Leadgenerierung{customerName ? `, ${customerName}` : ""}</dd>
            <dt className="text-[color:var(--muted)]">Art</dt>
            <dd>Ordentliche Kündigung zum nächstmöglichen Termin</dd>
            <dt className="text-[color:var(--muted)]">Gekündigt von</dt>
            <dd>{email}</dd>
          </dl>
          <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2 font-semibold" data-vertrag-termin>
            {nextText}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[color:var(--muted)]">
            <li>Bis dahin laufen Kampagnen, Leads und Software wie gewohnt weiter. Zusatzmodule enden mit dem Vertrag.</li>
            <li>Ihre Daten können Sie bis dahin jederzeit unter „Ihre Daten herunterladen“ exportieren. Spätestens 30 Tage nach Vertragsende löschen wir die Daten Ihrer Leads und Kunden, soweit keine gesetzliche Pflicht zur Aufbewahrung besteht.</li>
            <li>Sie bekommen sofort eine Bestätigung per E-Mail mit Eingang und Vertragsende.</li>
          </ul>
          <label className="block">
            <span className="text-[color:var(--muted)]">Grund (freiwillig)</span>
            <textarea
              name="reason"
              rows={2}
              maxLength={1000}
              defaultValue={reasonText}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20"
            />
          </label>
          {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
          <button type="submit" className={buttonClass("primary", "md", "h-11 w-full")} disabled={pending || readOnly} data-vertrag-jetzt-kuendigen>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Jetzt kündigen
          </button>
          <p className="text-xs text-[color:var(--muted)]">
            Außerordentliche Kündigung oder ein anderer Termin? Schreiben Sie uns in Textform, zum Beispiel per E-Mail.
          </p>
        </form>
        )}
      </Sheet>
    </>
  );
}
