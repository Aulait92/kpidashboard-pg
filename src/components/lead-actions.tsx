"use client";

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
  MessageCircle,
  MoreHorizontal,
  Phone,
  Pencil,
  ShieldX,
  Trophy,
  X,
} from "lucide-react";
import { eraseLeadAction, setLeadStatusAction, updateLeadDetailsAction } from "@/app/buyer/actions";
import { manualAppointmentAction, startLeadChatAction } from "@/app/buyer/lead-manual-actions";
import { SlotPicker } from "@/components/lead-booking";
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
import { attemptMessage, emitLeadAction, emitNotReachedOffer, LostSheet, useStepDone } from "@/components/next-step";

// Kopf des Lead-Details: Status antippen → Phase wählen; darunter eine Reihe
// mit den Aktionen. Alles Seltene steckt unter „Mehr".

type Props = {
  /** Eigenes Postfach verbunden: E-Mail aus der App. */
  mailReady?: boolean;
  /** E-Mail-Funktionen beim Kunden aus („Meine Gesellschaft erlaubt das nicht“): E-Mail-Knopf und Hinweis ausblenden */
  mailOff?: boolean;
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
  /** Wiedervorlage des Assistenten (Lead bat um später): Zeitpunkt und Anlass. */
  botRecall?: { at: string; note: string | null } | null;
  stornoOptions: StornogrundOption[];
  storniert: boolean;
  canErase?: boolean;
  /** Tage im aktuellen Status (auf dem Server berechnet). */
  daysInPhase?: number | null;
  /** Neue Oberfläche: nach „Anrufen“ und Rückkehr automatisch „Wie lief's?“ fragen. */
  askAfterCall?: boolean;
  /** Produkt (Lead.source): Beitrag beim Abschluss (Monats-/Jahresbeitrag) bzw. kein Feld bei festem Satz. */
  source?: string | null;
  /** WhatsApp im Konto verbunden (für „WhatsApp-Gespräch starten“). */
  whatsappConnected?: boolean;
  /** Ein Termin steht an: Die Terminkarte darunter übernimmt, „Termin“ wandert unter „Mehr“. */
  hasUpcomingAppointment?: boolean;
};

/** Öffnet „Angaben bearbeiten“ im Kontakt (components/lead-stammdaten-edit.tsx). */
export const STAMMDATEN_OPEN_EVENT = "pg:stammdaten-open";
const openStammdaten = () => window.dispatchEvent(new Event(STAMMDATEN_OPEN_EVENT));

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
  const [open, setOpen] = useState<"phase" | "more" | "followup" | "win" | "storno" | "erase" | "lost" | "termin" | "chat" | null>(null);
  const { done: stepDone } = useStepDone();
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

  function setStatus(status: LeadStatus, label: string, closeValue?: number | null, disqualifyReason?: string, sparte?: string | null) {
    // Verloren (Kein Interesse, Disqualifiziert): Grund wählen, Warnung unter 6 Anrufversuchen (Ole, 14.11.2026)
    if ((status === "Disqualifiziert" || status === "Kein Interesse") && !disqualifyReason) {
      setTimeout(() => setOpen("lost"), 0);
      return;
    }
    start(async () => {
      const res = await setLeadStatusAction(p.leadId, status, {
        ...(closeValue !== undefined ? { closeValue } : {}),
        ...(disqualifyReason ? { disqualifyReason } : {}),
        ...(sparte ? { sparte } : {}),
      });
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: `Status: ${label}` });
      router.refresh();
      emitLeadAction(p.leadId);
    });
  }

  function followUp(fn: () => ReturnType<typeof setFollowUpResult>, message: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      const undo = res.undo;
      toast.show({
        message: res.attempt ? attemptMessage(message, res.attempt) : message,
        ...(undo
          ? { actionLabel: "Rückgängig", onAction: () => start(async () => { await undoInboxAction(undo); router.refresh(); }) }
          : {}),
      });
      router.refresh();
      // Nach „nicht erreicht“: Nachricht anbieten; sonst prüfen, ob es einen nächsten Schritt gibt
      if (res.attempt && !res.attempt.offered) emitNotReachedOffer(p.leadId, p.name ?? "Lead", res.attempt);
      else if (!res.attempt) emitLeadAction(p.leadId);
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

  // Nur Aktionen, die nicht schon als eigene Kachel sichtbar sind (Ole, 14.11.2026: „Wiedervorlage setzen ist doppelt“).
  // Die Kacheln E-Mail und Wiedervorlage stehen auf jeder Breite (Handy: Raster mit 3 Spalten).
  const moreActions: SheetAction[] = [
    ...(p.hasUpcomingAppointment ? [{ label: "Weiteren Termin eintragen", icon: CalendarPlus, onSelect: () => setTimeout(() => setOpen("termin"), 0) }] : []),
    ...(!p.mailReady && !p.mailOff && p.email ? [{ label: "E-Mail aus der App: Postfach verbinden", icon: Mail, href: "/buyer/postfach" }] : []),
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
  const won = phase?.key === "abschluss";
  const lost = !!phase && LOST_KEYS.has(phase.key);
  const showBar = !p.storniert && !won && !lost && stepPhases.length > 1;

  // Anrufen, Chat, Mehr immer; E-Mail, Termin, Wiedervorlage je nach Lage (siehe Kacheln unten)
  const tileCount = 3 + (p.mailOff ? 0 : 1) + (p.hasUpcomingAppointment ? 0 : 1) + (p.followUpAt ? 0 : 1);

  const dueLabel = p.followUpAt
    ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric" }).format(new Date(p.followUpAt))
    : null;

  return (
    <>
      {/* @container: Im schmalen Fenster rechts auf „Heute“ (rund 530 px) wie am Handy der Status-Chip statt der
          Phasenleiste, deren Beschriftungen dort zu „Neuer L…“ gekürzt wurden (16.11.2026). */}
      <header className="@container mb-5">
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
                // Ruhig statt Signalfarbe (UX, Ole 15.11.2026): selten gebraucht, ausgefüllt nur im erreichten Zustand
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 text-sm font-medium transition",
                  won ? "border-emerald-600 bg-emerald-600 text-white" : "border-[color:var(--border)] bg-white text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50",
                )}
              >
                <Trophy className="h-4 w-4" /> Gewonnen
              </button>
              <button
                type="button"
                onClick={() => setOpen("lost")}
                className={cn(
                  "inline-flex h-8 items-center rounded-[var(--radius-sm)] border px-3 text-sm font-medium transition",
                  lost ? "border-rose-600 bg-rose-600 text-white" : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700",
                )}
              >
                Verloren
              </button>
            </div>
          ) : null}
        </div>
        {showBar ? (
          <ol className="mt-3 hidden overflow-hidden rounded-[var(--radius-sm)] @2xl:flex" aria-label="Phasen">
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
                      {current && days ? `${days} ${days === 1 ? "Tag" : "Tage"} · ` : ""}
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
                showBar && "@2xl:hidden",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", PHASE_DOT[phase?.key ?? "neu"] ?? "bg-zinc-400")} />
              {p.statusLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
          <span>eingegangen {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(p.createdAt))}</span>
        </div>

        {/* Handy: 4 Kacheln in einer Reihe, sonst 3 je Reihe (keine einzelne Kachel allein in der zweiten Reihe) */}
        <div className={cn("mt-4 grid gap-1.5 sm:flex sm:flex-wrap sm:gap-2", tileCount === 4 ? "grid-cols-4" : "grid-cols-3")}>
          {/* Grundsatz (Ole, 14.11.2026): Kein Knopf ist grau ohne Erklärung. Fehlt etwas, sagt das Antippen, was und wie es weitergeht. */}
          <ActionTile
            icon={Phone}
            label="Anrufen"
            href={p.phone ? `tel:+${p.phone}` : undefined}
            onClick={p.phone && p.askAfterCall ? () => markCall(p.leadId) : undefined}
            primary
            title={p.phone ? formatPhone(p.phone) : undefined}
            explain={{ title: "Keine Telefonnummer hinterlegt", text: "Tragen Sie die Nummer bei den Angaben zum Lead ein, dann können Sie direkt anrufen.", actions: [{ label: "Angaben ändern", onClick: openStammdaten }] }}
          />
          <ActionTile
            icon={MessageCircle}
            label="Chat"
            href={p.conversationId ? `/buyer/chats?c=${p.conversationId}` : undefined}
            onClick={p.conversationId ? undefined : () => setOpen("chat")}
          />
          {/* E-Mail direkt sichtbar (Ole, 14.11.2026: war unter „Mehr“ versteckt). Mit Postfach aus der App, sonst Mailprogramm. */}
          {p.mailOff ? null : (
          <ActionTile
            icon={Mail}
            label="E-Mail"
            href={!p.mailReady && p.email ? `mailto:${p.email}` : undefined}
            onClick={p.mailReady && p.email ? () => window.dispatchEvent(new Event(LEAD_MAIL_EVENT)) : undefined}
            explain={{ title: "Keine E-Mail-Adresse hinterlegt", text: "Tragen Sie die Adresse bei den Angaben zum Lead ein, dann können Sie direkt schreiben.", actions: [{ label: "Angaben ändern", onClick: openStammdaten }] }}
          />
          )}
          {/* Steht schon ein Termin an, zeigt die Terminkarte ihn (Verschieben, Vorbereiten); kein zweiter Knopf (16.11.2026) */}
          {p.hasUpcomingAppointment ? null : <ActionTile icon={CalendarPlus} label="Termin" onClick={() => setOpen("termin")} />}
          {/* Wiedervorlage direkt neben Anrufen/Chat/Termin (Ole, 13.11.2026: war zu versteckt). Steht schon eine an,
              übernimmt die Leiste darunter (Ändern, Erledigt): kein zweiter Knopf für dasselbe (16.11.2026). */}
          {dueLabel ? null : (
          <ActionTile
            icon={BellRing}
            label="Wiedervorlage"
            onClick={!p.storniert ? () => setOpen("followup") : undefined}
            explain={{ title: "Lead ist storniert", text: "Für stornierte Leads gibt es keine Wiedervorlage mehr. Ist die Stornierung abgelehnt worden, ändern Sie zuerst den Status." }}
          />
          )}
          <ActionTile icon={MoreHorizontal} label="Mehr" onClick={() => setOpen("more")} />
        </div>

        {p.botRecall ? (
          <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900" data-bot-recall-bar>
            <BellRing className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <b>
                Wiedervorlage vom Assistenten{" "}
                {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(p.botRecall.at))} Uhr
              </b>
              {" · meldet sich per WhatsApp"}
              {p.botRecall.note ? ` · ${p.botRecall.note}` : ""}
            </span>
          </div>
        ) : null}

        {dueLabel ? (
          <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
            <BellRing className="h-4 w-4 shrink-0" />
            <button type="button" onClick={() => setOpen("followup")} className="line-clamp-2 min-w-0 flex-1 text-left">
              <b>Wiedervorlage {dueLabel}</b>
              {p.followUpNote ? ` · ${p.followUpNote}` : ""}
            </button>
            {/* Handy: nur Symbole (40 px), damit das Datum nicht abgeschnitten wird */}
            <Button variant="ghost" icon={Pencil} onClick={() => setOpen("followup")} aria-label="Wiedervorlage ändern" className="h-10 shrink-0 px-2.5 sm:h-8 sm:px-3" data-followup-edit>
              <span className="hidden sm:inline">Ändern</span>
            </Button>
            <Button variant="ghost" icon={Check} onClick={() => followUp(() => clearFollowUpResult(p.leadId), "Wiedervorlage erledigt")} aria-label="Wiedervorlage erledigt" className="h-10 shrink-0 px-2.5 sm:h-8 sm:px-3">
              <span className="hidden sm:inline">Erledigt</span>
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
      {open === "lost" ? (
        <LostSheet
          leadId={p.leadId}
          name={p.name ?? "Lead"}
          onClose={() => setOpen(null)}
          onDone={(res, message) => {
            stepDone(res, message);
            emitLeadAction(p.leadId);
          }}
        />
      ) : null}

      <AbschlussSheet
        open={open === "win"}
        title="Abschluss"
        source={p.source}
        onClose={() => setOpen(null)}
        onSave={(v, sp) => {
          setOpen(null);
          setStatus("Abschluss" as LeadStatus, "Abschluss", v, undefined, sp);
        }}
      />

      {open === "termin" ? (
        <TerminSheet leadId={p.leadId} bookingSlug={p.bookingSlug} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); router.refresh(); emitLeadAction(p.leadId); }} />
      ) : null}
      {open === "chat" ? (
        <ChatStartSheet
          leadId={p.leadId}
          name={p.name}
          phone={p.phone}
          whatsappConnected={!!p.whatsappConnected}
          onClose={() => setOpen(null)}
          onStarted={(conversationId) => {
            setOpen(null);
            router.push(`/buyer/chats?c=${conversationId}`);
          }}
        />
      ) : null}

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

type Explain = { title: string; text: string; actions?: { label: string; href?: string; onClick?: () => void }[] };

function ActionTile({
  icon: Icon,
  label,
  href,
  onClick,
  primary,
  external,
  title,
  explain,
}: {
  icon: typeof Phone;
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  external?: boolean;
  title?: string;
  /** Fehlt etwas (kein href/onClick): Antippen erklärt, was fehlt und was man tun kann. */
  explain?: Explain;
}) {
  const [why, setWhy] = useState(false);
  const disabled = !href && !onClick;
  const cls = cn(
    "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] px-1.5 py-2.5 text-center text-[11px] font-semibold leading-tight transition sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
    primary
      ? "bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)]"
      : "border border-[color:var(--border)] bg-white text-[color:var(--foreground)] shadow-[var(--shadow-sm)] hover:border-[color:var(--border-strong)]",
    disabled && (explain ? "opacity-50" : "pointer-events-none opacity-40"),
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
  if (disabled && explain) {
    return (
      <>
        <button type="button" onClick={() => setWhy(true)} className={cls} aria-label={`${label}: ${explain.title}`} data-action-explain>
          {inner}
        </button>
        <Sheet open={why} onClose={() => setWhy(false)} title={explain.title}>
          <div className="space-y-3 p-5 text-sm">
            <p className="text-[color:var(--muted)]">{explain.text}</p>
            {explain.actions?.length ? (
              <div className="flex flex-wrap gap-2">
                {explain.actions.map((a) =>
                  a.href ? (
                    <a key={a.label} href={a.href} className="inline-flex items-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 py-2 font-semibold text-white">
                      {a.label}
                    </a>
                  ) : (
                    <Button
                      key={a.label}
                      variant="primary"
                      size="md"
                      onClick={() => {
                        setWhy(false);
                        a.onClick?.();
                      }}
                    >
                      {a.label}
                    </Button>
                  ),
                )}
              </div>
            ) : null}
          </div>
        </Sheet>
      </>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/** „Termin“: über die Buchungsseite (mit Kalender) oder von Hand eintragen (Ole, 14.11.2026). */
function TerminSheet({ leadId, bookingSlug, onClose, onSaved }: { leadId: string; bookingSlug: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [mode, setMode] = useState("phone");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = () =>
    start(async () => {
      setError(null);
      const r = await manualAppointmentAction(leadId, { date, time, mode, note });
      if (!r.ok) return setError(r.error);
      toast.show({ message: "Termin eingetragen" });
      onSaved();
    });
  return (
    <Sheet open onClose={onClose} title="Termin">
      <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5 text-sm" data-termin-sheet>
        {bookingSlug ? (
          <div className="space-y-2" data-termin-kalender>
            <p className="font-semibold">Freie Zeit in Ihrem Kalender</p>
            <SlotPicker leadId={leadId} onBooked={onSaved} />
          </div>
        ) : (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950" data-termin-ohne-kalender>
            <p>Für Terminbuchungen verbinden Sie Ihren Kalender. Dann sieht der Lead nur Ihre freien Zeiten, und der Termin landet direkt in Ihrem Kalender.</p>
            <a href="/buyer/kalender" className="inline-flex rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 py-2 font-semibold text-white">
              Kalender verbinden
            </a>
          </div>
        )}
        <div className="space-y-3" data-termin-manuell>
          <p className="font-semibold">{bookingSlug ? "Oder von Hand eintragen" : "Termin von Hand eintragen"}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[color:var(--muted)]">Datum</span>
              <input type="date" className="input w-full" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[color:var(--muted)]">Uhrzeit</span>
              <input type="time" step={300} className="input w-full" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[color:var(--muted)]">Art</span>
            <select className="input w-full" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="phone">Telefon</option>
              <option value="video">Video</option>
              <option value="onsite">Vor Ort</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[color:var(--muted)]">Notiz (optional)</span>
            <textarea className="input w-full" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="text-xs text-[color:var(--muted)]">Der Termin steht auf „Heute“ und im Kontakt. In Ihren Kalender wird er nicht übertragen, der Lead bekommt keine automatische Erinnerung.</p>
          {error ? <p className="rounded-[var(--radius-sm)] bg-rose-50 px-3 py-2 text-rose-800">{error}</p> : null}
          <Button variant="primary" size="md" className="w-full" disabled={pending || !date || !time} onClick={save}>
            {pending ? "Wird gespeichert …" : "Termin eintragen"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** „Chat“ ohne Verlauf: WhatsApp-Gespräch mit freigegebener Vorlage starten oder erklären, was fehlt. */
function ChatStartSheet({
  leadId,
  name,
  phone,
  whatsappConnected,
  onClose,
  onStarted,
}: {
  leadId: string;
  name: string | null;
  phone: string | null;
  whatsappConnected: boolean;
  onClose: () => void;
  onStarted: (conversationId: string) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = () =>
    start(async () => {
      setError(null);
      const r = await startLeadChatAction(leadId);
      if (r.ok) return onStarted(r.conversationId);
      if (r.reason === "exists" && r.conversationId) return onStarted(r.conversationId);
      setError(r.error);
    });
  return (
    <Sheet open onClose={onClose} title="WhatsApp-Gespräch starten">
      <div className="space-y-3 p-5 text-sm" data-chat-start>
        {!whatsappConnected ? (
          <>
            <p className="text-[color:var(--muted)]">WhatsApp ist in Ihrem Konto noch nicht verbunden. Danach schreibt Ihr Assistent neue Leads automatisch an.</p>
            <a href="/buyer/einrichtung#whatsapp" className="inline-flex rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 py-2 font-semibold text-white">
              WhatsApp verbinden
            </a>
          </>
        ) : !phone ? (
          <>
            <p className="text-[color:var(--muted)]">Keine Mobilnummer hinterlegt. Tragen Sie die Nummer bei den Angaben zum Lead ein.</p>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                onClose();
                openStammdaten();
              }}
            >
              Angaben ändern
            </Button>
          </>
        ) : (
          <>
            <p className="text-[color:var(--muted)]">
              Mit {name ?? "diesem Lead"} gibt es noch keinen Chat. Wir senden die freigegebene Erstnachricht (passend zur Ansprache) an +{phone}. Antwortet der Lead, geht es im Chat weiter.
            </p>
            {error ? <p className="rounded-[var(--radius-sm)] bg-rose-50 px-3 py-2 text-rose-800">{error}</p> : null}
            <Button variant="primary" size="md" icon={MessageCircle} className="w-full" disabled={pending} onClick={go}>
              {pending ? "Wird gesendet …" : "Erstnachricht senden"}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Notizen: speichern sich beim Verlassen des Feldes von selbst (Diktieren entfernt, Ole 15.11.2026). */
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
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Notizen</h2>
        <span className="text-xs text-[color:var(--muted)]">
          {state === "saving" ? "Speichert …" : state === "saved" ? "Gespeichert" : ""}
        </span>
      </div>
      <textarea
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        placeholder="Was wurde besprochen? Nächster Schritt?"
        className="block w-full resize-y px-5 py-4 text-base outline-none"
      />
    </Card>
  );
}
