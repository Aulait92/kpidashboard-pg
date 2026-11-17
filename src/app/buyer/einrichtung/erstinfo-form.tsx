"use client";

// Einrichtung „Erstinformation“: alle Pflichtangaben nach § 15 Abs. 1 VersVermV, vorausgefüllt aus Angebot und
// Impressum, der Vermittler prüft sie nur und bestätigt (Ole, 15.11.2026). Alternativ eigenes PDF (z. B. Vorlage
// der Gesellschaft), das dann als Erstinformation an Leads geht (lib/erstinformation.ts).

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FileDrop } from "@/components/ui/file-drop";
import {
  ERSTINFO_MAX_BYTES,
  TIPPGEBER_HINWEIS,
  VERGUETUNG_LABEL,
  VERMITTLER_STATUS,
  verguetungStandard,
  vermittlerStatusLabel,
  type ErstinfoDaten,
  type Verguetung,
  type VermittlerStatus,
} from "@/lib/erstinformation-shared";
import { saveErstinfoAction, type ErstinfoState } from "./actions";

const input =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";
const area =
  "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";
const box = "rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3";

type Impressum = { companyName: string | null; address: string | null; registerType: string | null; registerNumber: string | null; status: string | null } | null;

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-xs text-[color:var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export function ErstinfoForm({
  initial,
  impressum = null,
  confirmed = false,
  readOnly,
}: {
  initial: { status: string | null; registerNummer: string | null; fileName: string | null; daten: ErstinfoDaten; anrede?: string | null };
  /** Angaben aus dem Impressum der Website (vorausgefüllt, zum Gegenprüfen) */
  impressum?: Impressum;
  /** Schon einmal bestätigt bzw. gespeichert */
  confirmed?: boolean;
  readOnly: boolean;
}) {
  const d = initial.daten;
  const [state, action, pending] = useActionState<ErstinfoState, FormData>(saveErstinfoAction, {});
  const [status, setStatus] = useState(initial.status ?? impressum?.status ?? "");
  const [verguetung, setVerguetung] = useState<Verguetung[]>(d.verguetung);
  const [beteiligungen, setBeteiligungen] = useState(!!d.beteiligungen);
  const fromImpressum = !!impressum && !confirmed;
  const tippgeber = status === "tippgeber" || (!!state.tippgeber && status === "");
  const changeStatus = (s: string) => {
    setStatus(s);
    // Vergütung folgt dem Status, solange nur der Vorschlag gewählt ist
    if (s !== "tippgeber" && verguetung.length === 1 && verguetungStandard(d.status).includes(verguetung[0])) setVerguetung(verguetungStandard(s as VermittlerStatus));
  };
  const toggleVerguetung = (v: Verguetung) => setVerguetung((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  return (
    <form action={action} className="min-w-0 space-y-4" data-erstinfo-form>
      {impressum && (impressum.companyName || impressum.address || impressum.registerType) && fromImpressum ? (
        <p className="text-sm text-[color:var(--muted)]" data-erstinfo-impressum>
          Wir haben die Angaben aus Ihrem Impressum und Ihrem Angebot vorausgefüllt. Bitte kurz prüfen und bestätigen.
        </p>
      ) : null}
      <details className={box} open={!status}>
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
                <input type="radio" name="status" value={s.key} checked={status === s.key} onChange={() => changeStatus(s.key)} disabled={readOnly} className="mt-1" />
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
          <details className={`min-w-0 ${box}`} open={!!initial.fileName || status === "vertreter"} data-erstinfo-upload>
            <summary className="cursor-pointer text-sm font-medium">Erstinformation Ihrer Gesellschaft als PDF hochladen (freiwillig)</summary>
            <p className="mt-2 text-xs text-[color:var(--muted)] [overflow-wrap:anywhere]">
              {status === "vertreter"
                ? "Als Ausschließlichkeitsvertreter haben Sie meist eine fertige Erstinformation von Ihrem Versicherer. Laden Sie dieses PDF hoch, dann schickt Ihr Assistent genau dieses Dokument. "
                : "Haben Sie schon eine fertige Erstinformation, laden Sie sie hier hoch, dann schickt Ihr Assistent genau dieses Dokument. "}
              Ohne PDF erstellen wir die Erstinformation aus den Angaben unten.
            </p>
            <div className="mt-3 min-w-0">
              {initial.fileName ? (
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--muted)]" data-erstinfo-datei>
                  <p className="min-w-0 [overflow-wrap:anywhere]">
                    Hochgeladen: <b>{initial.fileName}</b>. Eine neue Datei ersetzt sie.
                  </p>
                  <label className="inline-flex shrink-0 items-center gap-1.5">
                    <input type="checkbox" name="removeFile" value="1" disabled={readOnly} /> entfernen
                  </label>
                </div>
              ) : null}
              <FileDrop
                id="pdf"
                name="pdf"
                accept="application/pdf,.pdf"
                maxBytes={ERSTINFO_MAX_BYTES}
                label="PDF auswählen"
                pendingLabel="Wird gespeichert …"
                disabled={readOnly}
                className="mt-2"
              />
            </div>
          </details>

          <fieldset className={`min-w-0 ${box}`} disabled={readOnly}>
            <legend className="px-1 text-sm font-medium">Angaben in der Erstinformation</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="name" label="Vor- und Nachname">
                <div className="flex gap-2">
                  {/* Anrede nur für den Assistenten („Herr Kannapinn zeigt Ihnen …“), Ole 17.11.2026 */}
                  <select id="anrede" name="anrede" aria-label="Anrede" className={`${input} w-28 shrink-0`} defaultValue={initial.anrede ?? ""}>
                    <option value="">Anrede</option>
                    <option value="Herr">Herr</option>
                    <option value="Frau">Frau</option>
                  </select>
                  <input id="name" name="name" className={`${input} min-w-0 flex-1`} defaultValue={d.name} autoComplete="name" />
                </div>
              </Field>
              <Field id="firma" label="Firma (falls vorhanden)">
                <input id="firma" name="firma" className={input} defaultValue={d.firma} autoComplete="organization" />
              </Field>
              <div className="sm:col-span-2">
                <Field id="anschrift" label="Betriebliche Anschrift">
                  <textarea id="anschrift" name="anschrift" rows={2} className={area} defaultValue={d.anschrift} />
                </Field>
              </div>
              <Field id="telefon" label="Telefon (freiwillig)">
                <input id="telefon" name="telefon" className={input} defaultValue={d.telefon} autoComplete="tel" />
              </Field>
              <Field id="email" label="E-Mail (freiwillig)">
                <input id="email" name="email" type="email" className={input} defaultValue={d.email} autoComplete="email" />
              </Field>

              {status === "vertreter" ? (
                <div className="sm:col-span-2">
                  <Field id="versicherer" label="Für welchen Versicherer sind Sie tätig?" hint="Genau ein Versicherer, am besten mit vollem Namen.">
                    <input id="versicherer" name="versicherer" className={input} placeholder="z. B. Allianz Versicherungs-AG" defaultValue={d.versicherer[0] ?? ""} />
                  </Field>
                </div>
              ) : null}
              {status === "mehrfachvertreter" ? (
                <div className="space-y-3 sm:col-span-2">
                  <fieldset>
                    <legend className="text-sm font-medium">Art Ihrer Tätigkeit</legend>
                    <label className="mt-1 flex gap-2 text-[15px]">
                      <input type="radio" name="erlaubnis" value="abs1" defaultChecked={d.erlaubnis !== "abs7"} className="mt-1" />
                      <span>Mit eigener Erlaubnis nach § 34d Abs. 1 GewO</span>
                    </label>
                    <label className="mt-1 flex gap-2 text-[15px]">
                      <input type="radio" name="erlaubnis" value="abs7" defaultChecked={d.erlaubnis === "abs7"} className="mt-1" />
                      <span>Gebunden nach § 34d Abs. 7 GewO (Produkte der Versicherer stehen nicht in Konkurrenz, die Versicherer haften für Sie)</span>
                    </label>
                  </fieldset>
                  <Field id="versicherer" label="Für welche Versicherer sind Sie tätig?" hint="Einen Versicherer je Zeile.">
                    <textarea id="versicherer" name="versicherer" rows={3} className={area} placeholder={"z. B. Gothaer Allgemeine Versicherung AG\nHallesche Krankenversicherung a. G."} defaultValue={d.versicherer.join("\n")} />
                  </Field>
                </div>
              ) : null}

              <Field id="registerNummer" label="Registernummer (IHK-Vermittlerregister)">
                <input id="registerNummer" name="registerNummer" className={input} placeholder="D-XXXX-XXXXX-XX" defaultValue={initial.registerNummer ?? d.registerNummer} />
              </Field>
              <Field id="ihk" label="Zuständige IHK" hint="Bei der Sie registriert sind, steht auf Ihrer Urkunde bzw. im Vermittlerregister.">
                <input id="ihk" name="ihk" className={input} placeholder="z. B. IHK München und Oberbayern" defaultValue={d.ihk} />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="text-sm font-medium">Bieten Sie eine Beratung an?</legend>
                <div className="mt-1 flex gap-4 text-[15px]">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="beratung" value="ja" defaultChecked={d.beratung} /> Ja
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="beratung" value="nein" defaultChecked={!d.beratung} /> Nein
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">Art Ihrer Vergütung</legend>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
                  {(Object.keys(VERGUETUNG_LABEL) as Verguetung[]).map((v) => (
                    <label key={v} className="flex items-center gap-1.5">
                      <input type="checkbox" name="verguetung" value={v} checked={verguetung.includes(v)} onChange={() => toggleVerguetung(v)} /> {VERGUETUNG_LABEL[v]}
                    </label>
                  ))}
                </div>
                <label className="mt-2 flex gap-2 text-sm">
                  <input type="checkbox" name="zuwendungen" value="1" defaultChecked={d.zuwendungen} className="mt-0.5" />
                  <span>Ich erhalte daneben andere Zuwendungen von Versicherern (z. B. geldwerte Vorteile, Sachleistungen)</span>
                </label>
              </fieldset>
            </div>

            <div className="mt-4">
              <label className="flex gap-2 text-sm">
                <input type="checkbox" name="beteiligungenJa" value="1" checked={beteiligungen} onChange={(ev) => setBeteiligungen(ev.target.checked)} className="mt-0.5" />
                <span>Es bestehen Beteiligungen von über 10 % (von mir an einem Versicherer oder von einem Versicherer an mir)</span>
              </label>
              {beteiligungen ? (
                <textarea
                  name="beteiligungen"
                  rows={2}
                  className={`${area} mt-2`}
                  placeholder="Bitte kurz beschreiben, z. B. Beteiligung der Muster Versicherung AG mit 25 % am Kapital"
                  defaultValue={d.beteiligungen ?? ""}
                  aria-label="Beteiligungen beschreiben"
                />
              ) : (
                <p className="mt-1 text-xs text-[color:var(--muted)]">Ohne Haken steht in der Erstinformation: keine Beteiligungen über 10 %.</p>
              )}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending || readOnly || !status}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Angaben bestätigen
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
