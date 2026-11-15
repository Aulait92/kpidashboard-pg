"use client";

// „Vertrag hier kündigen“ (Konto & Rechnungen): Knopf → (freiwillig) Grund und passende Alternativen
// (Anti-Churn, lib/anti-churn.ts) → Bestätigungsseite mit Termin → „Jetzt kündigen“ → Bestätigung auf der
// Seite und per E-Mail. Nach dem Vorbild von § 312k BGB, freiwillig auch für Unternehmer: „Direkt zur
// Kündigung“ bzw. „Trotzdem kündigen“ steht auf jedem Schritt, die Abfrage ist keine Hürde.
// Seit 15.11.2026 mit Halteangeboten je Grund (lib/halteangebote.ts): die Angebote mit aktuellen Werten kommen nach
// „Weiter“ vom Server (churnIntentAction), angenommen wird über halteOfferAction.
// Auf der Bestätigungsseite: Aufbewahrung der Daten nach Vertragsende (24 Monate, 3 Monate oder sofort, lib/ruhend-shared.ts).

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button, buttonClass } from "@/components/ui";
import { CHURN_OFFERS, CHURN_REASONS, churnReasonLabel, isHalteKind, offersFor, type ChurnReason } from "@/lib/anti-churn";
import type { OfferView } from "@/lib/halteangebote";
import { RETENTION_CHOICES, RETENTION_DEFAULT, RETENTION_NOTICE, type RetentionChoice } from "@/lib/ruhend-shared";
import { cancelContractAction, churnHelpCallAction, churnIntentAction, churnOfferAction, halteOfferAction, type CancelContractState, type ChurnState } from "./actions";

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
  const [retention, setRetention] = useState<RetentionChoice>(RETENTION_DEFAULT);
  const [state, action, pending] = useActionState<CancelContractState, FormData>(cancelContractAction, {});
  const [intent, intentAction, intentPending] = useActionState<ChurnState, FormData>(churnIntentAction, {});
  const [offerState, offerAction, offerPending] = useActionState<ChurnState, FormData>(churnOfferAction, {});
  const [callState, callAction, callPending] = useActionState<ChurnState, FormData>(churnHelpCallAction, {});
  const [halteState, halteAction, haltePending] = useActionState<ChurnState, FormData>(halteOfferAction, {});
  // Nach dem gespeicherten Grund zu den Alternativen (bleibt beim erneuten Öffnen dort)
  const view = step === "grund" && intent.ok && intent.intentId ? "angebot" : step;
  // Angebote mit aktuellen Werten vom Server (nach „Weiter“); ohne Antwort die festen Alternativen
  const offers: OfferView[] = (
    intent.offers ??
    offersFor(reason, { hasModules, canPause }).map((k): OfferView => ({ key: k, ...CHURN_OFFERS[k], form: k === "termin" ? "termin" : "simple" }))
  ).filter((o) => o.key !== "termin" || slots.length > 0);
  const saved = halteState.ok && halteState.message ? halteState.message : offerState.ok && offerState.message ? offerState.message : callState.ok ? callState.message : null;
  const close = () => {
    setOpen(false);
    setStep("grund");
  };
  /** Pause, Budget, Module: Auswahl merken, Fenster schließen, zur Karte springen */
  const jump = (anchor: string | undefined) => {
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
            Bis dahin läuft alles wie gewohnt weiter. Danach ruht Ihr Konto bis zur Löschung, siehe „Ihre Daten nach Vertragsende“. Haben Sie es sich anders überlegt? Schreiben Sie uns einfach.
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
                <p>{saved}</p>
              </div>
            ) : (
              <>
                <p className="text-[15px]">Danke für Ihre Offenheit. Vielleicht hilft eine dieser Möglichkeiten:</p>
                <ul className="space-y-3">
                  {offers.map((o) => (
                    <li key={o.key} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4" data-churn-offer={o.key}>
                      <div className="font-semibold">{o.title}</div>
                      <p className="mt-1 text-[color:var(--muted)]">{o.text}</p>
                      {o.hint ? (
                        <p className="mt-2" data-churn-hinweis>
                          {o.hint.text}{" "}
                          <a href={o.hint.href} className="font-medium text-[color:var(--brand)] underline">
                            {o.hint.label}
                          </a>
                        </p>
                      ) : null}
                      <OfferForm
                        o={o}
                        intentId={intent.intentId ?? ""}
                        slots={slots}
                        einrichtungSlots={intent.einrichtungSlots ?? []}
                        callAction={callAction}
                        callPending={callPending}
                        callError={callState.error}
                        offerAction={offerAction}
                        offerPending={offerPending}
                        halteAction={halteAction}
                        haltePending={haltePending}
                        onJump={() => jump(o.anchor)}
                      />
                    </li>
                  ))}
                </ul>
                {offerState.error || halteState.error ? <p className="font-medium text-rose-700">{halteState.error ?? offerState.error}</p> : null}
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
            <li>Sie bekommen sofort eine Bestätigung per E-Mail mit Eingang und Vertragsende.</li>
          </ul>
          <fieldset className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3" data-aufbewahrung-wahl>
            <legend className="px-1 font-semibold">Ihre Daten nach Vertragsende</legend>
            <p>{RETENTION_NOTICE}</p>
            {RETENTION_CHOICES.map((r) => (
              <label key={r.key} className="flex items-start gap-2">
                <input type="radio" name="retention" value={r.key} checked={retention === r.key} onChange={() => setRetention(r.key)} className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-medium">{r.label}</span>
                  {retention === r.key ? <span className="block text-[color:var(--muted)]">{r.hint}</span> : null}
                </span>
              </label>
            ))}
            <p className="text-[color:var(--muted)]">
              Ihre Daten können Sie jederzeit unter „Ihre Daten herunterladen“ exportieren. Die Wahl können Sie bis zur Löschung im Konto ändern.
            </p>
          </fieldset>
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

const fieldCls = "rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 py-2";
const slotLabel = (iso: string) =>
  `${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))} Uhr`;

/** Formular je Angebot: Knopf, Terminwahl, Zeitraum der Pause oder Wunsch als Text; Halteangebote gehen an halteOfferAction. */
function OfferForm({
  o,
  intentId,
  slots,
  einrichtungSlots,
  callAction,
  callPending,
  callError,
  offerAction,
  offerPending,
  halteAction,
  haltePending,
  onJump,
}: {
  o: OfferView;
  intentId: string;
  slots: { start: string }[];
  einrichtungSlots: { start: string }[];
  callAction: (fd: FormData) => void;
  callPending: boolean;
  callError?: string;
  offerAction: (fd: FormData) => void;
  offerPending: boolean;
  halteAction: (fd: FormData) => void;
  haltePending: boolean;
  onJump: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const pending = isHalteKind(o.key) ? haltePending : offerPending;
  const spinner = pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null;
  if (o.form === "termin") {
    return (
      <form action={callAction} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="intentId" value={intentId} />
        <select name="start" required className={`min-w-0 flex-1 ${fieldCls}`}>
          {slots.map((sl) => (
            <option key={sl.start} value={sl.start}>
              {slotLabel(sl.start)}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass("primary", "md")} disabled={callPending}>
          {callPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {o.cta}
        </button>
        {callError ? <p className="w-full font-medium text-rose-700">{callError}</p> : null}
      </form>
    );
  }
  if (!isHalteKind(o.key)) {
    return (
      <form action={offerAction} className="mt-3" onSubmit={() => (o.anchor ? onJump() : undefined)}>
        <input type="hidden" name="intentId" value={intentId} />
        <input type="hidden" name="offer" value={o.key} />
        <button type="submit" className={buttonClass("primary", "md")} disabled={offerPending}>
          {spinner}
          {o.cta}
        </button>
      </form>
    );
  }
  return (
    <form action={halteAction} className="mt-3 space-y-2" data-halteangebot={o.key}>
      <input type="hidden" name="intentId" value={intentId} />
      <input type="hidden" name="offer" value={o.key} />
      {o.form === "einrichtung" ? (
        <select name="start" required className={`w-full ${fieldCls}`}>
          {einrichtungSlots.map((sl) => (
            <option key={sl.start} value={sl.start}>
              {slotLabel(sl.start)}
            </option>
          ))}
        </select>
      ) : null}
      {o.form === "pause" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[color:var(--muted)]">Ab</span>
            <input type="date" name="from" required defaultValue={o.pauseFrom} min={o.pauseFrom} max={o.pauseMaxUntil} className={`mt-1 w-full ${fieldCls}`} />
          </label>
          <label className="block">
            <span className="text-[color:var(--muted)]">Bis</span>
            <input type="date" name="until" required defaultValue={o.pauseMaxUntil} min={o.pauseFrom} max={o.pauseMaxUntil} className={`mt-1 w-full ${fieldCls}`} />
          </label>
        </div>
      ) : null}
      {o.form === "note" ? (
        <label className="block">
          <span className="text-[color:var(--muted)]">Was soll anders werden? (freiwillig, z. B. Sparte, Region, Fragen im Formular)</span>
          <textarea name="note" rows={2} maxLength={1000} className={`mt-1 w-full ${fieldCls} text-[15px]`} />
        </label>
      ) : null}
      {o.confirm ? (
        <label className="flex items-start gap-2">
          <input type="checkbox" name="confirm" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4" data-halte-bestaetigung />
          <span>{o.confirm}</span>
        </label>
      ) : null}
      <button type="submit" className={buttonClass("primary", "md")} disabled={haltePending || (!!o.confirm && !confirmed)}>
        {spinner}
        {o.cta}
      </button>
    </form>
  );
}
