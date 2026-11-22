"use client";

// Test-Einladung im Kalenderschritt (Go-live-Prüfung 20./21.11.2026, Allianz-Generalvertretung): Mit dem App-Kalender
// kommen Termine als Einladung per Mail, oft an eine Konzernadresse. Filtert deren IT den Absender, fehlen Termine
// unbemerkt. Darum einmal testen; der Schritt gilt erst nach „Ist angekommen“ als erledigt.

import { useActionState, useState } from "react";
import { Check, CheckCircle2, Copy } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { einladungAngekommenAction, testEinladungAction, type TestEinladungState } from "./actions";

export function TestEinladung({ absender, angekommen, readOnly }: { absender: string; angekommen: boolean; readOnly: boolean }) {
  const [sent, sendAction, sending] = useActionState<TestEinladungState, FormData>(testEinladungAction, {});
  const [conf, confAction, confirming] = useActionState<TestEinladungState, FormData>(einladungAngekommenAction, {});
  const [kopiert, setKopiert] = useState(false);
  if (angekommen || conf.angekommen)
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700" data-test-einladung-ok>
        <CheckCircle2 className="h-4 w-4" /> Test-Einladung ist angekommen.
      </p>
    );
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(absender);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      /* Zwischenablage nicht verfügbar */
    }
  };
  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 px-4 py-3 text-[15px]" data-test-einladung>
      <p className="font-medium">Kommen Ihre Termine an? Einmal testen.</p>
      {sent.ok ? (
        <>
          <p className="text-sm">
            Geschickt an <b className="break-all">{sent.to}</b>.
          </p>
          <form action={confAction}>
            <button type="submit" disabled={readOnly || confirming} className={buttonClass("primary", "md")} data-test-einladung-angekommen>
              Ist angekommen
            </button>
          </form>
          <p className="text-sm" data-test-einladung-it>
            Nichts angekommen? Bitten Sie Ihre IT,{" "}
            <span className="inline-flex flex-wrap items-center gap-1 align-middle">
              <b className="break-all">{absender}</b>
              <button
                type="button"
                onClick={kopieren}
                className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-xs font-semibold"
                aria-label="Absender kopieren"
              >
                {kopiert ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {kopiert ? "Kopiert" : "Kopieren"}
              </button>
            </span>{" "}
            zuzulassen.
          </p>
        </>
      ) : null}
      <form action={sendAction}>
        <button type="submit" disabled={readOnly || sending} className={buttonClass(sent.ok ? "ghost" : "secondary", "md")} data-test-einladung-schicken>
          {sending ? "Wird geschickt …" : sent.ok ? "Noch einmal schicken" : "Test-Einladung schicken"}
        </button>
      </form>
      {sent.error || conf.error ? (
        <p className="text-sm text-rose-700" role="alert">
          {sent.error ?? conf.error}
        </p>
      ) : null}
    </div>
  );
}
