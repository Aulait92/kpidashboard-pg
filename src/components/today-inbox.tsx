"use client";

import { useProvisionRates } from "@/components/provision-context";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock,
  MessageCircle,
  Phone,
  PhoneMissed,
  Send,
  ThumbsDown,
  Trophy,
  UserRound,
  UserX,
  Video,
  X,
  SkipForward,
  PlayCircle,
} from "lucide-react";
import {
  appointmentOutcomeResult,
  callbackOutcomeResult,
  chatDoneResult,
  clearFollowUpResult,
  setFollowUpResult,
  undoInboxAction,
  type InboxResult,
} from "@/app/buyer/inbox-actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Button, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { ActionSheet, TapRow, type SheetAction } from "@/components/ui/sheet";
import type { InboxData } from "@/lib/inbox";
import { CallOutcomeSheet, useCallReturn, type CallOutcomeTarget } from "@/components/call-outcome";
import { AbschlussSheet, asksCloseValue } from "@/components/abschluss-sheet";

// Startseite „Heute": vier Listen, die man leer arbeitet. Jede Zeile hat eine
// sichtbare Aktion (Anrufen/Antworten); alles Weitere per Antippen im
// Aktionsblatt. Jede Aktion wirkt sofort, Toast mit „Rückgängig".

const TZ = "Europe/Berlin";
const time = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const day = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "numeric", month: "numeric" }).format(new Date(iso));
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "heute" : d === 1 ? "gestern" : `vor ${d} Tagen`;
};

type CallItem = {
  key: string;
  kind: "callback" | "followup";
  leadId: string;
  name: string;
  source: string | null;
  phone: string | null;
  reason: string;
  overdue: boolean;
  conversationId: string | null;
};

type SheetState =
  | { kind: "actions"; title: string; message?: string; actions: SheetAction[] }
  | { kind: "win"; name: string; source: string | null; save: (value: number | null) => void }
  | null;

export function TodayInbox({
  data,
  newUi = false,
  leadHref = "/buyer/leads/{id}",
  selectedLeadId = null,
}: {
  data: InboxData;
  /** Neue Oberfläche: Details rechts (Desktop), Anrufmodus, „Wie lief's?“ nach jedem Anruf. */
  newUi?: boolean;
  /** Ziel „Lead öffnen“; {id} wird ersetzt. */
  leadHref?: string;
  /** Rechts geöffneter Kontakt (Desktop) – Zeile wird hervorgehoben. */
  selectedLeadId?: string | null;
}) {
  const router = useRouter();
  const leadUrl = (id: string) => leadHref.replace("{id}", id);
  const [outcome, setOutcome] = useState<(CallOutcomeTarget & { key: string }) | null>(null);
  const [callMode, setCallMode] = useState<{ queue: CallItem[]; i: number } | null>(null);
  // Zuletzt angerufener Kontakt (im Klick gesetzt, nicht beim Rendern).
  const lastCall = useRef<CallItem | null>(null);
  const markCallReturn = useCallReturn((key) => {
    const c = lastCall.current;
    if (c && c.key === key) setOutcome({ key: c.key, leadId: c.leadId, name: c.name, source: c.source, kind: c.kind });
  });
  const markCall = (c: CallItem) => {
    lastCall.current = c;
    markCallReturn(c.key);
  };
  /** Desktop (neue Oberfläche): Zeile öffnet die Details rechts statt eines Auswahlfensters. */
  const openDetailOnDesktop = (leadId: string | null | undefined) => {
    if (!newUi || !leadId || typeof window === "undefined" || !window.matchMedia("(min-width: 1280px)").matches) return false;
    router.push(leadUrl(leadId), { scroll: false });
    return true;
  };
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [showAll, setShowAll] = useState(false);
  const provisionRates = useProvisionRates();
  const hide = (key: string) => setHidden((h) => new Set(h).add(key));
  const unhide = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      n.delete(key);
      return n;
    });

  function run(key: string, message: string, action: () => Promise<InboxResult>) {
    hide(key);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        unhide(key);
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      const undo = res.undo;
      toast.show({
        message,
        ...(undo
          ? {
              actionLabel: "Rückgängig",
              onAction: () =>
                startTransition(async () => {
                  await undoInboxAction(undo);
                  unhide(key);
                  router.refresh();
                }),
            }
          : {}),
      });
      router.refresh();
    });
  }

  // Fester Provisionsbetrag (Regelart „fixed“): ohne Eingabe direkt speichern.
  const askWin = (name: string, source: string | null, save: (value: number | null) => void) => {
    if (!asksCloseValue(source, provisionRates)) return save(null);
    setSheet({ kind: "win", name, source, save });
  };

  const appointments = data.appointments.filter((a) => !hidden.has(`a:${a.id}`));
  const outcomes = data.outcomes.filter((o) => !hidden.has(`o:${o.id}`));
  const chats = data.chats.filter((c) => !hidden.has(`c:${c.conversationId}`));
  // Rückrufe und Wiedervorlagen sind für den Nutzer dasselbe: anrufen.
  const calls: CallItem[] = [
    ...data.followUps.map((f) => ({
      key: `f:${f.leadId}`,
      kind: "followup" as const,
      leadId: f.leadId,
      name: f.name,
      source: f.source,
      phone: f.phone,
      reason: f.note ?? "Nachfassen",
      overdue: f.overdue,
      conversationId: f.conversationId,
    })),
    ...data.callbacks.map((c) => ({
      key: `r:${c.leadId}`,
      kind: "callback" as const,
      leadId: c.leadId,
      name: c.name,
      source: c.source,
      phone: c.phone,
      reason: `${c.reason} · ${ago(c.createdAt)}`,
      overdue: false,
      conversationId: c.conversationId,
    })),
  ].filter((c) => !hidden.has(c.key));
  const visibleCalls = showAll ? calls : calls.slice(0, 6);
  const current = callMode ? callMode.queue[callMode.i] : null;
  const advance = () =>
    setCallMode((m) => {
      if (!m) return m;
      if (m.i + 1 >= m.queue.length) {
        toast.show({ message: "Anrufliste fertig. Gute Arbeit!" });
        return null;
      }
      return { ...m, i: m.i + 1 };
    });
  const nothing = appointments.length + outcomes.length + chats.length + calls.length === 0;

  const laterSheet = (c: CallItem) =>
    setSheet({
      kind: "actions",
      title: `${c.name} später anrufen`,
      actions: [
        { label: "Morgen", days: 1 },
        { label: "In 3 Tagen", days: 3 },
        { label: "In 1 Woche", days: 5 },
        { label: "In 2 Wochen", days: 10 },
      ].map((o) => ({
        label: o.label,
        onSelect: () => run(c.key, `${c.name}: ${o.label === "Morgen" ? "morgen" : o.label.toLowerCase()} wieder`, () => setFollowUpResult(c.leadId, { days: o.days })),
      })),
    });

  const callSheet = (c: CallItem) => {
    const actions: SheetAction[] = [];
    if (c.phone) actions.push({ label: "Anrufen", icon: Phone, href: `tel:+${c.phone}`, tone: "primary", onSelect: newUi ? () => markCall(c) : undefined });
    if (c.kind === "callback") {
      actions.push({
        label: "Nicht erreicht",
        icon: PhoneMissed,
        onSelect: () => run(c.key, `${c.name}: morgen wieder in der Liste`, () => callbackOutcomeResult(c.leadId, "not_reached")),
      });
    } else {
      actions.push({ label: "Erledigt", icon: Check, onSelect: () => run(c.key, `${c.name}: erledigt`, () => clearFollowUpResult(c.leadId)) });
    }
    actions.push({ label: "Später", icon: Clock, onSelect: () => setTimeout(() => laterSheet(c), 0) });
    if (data.bookingSlug) actions.push({ label: "Termin buchen", icon: CalendarPlus, href: `/book/${data.bookingSlug}?lead=${c.leadId}` });
    actions.push(
      { label: "Angebot gesendet", icon: Send, onSelect: () => run(c.key, `${c.name}: Angebot gesendet`, () => callbackOutcomeResult(c.leadId, "offer")) },
      {
        label: "Abschluss",
        icon: Trophy,
        onSelect: () =>
          setTimeout(() => askWin(c.name, c.source, (v) => run(c.key, `${c.name}: Abschluss`, () => callbackOutcomeResult(c.leadId, "won", v))), 0),
      },
      { label: "Lead öffnen", icon: UserRound, href: leadUrl(c.leadId) },
      { label: "Kein Interesse", icon: ThumbsDown, tone: "danger", onSelect: () => run(c.key, `${c.name}: kein Interesse`, () => callbackOutcomeResult(c.leadId, "lost")) },
    );
    setSheet({ kind: "actions", title: c.name, message: c.reason, actions });
  };

  // Kleiner Pfeil rechts: Zeile antippen öffnet weitere Aktionen.
  const more = <ChevronRight className="hidden h-4 w-4 shrink-0 text-[color:var(--border-strong)] sm:block" />;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const sel = (leadId: string | null | undefined) =>
    newUi && leadId && leadId === selectedLeadId ? "xl:bg-[color:var(--brand-soft)] xl:hover:bg-[color:var(--brand-soft)]" : undefined;

  return (
    <div className="space-y-6">
      {nothing ? (
        <Card>
          <EmptyState icon={Check} title="Alles erledigt" text="Neue Aufgaben erscheinen hier von selbst." />
        </Card>
      ) : (
        <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", newUi && "xl:grid-cols-2")}>
          <Tile icon={MessageCircle} tone="rose" label="Chats" value={chats.length} target="chats" />
          <Tile icon={CalendarClock} tone="brand" label="Termine" value={appointments.length} target="termine" />
          <Tile icon={Trophy} tone="violet" label="Wie lief's?" value={outcomes.length} target="ergebnis" />
          <Tile icon={Phone} tone="emerald" label="Anrufen" value={calls.length} target="anrufen" />
        </div>
      )}

      {chats.length > 0 ? (
        <Card>
          <div id="chats" className="scroll-mt-20" />
          <CardHeader icon={MessageCircle} title="Braucht dich" count={chats.length} />
          <ul className="divide-y divide-[color:var(--border)]">
            {chats.map((c) => (
              <TapRow
                key={c.conversationId}
                onTap={() =>
                  setSheet({
                    kind: "actions",
                    title: c.name,
                    message: c.reason ?? undefined,
                    actions: [
                      { label: "Antworten", icon: MessageCircle, href: `/buyer/chats?c=${c.conversationId}`, tone: "primary" },
                      { label: "Erledigt", icon: Check, onSelect: () => run(`c:${c.conversationId}`, `${c.name}: erledigt`, () => chatDoneResult(c.conversationId)) },
                    ],
                  })
                }
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}</div>
                  <p className="truncate text-xs text-[color:var(--muted)]">{c.reason ?? "Bitte melden"}</p>
                </div>
                <span onClick={stop}>
                  <ButtonLink href={`/buyer/chats?c=${c.conversationId}`} variant="primary" icon={MessageCircle}>
                    Antworten
                  </ButtonLink>
                </span>
                {more}
              </TapRow>
            ))}
          </ul>
        </Card>
      ) : null}

      {appointments.length > 0 ? (
        <Card>
          <div id="termine" className="scroll-mt-20" />
          <CardHeader icon={CalendarClock} title="Termine" count={appointments.length} />
          <ul className="divide-y divide-[color:var(--border)]">
            {appointments.map((a) => {
              const video = a.mode === "video";
              const actions: SheetAction[] = [];
              if (video && a.meetUrl) actions.push({ label: "Videocall starten", icon: Video, href: a.meetUrl, tone: "primary" });
              if (a.phone) actions.push({ label: "Anrufen", icon: Phone, href: `tel:+${a.phone}`, tone: video ? undefined : "primary" });
              if (a.conversationId) actions.push({ label: "Chat öffnen", icon: MessageCircle, href: `/buyer/chats?c=${a.conversationId}` });
              if (a.leadId) actions.push({ label: "Lead öffnen", icon: UserRound, href: leadUrl(a.leadId) });
              if (a.manageToken) actions.push({ label: "Verschieben oder absagen", icon: CalendarClock, href: `/book/manage/${a.manageToken}` });
              return (
                <TapRow
                  key={a.id}
                  className={sel(a.leadId)}
                  onTap={() => openDetailOnDesktop(a.leadId) || setSheet({ kind: "actions", title: a.name, message: `${a.isToday ? "Heute" : day(a.startsAt)}, ${time(a.startsAt)} Uhr · ${video ? "Videocall" : "Telefonat"}`, actions })}
                >
                  <div className="w-12 shrink-0">
                    <div className="text-lg font-semibold leading-none tabular-nums">{time(a.startsAt)}</div>
                    <div className="mt-1 text-[11px] text-[color:var(--muted)]">{a.isToday ? "heute" : day(a.startsAt)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{a.name}</div>
                    <p className="truncate text-xs text-[color:var(--muted)]">{a.summary ?? (video ? "Videocall" : "Telefonat")}</p>
                  </div>
                  <span onClick={stop}>
                    {video && a.meetUrl ? (
                      <ButtonLink href={a.meetUrl} variant="primary" icon={Video}>
                        Starten
                      </ButtonLink>
                    ) : a.phone ? (
                      <ButtonLink href={`tel:+${a.phone}`} variant="primary" icon={Phone}>
                        Anrufen
                      </ButtonLink>
                    ) : null}
                  </span>
                  {more}
                </TapRow>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {outcomes.length > 0 ? (
        <Card>
          <div id="ergebnis" className="scroll-mt-20" />
          <CardHeader icon={Trophy} title="Wie lief's?" count={outcomes.length} />
          <ul className="divide-y divide-[color:var(--border)]">
            {outcomes.map((o) => {
              const key = `o:${o.id}`;
              const open = () =>
                setSheet({
                  kind: "actions",
                  title: `Wie lief der Termin mit ${o.name}?`,
                  actions: [
                    { label: "Angebot gesendet", icon: Send, onSelect: () => run(key, `${o.name}: Angebot gesendet`, () => appointmentOutcomeResult(o.id, "offer", null)) },
                    {
                      label: "Abschluss",
                      icon: Trophy,
                      onSelect: () =>
                        setTimeout(() => askWin(o.name, o.source, (v) => run(key, `${o.name}: Abschluss`, () => appointmentOutcomeResult(o.id, "closed", v))), 0),
                    },
                    { label: "Nicht erschienen", icon: UserX, onSelect: () => run(key, `${o.name}: steht jetzt bei Anrufen`, () => appointmentOutcomeResult(o.id, "no_show", null)) },
                    { label: "Kein Interesse", icon: ThumbsDown, tone: "danger", onSelect: () => run(key, `${o.name}: kein Interesse`, () => appointmentOutcomeResult(o.id, "lost", null)) },
                  ],
                });
              return (
                <TapRow key={o.id} className={sel(o.leadId)} onTap={() => openDetailOnDesktop(o.leadId) || open()}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{o.name}</div>
                    <p className="truncate text-xs text-[color:var(--muted)]">
                      {day(o.startsAt)}, {time(o.startsAt)} Uhr · {o.mode === "video" ? "Videocall" : "Telefonat"}
                    </p>
                  </div>
                  <Button
                    icon={Trophy}
                    onClick={(e) => {
                      e.stopPropagation();
                      open();
                    }}
                  >
                    Ergebnis
                  </Button>
                  {more}
                </TapRow>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {calls.length > 0 ? (
        <Card>
          <div id="anrufen" className="scroll-mt-20" />
          <CardHeader
            icon={Phone}
            title="Anrufen"
            count={calls.length}
            actions={
              newUi && calls.some((c) => c.phone) ? (
                <Button variant="primary" icon={PlayCircle} onClick={() => setCallMode({ queue: calls.filter((c) => c.phone), i: 0 })}>
                  Anrufliste starten
                </Button>
              ) : undefined
            }
          />
          <ul className="divide-y divide-[color:var(--border)]">
            {visibleCalls.map((c) => (
              <TapRow key={c.key} className={sel(c.leadId)} onTap={() => openDetailOnDesktop(c.leadId) || callSheet(c)}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}</div>
                  <p className="truncate text-xs text-[color:var(--muted)]">
                    {c.overdue ? <span className="font-medium text-rose-600">Überfällig · </span> : null}
                    {c.reason}
                  </p>
                </div>
                {c.phone ? (
                  <span
                    onClick={(e) => {
                      stop(e);
                      if (newUi) markCall(c);
                    }}
                  >
                    <ButtonLink href={`tel:+${c.phone}`} variant="primary" icon={Phone}>
                      Anrufen
                    </ButtonLink>
                  </span>
                ) : null}
                {more}
              </TapRow>
            ))}
          </ul>
          {calls.length > 6 ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full border-t border-[color:var(--border)] py-2.5 text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
            >
              {showAll ? "Weniger anzeigen" : `Alle ${calls.length} anzeigen`}
            </button>
          ) : null}
        </Card>
      ) : null}

      {current && callMode ? (
        <CallModePanel
          item={current}
          index={callMode.i}
          total={callMode.queue.length}
          onCall={() => markCall(current)}
          onResult={() => setOutcome({ key: current.key, leadId: current.leadId, name: current.name, source: current.source, kind: current.kind })}
          onSkip={advance}
          onEnd={() => setCallMode(null)}
        />
      ) : null}
      <CallOutcomeSheet
        target={outcome}
        bookingSlug={data.bookingSlug}
        onClose={() => setOutcome(null)}
        onPick={(message, action) => {
          const key = outcome?.key;
          if (key) run(key, message, action);
          if (callMode && key && callMode.queue[callMode.i]?.key === key) advance();
        }}
      />
      <ActionSheet
        open={sheet?.kind === "actions"}
        onClose={() => setSheet(null)}
        title={sheet?.kind === "actions" ? sheet.title : undefined}
        message={sheet?.kind === "actions" ? sheet.message : undefined}
        actions={sheet?.kind === "actions" ? sheet.actions : []}
      />
      <AbschlussSheet
        open={sheet?.kind === "win"}
        title={sheet?.kind === "win" ? `Abschluss mit ${sheet.name}` : ""}
        source={sheet?.kind === "win" ? sheet.source : null}
        onClose={() => setSheet(null)}
        onSave={(v) => {
          if (sheet?.kind !== "win") return;
          const save = sheet.save;
          setSheet(null);
          save(v);
        }}
      />
    </div>
  );
}

function Tile({
  icon: Icon,
  tone,
  label,
  value,
  target,
}: {
  icon: typeof Phone;
  tone: "rose" | "brand" | "violet" | "emerald";
  label: string;
  value: number;
  target: string;
}) {
  const color = { rose: "text-rose-600", brand: "text-blue-600", violet: "text-violet-600", emerald: "text-emerald-600" }[tone];
  return (
    <a
      href={value ? `#${target}` : undefined}
      className={`rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3 shadow-[var(--shadow-sm)] transition ${value ? "hover:border-[color:var(--border-strong)]" : "pointer-events-none"}`}
    >
      <div className="flex items-center gap-1.5 text-xs text-[color:var(--muted)]">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${value ? color : "text-[color:var(--muted)]"}`}>{value}</div>
    </a>
  );
}

/** Anrufmodus: eine Person nach der anderen, großer Anrufen-Knopf. */
function CallModePanel({
  item,
  index,
  total,
  onCall,
  onResult,
  onSkip,
  onEnd,
}: {
  item: CallItem;
  index: number;
  total: number;
  onCall: () => void;
  onResult: () => void;
  onSkip: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[color:var(--background)] md:items-center md:justify-center md:bg-slate-900/40" role="dialog" aria-label="Anrufliste">
      <div className="flex w-full flex-1 flex-col bg-[color:var(--background)] md:max-w-lg md:flex-none md:rounded-[var(--radius-lg)] md:shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <div>
            <div className="text-base font-semibold">Anrufliste</div>
            <div className="text-base text-[color:var(--muted)]">
              {index + 1} von {total}
            </div>
          </div>
          <button type="button" onClick={onEnd} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-base font-medium text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]">
            <X className="h-5 w-5" /> Beenden
          </button>
        </div>
        <div className="h-1 w-full bg-[color:var(--surface-sunken)]">
          <div className="h-1 bg-[color:var(--brand)] transition-all" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <div className="flex flex-1 flex-col justify-center px-6 py-8 md:flex-none">
          {item.overdue ? <div className="mb-2 text-base font-semibold text-rose-600">Überfällig</div> : null}
          <div className="text-3xl font-semibold tracking-tight">{item.name}</div>
          <p className="mt-2 text-base text-[color:var(--muted)]">{item.reason}</p>
          <a
            href={item.phone ? `tel:+${item.phone}` : undefined}
            onClick={onCall}
            className="mt-8 flex h-16 items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[color:var(--brand)] text-lg font-semibold text-white shadow-[var(--shadow-md)] active:scale-[0.99]"
          >
            <Phone className="h-6 w-6" /> Anrufen
          </a>
          <p className="mt-3 text-center text-base text-[color:var(--muted)]">Nach dem Gespräch fragt die App, wie es lief.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button size="md" icon={Check} onClick={onResult} className="h-12 text-base">
              Ergebnis eintragen
            </Button>
            <Button size="md" icon={SkipForward} onClick={onSkip} className="h-12 text-base">
              Überspringen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
