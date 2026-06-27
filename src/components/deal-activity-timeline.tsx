"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Trash2,
  Video,
} from "lucide-react";
import {
  createDealActivityAction,
  deleteDealActivityAction,
  type CreateActivityState,
} from "@/app/admin/crm/actions";
import { formatDate } from "@/lib/format";

export type ActivityItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  scheduledFor: Date | null;
  createdAt: Date;
  createdBy: { email: string } | null;
};

const KIND_META: Record<
  string,
  { label: string; icon: typeof Phone; tone: string }
> = {
  note: { label: "Notiz", icon: MessageSquare, tone: "bg-zinc-100 text-zinc-700" },
  // "call" bleibt für Alt-Datensätze erhalten, ist aber nicht mehr im Dropdown.
  call: { label: "Anruf", icon: Phone, tone: "bg-blue-100 text-blue-800" },
  settercall: {
    label: "Settercall ausmachen",
    icon: Phone,
    tone: "bg-blue-100 text-blue-800",
  },
  videosalescall: {
    label: "Videosalescall ausmachen",
    icon: Video,
    tone: "bg-indigo-100 text-indigo-800",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    tone: "bg-green-100 text-green-800",
  },
  email: { label: "Mail", icon: Mail, tone: "bg-violet-100 text-violet-800" },
  meeting: {
    label: "Termin",
    icon: CalendarPlus,
    tone: "bg-amber-100 text-amber-800",
  },
  status_change: {
    label: "Status",
    icon: CheckCircle2,
    tone: "bg-emerald-100 text-emerald-800",
  },
};

export function DealActivityTimeline({
  dealId,
  activities,
}: {
  dealId: string;
  activities: ActivityItem[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <header className="border-b border-[color:var(--border)] px-5 py-3">
        <h2 className="text-base font-semibold">Aktivität</h2>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">
          Notizen, Anrufe, Mails, Termine — chronologisch (neueste zuerst).
          Status-Wechsel werden automatisch protokolliert.
        </p>
      </header>
      <CreateActivityForm dealId={dealId} />
      {activities.length === 0 ? (
        <div className="px-5 py-6 text-sm text-[color:var(--muted)]">
          Noch keine Aktivitäten erfasst.
        </div>
      ) : (
        <ol className="divide-y divide-[color:var(--border)]">
          {activities.map((a) => (
            <ActivityRow key={a.id} dealId={dealId} activity={a} />
          ))}
        </ol>
      )}
    </section>
  );
}

function CreateActivityForm({ dealId }: { dealId: string }) {
  const [state, formAction, pending] = useActionState<
    CreateActivityState,
    FormData
  >(createDealActivityAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 border-b border-[color:var(--border)] bg-zinc-50/40 px-5 py-4"
    >
      <input type="hidden" name="dealId" value={dealId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
        <select
          name="kind"
          defaultValue="settercall"
          className="rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
        >
          <option value="call">Anruf</option>
          <option value="settercall">Settercall ausmachen</option>
          <option value="videosalescall">Videosalescall ausmachen</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Mail</option>
          <option value="meeting">Termin</option>
        </select>
        <input
          type="text"
          name="title"
          required
          minLength={2}
          placeholder="Titel — z. B. 'Erstgespräch geführt'"
          className="rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
        />
      </div>
      <textarea
        name="body"
        rows={2}
        placeholder="Optionale Details, Zusammenfassung, Next Steps …"
        className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
      />
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--muted)]">
          Geplant für (optional) — zeigt die Karte im Pipeline-Board als
          nächste Aktivität
        </span>
        <input
          type="datetime-local"
          name="scheduledFor"
          // Beim Klick (und Fokus) direkt den nativen Picker öffnen, statt erst
          // auf das kleine Kalender-Icon zielen zu müssen.
          onClick={(e) => {
            const el = e.currentTarget as HTMLInputElement & {
              showPicker?: () => void;
            };
            try {
              el.showPicker?.();
            } catch {
              /* showPicker nicht verfügbar → normales Verhalten */
            }
          }}
          onFocus={(e) => {
            const el = e.currentTarget as HTMLInputElement & {
              showPicker?: () => void;
            };
            try {
              el.showPicker?.();
            } catch {
              /* ignore */
            }
          }}
          className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        {state.error ? (
          <span className="text-xs font-medium text-rose-700">{state.error}</span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Aktivität anlegen
        </button>
      </div>
    </form>
  );
}

function ActivityRow({
  dealId,
  activity,
}: {
  dealId: string;
  activity: ActivityItem;
}) {
  const meta = KIND_META[activity.kind] ?? KIND_META.note;
  const Icon = meta.icon;
  return (
    <li className="flex gap-3 px-5 py-3">
      <span
        className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.tone}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium text-[color:var(--foreground)] break-words">
            {activity.title}
          </div>
          <div className="shrink-0 text-[11px] text-[color:var(--muted)]">
            {formatDate(activity.createdAt)}
          </div>
        </div>
        {activity.body ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[color:var(--muted)]">
            {activity.body}
          </p>
        ) : null}
        {activity.scheduledFor ? (
          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-800">
            <CalendarPlus className="h-3 w-3" />
            geplant für {formatDate(activity.scheduledFor)}
          </p>
        ) : null}
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[color:var(--muted)]">
          <span>{meta.label}</span>
          {/* status_change-Einträge nicht manuell löschbar — wären
              inkonsistent zur Pipeline-History. */}
          {activity.kind !== "status_change" ? (
            <form action={deleteDealActivityAction}>
              <input type="hidden" name="activityId" value={activity.id} />
              <input type="hidden" name="dealId" value={dealId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1 text-rose-600 hover:underline"
                onClick={(e) => {
                  if (!confirm("Aktivität wirklich löschen?")) e.preventDefault();
                }}
              >
                <Trash2 className="h-3 w-3" /> löschen
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </li>
  );
}
