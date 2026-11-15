"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { DEFAULT_REWARD_FIXED, DEFAULT_REWARD_MONTHS, DEFAULT_SETUP_DISCOUNT, referralIncentiveSentence } from "@/lib/kollegen-shared";
import { saveReferralSettingsAction, type ReferralSettingsState } from "./actions";

const input =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

export function ReferralSettingsForm({
  initial,
}: {
  initial: {
    enabled: boolean;
    rewardKind: string;
    rewardFixed: number | null;
    rewardMonths?: number | null;
    benefitKind: string;
    benefitText: string | null;
    benefitAmount?: number | null;
    nudgesEnabled?: boolean;
  };
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
      <label className="flex items-center gap-3 text-[15px]">
        <input type="checkbox" name="nudgesEnabled" defaultChecked={!!initial.nudgesEnabled} className="h-4 w-4" />
        <span>
          <span className="font-medium">Kunden aktiv auf das Empfehlen hinweisen</span>
          <span className="block text-sm text-[color:var(--muted)]">
            Hinweis in „Heute“ nach dem 5. bzw. 10. Abschluss und Link nach gutem Feedback. Standard aus: „Kollegen empfehlen“ bleibt im Profilmenü und
            unter Konto &amp; Rechnungen erreichbar, wird aber nicht beworben.
          </span>
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-base mb-1 font-semibold">Prämie für den Empfehler</legend>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="radio" name="rewardKind" value="fixed" checked={rewardKind === "fixed"} onChange={() => setRewardKind("fixed")} className="mt-1" />
          <span>
            Fester Betrag je Empfehlung (netto, Standard {DEFAULT_REWARD_FIXED} €)
            <span className="block text-sm text-[color:var(--muted)]">Gutschrift auf die nächste Rechnung, Rest mit den folgenden verrechnet. Jede Empfehlung zählt, ohne Obergrenze.</span>
          </span>
        </label>
        {rewardKind === "fixed" ? (
          <input name="rewardFixed" inputMode="decimal" defaultValue={initial.rewardFixed ?? DEFAULT_REWARD_FIXED} placeholder={String(DEFAULT_REWARD_FIXED)} className={`${input} max-w-[200px]`} aria-label="Prämie je Empfehlung in Euro netto" />
        ) : null}
        <label className="flex items-start gap-2 text-[15px]">
          <input type="radio" name="rewardKind" value="bestand" checked={rewardKind === "bestand"} onChange={() => setRewardKind("bestand")} className="mt-1" />
          <span>
            Bestandskunden-Modul gratis (Monate)
            <span className="block text-sm text-[color:var(--muted)]">
              Ohne Modul: wird gebucht und ist so lange gratis (Hinweis 2 Wochen vor Ende, abbestellen jederzeit). Mit Modul: die Monatsbeiträge werden
              gutgeschrieben. Ist das Modul schon kostenlos (z. B. Makler, Bestandsschutz), entsteht eine Aufgabe. Mehrere Empfehlungen zählen zusammen.
            </span>
          </span>
        </label>
        {rewardKind === "bestand" ? (
          <input
            name="rewardMonths"
            inputMode="numeric"
            defaultValue={initial.rewardMonths ?? DEFAULT_REWARD_MONTHS}
            className={`${input} max-w-[120px]`}
            aria-label="Monate Bestandskunden-Modul gratis"
          />
        ) : null}
        <label className="flex items-start gap-2 text-[15px]">
          <input type="radio" name="rewardKind" value="month" checked={rewardKind === "month"} onChange={() => setRewardKind("month")} className="mt-1" />
          <span>
            1 Monat Betreuung gratis
            <span className="block text-sm text-[color:var(--muted)]">Gutschrift in Höhe seines aktuellen Monatspreises (netto, ohne Zusätze)</span>
          </span>
        </label>
        <p className="text-sm text-[color:var(--muted)]">
          Gebucht wird automatisch als Gutschrift in Stripe, sobald der Neukunde angenommen und die erste Zahlung geleistet hat. Ohne Stripe-Konto entsteht
          die Aufgabe „Prämie manuell gutschreiben“.
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-base mb-1 font-semibold">Vorteil für den Neukunden</legend>
        {[
          { v: "none", l: "Kein Vorteil" },
          { v: "setup_free", l: "Einrichtung gratis (wird im Angebot vorbelegt)" },
          { v: "setup_discount", l: "Rabatt auf die Einrichtung (Betrag netto, wird im Angebot automatisch abgezogen)" },
          { v: "custom", l: "Eigener Vorteil (Text, wird nicht gerechnet)" },
        ].map((o) => (
          <label key={o.v} className="flex items-center gap-2 text-[15px]">
            <input type="radio" name="benefitKind" value={o.v} checked={benefitKind === o.v} onChange={() => setBenefitKind(o.v)} />
            {o.l}
          </label>
        ))}
        {benefitKind === "setup_discount" ? (
          <div className="space-y-1" data-einstellung-setup-rabatt>
            <input
              name="benefitAmount"
              inputMode="decimal"
              defaultValue={initial.benefitAmount ?? DEFAULT_SETUP_DISCOUNT}
              placeholder={String(DEFAULT_SETUP_DISCOUNT)}
              className={`${input} max-w-[200px]`}
              aria-label="Rabatt auf die Einrichtung in Euro netto"
            />
            <p className="text-sm text-[color:var(--muted)]">
              Gilt für jede Laufzeit (bei 300 €: 2.490 € → 2.190 €, 990 € → 690 €), nie unter 0. Ist im Angebot „Setup abweichend“ günstiger, gilt dieser Betrag. Im Angebot
              lässt sich der Rabatt übersteuern. Kein Rabatt bei Selbstempfehlung, bestehenden Kunden, Kontakten mit früherem Angebot und nach 12 Monaten.
            </p>
          </div>
        ) : null}
        {benefitKind === "custom" ? (
          <input name="benefitText" defaultValue={initial.benefitText ?? ""} maxLength={300} placeholder="z. B. 200 € Rabatt auf die Einrichtung" className={input} />
        ) : null}
        <p className="text-sm text-[color:var(--muted)]">
          Steht auf der Landingpage, in der Bestätigungsmail, unter „Kollegen empfehlen“ im Kundenbereich und als Hinweis beim Angebot für den empfohlenen
          Kontakt.
        </p>
      </fieldset>

      <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm" data-einstellung-satz>
        So steht es (gespeicherter Stand) im Kundenbereich: „{referralIncentiveSentence(initial)}“
      </p>

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
