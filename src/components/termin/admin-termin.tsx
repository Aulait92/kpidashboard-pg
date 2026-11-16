"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarCheck, CalendarPlus, Check, Link2, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import type { AdminTerminState } from "@/app/admin/vertrieb/buchungsseite/actions";

// Vertriebskontakt (Admin): Termin buchen bzw. verschieben ohne Buchungsfenster und außerhalb der freien Zeiten
// (Ole, 16.11.2026). Bei Überschneidung mit dem Kalender erst Warnhinweis, dann „Trotzdem buchen“.

type Action = (prev: AdminTerminState, fd: FormData) => Promise<AdminTerminState>;
export type TerminTypeOption = { slug: string; title: string; durationMin: number };

const TZ = "Europe/Berlin";
const ymdOf = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
const hhmmOf = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** Nächster Werktag (Berliner Datum) als Vorschlag. */
function nextWorkday(now = new Date()): string {
  const d = new Date(now.getTime() + 24 * 3600_000);
  while ([0, 6].includes(new Date(`${ymdOf(d)}T12:00:00Z`).getUTCDay())) d.setTime(d.getTime() + 24 * 3600_000);
  return ymdOf(d);
}

/** Formular für Datum und Uhrzeit (Buchen und Verschieben), mit Warnhinweis bei Überschneidung. */
function TerminForm({
  action,
  hidden,
  types,
  defaultType,
  email,
  defaultDate,
  defaultTime,
  submitLabel,
  forceLabel,
  onDone,
}: {
  action: Action;
  hidden: Record<string, string>;
  types?: TerminTypeOption[];
  defaultType?: string;
  email?: string | null;
  defaultDate: string;
  defaultTime: string;
  submitLabel: string;
  forceLabel: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<AdminTerminState, FormData>(action, {});
  // Nach einer Änderung gilt die Warnung nicht mehr: erneut prüfen statt trotzdem buchen
  const [editedAt, setEditedAt] = useState<AdminTerminState | null>(null);
  // Gesteuerte Felder: React setzt das Formular nach der Aktion zurück, die Warnung bezieht sich aber auf diese Werte
  const [v, setV] = useState({ art: defaultType ?? "", date: defaultDate, time: defaultTime, email: email ?? "" });
  const bind = (k: keyof typeof v) => ({ name: k, value: v[k], onChange: (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value })) });
  const warned = !!state.conflicts?.length && editedAt !== state;
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={formAction} onChange={() => setEditedAt(state)} className="space-y-3 p-5" data-admin-termin-form>
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      <input type="hidden" name="force" value={warned ? "1" : "0"} />
      {types ? (
        <label className="block text-xs font-medium text-slate-500">
          Termintyp
          <select {...bind("art")} className="input mt-1">
            {types.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.title.replace(/\s+mit\s+.+$/, "")} ({t.durationMin} Min.)
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-slate-500">
          Datum
          <input type="date" {...bind("date")} required min={ymdOf(new Date())} className="input mt-1" />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Uhrzeit
          <input type="time" {...bind("time")} required className="input mt-1" />
        </label>
      </div>
      {types ? (
        <label className="block text-xs font-medium text-slate-500">
          Einladung an
          <input type="email" {...bind("email")} required placeholder="name@agentur.de" className="input mt-1" />
        </label>
      ) : null}
      {warned ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" role="alert" data-admin-termin-warnung>
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Überschneidung im Kalender
          </div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {state.conflicts!.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : state.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full justify-center">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {warned ? forceLabel : submitLabel}
      </button>
    </form>
  );
}

/**
 * Knopf „Termin“ im Kopf des Vertriebskontakts: Termin buchen (Termintyp, Datum, Uhrzeit frei) und,
 * falls online buchbar, den persönlichen Link zum Entscheidungs-Call kopieren.
 */
export function AdminTerminButton({
  action,
  contactId,
  contactName,
  email,
  types,
  defaultType,
  decisionLink,
  oeffnen,
  label = "Termin",
  className = "btn-ghost",
}: {
  action: Action;
  contactId: string;
  contactName: string;
  email: string | null;
  types: TerminTypeOption[];
  defaultType: string;
  decisionLink: string | null;
  /** Neuer Admin („+ Neu → Termin“): jeder neue Wert öffnet das Fenster sofort. */
  oeffnen?: string | null;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!oeffnen);
  const [copied, setCopied] = useState(false);
  const [geoeffnet, setGeoeffnet] = useState(oeffnen ?? null);
  if (oeffnen && oeffnen !== geoeffnet) {
    // Während des Renderns statt im Effekt (React: Zustand aus geänderten Props ableiten)
    setGeoeffnet(oeffnen);
    setOpen(true);
  }
  if (!types.length) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} data-admin-termin>
        <CalendarPlus className="h-4 w-4" /> {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Termin buchen" message={contactName}>
        <TerminForm
          action={action}
          hidden={{ contactId }}
          types={types}
          defaultType={defaultType}
          email={email}
          defaultDate={nextWorkday()}
          defaultTime="10:00"
          submitLabel="Termin buchen"
          forceLabel="Trotzdem buchen"
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
        {decisionLink ? (
          <button
            type="button"
            className="flex h-12 w-full items-center gap-3 border-t border-[color:var(--border)] px-5 text-left text-sm text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
            title="Persönlichen Buchungslink kopieren (zum Senden per Mail oder WhatsApp)"
            data-entscheidungs-link
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(decisionLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                window.prompt("Link kopieren:", decisionLink);
              }
            }}
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
            {copied ? "Link kopiert" : "Link zum Entscheidungs-Call kopieren"}
          </button>
        ) : null}
      </Sheet>
    </>
  );
}

/** „Verschieben“ an einem Termin der eigenen Buchungsseite im Vertriebskontakt (ohne Grenze). */
export function AdminRescheduleButton({ action, meetingId, title, startAt }: { action: Action; meetingId: string; title: string; startAt: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const start = new Date(startAt);
  return (
    <>
      <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-[color:var(--brand)] hover:underline" onClick={() => setOpen(true)} data-admin-verschieben>
        <CalendarCheck className="h-3.5 w-3.5" /> Verschieben
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Termin verschieben" message={title}>
        <TerminForm
          action={action}
          hidden={{ meetingId }}
          defaultDate={ymdOf(start)}
          defaultTime={hhmmOf(start)}
          submitLabel="Termin verschieben"
          forceLabel="Trotzdem verschieben"
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </Sheet>
    </>
  );
}
