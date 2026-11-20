"use client";

// Modul „Empfehlungen & Bewertungen“: Buchungsblatt, Kündigen, Hinweis-Karten,
// Einstellungen mit Handy-Vorschau, „Nicht anfragen“, Empfehlungslink senden.

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Check, ChevronDown, Copy, Gift, Loader2, MessageCircle, QrCode, Send, Share2, Sparkles, Star, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button, buttonClass } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import {
  bookEmpfehlungAction,
  cancelEmpfehlungAction,
  chooseLocationAction,
  publishReplyAction,
  referralQrAction,
  type GbpState,
  type QrState,
  dismissHintAction,
  markResolvedAction,
  saveSettingsAction,
  saveGoogleUrlAction,
  sendReferralLinkAction,
  sendTestAction,
  setFeedbackConsentAction,
  setOptOutAction,
  settleRewardAction,
  type ModuleActionState,
  type SettingsState,
  type ShareState,
  type TestState,
} from "@/app/buyer/empfehlungen/actions";
import type { Ansprache } from "@/lib/ansprache";
import { EMPFEHLUNG_MODULE_AVAILABLE, DEFAULT_TEXTS, FEEDBACK_CONSENT_LABEL, OCCASIONS, defaultText, OFFER_LIMITS, OFFER_PRESETS, REWARD_LIMITS, REWARD_SAFE_LIMIT, TEXT_LABELS, bookingTerms, offerWarning, renderText, rewardWarning, type Occasion, type OfferKind, type TextKey } from "@/lib/empfehlung/shared";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const fmtDate = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

// ─── Buchen / Kündigen ──────────────────────────────────────────────────────

export function EmpfehlungBookButton({
  trial,
  annual,
  monthly,
  readOnly,
  reason,
  autoOpen = false,
  label,
  prepayMonths,
}: {
  trial: boolean;
  annual: boolean;
  /** Vorauszahlung: Monate je Zahlungszeitraum (6 oder 12) */
  prepayMonths?: number;
  monthly: number;
  readOnly: boolean;
  reason?: string | null;
  autoOpen?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(autoOpen && !readOnly && !reason);
  const [state, action, pending] = useActionState<ModuleActionState, FormData>(bookEmpfehlungAction, {});
  const terms = bookingTerms({ trial, annual, prepayMonths });
  useEffect(() => {
    if (state.ok) haptic("success");
    else if (state.error) haptic("error");
  }, [state]);
  if (state.ok) {
    return (
      <div className="space-y-2" data-empfehlung-booked>
        <p className="rounded-[var(--radius-md)] bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200">
          {state.message} {state.trialEndsAt ? `Kostenlos bis ${fmtDate(state.trialEndsAt)}.` : ""} Eine Bestätigung kommt per E-Mail.
        </p>
        <Link href="/buyer/empfehlungen" className={buttonClass("primary", "md")}>
          Jetzt einrichten (Google-Link hinterlegen)
        </Link>
      </div>
    );
  }
  if (reason) return <p className="text-sm text-[color:var(--muted)]">{reason}</p>;
  return (
    <>
      <Button variant="primary" size="md" icon={Sparkles} disabled={readOnly} onClick={() => setOpen(true)} data-empfehlung-book>
        {label ?? (trial ? "30 Tage kostenlos testen" : `Buchen, ${eur(monthly)} netto im Monat`)}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Empfehlungen & Bewertungen buchen" message={terms.headline}>
        <form action={action} className="max-h-[65dvh] space-y-4 overflow-y-auto px-5 py-4 text-sm" data-empfehlung-book-dialog>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt className="text-[color:var(--muted)]">{trial ? "Nach der Testphase monatlich" : "Monatlich"} netto</dt>
            <dd className="text-right font-semibold">{eur(monthly)}</dd>
            <dt className="text-[color:var(--muted)]">inkl. 19 % USt.</dt>
            <dd className="text-right">{eur(Math.round(monthly * 1.19 * 100) / 100)}</dd>
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-[color:var(--muted)]">
            {terms.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="text-sm text-[color:var(--muted)]">
            Es gelten unsere{" "}
            <a href="/rechtliches/agb" target="_blank" rel="noreferrer" className="underline">
              AGB
            </a>{" "}
            ({trial ? "Testphasen und kostenlose Zeiträume" : "Zusatzmodule"}).
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4" />
            <span>
              {trial
                ? `Ich teste das Modul kostenlos. Ohne Kündigung läuft es danach für ${eur(monthly)} netto im Monat weiter.`
                : "Ich buche das Modul kostenpflichtig."}
            </span>
          </label>
          {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
          <button type="submit" className={buttonClass("primary", "md", "h-11 w-full")} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {trial ? "Kostenlos testen" : "Kostenpflichtig buchen"}
          </button>
        </form>
      </Sheet>
    </>
  );
}

export function EmpfehlungCancelButton({ cancelAt, trialEndsAt, readOnly, annual, prepayMonths }: { cancelAt: string | null; trialEndsAt: string | null; readOnly: boolean; annual: boolean; prepayMonths?: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ModuleActionState, FormData>(cancelEmpfehlungAction, {});
  const [bookState, bookAction, booking] = useActionState<ModuleActionState, FormData>(bookEmpfehlungAction, {});
  const until = bookState.ok ? null : (state.until ?? cancelAt);
  if (until) {
    return (
      <form action={bookAction} className="flex flex-wrap items-center gap-3" data-empfehlung-cancelled>
        <span className="text-sm">Gekündigt zum {fmtDate(until)}, bis dahin nutzbar.</span>
        <input type="hidden" name="confirm" value="on" />
        <Button type="submit" disabled={readOnly || booking}>
          {booking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Kündigung zurücknehmen
        </Button>
        {bookState.error ? <span className="text-sm font-medium text-rose-700">{bookState.error}</span> : null}
      </form>
    );
  }
  const inTrial = !!trialEndsAt && new Date(trialEndsAt) > new Date();
  return (
    <>
      <Button disabled={readOnly} onClick={() => setOpen(true)} data-empfehlung-cancel>
        {inTrial ? "Testphase beenden (kostenlos)" : "Modul kündigen"}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Empfehlungen & Bewertungen kündigen">
        <form action={action} className="space-y-4 px-5 py-4 text-sm">
          <p>
            {inTrial
              ? `Das Modul endet mit Ihrer Testphase am ${fmtDate(trialEndsAt!)}. Es entstehen keine Kosten.`
              : annual
                ? `Das Modul läuft bis zum Ende Ihres bezahlten ${prepayMonths === 6 ? "Zahlungszeitraums" : "Abrechnungsjahres"} und wird danach nicht mehr berechnet. Eine anteilige Erstattung gibt es nicht.`
                : "Das Modul läuft bis zum Ende des aktuellen Abrechnungsmonats und wird danach nicht mehr berechnet."}{" "}
            Danach gehen keine neuen Anfragen mehr raus.
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4" />
            <span>Ich kündige das Modul „Empfehlungen &amp; Bewertungen“.</span>
          </label>
          {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
          <button type="submit" className={buttonClass("secondary", "md", "h-11 w-full")} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Kündigen
          </button>
        </form>
      </Sheet>
    </>
  );
}

// ─── Hinweise (dezent, einmal wegklickbar) ─────────────────────────────────

/** Hinweis nur, solange das Modul buchbar ist (lib/empfehlung/shared.ts EMPFEHLUNG_MODULE_AVAILABLE). */
export function ModuleHint(props: Parameters<typeof ModuleHintInner>[0]) {
  return EMPFEHLUNG_MODULE_AVAILABLE ? <ModuleHintInner {...props} /> : null;
}

function ModuleHintInner({ hintKey, title, text, cta = "30 Tage kostenlos testen", href = "/buyer/konto?modul=empfehlung#zusatzmodule", tone = "brand" }: {
  hintKey: string;
  title: string;
  text: string;
  cta?: string;
  href?: string;
  tone?: "brand" | "success";
}) {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;
  return (
    <div
      className={`relative mb-5 flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-[color:var(--border)] bg-white"}`}
      data-module-hint={hintKey}
    >
      {tone === "success" ? <Gift className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <p className="mt-0.5 text-[color:var(--muted)]">{text}</p>
        <Link href={href} className="mt-2 inline-block font-semibold text-[color:var(--brand)] hover:underline">
          {cta}
        </Link>
      </div>
      <button
        type="button"
        aria-label="Hinweis ausblenden"
        className="rounded p-1 text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]"
        onClick={() => {
          setHidden(true);
          start(() => dismissHintAction(hintKey));
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Kontaktakte: „Nicht anfragen“, „Geklärt“, Empfehlungslink ─────────────

/** Einwilligung in Nachfrage, Bewertungs- und Empfehlungsbitte (im Gespräch eingeholt) je Kontakt bestätigen. */
/**
 * Einwilligung beim Abschluss (Paket 1, 19.11.2026): ein Häkchen, nie vorausgefüllt, speichert mit einem Tipp
 * (Zeitpunkt, Quelle „vermittler“, Wortlaut). Der Satz zum Vorlesen ist aufklappbar.
 */
export function FeedbackConsentToggle({ leadId, consent, question, readOnly }: { leadId: string; consent: boolean; question: string; readOnly: boolean }) {
  const [value, setValue] = useState(consent);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [titel, rest] = FEEDBACK_CONSENT_LABEL.split(": ");
  return (
    <div className="space-y-1" data-feedback-consent>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
          checked={value}
          disabled={readOnly || pending}
          onChange={(e) => {
            const next = e.target.checked;
            start(async () => {
              const r = await setFeedbackConsentAction(leadId, next);
              if (r.ok) {
                setValue(next);
                setError(null);
                haptic("selection");
              } else setError(r.error ?? "Hat nicht geklappt.");
            });
          }}
          data-feedback-consent-toggle
        />
        <span className="text-sm">
          <b>{titel}:</b> {rest}
          {pending ? <Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin" /> : null}
        </span>
      </label>
      <details className="pl-8 text-sm" data-feedback-consent-satz>
        <summary className="cursor-pointer text-[color:var(--brand)]">Satz zum Vorlesen</summary>
        <p className="mt-1 text-[color:var(--muted)]">„{question}“</p>
      </details>
      {error ? <p className="pl-8 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

export function OptOutToggle({ leadId, off, readOnly }: { leadId: string; off: boolean; readOnly: boolean }) {
  const [value, setValue] = useState(off);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        disabled={readOnly || pending}
        onClick={() =>
          start(async () => {
            const r = await setOptOutAction(leadId, !value);
            if (r.ok) {
              setValue(!value);
              setError(null);
              haptic("selection");
            } else setError(r.error ?? "Hat nicht geklappt.");
          })
        }
        data-review-optout
      >
        {value ? "Doch anfragen" : "Nicht anfragen"}
      </Button>
      {error ? <span className="text-xs text-rose-700">{error}</span> : null}
    </span>
  );
}

export function ResolveButton({ requestId, readOnly }: { requestId: string; readOnly: boolean }) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> Geklärt</span>;
  return (
    <Button
      disabled={readOnly || pending}
      onClick={() =>
        start(async () => {
          await markResolvedAction(requestId);
          setDone(true);
          haptic("success");
        })
      }
    >
      Als geklärt markieren
    </Button>
  );
}

/** QR-Code zum persönlichen Link im Termin zeigen (Blatt). Ohne Einwilligung erlaubt: Der Kunde teilt selbst. */
function useReferralQr(target: { leadId?: string; existingCustomerId?: string }) {
  const [qr, setQr] = useState<QrState | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const show = () => {
    setOpen(true);
    if (qr?.ok) return;
    start(async () => {
      setQr(await referralQrAction(target));
    });
  };
  const sheet = (
    <Sheet open={open} onClose={() => setOpen(false)} title="Empfehlung im Termin" message="Ihr Kunde scannt den Code und leitet die Empfehlung gleich weiter.">
      <div className="space-y-3 px-5 py-4 text-center text-sm" data-referral-qr-sheet>
        {pending || !qr ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-[color:var(--muted)]" />
        ) : qr.ok && qr.qr ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qr} alt="QR-Code zum persönlichen Empfehlungslink" className="mx-auto h-60 w-60 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-2" />
            <p className="text-[color:var(--muted)]">Am besten gleich am Tisch teilen lassen.</p>
            {qr.followUp ? <p className="text-xs font-medium text-emerald-700">Aufgabe zum Nachfassen ist angelegt.</p> : null}
          </>
        ) : (
          <p className="font-medium text-rose-700">{qr.error ?? "Der QR-Code konnte nicht erstellt werden."}</p>
        )}
      </div>
    </Sheet>
  );
  return { show, sheet };
}

/** Fehler beim Senden: Hinweis, ggf. Text zum Kopieren oder Teilen (ohne WhatsApp-Verbindung). */
function ShareError({ state }: { state: ShareState }) {
  const [copied, setCopied] = useState(false);
  if (!state.error) return null;
  return (
    <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-3 text-xs" data-referral-error>
      <p className="font-medium">{state.error}</p>
      {state.text ? (
        <>
          <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-[color:var(--muted)]">{state.text}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              icon={copied ? Check : Copy}
              onClick={async () => {
                await navigator.clipboard?.writeText(state.text!).catch(() => {});
                setCopied(true);
                haptic("success");
              }}
            >
              {copied ? "Kopiert" : "Text kopieren"}
            </Button>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <Button icon={Share2} onClick={() => navigator.share({ text: state.text }).catch(() => {})}>
                Teilen
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Kontakt-Karte (Paket 2): ein primärer Knopf „Empfehlungslink senden“ mit automatischem Anlass, daneben „Im Termin
 * zeigen“. Anlass und weitere Aktionen (z. B. „Nicht anfragen“) unter „Mehr“. Ohne Einwilligung statt des Versands
 * „Kunde hat zugestimmt“ (primär) und der QR-Code.
 */
export function ReferralLinkButton({
  leadId,
  existingCustomerId,
  readOnly,
  defaultOccasion = null,
  needsConsent = false,
  consentAbove = false,
  more,
}: {
  leadId?: string;
  existingCustomerId?: string;
  readOnly: boolean;
  defaultOccasion?: Occasion | null;
  /** Einwilligung fehlt: statt „senden“ den Knopf „Kunde hat zugestimmt“ zeigen */
  needsConsent?: boolean;
  /** Das Häkchen „Kunde hat zugestimmt“ steht schon in der Abschluss-Karte: hier kein zweiter Knopf, nur der QR-Code */
  consentAbove?: boolean;
  more?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<ShareState, FormData>(sendReferralLinkAction, {});
  const [occasion, setOccasion] = useState<string>(defaultOccasion ?? "");
  const qr = useReferralQr(leadId ? { leadId } : { existingCustomerId });
  useEffect(() => {
    if (state.ok) haptic("success");
  }, [state]);
  return (
    <div className="min-w-0 max-w-full space-y-2" data-referral-share>
      {state.ok ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700" data-referral-sent>
          <Check className="h-4 w-4" /> {state.message}
        </p>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          {leadId ? <input type="hidden" name="leadId" value={leadId} /> : null}
          {existingCustomerId ? <input type="hidden" name="existingCustomerId" value={existingCustomerId} /> : null}
          <input type="hidden" name="occasion" value={occasion} />
          {needsConsent && consentAbove ? null : needsConsent && leadId ? (
            <ConsentButton leadId={leadId} readOnly={readOnly} primary />
          ) : (
            <Button type="submit" variant="primary" size="md" icon={Send} disabled={readOnly || pending} data-referral-send>
              {pending ? "Wird gesendet …" : "Empfehlungslink senden"}
            </Button>
          )}
          <Button type="button" size="md" icon={QrCode} disabled={readOnly} onClick={qr.show} data-referral-qr>
            Im Termin zeigen
          </Button>
        </form>
      )}
      <ShareError state={state} />
      {!needsConsent || more ? (
        <details className="text-sm" data-referral-more>
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 text-[color:var(--muted)] hover:text-[color:var(--foreground)] [&::-webkit-details-marker]:hidden">
            Mehr <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!needsConsent ? (
              <label className="flex items-center gap-2">
                <span className="text-[color:var(--muted)]">Anlass</span>
                <select value={occasion} onChange={(e) => setOccasion(e.target.value)} aria-label="Anlass" className="h-10 max-w-[14rem] rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm" data-referral-occasion>
                  <option value="">Normale Empfehlungsbitte</option>
                  {(Object.keys(OCCASIONS) as Occasion[]).map((o) => (
                    <option key={o} value={o}>
                      {OCCASIONS[o].label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {more}
          </div>
        </details>
      ) : null}
      {qr.sheet}
    </div>
  );
}

/** „Kunde hat zugestimmt“ als Knopf (Liste „Einwilligung fehlt“, Kontakt-Karte). Speichert wie das Häkchen beim Abschluss. */
export function ConsentButton({ leadId, readOnly, primary = false }: { leadId: string; readOnly: boolean; primary?: boolean }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700" data-consent-done><Check className="h-4 w-4" /> Zugestimmt</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={primary ? "primary" : "secondary"}
        size={primary ? "md" : "sm"}
        icon={Check}
        title={FEEDBACK_CONSENT_LABEL}
        disabled={readOnly || pending}
        onClick={() =>
          start(async () => {
            const r = await setFeedbackConsentAction(leadId, true);
            if (r.ok) {
              setDone(true);
              haptic("success");
            } else setError(r.error ?? "Hat nicht geklappt.");
          })
        }
        data-consent-button
      >
        Kunde hat zugestimmt
      </Button>
      {error ? <span className="text-xs text-rose-700">{error}</span> : null}
    </span>
  );
}

/** QR-Knopf als Symbol (Liste „Einwilligung fehlt“). */
export function QrIconButton({ leadId, readOnly }: { leadId: string; readOnly: boolean }) {
  const qr = useReferralQr({ leadId });
  return (
    <>
      <Button type="button" icon={QrCode} disabled={readOnly} onClick={qr.show} aria-label="QR-Code im Termin zeigen" data-referral-qr>
        QR
      </Button>
      {qr.sheet}
    </>
  );
}

/** Zeile in „Heute fragen“: Name, Grund, ein Knopf „Link senden“ (sendReferralLinkNow über die bestehende Aktion). */
function HeuteRow({ c, primary, readOnly }: { c: HeuteItem; primary: boolean; readOnly: boolean }) {
  const [state, action, pending] = useActionState<ShareState, FormData>(sendReferralLinkAction, {});
  useEffect(() => {
    if (state.ok) haptic("success");
  }, [state]);
  return (
    <li className="px-4 py-3 sm:px-5" data-heute-row={c.id}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/buyer/leads/${c.id}`} className="block truncate font-semibold hover:underline">
            {c.name}
          </Link>
          <span className="line-clamp-2 text-sm text-[color:var(--muted)]" data-heute-grund>
            {c.reasonText} · {c.thema}
          </span>
        </div>
        {state.ok ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-700" data-heute-sent>
            <Check className="h-4 w-4" /> Gesendet
          </span>
        ) : (
          <form action={action} className="shrink-0">
            <input type="hidden" name="leadId" value={c.id} />
            <input type="hidden" name="occasion" value={c.occasion ?? ""} />
            <Button type="submit" variant={primary ? "primary" : "secondary"} size="md" icon={Send} disabled={readOnly || pending} data-heute-send>
              {pending ? "Sendet …" : "Link senden"}
            </Button>
          </form>
        )}
      </div>
      {state.error ? (
        <div className="mt-2">
          <ShareError state={state} />
        </div>
      ) : null}
    </li>
  );
}

export type HeuteItem = { id: string; name: string; reasonText: string; thema: string; occasion: Occasion | null };

/** Liste „Heute fragen“: höchstens 5 sichtbar, Rest hinter „Alle anzeigen“. Bewusst kein „Allen senden“. */
export function HeuteFragenList({ items, visible = 5, readOnly }: { items: HeuteItem[]; visible?: number; readOnly: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, visible);
  return (
    <>
      <ul className="divide-y divide-[color:var(--border)]" data-heute-fragen>
        {shown.map((c, i) => (
          <HeuteRow key={c.id} c={c} primary={i === 0} readOnly={readOnly} />
        ))}
      </ul>
      {items.length > visible && !all ? (
        <div className="border-t border-[color:var(--border)] px-4 py-2 sm:px-5">
          <Button variant="ghost" onClick={() => setAll(true)} data-heute-alle>
            Alle {items.length} anzeigen
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Text kopieren (Signatur-Zeile, allgemeiner Link). */
export function CopyText({ text, label = "Kopieren", primary = false }: { text: string; label?: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={primary ? "primary" : "secondary"}
      size={primary ? "md" : "sm"}
      icon={copied ? Check : Copy}
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        haptic("success");
      }}
    >
      {copied ? "Kopiert" : label}
    </Button>
  );
}

// ─── Einstellungen mit Handy-Vorschau ──────────────────────────────────────

/** Aufklappbarer Abschnitt mit Zusammenfassung. Felder bleiben im Formular, auch zugeklappt. */
function Section({ title, summary, defaultOpen, children, ...rest }: { title: string; summary?: string; defaultOpen?: boolean; children: React.ReactNode } & Record<`data-${string}`, boolean>) {
  return (
    <details open={defaultOpen} className="group rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white" {...rest}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-[var(--radius-md)] px-4 py-3 hover:bg-[color:var(--surface-sunken)] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">{title}</span>
          {summary ? <span className="block truncate text-sm text-[color:var(--muted)]">{summary}</span> : null}
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-[color:var(--border)] px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}

const DAY_CHOICES = [7, 14, 21, 30] as const;
const FOLLOWUP_CHOICES = [0, 24, 48, 72, 168] as const;
const selectClass = "mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base sm:h-10 sm:text-sm";
const inputClass = "mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-base sm:h-10 sm:text-sm";

function withValue(choices: readonly number[], v: number): number[] {
  return choices.includes(v) ? [...choices] : [...choices, v].sort((x, y) => x - y);
}

/** Schalter-Zeile (Häkchen mit Titel und optional einem Satz). */
function Toggle({ name, defaultChecked, title, hint }: { name: string; defaultChecked: boolean; title: string; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--brand)]" />
      <span>
        <span className="font-medium">{title}</span>
        {hint ? <span className="block text-sm text-[color:var(--muted)]">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * Einstellungen (Paket 2): sichtbar nur Automatik, Google-Bewertungslink und Angebot für Empfohlene. Alles Seltene
 * unter „Erweitert“ (Tage, Nachfassen, Lob, Termin, Rückmeldungen, Dankeschön, Texte, Test).
 */
export function SettingsForm({
  initial,
  vertreter,
  readOnly,
  vermittlerTyp,
  an = "sie",
  linkExample = "https://app.performancegrowth.de/empfehlung/…",
  testForm,
}: {
  initial: {
    active: boolean;
    googleReviewUrl: string;
    reviewDelayDays: number;
    referralDelayDays: number;
    custom: Partial<Record<TextKey, string>>;
    offerKind: OfferKind;
    offerHeadline: string;
    offerText: string;
    referralOnPraise: boolean;
    statusUpdates: boolean;
    followUpHours: number;
    referralAfterAppointment: boolean;
    reward: { kind: string; amount: number | null; note: string | null; trigger: string; confirmed: boolean };
  };
  vertreter: string;
  readOnly: boolean;
  vermittlerTyp?: string | null;
  /** Ansprache der Kontakte (Customer.leadAddress): Vorschau und Platzhalter in Du oder Sie */
  an?: Ansprache;
  /** Beispiel-Link in der Vorschau (eigene Buchungsadresse, lib/public-url.ts) */
  linkExample?: string;
  /** „Test an mich“ (eigenes Formular, steht unter „Erweitert“ außerhalb dieses Formulars) */
  testForm?: React.ReactNode;
}) {
  const [offerKind, setOfferKind] = useState<OfferKind>(initial.offerKind);
  const [offerHeadline, setOfferHeadline] = useState(initial.offerHeadline);
  const [offerText, setOfferText] = useState(initial.offerText);
  const preset = offerKind !== "none" && offerKind !== "custom" ? OFFER_PRESETS[offerKind] : null;
  const warn = offerKind === "custom" ? offerWarning(offerHeadline, offerText, vermittlerTyp) : null;
  const [rewardKind, setRewardKind] = useState(initial.reward.kind);
  const [rewardAmount, setRewardAmount] = useState(initial.reward.amount != null ? String(initial.reward.amount) : String(REWARD_SAFE_LIMIT));
  const rewardWarn = rewardWarning(rewardKind, rewardAmount);
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, {});
  const [texts, setTexts] = useState<Record<TextKey, string>>(() => {
    const t = {} as Record<TextKey, string>;
    for (const k of Object.keys(DEFAULT_TEXTS) as TextKey[]) t[k] = initial.custom[k] ?? "";
    return t;
  });
  const [focus, setFocus] = useState<TextKey>("review");
  useEffect(() => {
    if (state.ok) haptic("success");
    else if (state.error) haptic("error");
  }, [state]);
  const preview = renderText(texts[focus] || defaultText(focus, an), {
    vorname: "Julia",
    anrede: { firstName: "Julia", lastName: "Schneider", salutation: "Frau" },
    link: focus === "review" ? "https://g.page/r/…/review" : linkExample,
    vertreter,
    an,
    thema: "Privatschutz",
  });
  const customCount = (Object.keys(TEXT_LABELS) as TextKey[]).filter((k) => texts[k].trim()).length;
  const advancedSummary = [
    `Bewertungsbitte nach ${initial.reviewDelayDays} Tagen`,
    `Empfehlungsbitte nach ${initial.referralDelayDays} Tagen`,
    customCount ? `${customCount} eigene ${customCount === 1 ? "Text" : "Texte"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4 text-sm" data-empfehlung-settings>
        <div className="space-y-5 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-4" data-empfehlung-basics>
          <Toggle name="active" defaultChecked={initial.active} title="Automatisch nachfragen" hint={`Bewertungsbitte ${initial.reviewDelayDays} Tage nach dem Abschluss, Empfehlungsbitte nach ${initial.referralDelayDays} Tagen.`} />
          <label className="block">
            <span className="font-medium">Google-Bewertungslink</span>
            <input name="googleReviewUrl" type="url" inputMode="url" defaultValue={initial.googleReviewUrl} placeholder="https://g.page/r/…/review" className={inputClass} />
            <span className="mt-1 block text-sm text-[color:var(--muted)]">Ohne eigenes Profil? Fragen Sie Ihre Agentur nach dem Bewertungslink.</span>
          </label>
          <details className="-mt-3 text-sm">
            <summary className="inline-flex min-h-10 cursor-pointer items-center text-[color:var(--brand)]">So finden Sie den Link</summary>
            <p className="text-[color:var(--muted)]">Bei Google nach Ihrem Unternehmen suchen (mit dem Konto des Profils angemeldet), „Rezensionen erhalten“ wählen und den Link kopieren.</p>
          </details>
          <div className="space-y-2" data-empfehlung-offer>
            <label className="block">
              <span className="font-medium">Angebot für Empfohlene</span>
              <select name="offerKind" value={offerKind} onChange={(e) => setOfferKind(e.target.value as OfferKind)} className={selectClass}>
                <option value="none">Kein Angebot (nur „Kontakt aufnehmen“)</option>
                {(Object.keys(OFFER_PRESETS) as (keyof typeof OFFER_PRESETS)[]).map((k) => (
                  <option key={k} value={k}>
                    {OFFER_PRESETS[k].label}
                  </option>
                ))}
                <option value="custom">Eigenes Angebot</option>
              </select>
            </label>
            {preset ? (
              <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-3" data-offer-preview>
                <div className="font-semibold">{preset.headline}</div>
                <p className="mt-1 text-sm text-[color:var(--muted)]">{preset.text.split("{Vertreter}").join(vertreter)}</p>
              </div>
            ) : null}
            {offerKind === "custom" ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="font-medium">Überschrift</span>
                  <input name="offerHeadline" value={offerHeadline} maxLength={OFFER_LIMITS.headline} onChange={(e) => setOfferHeadline(e.target.value)} placeholder="Kostenloser Wohngebäude-Check" className={inputClass} />
                </label>
                <label className="block">
                  <span className="font-medium">Text</span>
                  <textarea
                    name="offerText"
                    rows={3}
                    value={offerText}
                    maxLength={OFFER_LIMITS.text}
                    onChange={(e) => setOfferText(e.target.value)}
                    placeholder="Was prüfen Sie, und was hat die Person davon? Kostenlos und unverbindlich."
                    className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-base sm:text-sm"
                  />
                </label>
                <p className="text-sm text-[color:var(--muted)]">Keine Prämien, Gutscheine, Geldbeträge oder Garantien.</p>
                {warn ? <p className="text-xs font-medium text-amber-700">{warn}</p> : null}
              </div>
            ) : null}
          </div>
        </div>

        <Section title="Erweitert" summary={advancedSummary} data-empfehlung-advanced>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-medium">Bewertungsbitte nach</span>
              <select name="reviewDelayDays" defaultValue={initial.reviewDelayDays} className={selectClass}>
                {withValue(DAY_CHOICES, initial.reviewDelayDays).map((d) => (
                  <option key={d} value={d}>
                    {d} Tagen
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-medium">Empfehlungsbitte nach</span>
              <select name="referralDelayDays" defaultValue={initial.referralDelayDays} className={selectClass}>
                {withValue(DAY_CHOICES, initial.referralDelayDays).map((d) => (
                  <option key={d} value={d}>
                    {d} Tagen
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="font-medium">Nachfassen nach „Link senden“</span>
            <select name="followUpHours" defaultValue={initial.followUpHours} className={selectClass}>
              {withValue(FOLLOWUP_CHOICES, initial.followUpHours).map((h) => (
                <option key={h} value={h}>
                  {h === 0 ? "Aus" : h % 24 === 0 ? `Aufgabe nach ${h / 24} ${h === 24 ? "Tag" : "Tagen"}` : `Aufgabe nach ${h} Stunden`}
                </option>
              ))}
            </select>
          </label>
          <Toggle name="referralOnPraise" defaultChecked={initial.referralOnPraise} title="Bei Lob gleich um eine Empfehlung bitten" />
          <Toggle name="referralAfterAppointment" defaultChecked={initial.referralAfterAppointment} title="Empfehlungsbitte nach stattgefundenem Termin" hint="Höchstens alle 180 Tage je Kunde, nie nach Kritik." />
          <Toggle name="statusUpdates" defaultChecked={initial.statusUpdates} title="Empfehlende auf dem Laufenden halten" hint="Nur wenn die empfohlene Person zugestimmt hat." />

          <div className="space-y-3 border-t border-[color:var(--border)] pt-4" data-empfehlung-reward>
            <label className="block">
              <span className="font-medium">Dankeschön für Empfehlende</span>
              <select name="rewardKind" value={rewardKind} onChange={(e) => setRewardKind(e.target.value)} className={selectClass}>
                <option value="none">Kein Dankeschön</option>
                <option value="gutschein">Gutschein</option>
                <option value="spende">Spende in seinem Namen</option>
              </select>
              <span className="mt-1 block text-sm text-[color:var(--muted)]">
                Höchstens {REWARD_SAFE_LIMIT} € je Empfehler und Jahr, kein Bargeld (§ 48b VAG), Vorgaben Ihres Versicherers beachten.
              </span>
            </label>
            {rewardKind !== "none" ? (
              <>
                <div className="grid grid-cols-[7rem_1fr] gap-3">
                  <label className="block">
                    <span className="font-medium">Wert in €</span>
                    <input name="rewardAmount" type="number" min={REWARD_LIMITS.min} max={REWARD_LIMITS.max} value={rewardAmount} onChange={(e) => setRewardAmount(e.target.value)} className={`${inputClass} tabular-nums`} />
                  </label>
                  <label className="block">
                    <span className="font-medium">{rewardKind === "spende" ? "Spende geht an" : "Art (optional)"}</span>
                    <input
                      name="rewardNote"
                      defaultValue={initial.reward.note ?? ""}
                      maxLength={REWARD_LIMITS.note}
                      placeholder={rewardKind === "spende" ? "z. B. Kinderkrebshilfe vor Ort" : "z. B. Wunschgutschein"}
                      className={inputClass}
                    />
                  </label>
                </div>
                {rewardWarn ? <p className="rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{rewardWarn}</p> : null}
                <p className="text-sm text-[color:var(--muted)]">Fällig nach einem Gespräch mit der empfohlenen Person, nie für die empfohlene Person selbst.</p>
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="rewardConfirmed" defaultChecked={initial.reward.confirmed} required className="mt-0.5 h-5 w-5 shrink-0" />
                  <span className="font-medium">Ich habe geprüft, dass dieses Dankeschön für mich zulässig ist.</span>
                </label>
              </>
            ) : null}
          </div>

          <div className="space-y-3 border-t border-[color:var(--border)] pt-4" data-empfehlung-texts>
            <label className="block">
              <span className="font-medium">Nachrichtentext</span>
              <select value={focus} onChange={(e) => setFocus(e.target.value as TextKey)} className={selectClass} data-text-choice>
                {(Object.keys(TEXT_LABELS) as TextKey[]).map((k) => (
                  <option key={k} value={k}>
                    {TEXT_LABELS[k].title}
                    {texts[k].trim() ? " (eigener Text)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-[color:var(--muted)]">{TEXT_LABELS[focus].hint}</p>
            {(Object.keys(TEXT_LABELS) as TextKey[]).map((k) =>
              k === focus ? (
                <textarea
                  key={k}
                  name={`text_${k}`}
                  rows={5}
                  value={texts[k]}
                  placeholder={defaultText(k, an)}
                  aria-label={TEXT_LABELS[k].title}
                  onChange={(e) => setTexts({ ...texts, [k]: e.target.value })}
                  className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-base sm:text-sm"
                />
              ) : (
                <input key={k} type="hidden" name={`text_${k}`} value={texts[k]} />
              ),
            )}
            <div className="rounded-[24px] border-[6px] border-zinc-800 bg-[#e5ddd5] p-3">
              <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[14px] leading-snug text-zinc-900 shadow-sm" data-empfehlung-preview>
                {preview}
              </div>
            </div>
            <p className="text-xs text-[color:var(--muted)]">Leer lassen = Standardtext. Platzhalter: {"{Anrede}"}, {"{Vorname}"}, {"{Link}"}, {"{Vertreter}"}, {"{Thema}"}.</p>
          </div>
        </Section>

        <div className="sticky bottom-16 z-10 -mx-1 flex flex-wrap items-center gap-3 bg-white/95 px-1 py-3 backdrop-blur md:bottom-0">
          <Button type="submit" variant="primary" size="md" disabled={readOnly || pending}>
            {pending ? "Speichert …" : "Speichern"}
          </Button>
          {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
          {state.ok ? <p className="font-medium text-emerald-700">Gespeichert.</p> : null}
        </div>
      </form>
      {testForm}
    </div>
  );
}

export function TestSendForm({ readOnly }: { readOnly: boolean }) {
  const [state, action, pending] = useActionState<TestState, FormData>(sendTestAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 text-sm">
      <label className="block">
        <span className="text-xs font-medium text-[color:var(--muted)]">Ihre Handynummer</span>
        <input name="phone" inputMode="tel" placeholder="0151 …" className="mt-1 block h-10 w-48 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3" />
      </label>
      <Button type="submit" size="md" icon={MessageCircle} disabled={readOnly || pending}>
        {pending ? "Sendet …" : "Test an mich senden"}
      </Button>
      {state.error ? <span className="w-full text-rose-700">{state.error}</span> : null}
      {state.ok ? <span className="w-full text-emerald-700">{state.message}</span> : null}
    </form>
  );
}

// ─── Öffentliche Empfehlungsseite: Teilen ──────────────────────────────────

export function ShareReferral({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-4 text-[15px] leading-relaxed [overflow-wrap:anywhere]">{text}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md", "h-12 text-base")} onClick={() => haptic("light")}>
          <MessageCircle className="h-4 w-4" /> Per WhatsApp teilen
        </a>
        <button
          type="button"
          className={buttonClass("secondary", "md", "h-12 text-base")}
          onClick={async () => {
            // Teilen-Menü des Handys, sonst Text kopieren
            if (typeof navigator.share === "function") {
              await navigator.share({ text }).catch(() => {});
              return;
            }
            await navigator.clipboard?.writeText(text).catch(() => {});
            setCopied(true);
            haptic("success");
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />} {copied ? "Kopiert" : "Teilen oder kopieren"}
        </button>
      </div>
    </div>
  );
}


// ─── Bewertungs-Wächter ─────────────────────────────────────────────────────

export function LocationPicker({ locations, readOnly }: { locations: { accountName: string; locationName: string; title: string }[]; readOnly: boolean }) {
  const [state, action, pending] = useActionState<GbpState, FormData>(chooseLocationAction, {});
  return (
    <form action={action} className="space-y-2 text-sm">
      {locations.map((l, i) => (
        <label key={l.locationName} className="flex items-center gap-2">
          <input type="radio" name="location" value={`${l.accountName}|${l.locationName}`} defaultChecked={i === 0} />
          <input type="hidden" name={`title_${l.locationName}`} value={l.title} />
          {l.title}
        </label>
      ))}
      {state.error ? <p className="text-rose-700">{state.error}</p> : null}
      <Button type="submit" variant="primary" size="md" disabled={readOnly || pending}>
        {pending ? "Speichert …" : "Standort übernehmen"}
      </Button>
    </form>
  );
}

export function ReplyEditor({ reviewId, suggestion, readOnly }: { reviewId: string; suggestion: string; readOnly: boolean }) {
  const [state, action, pending] = useActionState<GbpState, FormData>(publishReplyAction, {});
  const [text, setText] = useState(suggestion);
  useEffect(() => {
    if (state.ok) haptic("success");
    else if (state.error) haptic("error");
  }, [state]);
  if (state.ok) return <p className="text-xs font-medium text-emerald-700">Antwort veröffentlicht.</p>;
  return (
    <form action={action} className="space-y-2" data-gbp-reply>
      <input type="hidden" name="reviewId" value={reviewId} />
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Antwortvorschlag (bitte prüfen und anpassen, wird erst nach Klick veröffentlicht)
        <textarea name="reply" rows={4} value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--foreground)]" />
      </label>
      {state.error ? <p className={`text-xs ${state.noAccess ? "text-amber-800" : "text-rose-700"}`}>{state.error}</p> : null}
      <Button type="submit" variant="primary" disabled={readOnly || pending || text.trim().length < 5}>
        {pending ? "Veröffentlicht …" : "Antwort auf Google veröffentlichen"}
      </Button>
    </form>
  );
}


/** Offenes Dankeschön: übergeben oder entfällt. */
export function RewardButtons({ leadId, readOnly }: { leadId: string; readOnly: boolean }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap gap-2">
      <Button type="button" icon={Gift} disabled={readOnly || pending} onClick={() => start(() => settleRewardAction(leadId, "erledigt"))} data-reward-done>
        Übergeben
      </Button>
      <Button type="button" icon={X} disabled={readOnly || pending} onClick={() => start(() => settleRewardAction(leadId, "entfaellt"))}>
        Entfällt
      </Button>
    </span>
  );
}

/** Google-Bewertungslink direkt im Hinweis speichern. */
export function GoogleUrlQuickForm({ readOnly, primary = false }: { readOnly: boolean; primary?: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveGoogleUrlAction, {});
  if (state.ok) return <span className="font-medium text-emerald-700">Gespeichert. Die Nachfragen gehen jetzt raus.</span>;
  return (
    <form action={action} className="mt-2 flex w-full flex-wrap items-center gap-2" data-google-quick>
      <input
        name="googleReviewUrl"
        type="url"
        inputMode="url"
        required
        placeholder="https://g.page/r/…/review"
        className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-amber-300 bg-white px-3 text-sm text-[color:var(--foreground)]"
      />
      <Button type="submit" variant={primary ? "primary" : "secondary"} size="md" disabled={readOnly || pending}>
        {pending ? "Speichert …" : "Link speichern"}
      </Button>
      {state.error ? <span className="w-full text-rose-700">{state.error}</span> : null}
    </form>
  );
}

