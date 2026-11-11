"use client";

// Verfügbarkeit einstellen: Quelle wählen (Google/Microsoft, ICS-Link,
// Allianz-Online-Kalender), Lead-Zeiten und „Zeit blockieren".
// Die Server-Actions kommen als Props (Kundenbereich bzw. Admin mit customerId).

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import type { SourceResult } from "@/lib/calendar/sources";

type FormAction = (prev: SourceResult, fd: FormData) => Promise<SourceResult>;
type PlainAction = (fd: FormData) => Promise<void>;

const input =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";
const chip =
  "block min-w-[3.25rem] rounded-full border border-[color:var(--border)] bg-white px-3 py-1.5 text-center text-sm transition peer-checked:border-[color:var(--brand)] peer-checked:bg-[#EFF6FF] peer-checked:font-semibold peer-checked:text-[color:var(--brand)] peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--brand)]/30";

function Result({ state }: { state: SourceResult }) {
  if (state.error) return <p className="text-sm font-medium text-rose-700">{state.error}</p>;
  if (state.ok)
    return (
      <p className="flex items-start gap-1.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {state.info ?? "Gespeichert."}
      </p>
    );
  return null;
}

function Submit({ pending, disabled, children, variant = "primary" }: { pending: boolean; disabled?: boolean; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <button type="submit" disabled={pending || disabled} className={buttonClass(variant, "md")}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

// ─── Lead-Zeiten ────────────────────────────────────────────────────────

const DAYS: Array<[number, string]> = [
  [1, "Mo"],
  [2, "Di"],
  [3, "Mi"],
  [4, "Do"],
  [5, "Fr"],
  [6, "Sa"],
  [0, "So"],
];
const GRID = Array.from({ length: 12 }, (_, i) => `${String(8 + i).padStart(2, "0")}:00`);

export function LeadTimesForm({
  initial,
  action,
  readOnly,
  hidden,
  source = "none",
}: {
  initial: { weekdays: number[]; times: string[] };
  action: FormAction;
  readOnly: boolean;
  hidden?: Record<string, string>;
  /**
   * Welche Quelle zeigt uns die belegten Zeiten? Davon hängt ab, wie die
   * Zeiten im Allianz-Kalender freigehalten werden (eine echte Blockierung
   * sähen wir über ICS bzw. den Online-Kalender sonst als belegt).
   */
  source?: "none" | "ics" | "allianz";
}) {
  const [state, formAction, pending] = useActionState<SourceResult, FormData>(action, {});
  const times = [...new Set([...GRID, ...initial.times])].sort();
  return (
    <form action={formAction} className="space-y-4">
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <fieldset>
        <legend className="text-sm font-medium">Wochentage</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAYS.map(([d, l]) => (
            <label key={d} className="cursor-pointer">
              <input type="checkbox" name={`day_${d}`} defaultChecked={initial.weekdays.includes(d)} className="peer sr-only" />
              <span className={chip}>{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Uhrzeiten</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {times.map((t) => (
            <label key={t} className="cursor-pointer">
              <input type="checkbox" name={`time_${t}`} defaultChecked={initial.times.includes(t)} className="peer sr-only" />
              <span className={chip}>{t.replace(/^0/, "")}</span>
            </label>
          ))}
        </div>
        <label className="mt-3 flex max-w-xs items-center gap-2 text-sm text-[color:var(--muted)]">
          Andere Uhrzeit
          <input name="extraTime" type="time" step={300} className={`${input} h-9 w-32`} />
        </label>
      </fieldset>
      <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken,#f8fafc)] px-4 py-3 text-sm">
        {source === "allianz"
          ? "Halten Sie diese Zeiten in Ihrem Allianz-Kalender frei. Blocken Sie sie dort bitte nicht, sonst zeigt Ihr Online-Kalender sie als belegt und wir können sie nicht anbieten."
          : source === "ics"
            ? "Tragen Sie diese Zeiten als Serie „Leadtermine“ in Ihren Allianz-Kalender ein und stellen Sie „Anzeigen als: Frei“ ein. So bucht dort niemand anderes hinein, und wir sehen die Zeiten weiter als frei."
            : "Halten Sie diese Zeiten in Ihrem Kalender frei. Wenn Sie sie dort markieren möchten (z. B. als Serie „Leadtermine“), dann nur mit „Anzeigen als: Frei“. Sonst gelten sie als belegt und wir können sie nicht anbieten."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Submit pending={pending} disabled={readOnly}>
          Zeiten speichern
        </Submit>
        <Result state={state} />
      </div>
    </form>
  );
}

// ─── Zeit blockieren ────────────────────────────────────────────────────

const fmtBlock = (start: Date, end: Date) => {
  const day = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(start);
  const t = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);
  return `${day}, ${t(start)} bis ${t(end)} Uhr`;
};

export function BlockTimes({
  blocks,
  addAction,
  deleteAction,
  readOnly,
  hidden,
}: {
  blocks: Array<{ id: string; startsAt: Date; endsAt: Date; note: string | null }>;
  addAction: FormAction;
  deleteAction: PlainAction;
  readOnly: boolean;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<SourceResult, FormData>(addAction, {});
  const hiddenInputs = hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null;
  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        {hiddenInputs}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <label className="text-sm font-medium">
            Datum
            <input name="date" type="date" required className={`${input} mt-1`} />
          </label>
          <label className="text-sm font-medium">
            von
            <input name="from" type="time" required step={300} className={`${input} mt-1`} />
          </label>
          <label className="text-sm font-medium">
            bis
            <input name="to" type="time" required step={300} className={`${input} mt-1`} />
          </label>
        </div>
        <input name="note" placeholder="Notiz (optional), z. B. Arzttermin" maxLength={120} className={input} />
        <div className="flex flex-wrap items-center gap-3">
          <Submit pending={pending} disabled={readOnly} variant="secondary">
            Zeit blockieren
          </Submit>
          <Result state={state} />
        </div>
      </form>
      {blocks.length ? (
        <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-[15px]">
              <span className="min-w-0 flex-1">
                {fmtBlock(new Date(b.startsAt), new Date(b.endsAt))}
                {b.note ? <span className="block truncate text-sm text-[color:var(--muted)]">{b.note}</span> : null}
              </span>
              <form action={deleteAction}>
                {hiddenInputs}
                <input type="hidden" name="id" value={b.id} />
                <button type="submit" disabled={readOnly} className={buttonClass("ghost", "sm")} aria-label="Blockierung löschen">
                  <Trash2 className="h-4 w-4" /> Löschen
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[color:var(--muted)]">Keine blockierten Zeiten.</p>
      )}
    </div>
  );
}

// ─── Quellen ────────────────────────────────────────────────────────────

export type SourceStatus = {
  native: { connected: boolean; label: string | null };
  hasIcs: boolean;
  allianz: { orgName: string; templateName: string; durationMin: number; lastError: string | null } | null;
};

export function AllianzForm({ action, readOnly, hidden }: { action: FormAction; readOnly: boolean; hidden?: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<SourceResult, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <label className="block text-sm font-medium" htmlFor="vertretung">
        Link Ihrer Vertreter-Seite oder Ihre Vertreternummer
      </label>
      <input id="vertretung" name="vertretung" className={input} placeholder="vertretung.allianz.de/vorname.nachname" autoComplete="off" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand)]" />
        <span>Ich stimme zu, dass performancegrowth meine freien Termine aus meinem Allianz-Online-Kalender abruft.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit pending={pending} disabled={readOnly}>
          Allianz-Online-Kalender verbinden
        </Submit>
        <Result state={state} />
      </div>
    </form>
  );
}

export function IcsForm({ action, readOnly, hidden }: { action: FormAction; readOnly: boolean; hidden?: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<SourceResult, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <ol className="list-decimal space-y-1.5 pl-5 text-[15px]">
        <li>Outlook im Browser öffnen, oben rechts auf das Zahnrad (Einstellungen).</li>
        <li>
          <b>Kalender → Freigegebene Kalender → Kalender veröffentlichen</b>.
        </li>
        <li>
          Ihren Kalender und <b>„Kann sehen, wann ich beschäftigt bin“</b> wählen, dann <b>Veröffentlichen</b>.
        </li>
        <li>
          Den <b>ICS-Link</b> kopieren und hier einfügen.
        </li>
      </ol>
      <input name="icsUrl" className={input} placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics" autoComplete="off" />
      <p className="text-sm text-[color:var(--muted)]">Wir sehen damit nur, wann Sie belegt sind, keine Inhalte.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Submit pending={pending} disabled={readOnly}>
          Link speichern
        </Submit>
        <Result state={state} />
      </div>
    </form>
  );
}

/**
 * „Ihr Kalender“ (Inhaber = Kalender des Kundenkontos): Google/Outlook verbinden
 * oder trennen. Darunter zugeklappt „Andere Quelle für freie Zeiten“ (ICS-Link,
 * Allianz-Online-Kalender) für Fälle, in denen wir den Kalender nicht direkt
 * lesen dürfen; Termine landen trotzdem im verbundenen Google-/Outlook-Kalender.
 */
export function SourcePicker({
  status,
  readOnly,
  connectLinks,
  icsAction,
  removeIcsAction,
  allianzAction,
  disconnectAllianzAction,
  disconnectNativeAction,
  hidden,
  allianzOption = true,
}: {
  status: SourceStatus;
  readOnly: boolean;
  connectLinks: { google: string; microsoft: string };
  icsAction: FormAction;
  removeIcsAction: PlainAction;
  allianzAction: FormAction;
  disconnectAllianzAction: PlainAction;
  /** Google/Outlook-Kalender trennen (optional). */
  disconnectNativeAction?: PlainAction;
  hidden?: Record<string, string>;
  /** Allianz-Online-Kalender anbieten (nicht für Makler, außer schon verbunden). */
  allianzOption?: boolean;
}) {
  const showAllianz = allianzOption || !!status.allianz;
  const [way, setWay] = useState<"ics" | "allianz">(status.allianz ? "allianz" : status.hasIcs || !showAllianz ? "ics" : "allianz");
  const hiddenInputs = hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null;
  const otherActive = status.hasIcs || !!status.allianz;
  const options: Array<["ics" | "allianz", string, string, boolean]> = [
    ["ics", "Kalender-Link (ICS)", "Ein veröffentlichter Link zeigt uns, wann Sie belegt sind.", status.hasIcs],
  ];
  if (showAllianz) options.unshift(["allianz", "Allianz-Online-Kalender", "Wir lesen Ihre freien Termine aus der Online-Terminbuchung Ihrer Vertreter-Seite.", !!status.allianz]);
  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4" data-ihr-kalender>
        {status.native.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-[15px] font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {status.native.label ?? "Kalender"} verbunden
            </span>
            {disconnectNativeAction && !readOnly ? (
              <form action={disconnectNativeAction}>
                {hiddenInputs}
                <button type="submit" className={buttonClass("ghost", "sm")}>
                  Trennen
                </button>
              </form>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[color:var(--muted)]">Verbinden Sie Ihren Kalender. Termine landen dann nur in Ihren freien Zeiten direkt dort.</p>
            <div className="flex flex-wrap gap-2">
              <a href={connectLinks.google} className={buttonClass("primary", "md", readOnly ? "pointer-events-none opacity-60" : "")}>
                Google-Kalender verbinden
              </a>
              <a href={connectLinks.microsoft} className={buttonClass("secondary", "md", readOnly ? "pointer-events-none opacity-60" : "")}>
                Outlook / Microsoft 365 verbinden
              </a>
            </div>
          </div>
        )}
      </div>

      <details open={otherActive} className="group rounded-[var(--radius-md)] border border-[color:var(--border)] [&>summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-1.5 text-[15px] font-medium">
            Andere Quelle für freie Zeiten
            {otherActive ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="eingerichtet" /> : null}
          </span>
          <span className="text-sm text-[color:var(--muted)] group-open:hidden">{showAllianz ? "z. B. Allianz-Kalender" : "Kalender-Link"}</span>
        </summary>
        <div className="space-y-3 border-t border-[color:var(--border)] p-4">
          <p className="text-sm text-[color:var(--muted)]">
            Dürfen wir Ihren Firmenkalender nicht direkt lesen, erkennen wir Ihre belegten Zeiten auch so. Termine tragen wir trotzdem in den oben verbundenen Kalender ein.
          </p>
          {options.length > 1 ? (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {options.map(([k, title, text, active]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={way === k}
                  onClick={() => setWay(k)}
                  className={`rounded-[var(--radius-md)] border px-4 py-3 text-left transition ${
                    way === k ? "border-[color:var(--brand)] bg-[#EFF6FF]" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                    {title}
                    {active ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="eingerichtet" /> : null}
                  </span>
                  <span className="mt-1 block text-sm text-[color:var(--muted)]">{text}</span>
                </button>
              ))}
            </div>
          ) : null}

          {way === "ics" ? (
            status.hasIcs ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Kalender-Link hinterlegt
                </span>
                <form action={removeIcsAction}>
                  {hiddenInputs}
                  <button type="submit" disabled={readOnly} className={buttonClass("ghost", "sm")}>
                    Entfernen
                  </button>
                </form>
              </div>
            ) : (
              <IcsForm action={icsAction} readOnly={readOnly} hidden={hidden} />
            )
          ) : null}

          {way === "allianz" ? (
            status.allianz ? (
              <div className="space-y-2 text-sm">
                <p className="flex items-start gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Verbunden{status.allianz.orgName ? `: ${status.allianz.orgName}` : ""}. Termin-Art „{status.allianz.templateName}“ ({status.allianz.durationMin} Min.).
                  </span>
                </p>
                {status.allianz.lastError ? <p className="text-rose-700">Letzter Abruf fehlgeschlagen: {status.allianz.lastError} Wir kümmern uns darum.</p> : null}
                <form action={disconnectAllianzAction}>
                  {hiddenInputs}
                  <button type="submit" disabled={readOnly} className={buttonClass("ghost", "sm")}>
                    Verbindung trennen
                  </button>
                </form>
              </div>
            ) : (
              <AllianzForm action={allianzAction} readOnly={readOnly} hidden={hidden} />
            )
          ) : null}
        </div>
      </details>
    </div>
  );
}

/** Team-Karte: Berater per E-Mail ans Verbinden erinnern. */
export function RemindButton({ action, userId, readOnly }: { action: FormAction; userId: string; readOnly: boolean }) {
  const [state, formAction, pending] = useActionState<SourceResult, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending || readOnly || !!state.ok} className={buttonClass("secondary", "sm")}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {state.ok ? "Erinnert" : "Erinnern"}
      </button>
      {state.error ? <span className="text-xs font-medium text-rose-700">{state.error}</span> : null}
    </form>
  );
}

// ─── Admin: Termin-Art / Person ─────────────────────────────────────────

export function AllianzTemplateForm({
  templates,
  resources,
  templateId,
  resourceId,
  action,
  hidden,
}: {
  templates: Array<{ id: string; name: string; durationMin: number }>;
  resources: Array<{ id: string; name: string }>;
  templateId: string;
  resourceId: string | null;
  action: FormAction;
  hidden: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<SourceResult, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="block text-sm font-medium">
        Termin-Art
        <select name="templateId" defaultValue={templateId} className={`${input} mt-1`}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.durationMin} Min.)
            </option>
          ))}
        </select>
      </label>
      {resources.length > 1 ? (
        <label className="block text-sm font-medium">
          Nur freie Zeiten von
          <select name="resourceId" defaultValue={resourceId ?? ""} className={`${input} mt-1`}>
            <option value="">allen Beratern der Vertretung</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Submit pending={pending} variant="secondary">
          Übernehmen
        </Submit>
        <Result state={state} />
      </div>
    </form>
  );
}
