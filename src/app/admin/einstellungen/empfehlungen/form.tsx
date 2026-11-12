"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { saveReferralSettingsAction, type ReferralSettingsState } from "./actions";

const input =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

export function ReferralSettingsForm({
  initial,
}: {
  initial: { enabled: boolean; rewardKind: string; rewardFixed: number | null; benefitKind: string; benefitText: string | null };
}) {
  const [state, action, pending] = useActionState<ReferralSettingsState, FormData>(saveReferralSettingsAction, {});
  const [rewardKind, setRewardKind] = useState(initial.rewardKind);
  const [benefitKind, setBenefitKind] = useState(initial.benefitKind);
  return (
    <form action={action} className="space-y-6">
      <label className="flex items-center gap-3 text-[15px]">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} className="h-4 w-4" />
        <span>
          <span className="font-medium">Empfehlungsprogramm aktiv</span>
          <span className="block text-sm text-[color:var(--muted)]">
            Aus = keine Hinweise im Kundenbereich, die Landingpage nimmt keine Anfragen an. Zugesagte Prämien werden trotzdem gebucht.
          </span>
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">Prämie für den Empfehler</legend>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="radio" name="rewardKind" value="month" checked={rewardKind === "month"} onChange={() => setRewardKind("month")} className="mt-1" />
          <span>
            1 Monat Betreuung gratis
            <span className="block text-sm text-[color:var(--muted)]">Gutschrift in Höhe seines aktuellen Monatspreises (netto, ohne Zusätze)</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="radio" name="rewardKind" value="fixed" checked={rewardKind === "fixed"} onChange={() => setRewardKind("fixed")} className="mt-1" />
          <span>Fester Betrag (netto)</span>
        </label>
        {rewardKind === "fixed" ? (
          <input name="rewardFixed" inputMode="decimal" defaultValue={initial.rewardFixed ?? ""} placeholder="z. B. 500" className={`${input} max-w-[200px]`} />
        ) : null}
        <p className="text-xs text-[color:var(--muted)]">
          Gebucht wird automatisch als Gutschrift in Stripe, sobald der Neukunde angenommen und die erste Zahlung geleistet hat. Ohne Stripe-Konto entsteht
          die Aufgabe „Prämie manuell gutschreiben“.
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">Vorteil für den Neukunden</legend>
        {[
          { v: "none", l: "Kein Vorteil" },
          { v: "setup_free", l: "Einrichtung gratis (wird im Angebot vorbelegt)" },
          { v: "custom", l: "Eigener Vorteil (Text)" },
        ].map((o) => (
          <label key={o.v} className="flex items-center gap-2 text-[15px]">
            <input type="radio" name="benefitKind" value={o.v} checked={benefitKind === o.v} onChange={() => setBenefitKind(o.v)} />
            {o.l}
          </label>
        ))}
        {benefitKind === "custom" ? (
          <input name="benefitText" defaultValue={initial.benefitText ?? ""} maxLength={300} placeholder="z. B. 200 € Rabatt auf die Einrichtung" className={input} />
        ) : null}
        <p className="text-xs text-[color:var(--muted)]">Steht auf der Landingpage und als Hinweis beim Angebot für den empfohlenen Kontakt.</p>
      </fieldset>

      {state.error ? <p className="text-sm font-medium text-rose-700">{state.error}</p> : null}
      {state.ok ? <p className="text-sm font-medium text-emerald-700">Gespeichert.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Speichern
      </button>
    </form>
  );
}
