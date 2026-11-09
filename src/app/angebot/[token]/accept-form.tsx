"use client";

import { useActionState, useEffect } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { acceptOfferAction, type AcceptState } from "./actions";

export function AcceptForm({
  token,
  termsUrl,
  dpaUrl,
  defaultName,
}: {
  token: string;
  termsUrl: string;
  dpaUrl: string;
  defaultName: string;
}) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(
    acceptOfferAction.bind(null, token),
    {},
  );

  useEffect(() => {
    if (state.checkoutUrl) window.location.href = state.checkoutUrl;
  }, [state.checkoutUrl]);

  if (state.ok && state.checkoutUrl) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-[#EFF6FF] px-5 py-4 text-[#1e3a8a]">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
        <div>
          <div className="font-semibold">Vielen Dank – Ihr Auftrag ist bestätigt.</div>
          <p className="mt-1 text-sm">Sie werden zur sicheren Zahlungseinrichtung (Stripe) weitergeleitet …</p>
        </div>
      </div>
    );
  }

  if (state.ok) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-5 py-4 text-emerald-900">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Vielen Dank – Ihr Auftrag ist bestätigt.</div>
          <p className="mt-1 text-sm">Wir melden uns in Kürze für den Onboarding-Termin.</p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="text-sm font-medium">
          Ihr vollständiger Name
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={3}
          defaultValue={defaultName}
          autoComplete="name"
          className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20"
        />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand)]" />
        <span>
          Ich akzeptiere die{" "}
          <a href={termsUrl} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
            AGB
          </a>{" "}
          und den{" "}
          <a href={dpaUrl} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
            Auftragsverarbeitungsvertrag
          </a>{" "}
          und nehme dieses Angebot verbindlich an.
        </span>
      </label>
      {state.error ? <p className="text-sm font-medium text-rose-700">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white shadow-[var(--shadow-sm)] transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60 sm:w-auto"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Angebot verbindlich annehmen
      </button>
      <p className="text-xs text-[color:var(--muted)]">
        Mit dem Klick schließen Sie den Vertrag zu den oben genannten Konditionen. Zeitpunkt und Name werden zur
        Dokumentation gespeichert.
      </p>
    </form>
  );
}
