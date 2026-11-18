"use client";

// Einrichtung ohne Ole (18.11.2026): Testlead an das eigene Handy, Logo bestätigen, Versicherer wählen.

import { useActionState, useState, useTransition } from "react";
import { Check, Send, X } from "lucide-react";
import { Button, buttonClass } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { gesellschaftenEinrichtungAction, testleadSelbstAction, type TestleadSelbstState } from "./actions";
import { logoBestaetigenAction } from "@/app/buyer/einstellungen/branding/actions";

export function TestleadSelbst({ phone, readOnly, schonGetestet }: { phone: string; readOnly: boolean; schonGetestet: boolean }) {
  const [state, action, pending] = useActionState<TestleadSelbstState, FormData>(testleadSelbstAction, {});
  if (state.ok) {
    return (
      <p className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testlead-gesendet>
        Unterwegs: In einer Minute schreibt Ihnen Ihr Assistent per WhatsApp. Antworten Sie wie ein Kunde und buchen Sie einen Termin. Der Testlead steht mit
        dem Abzeichen „Test“ unter Heute und zählt nirgends mit.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-2" data-testlead-selbst>
      <label htmlFor="testlead-phone" className="block text-sm font-medium">
        {schonGetestet ? "Noch einmal testen" : "Jetzt selbst testen: Ihr Assistent schreibt Sie an wie einen neuen Lead"}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="testlead-phone"
          name="phone"
          type="tel"
          defaultValue={phone}
          placeholder="Ihre Handynummer"
          autoComplete="tel"
          className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-base"
        />
        <button type="submit" disabled={readOnly || pending} className={buttonClass(schonGetestet ? "secondary" : "primary", "md", "h-11")}>
          <Send className="h-4 w-4" /> {pending ? "Wird gesendet …" : "Testlead an mich"}
        </button>
      </div>
      {state.error ? <p className="text-sm font-medium text-rose-700">{state.error}</p> : null}
    </form>
  );
}

export function LogoZeile({ dataUri, bestaetigt, readOnly }: { dataUri: string | null; bestaetigt: boolean; readOnly: boolean }) {
  const toast = useToast();
  const [ok, setOk] = useState(bestaetigt);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] pt-4 text-sm" data-logo-zeile>
      {dataUri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUri} alt="Ihr Logo" className="h-10 w-auto max-w-[140px] rounded border border-[color:var(--border)] bg-white object-contain p-1" />
      ) : null}
      <span className="min-w-0 flex-1">
        {dataUri ? (ok ? "Ihr Logo steht auf Präsentation und Angebot." : "Ihr Logo für Präsentation und Angebot (von Ihrer Webseite):") : "Noch kein Logo für Präsentation und Angebot."}
      </span>
      {dataUri && !ok && !readOnly ? (
        <Button
          size="md"
          icon={Check}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await logoBestaetigenAction(true);
              if (r.ok) setOk(true);
              else toast.show({ message: r.error, tone: "error" });
            })
          }
          data-logo-passt
        >
          Passt, ich darf es nutzen
        </Button>
      ) : null}
      <a href="/buyer/einstellungen/branding" className="font-medium text-[color:var(--brand)] hover:underline">
        {dataUri ? "Ändern" : "Logo hinzufügen"}
      </a>
    </div>
  );
}

/**
 * Versicherer für die Tarifvorschläge (Ole, 18.11.2026: Kunden sagen „Versicherer“, nicht „Gesellschaft“). Makler und
 * Mehrfachvertreter wählen mehrere; ein Ausschließlichkeitsvertreter genau einen (kein „Hinzufügen“, sobald er steht).
 */
export function GesellschaftenWahl({ alle, gewaehlt: start0, readOnly, vermittlerTyp }: { alle: { key: string; name: string }[]; gewaehlt: string[]; readOnly: boolean; vermittlerTyp: string }) {
  const nurEiner = vermittlerTyp !== "makler" && vermittlerTyp !== "mehrfachvertreter";
  const toast = useToast();
  const [gewaehlt, setGewaehlt] = useState(start0);
  const [pending, start] = useTransition();
  const name = (k: string) => alle.find((g) => g.key === k)?.name ?? k;
  const speichern = (keys: string[]) => {
    setGewaehlt(keys);
    start(async () => {
      const r = await gesellschaftenEinrichtungAction(keys);
      if (r.error) toast.show({ message: r.error, tone: "error" });
    });
  };
  return (
    <div className="mt-4 border-t border-[color:var(--border)] pt-4 text-sm" data-gesellschaften-wahl>
      <p className="mb-2 font-medium">{nurEiner ? "Für welchen Versicherer sind Sie tätig?" : "Mit welchen Versicherern arbeiten Sie?"}</p>
      <div className="flex flex-wrap items-center gap-2">
        {gewaehlt.map((k) => (
          <span key={k} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-sunken)] pl-3 pr-1">
            {name(k)}
            {!readOnly ? (
              <button type="button" aria-label={`${name(k)} entfernen`} disabled={pending} onClick={() => speichern(gewaehlt.filter((x) => x !== k))} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </span>
        ))}
        {!readOnly && gewaehlt.length < (nurEiner ? 1 : 12) ? (
          <select
            value=""
            disabled={pending}
            onChange={(e) => e.target.value && speichern([...gewaehlt, e.target.value])}
            className="h-9 rounded-full border border-dashed border-[color:var(--border-strong)] bg-white px-3 text-sm"
            aria-label="Versicherer hinzufügen"
            data-gesellschaft-dazu
          >
            <option value="">+ Versicherer hinzufügen</option>
            {alle
              .filter((g) => !gewaehlt.includes(g.key))
              .map((g) => (
                <option key={g.key} value={g.key}>
                  {g.name}
                </option>
              ))}
          </select>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-[color:var(--muted)]">Deren Tarife schlägt Ihnen die App in der Terminvorbereitung zuerst vor.</p>
    </div>
  );
}
