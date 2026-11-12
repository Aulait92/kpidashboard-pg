"use client";

// Modul „Empfehlungen & Bewertungen“: Buchungsblatt, Kündigen, Hinweis-Karten,
// Einstellungen mit Handy-Vorschau, „Nicht anfragen“, Empfehlungslink senden.

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Check, Copy, Gift, Loader2, MessageCircle, Send, Share2, Sparkles, Star, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button, buttonClass } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import {
  bookEmpfehlungAction,
  cancelEmpfehlungAction,
  chooseLocationAction,
  publishReplyAction,
  type GbpState,
  dismissHintAction,
  markResolvedAction,
  saveSettingsAction,
  sendReferralLinkAction,
  sendTestAction,
  setOptOutAction,
  type ModuleActionState,
  type SettingsState,
  type ShareState,
  type TestState,
} from "@/app/buyer/empfehlungen/actions";
import { DEFAULT_TEXTS, TEXT_LABELS, bookingTerms, renderText, type TextKey } from "@/lib/empfehlung/shared";

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
}: {
  trial: boolean;
  annual: boolean;
  monthly: number;
  readOnly: boolean;
  reason?: string | null;
  autoOpen?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(autoOpen && !readOnly && !reason);
  const [state, action, pending] = useActionState<ModuleActionState, FormData>(bookEmpfehlungAction, {});
  const terms = bookingTerms({ trial, annual });
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
        {label ?? (trial ? "30 Tage kostenlos testen" : `Buchen – ${eur(monthly)} netto im Monat`)}
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
          <p className="text-xs text-[color:var(--muted)]">
            Es gelten unsere{" "}
            <a href="/rechtliches/agb" target="_blank" rel="noreferrer" className="underline">
              AGB
            </a>{" "}
            (Zusatzmodule).
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

export function EmpfehlungCancelButton({ cancelAt, trialEndsAt, readOnly, annual }: { cancelAt: string | null; trialEndsAt: string | null; readOnly: boolean; annual: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ModuleActionState, FormData>(cancelEmpfehlungAction, {});
  const [bookState, bookAction, booking] = useActionState<ModuleActionState, FormData>(bookEmpfehlungAction, {});
  const until = bookState.ok ? null : (state.until ?? cancelAt);
  if (until) {
    return (
      <form action={bookAction} className="flex flex-wrap items-center gap-3" data-empfehlung-cancelled>
        <span className="text-sm">Gekündigt zum {fmtDate(until)} – bis dahin nutzbar.</span>
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
                ? "Das Modul läuft bis zum Ende Ihres bezahlten Abrechnungsjahres und wird danach nicht mehr berechnet. Eine anteilige Erstattung gibt es nicht."
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

export function ModuleHint({ hintKey, title, text, cta = "30 Tage kostenlos testen", href = "/buyer/konto?modul=empfehlung#zusatzmodule", tone = "brand" }: {
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

export function ReferralLinkButton({ leadId, existingCustomerId, readOnly }: { leadId?: string; existingCustomerId?: string; readOnly: boolean }) {
  const [state, action, pending] = useActionState<ShareState, FormData>(sendReferralLinkAction, {});
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (state.ok) haptic("success");
  }, [state]);
  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        {leadId ? <input type="hidden" name="leadId" value={leadId} /> : null}
        {existingCustomerId ? <input type="hidden" name="existingCustomerId" value={existingCustomerId} /> : null}
        <Button type="submit" icon={Send} disabled={readOnly || pending} data-referral-send>
          {pending ? "Wird gesendet …" : "Empfehlungslink senden"}
        </Button>
        {state.ok ? <span className="text-xs font-medium text-emerald-700">{state.message}</span> : null}
      </form>
      {state.error ? (
        <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-3 text-xs">
          <p className="font-medium">{state.error}</p>
          {state.text ? (
            <>
              <p className="mt-1 whitespace-pre-wrap text-[color:var(--muted)]">{state.text}</p>
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
      ) : null}
    </div>
  );
}

// ─── Einstellungen mit Handy-Vorschau ──────────────────────────────────────

export function SettingsForm({
  initial,
  vertreter,
  readOnly,
}: {
  initial: { active: boolean; googleReviewUrl: string; reviewDelayDays: number; referralDelayDays: number; custom: Partial<Record<TextKey, string>> };
  vertreter: string;
  readOnly: boolean;
}) {
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
  const preview = renderText(texts[focus] || DEFAULT_TEXTS[focus], {
    vorname: "Julia",
    link: focus === "review" ? "https://g.page/r/…/review" : "https://app.performancegrowth.de/empfehlung/…",
    vertreter,
  });
  return (
    <form action={action} className="space-y-5 text-sm" data-empfehlung-settings>
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" name="active" defaultChecked={initial.active} className="h-4 w-4" />
        Automatisch nachfragen (aus = pausiert, ohne zu kündigen)
      </label>
      <label className="block">
        <span className="font-medium">Ihr Google-Bewertungslink</span>
        <input
          name="googleReviewUrl"
          type="url"
          inputMode="url"
          defaultValue={initial.googleReviewUrl}
          placeholder="https://g.page/r/…/review"
          className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3"
        />
        <span className="mt-1 block text-xs text-[color:var(--muted)]">
          So finden Sie ihn: In Google nach Ihrem Unternehmen suchen (angemeldet mit dem Google-Konto des Profils) → „Rezensionen erhalten“ bzw. „Nach
          Rezensionen fragen“ → Link kopieren. Alle angeschriebenen Kunden bekommen denselben Link.
        </span>
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="font-medium">Nachfrage nach</span>
          <span className="mt-1 flex items-center gap-2">
            <input name="reviewDelayDays" type="number" min={1} max={120} defaultValue={initial.reviewDelayDays} className="h-10 w-20 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 tabular-nums" />
            Tagen nach dem Abschluss
          </span>
        </label>
        <label className="block">
          <span className="font-medium">Bitte um Empfehlung nach</span>
          <span className="mt-1 flex items-center gap-2">
            <input name="referralDelayDays" type="number" min={2} max={120} defaultValue={initial.referralDelayDays} className="h-10 w-20 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 tabular-nums" />
            Tagen
          </span>
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {(Object.keys(TEXT_LABELS) as TextKey[]).map((k) => (
            <label key={k} className="block">
              <span className="font-medium">{TEXT_LABELS[k].title}</span>
              <span className="block text-xs text-[color:var(--muted)]">{TEXT_LABELS[k].hint}</span>
              <textarea
                name={`text_${k}`}
                rows={k === "review" || k === "referral" ? 4 : 3}
                value={texts[k]}
                placeholder={DEFAULT_TEXTS[k]}
                onFocus={() => setFocus(k)}
                onChange={(e) => setTexts({ ...texts, [k]: e.target.value })}
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm"
              />
            </label>
          ))}
          <p className="text-xs text-[color:var(--muted)]">
            Platzhalter: {"{Vorname}"}, {"{Link}"}, {"{Vertreter}"}. Leer = Standardtext. Ihr Text geht raus, wenn der WhatsApp-Chat offen ist; sonst
            sendet die App die von Meta freigegebene Standardvorlage mit demselben Inhalt.
          </p>
        </div>
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="text-xs font-medium text-[color:var(--muted)]">Vorschau: {TEXT_LABELS[focus].title}</div>
          <div className="mt-2 rounded-[28px] border-[6px] border-zinc-800 bg-[#e5ddd5] p-3 shadow-[var(--shadow-md)]">
            <div className="max-w-full rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[14px] leading-snug text-zinc-900 shadow-sm" data-empfehlung-preview>
              {preview}
            </div>
          </div>
        </div>
      </div>
      {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
      {state.ok ? <p className="font-medium text-emerald-700">Gespeichert.</p> : null}
      <Button type="submit" variant="primary" size="md" disabled={readOnly || pending}>
        {pending ? "Speichert …" : "Speichern"}
      </Button>
    </form>
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
      <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-4 text-[15px] leading-relaxed">{text}</div>
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
