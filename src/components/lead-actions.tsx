"use client";

import { DISQUALIFY_REASONS } from "@/lib/lead-quality";
import { LEAD_MAIL_EVENT } from "@/components/lead-mail";
import { useProvisionRates } from "@/components/provision-context";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Ban,
  BellRing,
  CalendarPlus,
  Check,
  ChevronDown,
  Mail,
  Mic,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Pencil,
  ShieldX,
  Trophy,
  X,
} from "lucide-react";
import { eraseLeadAction, setLeadStatusAction, updateLeadDetailsAction } from "@/app/buyer/actions";
import { clearFollowUpResult, setFollowUpResult, undoInboxAction } from "@/app/buyer/inbox-actions";
import { Button, Card } from "@/components/ui";
import { ActionSheet, Sheet, type SheetAction } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { StornoDialog, type StornogrundOption } from "@/components/storno-dialog";
import { PHASE_DOT, findPhaseIn, statusToneClass, type LeadStatus, type PipelinePhase } from "@/lib/products";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CallOutcomeSheet, useCallReturn } from "@/components/call-outcome";
import { AbschlussSheet, asksCloseValue } from "@/components/abschluss-sheet";

// Kopf des Lead-Details: Status antippen → Phase wählen; darunter eine Reihe
// mit den Aktionen. Alles Seltene steckt unter „Mehr".

type Props = {
  /** Eigenes Postfach verbunden: E-Mail aus der App. */
  mailReady?: boolean;
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
  canErase?: boolean;
  /** Tage im aktuellen Status (auf dem Server berechnet). */
  daysInPhase?: number | null;
  /** Neue Oberfläche: nach „Anrufen“ und Rückkehr automatisch „Wie lief's?“ fragen. */
  askAfterCall?: boolean;
  /** Produkt (Lead.source): Beitrag beim Abschluss (Monats-/Jahresbeitrag) bzw. kein Feld bei festem Satz. */
  source?: string | null;
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
  const [open, setOpen] = useState<"phase" | "more" | "followup" | "win" | "storno" | "erase" | "lost" | "disq" | null>(null);
  const [erasing, setErasing] = useState(false);
  const [note, setNote] = useState(p.followUpNote ?? "");
  const [date, setDate] = useState("");
  const phase = findPhaseIn(p.phases, p.status);
  const [afterCall, setAfterCall] = useState(false);
  const provisionRates = useProvisionRates();
  const markCall = useCallReturn(() => setAfterCall(true));

  // Fester Provisionsbetrag (Regelart „fixed“): Abschluss ohne Eingabe direkt speichern.
  function askWin() {
    if (asksCloseValue(p.source, provisionRates)) setTimeout(() => setOpen("win"), 0);
    else setStatus("Abschluss" as LeadStatus, "Abschluss", null);
  }

  function setStatus(status: LeadStatus, label: string, closeValue?: number | null, disqualifyReason?: string) {
    // „Disqualifiziert“ fragt erst nach dem Grund (Ole, 13.11.2026)
    if (status === "Disqualifiziert" && !disqualifyReason) {
      setTimeout(() => setOpen("disq"), 0);
      return;
    }
    start(async () => {
      const res = await setLeadStatusAction(p.leadId, status, {
        ...(closeValue !== undefined ? { closeValue } : {}),
        ...(disqualifyReason ? { disqualifyReason } : {}),
      });
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
      if (ph.key === "abschluss") askWin();
      else setStatus(ph.defaultStatus, ph.label);
    },
  }));

  const moreActions: SheetAction[] = [
    { label: p.followUpAt ? "Wiedervorlage ändern" : "Wiedervorlage setzen", icon: BellRing, onSelect: () => setTimeout(() => setOpen("followup"), 0) },
    // Eigenes Postfach verbunden → E-Mail aus der App (mit Vorlagen), sonst Mailprogramm
    ...(p.mailReady
      ? [{ label: "E-Mail schreiben", icon: Mail, onSelect: () => setTimeout(() => window.dispatchEvent(new Event(LEAD_MAIL_EVENT)), 0) }]
      : p.email
        ? [
            { label: "E-Mail schreiben", icon: Mail, href: `mailto:${p.email}` },
            { label: "E-Mail aus der App: Postfach verbinden", icon: Mail, href: "/buyer/postfach" },
          ]
        : []),
    ...(!p.storniert && p.stornoOptions.length > 0
      ? [{ label: "Stornieren", icon: Ban, tone: "danger" as const, onSelect: () => setTimeout(() => setOpen("storno"), 0) }]
      : []),
    ...(p.canErase
      ? [{ label: "Daten löschen (Datenschutz)", icon: ShieldX, tone: "danger" as const, onSelect: () => setTimeout(() => setOpen("erase"), 0) }]
      : []),
  ];

  function erase() {
    setErasing(true);
    start(async () => {
      const res = await eraseLeadAction(p.leadId);
      setErasing(false);
      setOpen(null);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: "Daten gelöscht" });
      router.refresh();
    });
  }

  const LOST_KEYS = new Set(["kein-interesse", "disqualifiziert"]);
  const stepPhases = p.phases.filter((ph) => !LOST_KEYS.has(ph.key) && ph.key !== "abschluss");
  const currentIdx = stepPhases.findIndex((ph) => ph.key === phase?.key);
  const days = p.daysInPhase ?? null;
  const lostActions: SheetAction[] = [
    ...p.phases.filter((ph) => LOST_KEYS.has(ph.key)).map((ph) => ({ label: ph.label, onSelect: () => setStatus(ph.defaultStatus, ph.label) })),
    ...(!p.storniert && p.stornoOptions.length > 0
      ? [{ label: "Stornieren (Lead reklamieren)", icon: Ban, tone: "danger" as const, onSelect: () => setTimeout(() => setOpen("storno"), 0) }]
      : []),
  ];
  const won = phase?.key === "abschluss";
  const lost = !!phase && LOST_KEYS.has(phase.key);
  const showBar = !p.storniert && !won && !lost && stepPhases.length > 1;

  const dueLabel = p.followUpAt
    ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric" }).format(new Date(p.followUpAt))
    : null;

  return (
    <>
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name ?? "Lead"}</h1>
          {!p.storniert ? (
            <div className="hidden shrink-0 gap-2 sm:flex">
              <button
                type="button"
                onClick={() => {
                  if (won) return;
                  askWin();
                }}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 text-sm font-semibold transition",
                  won ? "bg-emerald-100 text-emerald-800" : "bg-emerald-600 text-white hover:bg-emerald-700",
                )}
              >
                <Trophy className="h-4 w-4" /> Gewonnen
              </button>
              <button
                type="button"
                onClick={() => setOpen("lost")}
                className={cn(
                  "inline-flex h-9 items-center rounded-[var(--radius-sm)] px-3.5 text-sm font-semibold transition",
                  lost ? "bg-rose-100 text-rose-800" : "bg-rose-600 text-white hover:bg-rose-700",
                )}
              >
                Verloren
              </button>
            </div>
          ) : null}
        </div>
        {showBar ? (
          <ol className="mt-3 hidden overflow-hidden rounded-[var(--radius-sm)] sm:flex" aria-label="Phasen">
            {stepPhases.map((ph, i) => {
              const done = currentIdx >= 0 && i < currentIdx;
              const current = i === currentIdx;
              return (
                <li key={ph.key} className={cn("min-w-0", current ? "flex-[1.6]" : "flex-1")}>
                  <button
                    type="button"
                    onClick={() => !current && setStatus(ph.defaultStatus, ph.label)}
                    title={current ? undefined : `Auf „${ph.label}“ setzen`}
                    className={cn(
                      "relative flex h-8 w-full items-center justify-center truncate px-4 text-xs font-medium transition [clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)]",
                      i === 0 && "[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%)]",
                      current
                        ? "bg-emerald-600 text-white"
                        : done
                          ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                          : "bg-[color:var(--surface-sunken,#f1f5f9)] text-[color:var(--muted)] hover:bg-slate-200",
                    )}
                  >
                    <span className="truncate">
                      {current && days != null ? `${days} ${days === 1 ? "Tag" : "Tage"} · ` : ""}
                      {ph.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
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
                showBar && "sm:hidden",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", PHASE_DOT[phase?.key ?? "neu"] ?? "bg-zinc-400")} />
              {p.statusLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
          <span>eingegangen {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(p.createdAt))}</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
          <ActionTile
            icon={Phone}
            label="Anrufen"
            href={p.phone ? `tel:+${p.phone}` : undefined}
            onClick={p.askAfterCall ? () => markCall(p.leadId) : undefined}
            primary
            title={p.phone ? formatPhone(p.phone) : undefined}
          />
          <ActionTile icon={MessageCircle} label="Chat" href={p.conversationId ? `/buyer/chats?c=${p.conversationId}` : undefined} />
          {/* E-Mail direkt sichtbar (Ole, 14.11.2026: war unter „Mehr“ versteckt). Mit Postfach aus der App, sonst Mailprogramm. */}
          <ActionTile
            icon={Mail}
            label="E-Mail"
            href={!p.mailReady && p.email ? `mailto:${p.email}` : undefined}
            onClick={p.mailReady ? () => window.dispatchEvent(new Event(LEAD_MAIL_EVENT)) : undefined}
          />
          <ActionTile icon={CalendarPlus} label="Termin" href={p.bookingSlug ? `/book/${p.bookingSlug}?lead=${p.leadId}` : undefined} external />
          {/* Wiedervorlage direkt neben Anrufen/Chat/Termin (Ole, 13.11.2026: war zu versteckt) */}
          <ActionTile icon={BellRing} label="Wiedervorlage" onClick={!p.storniert ? () => setOpen("followup") : undefined} />
          <ActionTile icon={MoreHorizontal} label="Mehr" onClick={() => setOpen("more")} />
        </div>

        {dueLabel ? (
          <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
            <BellRing className="h-4 w-4 shrink-0" />
            <button type="button" onClick={() => setOpen("followup")} className="min-w-0 flex-1 truncate text-left">
              <b>Wiedervorlage {dueLabel}</b>
              {p.followUpNote ? ` · ${p.followUpNote}` : ""}
            </button>
            <Button variant="ghost" icon={Pencil} onClick={() => setOpen("followup")} data-followup-edit>
              Ändern
            </Button>
            <Button variant="ghost" icon={Check} onClick={() => followUp(() => clearFollowUpResult(p.leadId), "Wiedervorlage erledigt")}>
              Erledigt
            </Button>
          </div>
        ) : null}
      </header>

      {p.askAfterCall ? (
        <CallOutcomeSheet
          target={afterCall ? { leadId: p.leadId, name: p.name ?? "Lead", source: p.source, kind: p.followUpAt ? "followup" : "lead" } : null}
          bookingSlug={p.bookingSlug}
          onClose={() => setAfterCall(false)}
          onPick={(message, action) => followUp(action, message)}
        />
      ) : null}
      <ActionSheet open={open === "phase"} onClose={() => setOpen(null)} title="Status ändern" actions={phaseActions} />
      <ActionSheet open={open === "more"} onClose={() => setOpen(null)} title={p.name ?? "Lead"} actions={moreActions} />
      <ActionSheet open={open === "lost"} onClose={() => setOpen(null)} title="Warum verloren?" actions={lostActions} />
      <ActionSheet
        open={open === "disq"}
        onClose={() => setOpen(null)}
        title="Warum disqualifiziert?"
        message="Hilft uns, Formular und Zielgruppe zu verbessern."
        actions={DISQUALIFY_REASONS.map((r) => ({ label: r.label, onSelect: () => setStatus("Disqualifiziert" as LeadStatus, "Disqualifiziert", undefined, r.key) }))}
      />

      <AbschlussSheet
        open={open === "win"}
        title="Abschluss"
        source={p.source}
        onClose={() => setOpen(null)}
        onSave={(v) => {
          setOpen(null);
          setStatus("Abschluss" as LeadStatus, "Abschluss", v);
        }}
      />

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

      <Sheet
        open={open === "erase"}
        onClose={() => setOpen(null)}
        title="Daten löschen?"
        message="Für Löschwünsche nach DSGVO. Name, Telefon, E-Mail, Angaben, Notizen, Chats und Termine werden endgültig gelöscht. Für Abrechnung und Zahlen bleibt ein anonymer Eintrag."
      >
        <div className="space-y-2 p-5">
          <p className="text-xs text-[color:var(--muted)]">Termine in Ihrem eigenen Kalender bitte zusätzlich dort löschen.</p>
          <Button variant="danger" size="md" icon={ShieldX} className="w-full" disabled={erasing} onClick={erase}>
            {erasing ? "Wird gelöscht …" : "Endgültig löschen"}
          </Button>
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
    "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] px-1.5 py-2.5 text-center text-[11px] font-semibold leading-tight transition sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
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
      <a href={href} className={cls} onClick={onClick} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
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

/** Notizen: speichern sich beim Verlassen des Feldes von selbst.
 *  Diktieren läuft bewusst über das Mikrofon der Handy-Tastatur (Diktat des
 *  Betriebssystems) – kein eigener Spracherkennungsdienst für Kundendaten. */
export function LeadNotes({ leadId, initial }: { leadId: string; initial: string }) {
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const saved = useRef(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [touch, setTouch] = useState(false);
  const [dictateHint, setDictateHint] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false), 0);
    return () => clearTimeout(t);
  }, []);
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
  function dictate() {
    const el = area.current;
    if (!el) return;
    // Neue Zeile anhängen, damit Diktiertes nicht mitten im alten Text landet.
    if (value && !value.endsWith("\n")) setValue(`${value}\n`);
    el.focus();
    requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
    setDictateHint(true);
  }
  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Notizen</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[color:var(--muted)]">
            {state === "saving" ? "Speichert …" : state === "saved" ? "Gespeichert" : ""}
          </span>
          {touch ? (
            <button
              type="button"
              onClick={dictate}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[color:var(--border-strong)] px-3 text-sm font-medium hover:border-[color:var(--brand)]"
            >
              <Mic className="h-4 w-4" /> Diktieren
            </button>
          ) : null}
        </div>
      </div>
      <textarea
        ref={area}
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          setDictateHint(false);
          void save();
        }}
        placeholder="Was wurde besprochen? Nächster Schritt?"
        className="block w-full resize-y px-5 py-4 text-base outline-none"
      />
      {dictateHint ? (
        <p className="flex items-center gap-2 border-t border-[color:var(--border)] bg-[color:var(--brand-soft)] px-5 py-2.5 text-sm text-[color:var(--brand-dark)]">
          <Mic className="h-4 w-4 shrink-0" /> Tippen Sie unten in der Tastatur auf das Mikrofon und sprechen Sie. Gespeichert wird automatisch.
        </p>
      ) : null}
    </Card>
  );
}
