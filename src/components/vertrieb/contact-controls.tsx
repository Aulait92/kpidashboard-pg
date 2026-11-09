"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import { deleteContact, setStage } from "@/app/admin/vertrieb/actions";
import { Button } from "@/components/ui";
import { ActionSheet, Sheet, type SheetAction } from "@/components/ui/sheet";
import { LOSS_REASONS, STAGES } from "@/lib/vertrieb/crm";
import type { SalesStage as Stage } from "@/generated/prisma/enums";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

/** Stufe als antippbarer Chip; „Verloren“ fragt nach dem Grund. */
export function StagePicker({ contactId, stage, competitor }: { contactId: string; stage: Stage; competitor: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<"pick" | "lost" | null>(null);
  const [reason, setReason] = useState("");
  const [comp, setComp] = useState(competitor ?? "");
  const current = STAGES.find((s) => s.id === stage);
  const save = (o: Record<string, string>) =>
    start(async () => {
      await setStage(fd({ contactId, ...o }));
      router.refresh();
    });
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen("pick")}
        className={clsx("badge inline-flex items-center gap-1 transition hover:opacity-80", current?.color, pending && "opacity-60")}
      >
        {current?.label ?? stage}
        <ChevronDown className="h-3 w-3" />
      </button>
      <ActionSheet
        open={open === "pick"}
        onClose={() => setOpen(null)}
        title="Stufe ändern"
        actions={STAGES.map((s) => ({
          label: s.label,
          tone: s.id === stage ? "primary" : s.id === "VERLOREN" ? "danger" : undefined,
          onSelect: () => {
            if (s.id === stage) return;
            if (s.id === "VERLOREN") setTimeout(() => setOpen("lost"), 0);
            else save({ stage: s.id });
          },
        }))}
      />
      <Sheet open={open === "lost"} onClose={() => setOpen(null)} title="Verloren: warum?">
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(null);
            save({ stage: "VERLOREN", lossReason: reason || "SONSTIGES", competitor: comp });
          }}
        >
          <div className="grid grid-cols-1 gap-2">
            {LOSS_REASONS.map((r) => (
              <label key={r.id} className={clsx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", reason === r.id ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-[color:var(--border)]")}>
                <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                {r.label}
              </label>
            ))}
          </div>
          <input value={comp} onChange={(e) => setComp(e.target.value)} placeholder="Wettbewerber (optional)" className="input" />
          <Button type="submit" variant="primary" size="md" className="w-full">
            Als verloren speichern
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Seltene Aktionen eines Kontakts. */
export function ContactMore({ contactId, name, url, linkedinUrl }: { contactId: string; name: string; url: string | null; linkedinUrl: string | null }) {
  const [open, setOpen] = useState<"menu" | "delete" | null>(null);
  const [pending, start] = useTransition();
  const actions: SheetAction[] = [
    ...(url ? [{ label: "Website öffnen", icon: ExternalLink, href: url }] : []),
    ...(linkedinUrl ? [{ label: "LinkedIn-Profil öffnen", icon: ExternalLink, href: linkedinUrl }] : []),
    { label: "Kontakt löschen", icon: Trash2, tone: "danger", onSelect: () => setTimeout(() => setOpen("delete"), 0) },
  ];
  return (
    <>
      <button type="button" onClick={() => setOpen("menu")} className="btn-ghost" aria-label="Mehr">
        <MoreHorizontal className="h-4 w-4" /> Mehr
      </button>
      <ActionSheet open={open === "menu"} onClose={() => setOpen(null)} title={name} actions={actions} />
      <Sheet open={open === "delete"} onClose={() => setOpen(null)} title={`„${name}“ löschen?`} message="Verlauf, Aufgaben und Cold-Mail-Status werden mit gelöscht.">
        <div className="p-5">
          <Button
            variant="danger"
            size="md"
            className="w-full"
            disabled={pending}
            onClick={() => start(() => deleteContact(fd({ contactId })))}
          >
            Endgültig löschen
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/** Zugeklappter Bereich mit Kurz-Info in der Kopfzeile. */
export function Fold({ title, summary, open = false, children }: { title: string; summary?: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 select-none group-open:border-b group-open:border-slate-100 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">{title}</span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
        </span>
      </summary>
      <div className="p-4">{children}</div>
    </details>
  );
}
