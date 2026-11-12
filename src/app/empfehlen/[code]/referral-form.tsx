"use client";

import { useActionState } from "react";
import { CalendarCheck, CheckCircle2, Loader2 } from "lucide-react";
import { submitReferralAction, type ReferralFormState } from "./actions";

const input =
  "h-12 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

export function ReferralForm({
  code,
  consentText,
  privacyUrl,
  bookingUrl,
  bookingLabel,
  renderedAt,
}: {
  code: string;
  renderedAt: number;
  consentText: string;
  privacyUrl: string;
  bookingUrl: string | null;
  bookingLabel: string;
}) {
  const [state, action, pending] = useActionState<ReferralFormState, FormData>(submitReferralAction.bind(null, code), {});
  if (state.ok) {
    return (
      <div className="space-y-4" data-empfehlen-ok>
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-5 py-4 text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">Danke! Wir melden uns bei Ihnen.</div>
            <p className="mt-1 text-sm">In der Regel rufen wir noch am selben oder am nächsten Werktag an.</p>
          </div>
        </div>
        {bookingUrl ? (
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-5 text-[15px] font-semibold transition hover:bg-[color:var(--surface-sunken)]"
          >
            <CalendarCheck className="h-4 w-4" /> Lieber gleich einen Termin wählen: {bookingLabel}
          </a>
        ) : null}
      </div>
    );
  }
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-3" data-empfehlen-form>
      <label className="block">
        <span className="text-sm font-medium">Ihr Name</span>
        <input name="name" required autoComplete="name" defaultValue={v.name} className={`${input} mt-1`} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Agentur</span>
        <input name="company" autoComplete="organization" defaultValue={v.company} className={`${input} mt-1`} placeholder="z. B. Agentur Muster" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">E-Mail</span>
        <input name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={v.email} className={`${input} mt-1`} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Telefon</span>
        <input name="phone" type="tel" required autoComplete="tel" inputMode="tel" defaultValue={v.phone} className={`${input} mt-1`} />
      </label>
      {/* Bot-Falle: für Menschen unsichtbar */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website_hp" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name="rendered_at" value={String(renderedAt)} />
      <label className="flex items-start gap-2 pt-1 text-xs leading-relaxed text-[color:var(--muted)]">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {consentText} Hinweise in der{" "}
          <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Datenschutzerklärung
          </a>
          .
        </span>
      </label>
      {state.error ? <p className="text-sm font-medium text-rose-700">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-base font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Unverbindliches Erstgespräch anfragen
      </button>
    </form>
  );
}
