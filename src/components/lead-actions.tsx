"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Ban,
  BellRing,
  CalendarPlus,
  Check,
  ChevronDown,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Trophy,
  X,
} from "lucide-react";
import { setLeadStatusAction, updateLeadDetailsAction } from "@/app/buyer/actions";
import { clearFollowUpResult, setFollowUpResult, undoInboxAction } from "@/app/buyer/inbox-actions";
import { Button, Card } from "@/components/ui";
import { ActionSheet, Sheet, type SheetAction } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { StornoDialog, type StornogrundOption } from "@/components/storno-dialog";
import { PHASE_DOT, findPhaseIn, statusToneClass, type LeadStatus, type PipelinePhase } from "@/lib/products";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

// Kopf des Lead-Details: Status antippen → Phase wählen; darunter eine Reihe
// mit den Aktionen. Alles Seltene steckt unter „Mehr".

type Props = {
  leadId: string;
  name: string | null;
  createdAt: string;
  phone: string | null;
  email: string | null;
  status: string | null;
  statusLabel: string;
  phases: readonly PipelinePhase[];
  conversationId: string | null;
  bookingSlug: string | null;
  followUpAt: string | null;
  followUpNote: string | null;
  stornoOptions: StornogrundOption[];
  storniert: boolean;
};

const QUICK = [
  { label: "Morgen", days: 1 },
  { label: "In 3 Tagen", days: 3 },
  { label: "In 1 Woche", days: 5 },
  { label: "In 2 Wochen", days: 10 },
];

export function LeadHeaderActions(p: Props) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [open, setOpen] = useState<"phase" | "more" | "followup" | "win" | "storno" | null>(null);
  const [winValue, setWinValue] = useState("");
  const [note, setNote] = useState(p.followUpNote ?? "");
  const [date, setDate] = useState("");
  const phase = findPhaseIn(p.phases, p.status);

  function setStatus(status: LeadStatus, label: string, closeValue?: number | null) {
    start(async () => {
      const res = await setLeadStatusAction(p.leadId, status, closeValue !== undefined ? { closeValue } : undefined);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: `Status: ${label}` });
      router.refresh();
    });
  }

  function followUp(fn: () => ReturnType<typeof setFollowUpResult>, message: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      const undo = res.undo;
      toast.show({
        message,
        ...(undo
          ? { actionLabel: "Rückgängig", onAction: () => start(async () => { await undoInboxAction(undo); router.refresh(); }) }
          : {}),
      });
      router.refresh();
    });
  }

  const phaseActions: SheetAction[] = p.phases.map((ph) => ({
    label: ph.label,
    tone: ph.key === phase?.key ? "primary" : undefined,
    onSelect: () => {
      if (ph.key === phase?.key) return;
      if (ph.key === "abschluss") {
        setWinValue("");
        setTimeout(() => setOpen("win"), 0);
      } else setStatus(ph.defaultStatus, ph.label);
    },
  }));

  const moreActions: SheetAction[] = [
    { label: p.followUpAt ? "Wiedervorlage ändern" : "Wiedervorlage setzen", icon: BellRing, onSelect: () => setTimeout(() => setOpen("followup"), 0) },
    ...(p.email ? [{ label: "E-Mail schreiben", icon: Mail, href: `mailto:${p.email}` }] : []),
    ...(!p.storniert && p.stornoOptions.length > 0
      ? [{ label: "Stornieren", icon: Ban, tone: "danger" as const, onSelect: () => setTimeout(() => setOpen("storno"), 0) }]
      : []),
  ];

  const dueLabel = p.followUpAt
    ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric" }).format(new Date(p.followUpAt))
    : null;

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{p.name ?? "Lead"}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[color:var(--muted)]">
          {p.storniert ? (
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">Storniert</span>
          ) : (
            <button
              type="button"
              onClick={() => setOpen("phase")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition hover:opacity-80",
                statusToneClass(p.status),
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", PHASE_DOT[phase?.key ?? "neu"] ?? "bg-zinc-400")} />
              {p.statusLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
          <span>eingegangen {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(p.createdAt))}</span>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
          <ActionTile icon={Phone} label="Anrufen" href={p.phone ? `tel:+${p.phone}` : undefined} primary title={p.phone ? formatPhone(p.phone) : undefined} />
          <ActionTile icon={MessageCircle} label="Chat" href={p.conversationId ? `/buyer/chats?c=${p.conversationId}` : undefined} />
          <ActionTile icon={CalendarPlus} label="Termin" href={p.bookingSlug ? `/book/${p.bookingSlug}?lead=${p.leadId}` : undefined} external />
          <ActionTile icon={MoreHorizontal} label="Mehr" onClick={() => setOpen("more")} />
        </div>

        {dueLabel ? (
          <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
            <BellRing className="h-4 w-4 shrink-0" />
            <button type="button" onClick={() => setOpen("followup")} className="min-w-0 flex-1 truncate text-left">
              <b>Wiedervorlage {dueLabel}</b>
              {p.followUpNote ? ` · ${p.followUpNote}` : ""}
            </button>
            <Button variant="ghost" icon={Check} onClick={() => followUp(() => clearFollowUpResult(p.leadId), "Wiedervorlage erledigt")}>
              Erledigt
            </Button>
          </div>
        ) : null}
      </header>

      <ActionSheet open={open === "phase"} onClose={() => setOpen(null)} title="Status ändern" actions={phaseActions} />
      <ActionSheet open={open === "more"} onClose={() => setOpen(null)} title={p.name ?? "Lead"} actions={moreActions} />

      <Sheet open={open === "win"} onClose={() => setOpen(null)} title="Abschluss" message="Wert des Abschlusses (optional)">
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number.parseFloat(winValue.replace(/\./g, "").replace(",", "."));
            setOpen(null);
            setStatus("Abschluss" as LeadStatus, "Abschluss", Number.isFinite(n) ? n : null);
          }}
        >
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 focus-within:border-[color:var(--brand)]">
            <input autoFocus inputMode="decimal" placeholder="z. B. 1.200" value={winValue} onChange={(e) => setWinValue(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" />
            <span className="text-sm text-[color:var(--muted)]">€</span>
          </div>
          <Button type="submit" variant="primary" size="md" icon={Trophy} className="w-full">
            Abschluss speichern
          </Button>
        </form>
      </Sheet>

      <Sheet open={open === "followup"} onClose={() => setOpen(null)} title="Wiedervorlage" message="Erscheint am Tag auf „Heute“.">
        <div className="space-y-3 p-5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Worum geht's? (optional)"
            className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-base outline-none focus:border-[color:var(--brand)]"
          />
          <div className="grid grid-cols-2 gap-2">
            {QUICK.map((q) => (
              <Button
                key={q.label}
                size="md"
                onClick={() => {
                  setOpen(null);
                  followUp(() => setFollowUpResult(p.leadId, { days: q.days }, note), `Wiedervorlage: ${q.label}`);
                }}
              >
                {q.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm"
              aria-label="Datum wählen"
            />
            <Button
              variant="primary"
              size="md"
              disabled={!date}
              onClick={() => {
                setOpen(null);
                followUp(() => setFollowUpResult(p.leadId, { date }, note), "Wiedervorlage gesetzt");
              }}
            >
              Setzen
            </Button>
          </div>
          {p.followUpAt ? (
            <Button
              variant="ghost"
              icon={X}
              className="w-full"
              onClick={() => {
                setOpen(null);
                followUp(() => clearFollowUpResult(p.leadId), "Wiedervorlage entfernt");
              }}
            >
              Wiedervorlage entfernen
            </Button>
          ) : null}
        </div>
      </Sheet>

      {open === "storno" ? (
        <StornoDialog
          leadId={p.leadId}
          leadName={p.name}
          leadCreatedAt={new Date(p.createdAt)}
          stornoOptions={p.stornoOptions}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function ActionTile({
  icon: Icon,
  label,
  href,
  onClick,
  primary,
  external,
  title,
}: {
  icon: typeof Phone;
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  external?: boolean;
  title?: string;
}) {
  const disabled = !href && !onClick;
  const cls = cn(
    "flex flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] px-3 py-2.5 text-xs font-semibold transition sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
    primary
      ? "bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)]"
      : "border border-[color:var(--border)] bg-white text-[color:var(--foreground)] shadow-[var(--shadow-sm)] hover:border-[color:var(--border-strong)]",
    disabled && "pointer-events-none opacity-40",
  );
  const inner = (
    <>
      <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
      <span>{title && primary ? <><span className="sm:hidden">{label}</span><span className="hidden sm:inline">{title}</span></> : label}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/** Notizen: speichern sich beim Verlassen des Feldes von selbst. */
export function LeadNotes({ leadId, initial }: { leadId: string; initial: string }) {
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const saved = useRef(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    if (state !== "saved") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);
  async function save() {
    if (value === saved.current) return;
    setState("saving");
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("bearbeitungsstatus", "");
    fd.set("notizen", value);
    const res = await updateLeadDetailsAction({}, fd);
    if (res.error) {
      setState("idle");
      toast.show({ message: res.error, tone: "error" });
      return;
    }
    saved.current = value;
    setState("saved");
  }
  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-3.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Notizen</h2>
        <span className="text-xs text-[color:var(--muted)]">
          {state === "saving" ? "Speichert …" : state === "saved" ? "Gespeichert" : ""}
        </span>
      </div>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        placeholder="Was wurde besprochen? Nächster Schritt?"
        className="block w-full resize-y px-5 py-4 text-sm outline-none"
      />
    </Card>
  );
}
