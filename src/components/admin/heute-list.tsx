"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Clock, Phone, X } from "lucide-react";
import type { HeuteArea, HeuteItem, HeuteTone } from "@/lib/admin-heute";
import {
  completeTaskAction,
  decideStornoQuickAction,
  dismissAction,
  garantieAblehnenAction,
  garantieGewaehrenAction,
  meetingOutcomeAction,
  offerFollowedUpAction,
  postponeTaskAction,
  undoHeuteAction,
  type HeuteResult,
} from "@/app/admin/heute/actions";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { HEUTE_ICONS } from "@/components/admin/heute-icons";
import { cn } from "@/lib/utils";
import { TERMIN_REVIEW_CHOICES } from "@/lib/vertrieb/crm";


const TONE: Record<HeuteTone, string> = {
  bad: "bg-rose-50 text-rose-600",
  warn: "bg-amber-50 text-amber-600",
  info: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
};

const AREA_COLOR: Record<HeuteArea, string> = {
  Vertrieb: "text-sky-700",
  Kunden: "text-emerald-700",
  Leads: "text-violet-700",
  "Pay-per-Lead": "text-violet-700",
  System: "text-rose-700",
};

/** Die Liste „Braucht Sie“ mit Sofort-Aktionen und „Rückgängig“. */
export function HeuteList({ items }: { items: HeuteItem[] }) {
  return (
    <ToastProvider>
      <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        {items.map((it) => (
          <HeuteRow key={it.key} it={it} />
        ))}
      </ul>
    </ToastProvider>
  );
}

// Am Handy teilen sich die Knöpfe eine Zeile (gleich breit), am Rechner so breit wie nötig.
const btn = "inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] px-2 text-sm font-semibold transition disabled:opacity-50 sm:h-9 sm:flex-none sm:shrink-0 sm:px-3 [&_svg]:hidden sm:[&_svg]:block";
const secondary = "border border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:bg-[color:var(--surface-sunken)]";
const primary = "bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)]";

function HeuteRow({ it }: { it: HeuteItem }) {
  const Icon = HEUTE_ICONS[it.icon];
  const toast = useToast();
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [grund, setGrund] = useState(it.quick?.kind === "garantie" ? it.quick.grundVorschlag : "");

  // Zeile sofort ausblenden; bei Fehler wieder zeigen. „Rückgängig“ holt sie zurück.
  function run(action: () => Promise<HeuteResult>) {
    setHidden(true);
    start(async () => {
      const res = await action().catch(() => ({ ok: false, error: "Keine Verbindung. Bitte noch einmal versuchen." }) as HeuteResult);
      if (!res.ok) {
        setHidden(false);
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      const undo = res.undo;
      toast.show({
        message: res.message,
        ...(undo
          ? {
              actionLabel: "Rückgängig",
              onAction: () => {
                setHidden(false);
                start(async () => {
                  const back = await undoHeuteAction(undo).catch(() => null);
                  if (!back?.ok) toast.show({ message: "Rückgängig hat nicht geklappt.", tone: "error" });
                });
              },
            }
          : {}),
      });
    });
  }

  if (hidden) return null;
  const q = it.quick;
  const mainIsPrimary = it.tone !== "info" && q?.kind !== "task" && q?.kind !== "termin" && q?.kind !== "storno" && q?.kind !== "garantie";

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4" data-heute={it.key}>
      {/* Ganze linke Seite führt zur Detailansicht (Kontakt, Kunde, Lead …) */}
      <Link href={it.action.href} className="group flex min-w-0 flex-1 gap-3 rounded-lg" title="Öffnen">
        <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", TONE[it.tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <div className={cn("text-[11px] font-semibold uppercase tracking-wide", AREA_COLOR[it.area])}>{it.area}</div>
          <div className="font-medium leading-snug group-hover:text-[color:var(--brand)] group-hover:underline">{it.title}</div>
          <div className="mt-0.5 text-sm text-[color:var(--muted)]">{it.detail}</div>
        </div>
      </Link>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        {q?.kind === "termin" ? (
          <div className="flex flex-wrap gap-1.5" data-termin-ergebnis>
            {TERMIN_REVIEW_CHOICES.map((c) => (
              <button
                key={c.outcome}
                type="button"
                disabled={pending}
                onClick={() => run(() => meetingOutcomeAction(q.taskId, c.outcome))}
                className={cn(btn, c.outcome === "gewonnen" ? primary : secondary, "px-2.5")}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}
        {q?.kind === "task" ? (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => completeTaskAction(q.taskId))} className={cn(btn, primary)}>
              <Check className="h-4 w-4" />
              Erledigt
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => postponeTaskAction(q.taskId))} className={cn(btn, secondary)}>
              <Clock className="h-4 w-4" />
              Morgen
            </button>
          </>
        ) : null}

        {q?.kind === "storno" ? (
          confirm ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => decideStornoQuickAction(q.leadId, confirm === "approve"))}
                className={cn(btn, confirm === "approve" ? primary : "bg-rose-600 text-white hover:bg-rose-700")}
              >
                {confirm === "approve" ? "Ja, anerkennen" : "Ja, ablehnen"}
              </button>
              <button type="button" onClick={() => setConfirm(null)} className={cn(btn, secondary, "flex-none px-3 [&_svg]:block")} aria-label="Abbrechen">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={pending} onClick={() => setConfirm("approve")} className={cn(btn, primary)}>
                <Check className="h-4 w-4" />
                Anerkennen
              </button>
              <button type="button" disabled={pending} onClick={() => setConfirm("reject")} className={cn(btn, secondary)}>
                Ablehnen
              </button>
            </>
          )
        ) : null}

        {q?.kind === "garantie" ? (
          confirm === "reject" ? (
            <form
              className="flex w-full min-w-0 flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => garantieAblehnenAction(q.fallId, grund));
              }}
            >
              <input
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                required
                minLength={3}
                maxLength={500}
                autoFocus
                placeholder="Begründung"
                aria-label="Begründung für die Ablehnung"
                className="h-10 min-w-0 flex-[2] rounded-[var(--radius-sm)] border border-[color:var(--border)] px-2 text-sm sm:h-9 sm:w-64"
              />
              <button type="submit" disabled={pending || grund.trim().length < 3} className={cn(btn, "bg-rose-600 text-white hover:bg-rose-700")}>
                Ablehnen
              </button>
              <button type="button" onClick={() => setConfirm(null)} className={cn(btn, secondary, "flex-none px-3 [&_svg]:block")} aria-label="Abbrechen">
                <X className="h-4 w-4" />
              </button>
            </form>
          ) : confirm === "approve" ? (
            <>
              <button type="button" disabled={pending} onClick={() => run(() => garantieGewaehrenAction(q.fallId))} className={cn(btn, primary)}>
                Ja, gutschreiben
              </button>
              <button type="button" onClick={() => setConfirm(null)} className={cn(btn, secondary, "flex-none px-3 [&_svg]:block")} aria-label="Abbrechen">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={pending} onClick={() => setConfirm("approve")} className={cn(btn, it.tone === "info" ? secondary : primary)}>
                <Check className="h-4 w-4" />
                Gewähren
              </button>
              <button type="button" disabled={pending} onClick={() => setConfirm("reject")} className={cn(btn, secondary)}>
                Ablehnen
              </button>
            </>
          )
        ) : null}

        {q?.kind === "offer" ? (
          <button type="button" disabled={pending} onClick={() => run(() => offerFollowedUpAction(q.offerId, q.contactId))} className={cn(btn, secondary)}>
            <Check className="h-4 w-4" />
            Nachgefasst
          </button>
        ) : null}

        {it.later ? (
          <button type="button" disabled={pending} onClick={() => run(() => dismissAction(it.key, it.later!.days))} className={cn(btn, secondary)}>
            {it.later.days === 1 ? <Clock className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {it.later.label}
          </button>
        ) : null}

        {confirm ? null : (
          <Link href={it.action.href} className={cn(btn, "sm:px-4", mainIsPrimary ? primary : secondary)}>
            {it.icon === "phone" ? <Phone className="h-4 w-4" /> : null}
            {it.action.label}
          </Link>
        )}
      </div>
    </li>
  );
}
