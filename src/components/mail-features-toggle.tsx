"use client";

// „E-Mail-Funktionen nutzen“ unter Einstellungen → E-Mail-Postfach (Ole, 15.11.2026).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMailFeaturesAction } from "@/app/buyer/postfach/actions";

export function MailFeaturesToggle({ on, readOnly }: { on: boolean; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toggle = (next: boolean) =>
    start(async () => {
      setError(null);
      const r = await setMailFeaturesAction(next);
      if (!r.ok) setError(r.error ?? "Speichern hat nicht geklappt.");
      router.refresh();
    });
  return (
    <div className="space-y-1" data-mail-features>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={on} disabled={pending || readOnly} onChange={(e) => toggle(e.target.checked)} />
        <span>
          <span className="block font-semibold">E-Mail-Funktionen nutzen</span>
          <span className="block text-xs text-[color:var(--muted)]">
            {on
              ? "Ausschalten, wenn Ihre Gesellschaft nicht erlaubt, das dienstliche Postfach mit anderen Programmen zu verbinden. Dann blendet die App alle E-Mail-Knöpfe aus."
              : "Ausgeschaltet: Die App blendet alle E-Mail-Knöpfe aus. Einschalten, sobald Sie Ihr Postfach verbinden dürfen."}
          </span>
        </span>
      </label>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
