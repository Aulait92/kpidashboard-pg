"use client";

// Einrichtung „Erstinformation“: Angaben aus dem Impressum vorausgefüllt, der Vermittler prüft sie nur (Ole,
// 15.11.2026). Status nach § 34d GewO, Registernummer; eigenes PDF oder Link freiwillig (lib/erstinformation.ts).

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { TIPPGEBER_HINWEIS, VERMITTLER_STATUS, vermittlerStatusLabel } from "@/lib/erstinformation-shared";
import { saveErstinfoAction, type ErstinfoState } from "./actions";

const input =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

type Impressum = { companyName: string | null; address: string | null; registerType: string | null; registerNumber: string | null; status: string | null } | null;

export function ErstinfoForm({
  initial,
  impressum = null,
  confirmed = false,
  readOnly,
}: {
  initial: { status: string | null; registerNummer: string | null; url: string | null; fileName: string | null };
  /** Angaben aus dem Impressum der Website (vorausgefüllt, zum Gegenprüfen) */
  impressum?: Impressum;
  /** Schon einmal bestätigt bzw. gespeichert */
  confirmed?: boolean;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState<ErstinfoState, FormData>(saveErstinfoAction, {});
  const [status, setStatus] = useState(initial.status ?? impressum?.status ?? "");
  const fromImpressum = !!impressum && !confirmed;
  const tippgeber = status === "tippgeber" || (!!state.tippgeber && status === "");
  return (
    <form action={action} className="space-y-4" data-erstinfo-form>
      {impressum && (impressum.companyName || impressum.address || impressum.registerType) ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken,#f8fafc)] px-4 py-3 text-sm" data-erstinfo-impressum>
          <p className="font-medium">Aus Ihrem Impressum übernommen{fromImpressum ? ", bitte kurz prüfen" : ""}:</p>
          <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1">
            {impressum.companyName ? (
              <>
                <dt className="text-[color:var(--muted)]">Name</dt>
                <dd>{impressum.companyName}</dd>
              </>
            ) : null}
            {impressum.address ? (
              <>
                <dt className="text-[color:var(--muted)]">Anschrift</dt>
                <dd className="whitespace-pre-line">{impressum.address}</dd>
              </>
            ) : null}
            {impressum.registerType ? (
              <>
                <dt className="text-[color:var(--muted)]">Status</dt>
                <dd>{impressum.registerType}</dd>
              </>
            ) : null}
          </dl>
          <p className="mt-2 text-xs text-[color:var(--muted)]">Stimmt etwas nicht? Dann bitte im Impressum Ihrer Website korrigieren oder uns kurz schreiben.</p>
        </div>
      ) : null}
      <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3" open={!status}>
        <summary className="cursor-pointer text-sm font-medium">
          Ihr Status: {status && status !== "tippgeber" ? vermittlerStatusLabel(status) : "bitte wählen"}
          {status ? <span className="font-normal text-[color:var(--muted)]"> (aus Ihrem Angebot, nur bei Bedarf ändern)</span> : null}
        </summary>
      <fieldset className="mt-3">
        <legend className="sr-only">Ihr Status als Vermittler</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {VERMITTLER_STATUS.map((s) => (
            <label
              key={s.key}
              className={`flex cursor-pointer gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-[15px] ${
                status === s.key ? "border-[color:var(--brand)] bg-[color:var(--surface-sunken,#f8fafc)]" : "border-[color:var(--border)]"
              }`}
            >
              <input type="radio" name="status" value={s.key} checked={status === s.key} onChange={() => setStatus(s.key)} disabled={readOnly} className="mt-1" />
              <span>
                <span className="font-medium">{s.label}</span>
                <span className="block text-xs text-[color:var(--muted)]">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-[color:var(--muted)]">Der Status bestimmt auch die vorausgefüllten Provisionssätze (Makler oder Vertreter).</p>
      </fieldset>
      </details>
      {tippgeber ? (
        <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-tippgeber-hinweis>
          {TIPPGEBER_HINWEIS}
        </p>
      ) : (
        <>
          <div>
            <label className="text-sm font-medium" htmlFor="registerNummer">
              Registernummer (IHK-Vermittlerregister)
            </label>
            <input id="registerNummer" name="registerNummer" className={`${input} mt-1`} placeholder="D-XXXX-XXXXX-XX" defaultValue={initial.registerNummer ?? ""} disabled={readOnly} />
          </div>
          <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3" open={!!(initial.fileName || initial.url)}>
            <summary className="cursor-pointer text-sm font-medium">Eigene Erstinformation hinterlegen (freiwillig)</summary>
            <p className="mt-2 text-xs text-[color:var(--muted)]">
              Ohne eigene Datei erstellen wir die Erstinformation aus den Angaben oben. Haben Sie eine eigene (z. B. von Ihrer Gesellschaft), nutzt Ihr Assistent diese.
            </p>
            <div className="mt-3">
              <label className="text-sm font-medium" htmlFor="pdf">
                Erstinformation als PDF
              </label>
              {initial.fileName ? (
                <p className="mt-1 text-sm text-[color:var(--muted)]">
                  Hochgeladen: <b>{initial.fileName}</b>. Eine neue Datei ersetzt sie.{" "}
                  <label className="ml-2 inline-flex items-center gap-1">
                    <input type="checkbox" name="removeFile" value="1" disabled={readOnly} /> entfernen
                  </label>
                </p>
              ) : null}
              <input id="pdf" name="pdf" type="file" accept="application/pdf,.pdf" className="mt-1 block w-full text-sm" disabled={readOnly} />
            </div>
            <div className="mt-3">
              <label className="text-sm font-medium" htmlFor="url">
                oder Link zu Ihrer Erstinformation
              </label>
              <input id="url" name="url" className={`${input} mt-1`} placeholder="https://ihre-agentur.de/erstinformation" defaultValue={initial.url ?? ""} disabled={readOnly} />
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending || readOnly || !status}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Speichern
            </button>
            {state.ok ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Gespeichert. Vielen Dank!
              </p>
            ) : null}
            {state.error ? <p className="text-sm font-medium text-rose-700">{state.error}</p> : null}
          </div>
        </>
      )}
    </form>
  );
}
