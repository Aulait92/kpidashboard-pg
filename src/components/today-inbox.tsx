"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CalendarCheck,
  CalendarClock,
  BellRing,
  CalendarPlus,
  Check,
  Clock,
  MessageCircle,
  Phone,
  PhoneMissed,
  PhoneOff,
  Send,
  ThumbsDown,
  Trophy,
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
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ActionMenu, type MenuItem } from "@/components/ui/menu";
import { formatPhone } from "@/lib/format";
import { statusLabel, statusToneClass } from "@/lib/products";
import type { InboxData } from "@/lib/inbox";

// Startseite „Heute": eine Aufgabenliste, die man leer arbeitet. Jede Aktion
// wirkt sofort (Eintrag verschwindet), bestätigt per Toast mit „Rückgängig".

const TZ = "Europe/Berlin";
const time = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const day = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "numeric", month: "numeric" }).format(
    new Date(iso),
  );
const since = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "seit heute" : days === 1 ? "seit gestern" : `seit ${days} Tagen`;
};

export function TodayInbox({ data }: { data: InboxData }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  // Lokal ausgeblendete Einträge (sofortige Reaktion vor dem Server-Refresh).
  const [hidden, setHidden] = useState<Set<string>>(new Set());
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

  const appointments = data.appointments.filter((a) => !hidden.has(`a:${a.id}`));
  const followUps = data.followUps.filter((f) => !hidden.has(`f:${f.leadId}`));
  const outcomes = data.outcomes.filter((o) => !hidden.has(`o:${o.id}`));
  const chats = data.chats.filter((c) => !hidden.has(`c:${c.conversationId}`));
  const callbacks = data.callbacks.filter((c) => !hidden.has(`r:${c.leadId}`));
  const [showAllCallbacks, setShowAllCallbacks] = useState(false);
  // Inline-Eingabe des Abschlusswerts nach „Gewonnen" (Schlüssel = Zeile).
  const [winning, setWinning] = useState<{ key: string; leadId: string; name: string } | null>(null);
  const [winValue, setWinValue] = useState("");
  const visibleCallbacks = showAllCallbacks ? callbacks : callbacks.slice(0, 5);
  const openTasks = outcomes.length + chats.length + callbacks.length + followUps.length;

  // Ergebnis „Angebot gesendet" / „Gewonnen" / „Verloren" – überall gleich.
  const closeItems = (key: string, leadId: string, name: string): MenuItem[] => [
    { type: "label", label: "Ergebnis" },
    {
      label: "Angebot gesendet",
      hint: "Wiedervorlage in 3 Tagen",
      icon: Send,
      onSelect: () => run(key, `${name}: Angebot gesendet`, () => callbackOutcomeResult(leadId, "offer")),
    },
    {
      label: "Gewonnen",
      hint: "Abschluss mit Wert eintragen",
      icon: Trophy,
      onSelect: () => {
        setWinValue("");
        setWinning({ key, leadId, name });
      },
    },
    {
      label: "Verloren",
      hint: "Kein Interesse",
      icon: PhoneOff,
      tone: "danger",
      onSelect: () => run(key, `${name}: als verloren markiert`, () => callbackOutcomeResult(leadId, "lost")),
    },
  ];

  /** Zeile durch Wert-Eingabe ersetzen, solange „Gewonnen" offen ist. */
  const winForm = (key: string) =>
    winning?.key === key ? (
      <form
        className="flex shrink-0 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number.parseFloat(winValue.replace(/\./g, "").replace(",", "."));
          const w = winning;
          setWinning(null);
          run(w.key, `${w.name}: gewonnen`, () =>
            callbackOutcomeResult(w.leadId, "won", Number.isFinite(n) ? n : null),
          );
        }}
      >
        <input
          autoFocus
          inputMode="decimal"
          placeholder="Wert in €"
          value={winValue}
          onChange={(e) => setWinValue(e.target.value)}
          className="h-8 w-28 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-2.5 text-sm focus:border-[color:var(--brand)] focus:outline-none"
        />
        <Button variant="primary" type="submit" icon={Trophy}>
          Speichern
        </Button>
        <Button variant="ghost" type="button" onClick={() => setWinning(null)}>
          Abbrechen
        </Button>
      </form>
    ) : null;

  // Wiedervorlage-Optionen (Werktage ab heute) – gleiche Auswahl überall.
  const laterItems = (key: string, leadId: string, name: string): MenuItem[] => [
    { type: "label", label: "Wiedervorlage" },
    ...[
      { label: "Morgen", days: 1 },
      { label: "In 3 Tagen", days: 3 },
      { label: "In 1 Woche", days: 5 },
      { label: "In 2 Wochen", days: 10 },
    ].map((o) => ({
      label: o.label,
      icon: Clock,
      onSelect: () =>
        run(key, `${name}: Wiedervorlage ${o.label === "Morgen" ? "morgen" : o.label}`, () =>
          setFollowUpResult(leadId, { days: o.days }),
        ),
    })),
  ];

  return (
    <div className="space-y-6">
      {/* Kurzüberblick */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat icon={CalendarClock} label="Termine heute & morgen" value={appointments.length} />
        <Stat icon={CalendarCheck} label="Ergebnis eintragen" value={outcomes.length} tone={outcomes.length ? "violet" : undefined} />
        <Stat icon={BellRing} label="Wiedervorlagen" value={followUps.length} tone={followUps.length ? "violet" : undefined} />
        <Stat icon={MessageCircle} label="Chats brauchen dich" value={chats.length} tone={chats.length ? "rose" : undefined} />
        <Stat icon={Phone} label="Rückrufe" value={callbacks.length} tone={callbacks.length ? "amber" : undefined} />
      </div>

      {openTasks === 0 && appointments.length === 0 ? (
        <Card>
          <EmptyState
            icon={Check}
            title="Alles erledigt"
            text="Keine Termine, Rückrufe oder Chats, die auf dich warten. Neue Aufgaben erscheinen hier automatisch."
          />
        </Card>
      ) : null}

      {appointments.length > 0 ? (
        <Card>
          <CardHeader icon={CalendarClock} title="Termine" count={appointments.length} hint="Heute und morgen" />
          <ul className="divide-y divide-[color:var(--border)]">
            {appointments.map((a) => (
              <li key={a.id} className="ui-fade-in flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 gap-4">
                  <div className="w-14 shrink-0">
                    <div className="text-lg font-semibold leading-none tabular-nums">{time(a.startsAt)}</div>
                    <div className="mt-1 text-[11px] text-[color:var(--muted)]">{a.isToday ? "heute" : day(a.startsAt)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.leadId ? (
                        <Link href={`/buyer/leads/${a.leadId}`} className="font-medium hover:text-[color:var(--brand)]">
                          {a.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{a.name}</span>
                      )}
                      <Badge tone="brand" icon={a.mode === "video" ? Video : Phone}>
                        {a.mode === "video" ? "Videocall" : "Telefonat"}
                      </Badge>
                    </div>
                    {a.summary ? (
                      <p className="mt-1 line-clamp-2 text-xs text-[color:var(--muted)]">{a.summary}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {a.mode === "video" && a.meetUrl ? (
                    <ButtonLink href={a.meetUrl} variant="primary" icon={Video}>
                      Videocall starten
                    </ButtonLink>
                  ) : a.phone ? (
                    <ButtonLink href={`tel:+${a.phone}`} variant="primary" icon={Phone}>
                      {formatPhone(a.phone)}
                    </ButtonLink>
                  ) : null}
                  {a.conversationId ? (
                    <ButtonLink href={`/buyer/chats?c=${a.conversationId}`} icon={MessageCircle}>
                      Chat
                    </ButtonLink>
                  ) : null}
                  {a.manageToken ? (
                    <ButtonLink href={`/book/manage/${a.manageToken}`} external variant="ghost">
                      Verschieben
                    </ButtonLink>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {outcomes.length > 0 ? (
        <Card>
          <CardHeader icon={CalendarCheck} title="Wie lief's?" count={outcomes.length} hint="Ergebnis eintragen, zählt in deine Abschlussquote" />
          <ul className="divide-y divide-[color:var(--border)]">
            {outcomes.map((o) => (
              <OutcomeRow
                key={o.id}
                o={o}
                onDone={(outcome, value, label) =>
                  run(`o:${o.id}`, `${o.name}: ${label}`, () => appointmentOutcomeResult(o.id, outcome, value))
                }
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {chats.length > 0 ? (
        <Card>
          <CardHeader icon={MessageCircle} title="Chats brauchen dich" count={chats.length} />
          <ul className="divide-y divide-[color:var(--border)]">
            {chats.map((c) => (
              <li key={c.conversationId} className="ui-fade-in flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                    {c.name}
                  </div>
                  <p className="mt-0.5 text-xs text-[color:var(--muted)]">{c.reason ?? "Bitte beim Lead melden."}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <ButtonLink href={`/buyer/chats?c=${c.conversationId}`} variant="primary" icon={MessageCircle}>
                    Antworten
                  </ButtonLink>
                  <Button
                    variant="ghost"
                    icon={Check}
                    onClick={() => run(`c:${c.conversationId}`, `${c.name}: erledigt`, () => chatDoneResult(c.conversationId))}
                  >
                    Erledigt
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {followUps.length > 0 ? (
        <Card menus>
          <CardHeader icon={BellRing} title="Wiedervorlagen" count={followUps.length} hint="Heute fällig" />
          <ul className="divide-y divide-[color:var(--border)]">
            {followUps.map((f) => (
              <li key={f.leadId} className="ui-fade-in flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/buyer/leads/${f.leadId}`} className="font-medium hover:text-[color:var(--brand)]">
                      {f.name}
                    </Link>
                    {f.status ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusToneClass(f.status)}`}>
                        {statusLabel(f.status, true)}
                      </span>
                    ) : null}
                    {f.overdue ? <Badge tone="danger">überfällig</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                    {f.note ?? "Wiedervorlage"}
                    {f.overdue ? ` · fällig seit ${day(f.dueAt)}` : ""}
                  </p>
                </div>
                {winForm(`f:${f.leadId}`) ?? (
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
                  {f.phone ? (
                    <ButtonLink href={`tel:+${f.phone}`} variant="primary" icon={Phone}>
                      <span className="sm:hidden">Anrufen</span>
                      <span className="hidden sm:inline">{formatPhone(f.phone)}</span>
                    </ButtonLink>
                  ) : null}
                  <Button
                    icon={Check}
                    onClick={() => run(`f:${f.leadId}`, `${f.name}: Wiedervorlage erledigt`, () => clearFollowUpResult(f.leadId))}
                  >
                    Erledigt
                  </Button>
                  <ActionMenu
                    label="Ergebnis"
                    items={[...laterItems(`f:${f.leadId}`, f.leadId, f.name), ...closeItems(`f:${f.leadId}`, f.leadId, f.name)]}
                  />
                </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {callbacks.length > 0 ? (
        <Card tone="attention" menus>
          <CardHeader icon={Phone} title="Rückrufe" count={callbacks.length} hint="Nach dem Anruf Ergebnis wählen" />
          <ul className="divide-y divide-[color:var(--border)]">
            {visibleCallbacks.map((c) => (
              <li key={c.leadId} className="ui-fade-in flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <Link href={`/buyer/leads/${c.leadId}`} className="font-medium hover:text-[color:var(--brand)]">
                    {c.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                    <span className="text-amber-700">{c.reason}</span> · {since(c.createdAt)}
                    {c.conversationId ? (
                      <>
                        {" · "}
                        <Link href={`/buyer/chats?c=${c.conversationId}`} className="hover:text-[color:var(--brand)]">
                          Chat lesen
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {winForm(`r:${c.leadId}`) ?? (
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
                  {c.phone ? (
                    <ButtonLink href={`tel:+${c.phone}`} variant="primary" icon={Phone}>
                      <span className="sm:hidden">Anrufen</span>
                      <span className="hidden sm:inline">{formatPhone(c.phone)}</span>
                    </ButtonLink>
                  ) : null}
                  {data.bookingSlug ? (
                    <ButtonLink href={`/book/${data.bookingSlug}?lead=${c.leadId}`} external icon={CalendarPlus}>
                      Termin
                    </ButtonLink>
                  ) : null}
                  <ActionMenu
                    label="Ergebnis"
                    items={[
                      {
                        label: "Nicht erreicht",
                        hint: "Morgen wieder in der Liste",
                        icon: PhoneMissed,
                        onSelect: () =>
                          run(`r:${c.leadId}`, `${c.name}: nicht erreicht, morgen wieder`, () =>
                            callbackOutcomeResult(c.leadId, "not_reached"),
                          ),
                      },
                      ...laterItems(`r:${c.leadId}`, c.leadId, c.name),
                      ...closeItems(`r:${c.leadId}`, c.leadId, c.name),
                    ]}
                  />
                </div>
                )}
              </li>
            ))}
          </ul>
          {callbacks.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAllCallbacks((v) => !v)}
              className="w-full border-t border-[color:var(--border)] py-2.5 text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
            >
              {showAllCallbacks ? "Weniger anzeigen" : `Alle ${callbacks.length} anzeigen`}
            </button>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function OutcomeRow({
  o,
  onDone,
}: {
  o: InboxData["outcomes"][number];
  onDone: (outcome: "offer" | "closed" | "lost" | "no_show", value: number | null, label: string) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [value, setValue] = useState("");
  return (
    <li className="ui-fade-in flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <Link href={`/buyer/leads/${o.leadId}`} className="font-medium hover:text-[color:var(--brand)]">
          {o.name}
        </Link>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">
          {day(o.startsAt)}, {time(o.startsAt)} Uhr · {o.mode === "video" ? "Videocall" : "Telefonat"}
        </p>
      </div>
      {closing ? (
        <form
          className="flex shrink-0 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number.parseFloat(value.replace(/\./g, "").replace(",", "."));
            onDone("closed", Number.isFinite(n) ? n : null, "Abschluss eingetragen");
          }}
        >
          <input
            autoFocus
            inputMode="decimal"
            placeholder="Wert in €"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 w-28 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-2.5 text-sm focus:border-[color:var(--brand)] focus:outline-none"
          />
          <Button variant="primary" type="submit" icon={Trophy}>
            Speichern
          </Button>
          <Button variant="ghost" type="button" onClick={() => setClosing(false)}>
            Abbrechen
          </Button>
        </form>
      ) : (
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
          <Button icon={CalendarCheck} onClick={() => onDone("offer", null, "Angebot gesendet")}>
            Angebot gesendet
          </Button>
          <Button icon={Trophy} onClick={() => setClosing(true)} className="text-emerald-700">
            Abschluss
          </Button>
          <Button icon={ThumbsDown} onClick={() => onDone("lost", null, "kein Interesse")}>
            Kein Interesse
          </Button>
          <Button variant="ghost" icon={UserX} onClick={() => onDone("no_show", null, "nicht erschienen, steht in den Rückrufen")}>
            Nicht erschienen
          </Button>
        </div>
      )}
    </li>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Phone;
  label: string;
  value: number;
  tone?: "rose" | "amber" | "violet";
}) {
  const toneCls =
    tone === "rose"
      ? "text-rose-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "violet"
          ? "text-violet-600"
          : "text-[color:var(--foreground)]";
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--muted)]">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}

