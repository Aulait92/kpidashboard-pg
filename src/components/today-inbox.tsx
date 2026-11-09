"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCircle2,
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
import { ActionSheet, Avatar, IconTile, Row, RoundAction, Section, Sheet, type SheetAction } from "@/components/ui/ios";
import type { InboxData } from "@/lib/inbox";

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
  phone: string | null;
  reason: string;
  overdue: boolean;
  conversationId: string | null;
};

type SheetState =
  | { kind: "actions"; title: string; message?: string; actions: SheetAction[] }
  | { kind: "win"; name: string; save: (value: number | null) => void }
  | null;

export function TodayInbox({ data }: { data: InboxData }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [winValue, setWinValue] = useState("");
  const [showAll, setShowAll] = useState(false);
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

  const askWin = (name: string, save: (value: number | null) => void) => {
    setWinValue("");
    setSheet({ kind: "win", name, save });
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
      phone: c.phone,
      reason: `${c.reason} · ${ago(c.createdAt)}`,
      overdue: false,
      conversationId: c.conversationId,
    })),
  ].filter((c) => !hidden.has(c.key));
  const visibleCalls = showAll ? calls : calls.slice(0, 6);
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
    if (c.phone) actions.push({ label: "Anrufen", icon: Phone, href: `tel:+${c.phone}`, tone: "primary" });
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
          setTimeout(() => askWin(c.name, (v) => run(c.key, `${c.name}: Abschluss`, () => callbackOutcomeResult(c.leadId, "won", v))), 0),
      },
      { label: "Lead öffnen", icon: UserRound, href: `/buyer/leads/${c.leadId}` },
      { label: "Kein Interesse", icon: ThumbsDown, tone: "danger", onSelect: () => run(c.key, `${c.name}: kein Interesse`, () => callbackOutcomeResult(c.leadId, "lost")) },
    );
    setSheet({ kind: "actions", title: c.name, message: c.reason, actions });
  };

  return (
    <div>
      {nothing ? (
        <div className="flex flex-col items-center px-6 py-20 text-center">
          <CheckCircle2 className="h-16 w-16 text-[color:var(--green)]" strokeWidth={1.5} />
          <div className="mt-4 text-[22px] font-bold">Alles erledigt</div>
          <div className="mt-1 text-[15px] text-[color:var(--muted)]">Neue Aufgaben erscheinen hier von selbst.</div>
        </div>
      ) : (
        <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile icon={MessageCircle} color="#ff9500" label="Chats" value={chats.length} target="chats" />
          <Tile icon={CalendarClock} color="#007aff" label="Termine" value={appointments.length} target="termine" />
          <Tile icon={Trophy} color="#5856d6" label="Wie lief's?" value={outcomes.length} target="ergebnis" />
          <Tile icon={Phone} color="#34c759" label="Anrufen" value={calls.length} target="anrufen" />
        </div>
      )}

      {chats.length > 0 ? (
        <div id="chats">
          <Section title="Braucht dich" count={chats.length}>
            {chats.map((c) => (
              <Row
                key={c.conversationId}
                leading={<Avatar name={c.name} />}
                title={c.name}
                subtitle={c.reason ?? "Bitte melden"}
                href={`/buyer/chats?c=${c.conversationId}`}
                trailing={
                  <RoundAction
                    icon={Check}
                    label="Erledigt"
                    onClick={() => run(`c:${c.conversationId}`, `${c.name}: erledigt`, () => chatDoneResult(c.conversationId))}
                  />
                }
              />
            ))}
          </Section>
        </div>
      ) : null}

      {appointments.length > 0 ? (
        <div id="termine">
          <Section title="Termine" count={appointments.length}>
            {appointments.map((a) => {
              const video = a.mode === "video";
              const actions: SheetAction[] = [];
              if (video && a.meetUrl) actions.push({ label: "Videocall starten", icon: Video, href: a.meetUrl, tone: "primary" });
              if (a.phone) actions.push({ label: "Anrufen", icon: Phone, href: `tel:+${a.phone}`, tone: video ? undefined : "primary" });
              if (a.conversationId) actions.push({ label: "Chat öffnen", icon: MessageCircle, href: `/buyer/chats?c=${a.conversationId}` });
              if (a.leadId) actions.push({ label: "Lead öffnen", icon: UserRound, href: `/buyer/leads/${a.leadId}` });
              if (a.manageToken) actions.push({ label: "Verschieben oder absagen", icon: CalendarClock, href: `/book/manage/${a.manageToken}` });
              return (
                <Row
                  key={a.id}
                  leading={
                    <div className="w-12 shrink-0 text-center">
                      <div className="text-[17px] font-semibold tabular-nums leading-tight">{time(a.startsAt)}</div>
                      <div className="text-[12px] text-[color:var(--muted)]">{a.isToday ? "heute" : day(a.startsAt)}</div>
                    </div>
                  }
                  title={a.name}
                  subtitle={a.summary ?? (video ? "Videocall" : "Telefonat")}
                  onClick={() => setSheet({ kind: "actions", title: a.name, message: `${a.isToday ? "Heute" : day(a.startsAt)}, ${time(a.startsAt)} Uhr`, actions })}
                  trailing={
                    video && a.meetUrl ? (
                      <RoundAction icon={Video} label="Videocall starten" href={a.meetUrl} color="#34c759" filled />
                    ) : a.phone ? (
                      <RoundAction icon={Phone} label="Anrufen" href={`tel:+${a.phone}`} color="#34c759" filled />
                    ) : null
                  }
                />
              );
            })}
          </Section>
        </div>
      ) : null}

      {outcomes.length > 0 ? (
        <div id="ergebnis">
          <Section title="Wie lief's?" count={outcomes.length}>
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
                        setTimeout(() => askWin(o.name, (v) => run(key, `${o.name}: Abschluss`, () => appointmentOutcomeResult(o.id, "closed", v))), 0),
                    },
                    { label: "Nicht erschienen", icon: UserX, onSelect: () => run(key, `${o.name}: steht jetzt bei Anrufen`, () => appointmentOutcomeResult(o.id, "no_show", null)) },
                    { label: "Kein Interesse", icon: ThumbsDown, tone: "danger", onSelect: () => run(key, `${o.name}: kein Interesse`, () => appointmentOutcomeResult(o.id, "lost", null)) },
                  ],
                });
              return (
                <Row
                  key={o.id}
                  leading={<Avatar name={o.name} />}
                  title={o.name}
                  subtitle={`${day(o.startsAt)}, ${time(o.startsAt)} · ${o.mode === "video" ? "Video" : "Telefon"}`}
                  onClick={open}
                  trailing={
                    <span className="rounded-full bg-[color:var(--fill)] px-3 py-1.5 text-[15px] font-semibold text-[color:var(--brand)]">Eintragen</span>
                  }
                />
              );
            })}
          </Section>
        </div>
      ) : null}

      {calls.length > 0 ? (
        <div id="anrufen">
          <Section title="Anrufen" count={calls.length}>
            {visibleCalls.map((c) => (
              <Row
                key={c.key}
                leading={<Avatar name={c.name} />}
                title={c.name}
                subtitle={
                  c.overdue ? (
                    <>
                      <span className="text-[color:var(--red)]">Überfällig</span> · {c.reason}
                    </>
                  ) : (
                    c.reason
                  )
                }
                onClick={() => callSheet(c)}
                trailing={c.phone ? <RoundAction icon={Phone} label="Anrufen" href={`tel:+${c.phone}`} color="#34c759" filled /> : null}
              />
            ))}
            {calls.length > 6 ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="ui-press h-12 w-full border-t border-[color:var(--border)] text-[17px] text-[color:var(--brand)]"
              >
                {showAll ? "Weniger" : `Alle ${calls.length} anzeigen`}
              </button>
            ) : null}
          </Section>
        </div>
      ) : null}

      <ActionSheet
        open={sheet?.kind === "actions"}
        onClose={() => setSheet(null)}
        title={sheet?.kind === "actions" ? sheet.title : undefined}
        message={sheet?.kind === "actions" ? sheet.message : undefined}
        actions={sheet?.kind === "actions" ? sheet.actions : []}
      />
      <Sheet open={sheet?.kind === "win"} onClose={() => setSheet(null)} title={sheet?.kind === "win" ? `Abschluss mit ${sheet.name}` : undefined} message="Wert des Abschlusses (optional)">
        <form
          className="rounded-b-[14px] border-t border-[color:var(--border)] bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (sheet?.kind !== "win") return;
            const n = Number.parseFloat(winValue.replace(/\./g, "").replace(",", "."));
            const save = sheet.save;
            setSheet(null);
            save(Number.isFinite(n) ? n : null);
          }}
        >
          <div className="flex items-center gap-2 rounded-[10px] bg-[color:var(--fill)] px-3">
            <input
              autoFocus
              inputMode="decimal"
              placeholder="0"
              value={winValue}
              onChange={(e) => setWinValue(e.target.value)}
              className="h-12 min-w-0 flex-1 bg-transparent text-[22px] font-semibold outline-none"
            />
            <span className="text-[17px] text-[color:var(--muted)]">€</span>
          </div>
          <button type="submit" className="mt-3 h-12 w-full rounded-[12px] bg-[color:var(--brand)] text-[17px] font-semibold text-white active:opacity-80">
            Speichern
          </button>
        </form>
      </Sheet>
    </div>
  );
}

function Tile({ icon, color, label, value, target }: { icon: typeof Phone; color: string; label: string; value: number; target: string }) {
  return (
    <a
      href={value ? `#${target}` : undefined}
      className={`ui-press flex flex-col gap-2 rounded-[var(--radius-lg)] bg-white p-3 ${value ? "" : "pointer-events-none"}`}
    >
      <div className="flex items-start justify-between">
        <IconTile icon={icon} color={value ? color : "#c7c7cc"} size={32} />
        <span className={`text-[28px] font-bold leading-none tabular-nums ${value ? "" : "text-[color:var(--border-strong)]"}`}>{value}</span>
      </div>
      <span className="text-[15px] font-semibold text-[color:var(--muted)]">{label}</span>
    </a>
  );
}
