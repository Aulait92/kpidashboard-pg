"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BellRing, Check, X } from "lucide-react";
import { clearFollowUpResult, setFollowUpResult, undoInboxAction } from "@/app/buyer/inbox-actions";
import { Button, Card, CardHeader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// Wiedervorlage am Lead: „Ruf mich in 1 Woche an", Angebot nachfassen …
// Erscheint am Fälligkeitstag auf „Heute".
const QUICK = [
  { label: "Morgen", days: 1 },
  { label: "In 3 Tagen", days: 3 },
  { label: "In 1 Woche", days: 5 },
  { label: "In 2 Wochen", days: 10 },
];

export function FollowUpEditor({
  leadId,
  followUpAt,
  note: initialNote,
}: {
  leadId: string;
  followUpAt: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [note, setNote] = useState(initialNote ?? "");
  const [date, setDate] = useState("");
  const due = followUpAt
    ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long" }).format(
        new Date(followUpAt),
      )
    : null;

  function apply(fn: () => ReturnType<typeof setFollowUpResult>, message: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      const undo = res.undo;
      toast.show({
        message,
        ...(undo
          ? {
              actionLabel: "Rückgängig",
              onAction: () => start(async () => {
                await undoInboxAction(undo);
                router.refresh();
              }),
            }
          : {}),
      });
      router.refresh();
    });
  }

  return (
    <Card className="mb-6">
      <CardHeader
        icon={BellRing}
        title="Wiedervorlage"
        actions={
          due ? (
            <span className="text-xs font-medium text-violet-700">fällig {due}</span>
          ) : (
            <span className="text-xs text-[color:var(--muted)]">keine</span>
          )
        }
      />
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={pending}
              onClick={() =>
                apply(() => setFollowUpResult(leadId, { days: q.days }, note), `Wiedervorlage gesetzt: ${q.label}`)
              }
              className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1.5 text-xs font-medium transition hover:border-[color:var(--brand)] disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-xs"
            aria-label="Datum wählen"
          />
          {date ? (
            <Button
              variant="primary"
              icon={Check}
              disabled={pending}
              onClick={() => apply(() => setFollowUpResult(leadId, { date }, note), "Wiedervorlage gesetzt")}
            >
              Setzen
            </Button>
          ) : null}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Worum geht's? z. B. „Will nach dem Urlaub entscheiden“"
          className={cn(
            "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-sm",
            "focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/15",
          )}
        />
        {due ? (
          <Button
            variant="ghost"
            icon={X}
            disabled={pending}
            onClick={() => apply(() => clearFollowUpResult(leadId), "Wiedervorlage entfernt")}
          >
            Wiedervorlage entfernen
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
