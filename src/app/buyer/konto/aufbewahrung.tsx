"use client";

// „Ihre Daten nach Vertragsende“: Aufbewahrung ansehen und ändern (24 Monate, 3 Monate, sofort), jederzeit bis zur
// Löschung, auch zurück auf 24 Monate (lib/ruhend-shared.ts). Im Konto nach der Kündigung und auf der Seite für
// ruhende Konten (dort kann eine frühere Wahl sofort löschen, mit Bestätigung).

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { RETENTION_CHOICES, retentionLastDayIso, type RetentionChoice } from "@/lib/ruhend-shared";
import type { RetentionState } from "./actions";

const fmt = (iso: string) => iso.split("-").reverse().join(".");

export function Aufbewahrung({
  endIso,
  choice,
  todayIso,
  dormant = false,
  readOnly = false,
  action,
}: {
  /** Letzter Vertragstag */
  endIso: string;
  choice: RetentionChoice;
  todayIso: string;
  dormant?: boolean;
  readOnly?: boolean;
  action: (prev: RetentionState, fd: FormData) => Promise<RetentionState>;
}) {
  const [state, formAction, pending] = useActionState<RetentionState, FormData>(action, {});
  const [picked, setPicked] = useState<RetentionChoice>(choice);
  const lastDay = (c: RetentionChoice) => retentionLastDayIso(endIso, c);
  // Ruhend und die gewählte Frist ist schon vorbei: Löschung sofort (mit Bestätigung)
  const deletesNow = dormant && lastDay(picked) < todayIso;
  const current = lastDay(choice);
  return (
    <form action={formAction} className="space-y-3 text-sm" id="aufbewahrung" data-aufbewahrung>
      <p data-aufbewahrung-stand>
        {choice === "sofort" ? (
          <>Sie haben gewählt: Löschung direkt nach Vertragsende am <b>{fmt(endIso)}</b>.</>
        ) : (
          <>
            Wir bewahren Ihre Daten bis einschließlich <b>{fmt(current)}</b> auf und löschen sie danach endgültig.
          </>
        )}{" "}
        Sie können das jederzeit ändern.
      </p>
      <fieldset className="space-y-2">
        {RETENTION_CHOICES.map((r) => {
          const until = lastDay(r.key);
          const passed = dormant && until < todayIso;
          return (
            <label key={r.key} className="flex items-start gap-2">
              <input type="radio" name="retention" value={r.key} checked={picked === r.key} onChange={() => setPicked(r.key)} disabled={readOnly} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="font-medium">{r.label}</span>
                <span className="block text-[color:var(--muted)]">
                  {r.key === "sofort" ? (dormant ? "Ihre Daten werden sofort gelöscht." : `Löschung nach dem ${fmt(endIso)}.`) : passed ? "Diese Frist ist schon vorbei: Ihre Daten werden sofort gelöscht." : `Aufbewahrung bis ${fmt(until)}.`}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {deletesNow ? (
        <label className="flex items-start gap-2 rounded-[var(--radius-md)] bg-rose-50 px-3 py-2 text-rose-900 ring-1 ring-rose-200">
          <input type="checkbox" name="confirmNow" className="mt-0.5 h-4 w-4" required />
          <span>Ich habe meine Daten heruntergeladen oder brauche sie nicht mehr. Bitte jetzt endgültig löschen. Eine Wiederherstellung ist danach nicht möglich.</span>
        </label>
      ) : null}
      {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
      {state.ok && state.message ? <p className="font-medium text-emerald-700">{state.message}</p> : null}
      <button type="submit" className={buttonClass(deletesNow ? "danger" : "secondary", "md")} disabled={pending || readOnly || (picked === choice && !deletesNow)} data-aufbewahrung-speichern>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {deletesNow ? "Jetzt endgültig löschen" : "Aufbewahrung speichern"}
      </button>
    </form>
  );
}
