"use client";

import { anrufZiel } from "@/lib/anruf-ziel";
import { LEAD_BOOKED_EVENT, openLeadBooking } from "@/components/lead-booking";
import { terminArtLabel } from "@/lib/termin-art";

import { fmtDay, LaterDateSheet } from "@/components/later-date-sheet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  BellRing,
  Calculator,
  CalendarDays,
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
  Presentation,
} from "lucide-react";
import {
  appointmentOutcomeResult,
  callbackOutcomeResult,
  chatDoneResult,
  clearFollowUpResult,
  followUpNotReachedResult,
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
import { abschlussEinTipp } from "@/components/abschluss-nachher";
import { heuteLeer } from "@/lib/leo";
import { BeitragFehltKarte } from "@/components/beitrag-fehlt-karte";
import { RescheduleDialog } from "@/components/reschedule-dialog";
import { attemptMessage, emitNotReachedOffer, LostSheet, NextStepSheet } from "@/components/next-step";
import { emitBdFrage } from "@/components/beratungsdoku-frage";
import { NEXT_STEP_LABEL } from "@/lib/lead-next-step";
import { TerminAnwesenheit } from "@/components/termin-anwesenheit";
import { anwesenheitsFrage } from "@/lib/showup";
import { AngebotSendenSheet, type AngebotZiel } from "@/components/angebot-senden";
import { ANGEBOT_AUFGABE, ANGEBOT_HINWEIS } from "@/lib/angebot-senden";
import { MorgenAutomatisch } from "@/components/morgen-automatisch";
import { DatenschutzKarte } from "@/components/datenschutz-karte";
import type { AutomatischeNachrichten } from "@/lib/nachrichtenplan-server";
import { CrossSellZusatzKnopf } from "@/components/bestand/cross-sell-angebot";
import { istCrossSellAufgabe, type CrossSellVerkauf } from "@/lib/cross-sell-verkauf";
import { eingangAlter, neuerLeadGrund } from "@/lib/eingang-alter";
import { istWartenderNeuerLead } from "@/lib/neue-leads-shared";
import { bestandWarmErledigtAction } from "@/app/buyer/bestand/actions";
import { WARM_TITLE } from "@/lib/bestand/warm-shared";
import { gebeugt } from "@/lib/ansprache";

// Startseite „Heute": vier Listen, die man leer arbeitet. Jede Zeile hat eine
// sichtbare Aktion (Anrufen/Antworten); alles Weitere per Antippen im
// Aktionsblatt. Jede Aktion wirkt sofort, Toast mit „Rückgängig".

const TZ = "Europe/Berlin";
const time = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const day = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "numeric", month: "numeric" }).format(new Date(iso));
// Bei neuen Leads zählt jede Minute: „vor 4 Min.“ statt „heute“ (UX-Runde 19.11.2026)
const ago = (iso: string) => eingangAlter(iso);

const since = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "seit heute" : d === 1 ? "seit gestern" : `seit ${d} Tagen`;
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
  /** Kein WhatsApp: sofort anrufen, steht ganz oben */
  urgent?: boolean;
  /** Was der Assistent schon weiß (Chat-Zusammenfassung) */
  known?: string | null;
  /** Wiedervorlage: „Erledigt, kein weiterer Anruf nötig“ erlaubt (lib/inbox.ts InboxFollowUp.erledigtOk) */
  erledigtOk?: boolean;
  /** Wiedervorlage: fällig seit (ISO), für „Überfällig seit gestern“ */
  dueAt?: string;
  /** Neuer Lead (urgent): Zeile in „Neue Leads“ mit Produkt und Wartezeit */
  neu?: { grund: string; seit: string };
  /** Empfohlene Person: Gesprächseinstieg unter der Zeile (Modul Empfehlungen & Bewertungen) */
  einstieg?: string | null;
};

type SheetState =
  | { kind: "actions"; title: string; message?: string; actions: SheetAction[] }
  | { kind: "date"; title: string; save: (date: string, time?: string) => void }
  | { kind: "reschedule"; appointmentId: string }
  | { kind: "lost"; key: string; leadId: string; name: string; appointmentId?: string | null }
  | { kind: "step"; key: string; leadId: string; name: string; source: string | null; appointmentId: string | null }
  | null;

export function TodayInbox({
  data,
  newUi = false,
  leadHref = "/buyer/leads/{id}",
  selectedLeadId = null,
  zuVorbereiten = [],
  anrufen = null,
  automatisch = null,
  weiteresProdukt = null,
  leer = null,
}: {
  /** Leerer Zustand mit Leo (lib/leo.ts heuteLeer): Mitteilungen an und Wartezeit des Erstanschreibens (null = aus) */
  leer?: { push: boolean; assistentMinuten: number | null } | null;
  /** Wiedervorlage „Weiteres Produkt anbieten?“: Zusatz-Knopf zum Bestandskunden-Modul (nur verfügbar und nicht gebucht) */
  weiteresProdukt?: CrossSellVerkauf | null;
  /** „Morgen: 3 automatische Nachrichten“ (Paket P6) */
  automatisch?: AutomatischeNachrichten | null;
  /** Deep-Link aus dem Push „… hat noch nicht geantwortet. Jetzt anrufen?“ (/buyer?anrufen=<leadId>): Anruf-Blatt öffnen */
  anrufen?: string | null;
  data: InboxData;
  /** Termine, die noch vorbereitet werden müssen (Angebot rechnen): Link „Vorbereiten“ in der Zeile */
  zuVorbereiten?: string[];
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
    if (c && c.key === key) setOutcome({ key: c.key, leadId: c.leadId, name: c.name, source: c.source, kind: c.kind, erledigtOk: c.erledigtOk });
  });
  const markCall = (c: CallItem) => {
    lastCall.current = c;
    markCallReturn(c.key, c.leadId);
  };
  /** Desktop (neue Oberfläche): Zeile öffnet die Details rechts statt eines Auswahlfensters. */
  const openDetailOnDesktop = (leadId: string | null | undefined) => {
    if (!newUi || !leadId || typeof window === "undefined" || !window.matchMedia("(min-width: 1280px)").matches) return false;
    router.push(leadUrl(leadId), { scroll: false });
    return true;
  };
  const vorbereiten = new Set(zuVorbereiten);
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [showAll, setShowAll] = useState(false);
  // „Angebot senden“ (Paket P3): Blatt mit den zwei Wegen; spaeter nur aus „Wie lief der Termin?“
  const [angebot, setAngebot] = useState<(AngebotZiel & { key: string; spaeter?: () => void }) | null>(null);
  const hide = (key: string) => setHidden((h) => new Set(h).add(key));
  const unhide = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      n.delete(key);
      return n;
    });

  function run(key: string, message: string, action: () => Promise<InboxResult>, who?: { leadId: string; name: string }) {
    hide(key);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        unhide(key);
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      // Nach „nicht erreicht“: Versuch X von 6, nächster Versuch, Nachricht „Nicht erreicht“ anbieten
      if (res.attempt && who && !res.attempt.offered) emitNotReachedOffer(who.leadId, who.name, res.attempt);
      // Erstes Termin-Ergebnis: einmal fragen, ob die Beratungsdokumentation vorbereitet werden soll
      if (res.bdFrage) emitBdFrage(key.startsWith("o:") && who ? { appointmentId: key.slice(2), name: who.name } : null);
      const undo = res.undo;
      toast.show({
        message: res.attempt ? attemptMessage(message, res.attempt) : message,
        // Abschluss: Konfetti und Glückwunsch, je Deal einmal (lib/konfetti.ts)
        feiern: res.gewonnen,
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

  // Abschluss mit einem Tipp (P4): sofort speichern, danach Blatt mit Beitrag, Provision und Glückwunsch (abschluss-nachher)
  const askWin = (leadId: string, name: string, save: (value: number | null, sparte: string | null) => void) => abschlussEinTipp(leadId, name, save);

  const appointments = data.appointments.filter((a) => !hidden.has(`a:${a.id}`));
  const outcomes = data.outcomes.filter((o) => !hidden.has(`o:${o.id}`));
  const angebote = (data.angebote ?? []).filter((g) => !hidden.has(`g:${g.id}`));
  // Angerufen, Ergebnis fehlt (lib/telefonat.ts): steht bei „Wie lief es?“, Assistent pausiert bis dahin
  const openCalls = (data.openCalls ?? []).filter((c) => !hidden.has(`k:${c.leadId}`));
  const chats = data.chats.filter((c) => !hidden.has(`c:${c.conversationId}`));
  // Rückrufe und Wiedervorlagen sind für den Nutzer dasselbe: anrufen. „Kein WhatsApp“ (urgent) ganz oben.
  const toCallback = (c: InboxData["callbacks"][number]): CallItem => ({
    key: `r:${c.leadId}`,
    kind: "callback" as const,
    leadId: c.leadId,
    name: c.name,
    source: c.source,
    phone: c.phone,
    reason: `${c.reason} · ${ago(c.createdAt)}`,
    overdue: false,
    conversationId: c.conversationId,
    urgent: c.urgent,
    known: c.known ?? null,
    ...(c.urgent ? { neu: { grund: c.empfehlung ? c.reason : neuerLeadGrund(c.reason), seit: ago(c.createdAt) } } : {}),
    einstieg: c.empfehlung?.einstieg ?? null,
  });
  const urgentIds = new Set(data.callbacks.filter((c) => c.urgent).map((c) => c.leadId));
  const calls: CallItem[] = [
    ...data.callbacks.filter((c) => c.urgent).map(toCallback),
    ...data.followUps.filter((f) => !urgentIds.has(f.leadId)).map((f) => ({
      key: `f:${f.leadId}`,
      kind: "followup" as const,
      leadId: f.leadId,
      name: f.name,
      source: f.source,
      phone: f.phone,
      reason: f.note ?? "Nachfassen",
      overdue: f.overdue,
      conversationId: f.conversationId,
      known: f.known ?? null,
      erledigtOk: f.erledigtOk,
      dueAt: f.dueAt,
    })),
    ...data.callbacks.filter((c) => !c.urgent).map(toCallback),
  ].filter((c) => !hidden.has(c.key));
  // Neue Leads ohne WhatsApp (bzw. ohne Erstanschreiben) stehen in einer eigenen Karte ganz oben: Zeit bis Erstkontakt
  // ist die wichtigste Zahl des Tages (UX-Runde 19.11.2026). Die Anrufliste beginnt weiter mit ihnen.
  // Gleiche Regel wie der Zähler „N neu“ an Kontakte (lib/neue-leads.ts)
  const neueLeads = calls.filter(istWartenderNeuerLead);
  // „Heute fällig“ (Ole, 25.11.2026, Usability-Check: 42 % der Wiedervorlagen über 24 h überfällig): fällige und
  // überfällige Wiedervorlagen als eigene Karte, überfällige zuerst, je Zeile „Erledigt“ und „Morgen“. Die übrigen Rückrufe
  // bleiben unter „Anrufen“, die Anrufliste nimmt weiter alle mit.
  const faellig = calls
    .filter((c) => c.kind === "followup" && !istWartenderNeuerLead(c))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  const restCalls = calls.filter((c) => c.kind !== "followup" && !istWartenderNeuerLead(c));
  const visibleCalls = showAll ? restCalls : restCalls.slice(0, 6);
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
  // Anrufliste: Termin gebucht → Karte erledigt, weiter zur nächsten (Ole, 16.11.2026: „Hatte einen Termin vereinbart.
  // Danach müsste die nächste Karte angezeigt werden.“). Bei Wiedervorlagen ist die Wiedervorlage damit erledigt.
  useEffect(() => {
    if (!callMode) return;
    const h = (e: Event) => {
      const leadId = (e as CustomEvent<{ leadId: string }>).detail?.leadId;
      const cur = callMode.queue[callMode.i];
      if (!cur || cur.leadId !== leadId) return;
      hide(cur.key);
      // Ohne eigenen Toast: „Termin gebucht: Montag, 16.11., 10:00 Uhr“ aus dem Buchungsfenster bleibt stehen.
      // Kein „Rückgängig“ hier, es würde nur die Wiedervorlage zurückholen, nicht die Buchung (Runde 5, 16.11.2026).
      if (cur.kind === "followup")
        startTransition(async () => {
          const res = await clearFollowUpResult(cur.leadId);
          if (!res.ok) toast.show({ message: res.error, tone: "error" });
          router.refresh();
        });
      advance();
    };
    window.addEventListener(LEAD_BOOKED_EVENT, h);
    return () => window.removeEventListener(LEAD_BOOKED_EVENT, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callMode]);
  const noStep = data.noNextStep.leads.filter((l) => !hidden.has(`n:${l.leadId}`));
  const noStepTotal = Math.max(noStep.length, data.noNextStep.total - (data.noNextStep.leads.length - noStep.length));
  // Bestand Paket 4: geantwortet ohne Termin (nur mit sichtbarem Modul geladen)
  const warm = (data.bestandWarm ?? []).filter((w) => !hidden.has(`w:${w.recipientId}`));
  const nothing = appointments.length + outcomes.length + angebote.length + openCalls.length + chats.length + calls.length + noStep.length + warm.length + (data.datenschutz?.length ?? 0) === 0;
  const noStepHref = leadHref.startsWith("/buyer?") ? "/buyer/kontakte?ansicht=ohne-schritt" : "/buyer/leads?ansicht=ohne-schritt";

  const laterSheet = (c: CallItem) =>
    setSheet({
      kind: "actions",
      title: `${c.name} später anrufen`,
      actions: [
        { label: "Morgen", days: 1 },
        { label: "In 3 Tagen", days: 3 },
        { label: "In 1 Woche", days: 5 },
        { label: "In 2 Wochen", days: 10 },
      ]
        .map((o): SheetAction => ({
          label: o.label,
          onSelect: () => run(c.key, `${c.name}: ${o.label === "Morgen" ? "morgen" : o.label.toLowerCase()} wieder`, () => setFollowUpResult(c.leadId, { days: o.days })),
        }))
        .concat({
          label: "Anderer Tag …",
          onSelect: () =>
            setTimeout(
              () =>
                setSheet({
                  kind: "date",
                  title: `${c.name} später anrufen`,
                  save: (date, time) => run(c.key, time ? `${c.name}: Rückruf ${fmtDay(date)} ${time} Uhr` : `${c.name}: am ${fmtDay(date)} wieder`, () => setFollowUpResult(c.leadId, { date, time })),
                }),
              0,
            ),
        }),
    });

  const callSheet = (c: CallItem) => {
    const actions: SheetAction[] = [];
    if (c.phone) actions.push({ label: "Anrufen", icon: Phone, href: `tel:+${c.phone}`, tone: "primary", onSelect: newUi ? () => markCall(c) : undefined });
    if (c.kind === "callback") {
      actions.push({
        label: "Nicht erreicht",
        icon: PhoneMissed,
        onSelect: () => run(c.key, `${c.name}: nicht erreicht`, () => callbackOutcomeResult(c.leadId, "not_reached"), { leadId: c.leadId, name: c.name }),
      });
    } else {
      actions.push({
        label: "Nicht erreicht",
        icon: PhoneMissed,
        onSelect: () => run(c.key, `${c.name}: nicht erreicht, morgen wieder`, () => followUpNotReachedResult(c.leadId)),
      });
    }
    // Schnell schieben (Ole, 13.11.2026): +1 Tag / +1 Woche direkt, sonst „Später …“
    actions.push(
      { label: "+1 Tag (morgen)", icon: Clock, onSelect: () => run(c.key, `${c.name}: morgen wieder`, () => setFollowUpResult(c.leadId, { days: 1 })) },
      { label: "+1 Woche", icon: Clock, onSelect: () => run(c.key, `${c.name}: in 1 Woche wieder`, () => setFollowUpResult(c.leadId, { days: 5 })) },
      { label: "Später …", icon: Clock, onSelect: () => setTimeout(() => laterSheet(c), 0) },
    );
    actions.push({ label: "Termin buchen", icon: CalendarPlus, onSelect: () => openLeadBooking(c.leadId, c.name) });
    actions.push(
      { label: "Angebot gesendet", icon: Send, onSelect: () => run(c.key, `${c.name}: Angebot gesendet`, () => callbackOutcomeResult(c.leadId, "offer")) },
      {
        label: "Abschluss",
        icon: Trophy,
        onSelect: () =>
          setTimeout(() => askWin(c.leadId, c.name, (v, sp) => run(c.key, `${c.name}: Abschluss`, () => callbackOutcomeResult(c.leadId, "won", v, sp))), 0),
      },
      ...(c.kind === "followup" && c.erledigtOk
        ? [{ label: "Erledigt, kein weiterer Anruf nötig", icon: Check, onSelect: () => run(c.key, `${c.name}: Wiedervorlage erledigt`, () => clearFollowUpResult(c.leadId)) }]
        : []),
      { label: "Kontakt öffnen", icon: UserRound, href: leadUrl(c.leadId) },
      { label: "Verloren", icon: ThumbsDown, tone: "danger", onSelect: () => setTimeout(() => setSheet({ kind: "lost", key: c.key, leadId: c.leadId, name: c.name }), 0) },
    );
    setSheet({ kind: "actions", title: c.name, message: c.reason, actions });
  };

  // Push „Jetzt anrufen?“ (lib/anruf-ausloeser.ts): Anruf-Blatt des Kontakts direkt öffnen, einmal
  const anrufGeoeffnet = useRef(false);
  useEffect(() => {
    if (!anrufen || anrufGeoeffnet.current) return;
    const c = calls.find((x) => x.leadId === anrufen);
    if (!c) return;
    anrufGeoeffnet.current = true;
    setTimeout(() => callSheet(c), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anrufen]);

  // Kleiner Pfeil rechts: Zeile antippen öffnet weitere Aktionen.
  const more = <ChevronRight className="hidden h-4 w-4 shrink-0 text-[color:var(--border-strong)] sm:block" />;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const sel = (leadId: string | null | undefined) =>
    newUi && leadId && leadId === selectedLeadId ? "xl:bg-[color:var(--brand-soft)] xl:hover:bg-[color:var(--brand-soft)]" : undefined;
  /** Eine Anruf-Zeile (Neue Leads und Anrufen). Neue Leads: Produkt, Grund und Wartezeit, „Anrufen“ als Hauptaktion. */
  const callRow = (c: CallItem, hauptaktion = false) => (
    <TapRow key={c.key} className={sel(c.leadId)} onTap={() => openDetailOnDesktop(c.leadId) || callSheet(c)}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{c.name}</div>
        <p className="truncate text-xs text-[color:var(--muted)]">
          {c.neu ? (
            <>
              <span className="font-semibold text-rose-600" data-call-urgent>
                {c.neu.seit}
              </span>
              {` · ${[c.neu.grund, c.einstieg ? null : c.source].filter(Boolean).join(" · ")}`}
            </>
          ) : (
            <>
              {c.overdue ? <span className="font-medium text-amber-700">Überfällig · </span> : null}
              {c.reason}
            </>
          )}
        </p>
        {c.einstieg ? (
          <p className="truncate text-xs text-emerald-700" data-call-einstieg>
            Einstieg: {c.einstieg}
          </p>
        ) : null}
        {weiteresProdukt && c.kind === "followup" && istCrossSellAufgabe(c.reason) ? <CrossSellZusatzKnopf verkauf={weiteresProdukt} /> : null}
      </div>
      {c.phone ? (
        <span
          onClick={(e) => {
            stop(e);
            if (newUi) markCall(c);
          }}
        >
          <ButtonLink href={`tel:+${c.phone}`} variant={hauptaktion ? "primary" : "secondary"} icon={Phone}>
            Anrufen
          </ButtonLink>
        </span>
      ) : null}
      {more}
    </TapRow>
  );

  // „Erledigt“: nur wenn danach ein Schritt bleibt (Termin, Abschluss), sonst „Wie geht es weiter?“ (Ole, 16.11.2026)
  const erledigt = (c: CallItem) =>
    c.erledigtOk
      ? run(c.key, `${c.name}: erledigt`, () => clearFollowUpResult(c.leadId))
      : setSheet({ kind: "step", key: c.key, leadId: c.leadId, name: c.name, source: c.source, appointmentId: null });
  const anruflisteKnopf =
    newUi && calls.some((c) => c.phone) ? (
      // Eine Hauptaktion je Seite (Usability-Check 25.11.2026): immer sekundär, Hauptaktion ist „Anrufen“ bzw. der Kontakt rechts
      <Button variant="secondary" icon={PlayCircle} onClick={() => setCallMode({ queue: calls.filter((c) => c.phone), i: 0 })}>
        Anrufliste starten
      </Button>
    ) : undefined;
  const visibleFaellig = showAll ? faellig : faellig.slice(0, 6);
  // Einstieg aus Kontakte „Zu erledigen“ (Ole, 27.11.2026): /buyer?anrufliste=1 startet die Anrufliste direkt, einmal
  const anrufbar = calls.filter((c) => c.phone);
  const autoStart = useRef(false);
  useEffect(() => {
    if (autoStart.current || !newUi || !anrufbar.length) return;
    let wunsch = false;
    try {
      const u = new URL(window.location.href);
      wunsch = u.searchParams.get("anrufliste") === "1";
      if (wunsch) {
        u.searchParams.delete("anrufliste");
        window.history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
      }
    } catch {
      wunsch = false;
    }
    autoStart.current = true;
    if (wunsch) setCallMode({ queue: anrufbar, i: 0 });
  }, [newUi, anrufbar]);

  return (
    <div className="space-y-6">
      {nothing ? (
        <Card>
          {(() => {
            const l = heuteLeer(leer ?? { push: false, assistentMinuten: null });
            return (
              <EmptyState
                leo="ruhig"
                title={l.titel}
                text={l.text}
                action={l.zuKontakten ? <ButtonLink href="/buyer/kontakte">Kontakte ansehen</ButtonLink> : undefined}
              />
            );
          })()}
        </Card>
      ) : null}
      {data.datenschutz?.length ? <DatenschutzKarte items={data.datenschutz} leadUrl={leadUrl} /> : null}
      {neueLeads.length > 0 ? (
        <Card className="ring-1 ring-rose-200">
          <div id="neue-leads" className="scroll-mt-20" data-neue-leads />
          <CardHeader icon={Phone} title="Neue Leads: jetzt anrufen" count={neueLeads.length} />
          <ul className="divide-y divide-[color:var(--border)]">{neueLeads.map((c) => callRow(c, true))}</ul>
        </Card>
      ) : null}
      {faellig.length > 0 ? (
        <Card>
          <div id="faellig" className="scroll-mt-20" data-heute-faellig />
          <CardHeader icon={BellRing} title="Heute fällig" count={faellig.length} actions={anruflisteKnopf} />
          <ul className="@container divide-y divide-[color:var(--border)]">
            {visibleFaellig.map((c) => (
              // Schmal (Handy, Spalte neben dem Kontakt): Knöpfe in eigener Zeile, sonst wird der Grund abgeschnitten
              <TapRow key={c.key} className={cn("flex-wrap gap-y-2 @lg:flex-nowrap", sel(c.leadId))} onTap={() => openDetailOnDesktop(c.leadId) || callSheet(c)}>
                <div className="min-w-0 flex-1 basis-full @lg:basis-auto">
                  <div className="truncate font-medium">{c.name}</div>
                  <p className="truncate text-xs text-[color:var(--muted)]">
                    {c.overdue ? (
                      <span className="font-medium text-rose-600" data-ueberfaellig>
                        Überfällig {c.dueAt ? since(c.dueAt) : ""} ·{" "}
                      </span>
                    ) : null}
                    {c.reason}
                  </p>
                  {weiteresProdukt && istCrossSellAufgabe(c.reason) ? <CrossSellZusatzKnopf verkauf={weiteresProdukt} /> : null}
                </div>
                <span className="flex shrink-0 items-center gap-1.5" onClick={stop} data-faellig-knoepfe>
                  <Button icon={Check} onClick={() => erledigt(c)} data-erledigt>
                    Erledigt
                  </Button>
                  <Button variant="ghost" icon={Clock} onClick={() => run(c.key, `${c.name}: morgen wieder`, () => setFollowUpResult(c.leadId, { days: 1 }))} data-morgen>
                    Morgen
                  </Button>
                </span>
                {more}
              </TapRow>
            ))}
          </ul>
          {faellig.length > 6 ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full border-t border-[color:var(--border)] py-2.5 text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
            >
              {showAll ? "Weniger anzeigen" : `Alle ${faellig.length} anzeigen`}
            </button>
          ) : null}
        </Card>
      ) : null}
      {chats.length > 0 ? (
        <Card>
          <div id="chats" className="scroll-mt-20" />
          <CardHeader icon={MessageCircle} title="Wartet auf Sie" count={chats.length} />
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
                  <ButtonLink href={`/buyer/chats?c=${c.conversationId}`} variant="secondary" icon={MessageCircle}>
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
              // Show-up-Paket: ab Terminbeginn „Ist Frau Becker da?“ direkt in der Zeile (auch ohne Push)
              const frage = anwesenheitsFrage(
                { startsAt: new Date(a.startsAt), endsAt: a.endsAt ? new Date(a.endsAt) : null, mode: a.mode, status: "booked", attendance: a.attendance ?? null },
                new Date(),
              );
              const actions: SheetAction[] = [];
              if (video && a.meetUrl) actions.push({ label: "Videocall starten", icon: Video, href: a.meetUrl, tone: "primary" });
              if (a.phone) actions.push({ label: "Anrufen", icon: Phone, href: `tel:+${a.phone}`, tone: video ? undefined : "primary" });
              // UX Runde 4: Vorbereiten und Präsentation auch hier (vorher nur über den Kontakt erreichbar)
              if (a.leadId) {
                actions.push({ label: "Vorbereiten", icon: Calculator, href: `/buyer/termine/${a.id}/vorbereitung?von=heute` });
                actions.push({ label: "Präsentation", icon: Presentation, href: `/buyer/termine/${a.id}/praesentation?von=heute` });
              }
              if (a.conversationId) actions.push({ label: "Chat öffnen", icon: MessageCircle, href: `/buyer/chats?c=${a.conversationId}` });
              if (a.leadId) actions.push({ label: "Kontakt öffnen", icon: UserRound, href: leadUrl(a.leadId) });
              actions.push({
                label: "Verschieben oder absagen",
                icon: CalendarClock,
                onSelect: () => setTimeout(() => setSheet({ kind: "reschedule", appointmentId: a.id }), 0),
              });
              return (
                <TapRow
                  key={a.id}
                  className={sel(a.leadId)}
                  onTap={() => openDetailOnDesktop(a.leadId) || setSheet({ kind: "actions", title: a.name, message: `${a.isToday ? "Heute" : day(a.startsAt)}, ${time(a.startsAt)} Uhr · ${terminArtLabel(a.mode)}`, actions })}
                >
                  <div className="w-12 shrink-0">
                    <div className="text-lg font-semibold leading-none tabular-nums">{time(a.startsAt)}</div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">{a.isToday ? "heute" : day(a.startsAt)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{a.name}</div>
                    <p className="truncate text-xs text-[color:var(--muted)]">{a.summary ?? terminArtLabel(a.mode)}</p>
                    {frage === "start" || frage === "wartet" ? (
                      <div className="mt-1.5">
                        <TerminAnwesenheit appointmentId={a.id} label={a.label ?? a.name} stand={frage} phone={a.phone} wa={a.wa ?? null} />
                      </div>
                    ) : null}
                    {frage !== "start" && frage !== "wartet" && vorbereiten.has(a.id) ? (
                      <Link href={`/buyer/termine/${a.id}/vorbereitung?von=heute`} onClick={stop} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline" data-termin-vorbereiten>
                        <Calculator className="h-3.5 w-3.5" /> Vorbereiten: Angebot rechnen
                      </Link>
                    ) : null}
                  </div>
                  <span onClick={stop}>
                    {video && a.meetUrl ? (
                      <ButtonLink href={a.meetUrl} variant="secondary" icon={Video}>
                        Starten
                      </ButtonLink>
                    ) : a.phone ? (
                      <ButtonLink href={`tel:+${a.phone}`} variant="secondary" icon={Phone}>
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

      {outcomes.length + openCalls.length > 0 ? (
        <Card>
          <div id="ergebnis" className="scroll-mt-20" />
          <CardHeader icon={Trophy} title="Wie lief es?" count={outcomes.length + openCalls.length} />
          <ul className="divide-y divide-[color:var(--border)]">
            {openCalls.map((c) => {
              const open = () => setOutcome({ key: `k:${c.leadId}`, leadId: c.leadId, name: c.name, source: c.source, kind: "lead" });
              return (
                <TapRow key={`k:${c.leadId}`} className={sel(c.leadId)} onTap={open}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <p className="truncate text-xs text-[color:var(--muted)]" data-anruf-ergebnis-fehlt>
                      Angerufen um {time(c.at)} Uhr · Ergebnis fehlt
                    </p>
                  </div>
                  <Button
                    icon={Phone}
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
            {outcomes.map((o) => {
              const key = `o:${o.id}`;
              // „Fehlt noch“ ohne weitere Antwort: erst „Ist … noch gekommen?“ (Show-up-Paket), danach wie gewohnt das Ergebnis
              if (o.attendance === "fehlt" && o.mode === "video") {
                return (
                  <li key={o.id} className={`px-5 py-3 ${sel(o.leadId) ?? ""}`}>
                    <div className="truncate font-medium">{o.name}</div>
                    <p className="mb-1 truncate text-xs text-[color:var(--muted)]">
                      {day(o.startsAt)}, {time(o.startsAt)} Uhr · {terminArtLabel(o.mode)}
                    </p>
                    <TerminAnwesenheit appointmentId={o.id} label={o.label ?? o.name} stand="nachher" phone={null} />
                  </li>
                );
              }
              const open = () =>
                setSheet({
                  kind: "actions",
                  title: `Wie lief der Termin mit ${gebeugt(o.name)}?`,
                  actions: [
                    // Paket P3: „Angebot gesendet“ startet das Nachfassen nicht mehr ohne Versand, sondern führt auf die zwei Wege
                    {
                      label: "Angebot senden",
                      icon: Send,
                      onSelect: () =>
                        setTimeout(
                          () =>
                            setAngebot({
                              appointmentId: o.id,
                              name: o.name,
                              key,
                              spaeter: () =>
                                run(key, `${o.name}: Angebot steht unter „Angebote senden“`, () => appointmentOutcomeResult(o.id, "offer", null), { leadId: o.leadId, name: o.name }),
                            }),
                          0,
                        ),
                    },
                    {
                      label: "Abschluss",
                      icon: Trophy,
                      onSelect: () =>
                        setTimeout(
                          () =>
                            askWin(o.leadId, o.name, (v, sp) =>
                              run(key, `${o.name}: Abschluss`, () => appointmentOutcomeResult(o.id, "closed", v, sp), { leadId: o.leadId, name: o.name }),
                            ),
                          0,
                        ),
                    },
                    { label: "Nicht erschienen", icon: UserX, onSelect: () => run(key, `${o.name}: steht jetzt bei Anrufen`, () => appointmentOutcomeResult(o.id, "no_show", null)) },
                    { label: "Verloren", icon: ThumbsDown, tone: "danger", onSelect: () => setTimeout(() => setSheet({ kind: "lost", key, leadId: o.leadId, name: o.name, appointmentId: o.id }), 0) },
                  ],
                });
              return (
                <TapRow key={o.id} className={sel(o.leadId)} onTap={() => openDetailOnDesktop(o.leadId) || open()}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{o.name}</div>
                    <p className="truncate text-xs text-[color:var(--muted)]">
                      {day(o.startsAt)}, {time(o.startsAt)} Uhr · {terminArtLabel(o.mode)}
                    </p>
                  </div>
                  <Button
                    icon={Trophy}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Usability-Check 25.11.2026 (U6): am Rechner gleich die Ergebnis-Auswahl, der Kontakt geht rechts mit auf
                      openDetailOnDesktop(o.leadId);
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

      {angebote.length > 0 ? (
        <Card>
          <div id="angebote" className="scroll-mt-20" data-angebote-senden />
          <CardHeader icon={Send} title="Angebote senden" count={angebote.length} />
          <p className="border-b border-[color:var(--border)] px-5 py-2 text-xs text-[color:var(--muted)]">{ANGEBOT_HINWEIS}</p>
          <ul className="divide-y divide-[color:var(--border)]">
            {angebote.map((g) => {
              const open = () => setAngebot({ appointmentId: g.id, name: g.name, key: `g:${g.id}` });
              return (
                <TapRow key={g.id} className={sel(g.leadId)} onTap={open}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{g.name}</div>
                    <p className="truncate text-xs text-[color:var(--muted)]" data-angebot-aufgabe>
                      {ANGEBOT_AUFGABE} · Termin {day(g.startsAt)}
                    </p>
                  </div>
                  <Button
                    icon={Send}
                    onClick={(e) => {
                      e.stopPropagation();
                      open();
                    }}
                  >
                    Senden
                  </Button>
                  {more}
                </TapRow>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {warm.length > 0 ? (
        <Card>
          <div id="bestand-nachfassen" className="scroll-mt-20" data-bestand-warm />
          <CardHeader icon={MessageCircle} title={WARM_TITLE} count={warm.length} />
          <ul className="divide-y divide-[color:var(--border)]">
            {warm.map((w) => {
              const key = `w:${w.recipientId}`;
              const href = w.conversationId ? `/buyer/chats?c=${w.conversationId}` : leadUrl(w.leadId);
              const open = () =>
                setSheet({
                  kind: "actions",
                  title: w.name,
                  message: `Hat auf „${w.kampagne}“ geantwortet, noch kein Termin.`,
                  actions: [
                    { label: "Nachricht schreiben", icon: MessageCircle, href, tone: "primary" },
                    { label: "Termin buchen", icon: CalendarPlus, onSelect: () => openLeadBooking(w.leadId, w.name) },
                    { label: "Kontakt öffnen", icon: UserRound, href: leadUrl(w.leadId) },
                    { label: "Erledigt", icon: Check, onSelect: () => run(key, `${w.name}: erledigt`, () => bestandWarmErledigtAction(w.recipientId)) },
                  ],
                });
              return (
                <TapRow key={key} className={sel(w.leadId)} onTap={() => openDetailOnDesktop(w.leadId) || open()}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{w.name}</div>
                    <p className="truncate text-xs text-[color:var(--muted)]" data-bestand-warm-row>
                      Antwort auf {w.kampagne} · {since(w.repliedAt)} ohne Termin
                    </p>
                  </div>
                  <span onClick={stop}>
                    <ButtonLink href={href} variant="secondary" icon={MessageCircle}>
                      Nachricht
                    </ButtonLink>
                  </span>
                  {more}
                </TapRow>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {restCalls.length > 0 ? (
        <Card>
          <div id="anrufen" className="scroll-mt-20" />
          <CardHeader
            icon={Phone}
            title="Anrufen"
            count={restCalls.length}
            actions={faellig.length > 0 ? undefined : anruflisteKnopf}
          />
          <ul className="divide-y divide-[color:var(--border)]">{visibleCalls.map((c) => callRow(c))}</ul>
          {restCalls.length > 6 ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full border-t border-[color:var(--border)] py-2.5 text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
            >
              {showAll ? "Weniger anzeigen" : `Alle ${restCalls.length} anzeigen`}
            </button>
          ) : null}
        </Card>
      ) : null}

      {/* Dezent, eine Zeile über „Nächste Tage“ (Paket P6) */}
      {automatisch?.anzahl ? <MorgenAutomatisch daten={automatisch} href={leadUrl} /> : null}
      {/* Abschluss mit einem Tipp (P4): typische Beiträge vom Vortag gesammelt ergänzen */}
      {data.beitragFehlt?.length ? <BeitragFehltKarte items={data.beitragFehlt} /> : null}

      {data.upcoming.length > 0 ? (
        <UpcomingCard
          vorbereiten={vorbereiten}
          items={data.upcoming}
          open={(id) => openDetailOnDesktop(id) || router.push(leadUrl(id))}
          shift={(it, days) =>
            startTransition(async () => {
              const res = await setFollowUpResult(it.leadId!, { date: shiftYmd(it.at, days) });
              if (!res.ok) return toast.show({ message: res.error, tone: "error" });
              toast.show({ message: `${it.name}: ${days === 1 ? "einen Tag" : "eine Woche"} später` });
              router.refresh();
            })
          }
        />
      ) : null}

      {noStep.length > 0 ? (
        // Aufräumen (UX, Ole 15.11.2026): wichtig, aber nicht dringend, daher ganz unten und zugeklappt
        <details data-no-next-step className="group overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]">
          <div id="ohne-schritt" className="scroll-mt-20" />
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1 text-[15px] font-semibold">
              Aufräumen: {noStepTotal} {noStepTotal === 1 ? "Kontakt" : "Kontakte"} ohne nächsten Schritt
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)] transition group-open:rotate-90" />
          </summary>
          <ul className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
            {(showAll ? noStep : noStep.slice(0, 5)).map((l) => {
              const key = `n:${l.leadId}`;
              const openStep = () => setSheet({ kind: "step", key, leadId: l.leadId, name: l.name, source: l.source, appointmentId: l.appointmentId });
              return (
                <TapRow key={l.leadId} className={sel(l.leadId)} onTap={() => openDetailOnDesktop(l.leadId) || openStep()}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{l.name}</div>
                    <p className="truncate text-xs text-[color:var(--muted)]">
                      <span className="font-medium text-amber-700">{NEXT_STEP_LABEL[l.resultMissing ? "result_missing" : "missing"]}</span>
                      {` · ${l.status ?? "Offen"}, ${since(l.statusChangedAt)}`}
                    </p>
                  </div>
                  <span onClick={stop}>
                    <Button variant="secondary" icon={ChevronRight} onClick={openStep}>
                      {l.resultMissing ? "Ergebnis" : "Weiter"}
                    </Button>
                  </span>
                  {more}
                </TapRow>
              );
            })}
          </ul>
          {noStep.length > 5 && !showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full border-t border-[color:var(--border)] py-2.5 text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
            >
              Alle {noStep.length} anzeigen
            </button>
          ) : null}
          <Link href={noStepHref} className="block border-t border-[color:var(--border)] py-2.5 text-center text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]">
            In Kontakte ansehen
          </Link>
        </details>
      ) : null}
      {current && callMode ? (
        <CallModePanel
          item={current}
          index={callMode.i}
          total={callMode.queue.length}
          onCall={() => markCall(current)}
          onResult={() => setOutcome({ key: current.key, leadId: current.leadId, name: current.name, source: current.source, kind: current.kind, erledigtOk: current.erledigtOk })}
          onSkip={advance}
          onEnd={() => setCallMode(null)}
          kontaktHref={leadUrl(current.leadId)}
        />
      ) : null}
      <CallOutcomeSheet
        target={outcome}
        bookingSlug={data.bookingSlug}
        onClose={() => setOutcome(null)}
        onPick={(message, action) => {
          const key = outcome?.key;
          if (key) run(key, message, action, outcome ? { leadId: outcome.leadId, name: outcome.name } : undefined);
          if (callMode && key && callMode.queue[callMode.i]?.key === key) advance();
        }}
      />
      {sheet?.kind === "lost" ? (
        <LostSheet
          leadId={sheet.leadId}
          name={sheet.name}
          appointmentId={sheet.appointmentId ?? null}
          onClose={() => setSheet(null)}
          onDone={(res, message) => run(sheet.key, message, async () => res, { leadId: sheet.leadId, name: sheet.name })}
        />
      ) : null}
      {sheet?.kind === "step" ? (
        <NextStepSheet
          leadId={sheet.leadId}
          name={sheet.name}
          source={sheet.source}
          appointmentId={sheet.appointmentId}
          fallbackOnClose={false}
          onClose={() => setSheet(null)}
          onDone={(res, message) => run(sheet.key, message, async () => res, { leadId: sheet.leadId, name: sheet.name })}
        />
      ) : null}
      <AngebotSendenSheet
        ziel={angebot}
        spaeter={angebot?.spaeter}
        onClose={() => setAngebot(null)}
        onError={(message) => toast.show({ message, tone: "error" })}
        onDone={(message) => {
          if (angebot) hide(angebot.key);
          toast.show({ message });
          router.refresh();
        }}
      />
      <ActionSheet
        open={sheet?.kind === "actions"}
        onClose={() => setSheet(null)}
        title={sheet?.kind === "actions" ? sheet.title : undefined}
        message={sheet?.kind === "actions" ? sheet.message : undefined}
        actions={sheet?.kind === "actions" ? sheet.actions : []}
      />
      <LaterDateSheet
        open={sheet?.kind === "date"}
        title={sheet?.kind === "date" ? sheet.title : ""}
        onClose={() => setSheet(null)}
        onPick={(date, time) => {
          if (sheet?.kind !== "date") return;
          const save = sheet.save;
          setSheet(null);
          save(date, time);
        }}
      />
      <RescheduleDialog
        appointmentId={sheet?.kind === "reschedule" ? sheet.appointmentId : null}
        open={sheet?.kind === "reschedule"}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}

/** Nächste Tage (Ole, 13.11.2026): Wiedervorlagen und Termine der kommenden 14 Tage, nach Tag. */
/** Kalendertag (Berlin) des Zeitpunkts + n Tage, als YYYY-MM-DD; nie vor morgen. */
function shiftYmd(iso: string, days: number): string {
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const base = new Date(`${ymd(new Date(iso))}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  const tomorrow = new Date(`${ymd(new Date())}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return ymd(base < tomorrow ? tomorrow : base);
}

function UpcomingCard({
  items,
  open,
  shift,
  vorbereiten,
}: {
  vorbereiten: Set<string>;
  items: InboxData["upcoming"];
  open: (leadId: string) => void;
  shift: (it: InboxData["upcoming"][number], days: number) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const dayLabel = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const groups: { key: string; label: string; rows: typeof items }[] = [];
  for (const it of shown) {
    const k = dayKey(it.at);
    const g = groups.find((x) => x.key === k);
    if (g) g.rows.push(it);
    else groups.push({ key: k, label: dayLabel(it.at), rows: [it] });
  }
  return (
    // Kommende Tage sind keine Aufgabe für heute: zugeklappt wie „Aufräumen“ (Ole, 19.11.2026)
    <details data-upcoming className="group overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]">
      <div id="naechste-tage" className="scroll-mt-20" />
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <CalendarDays className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
        <span className="min-w-0 flex-1 text-[15px] font-semibold">
          Nächste Tage <span className="ml-1 font-normal text-[color:var(--muted)]">{items.length}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)] transition group-open:rotate-90" />
      </summary>
      <div className="border-t border-[color:var(--border)]">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="bg-[color:var(--surface-sunken,#f8fafc)] px-5 py-1.5 text-xs font-semibold text-[color:var(--muted)]">{g.label}</div>
          <ul className="divide-y divide-[color:var(--border)]">
            {g.rows.map((it) => (
              <TapRow key={it.key} onTap={() => it.leadId && open(it.leadId)}>
                {it.kind === "termin" ? (
                  <CalendarClock className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
                ) : (
                  <BellRing className="h-4 w-4 shrink-0 text-violet-600" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.name}</div>
                  <p className="truncate text-xs text-[color:var(--muted)]">
                    {it.kind === "termin" ? `Termin ${time(it.at)} Uhr · ${it.note ?? ""}` : `Wiedervorlage${it.note ? ` · ${it.note}` : ""}`}
                  </p>
                  {it.kind === "termin" && vorbereiten.has(it.key.slice(2)) ? (
                    <Link href={`/buyer/termine/${it.key.slice(2)}/vorbereitung?von=heute`} onClick={(e) => e.stopPropagation()} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline" data-termin-vorbereiten>
                      <Calculator className="h-3.5 w-3.5" /> Vorbereiten: Angebot rechnen
                    </Link>
                  ) : null}
                </div>
                {it.kind === "wiedervorlage" && it.leadId ? (
                  <span className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                    {[
                      { d: 1, l: "+1 Tag" },
                      { d: 7, l: "+1 Woche" },
                    ].map((b) => (
                      <button
                        key={b.d}
                        type="button"
                        onClick={() => shift(it, b.d)}
                        className="rounded-full border border-[color:var(--border)] px-2.5 py-2.5 text-xs font-semibold text-[color:var(--muted)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand)] sm:py-1"
                      >
                        {b.l}
                      </button>
                    ))}
                  </span>
                ) : null}
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-[color:var(--border-strong)] sm:block" />
              </TapRow>
            ))}
          </ul>
        </div>
      ))}
      {items.length > 8 ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="w-full border-t border-[color:var(--border)] py-2.5 text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
        >
          {all ? "Weniger anzeigen" : `Alle ${items.length} anzeigen`}
        </button>
      ) : null}
      </div>
    </details>
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
  kontaktHref,
}: {
  item: CallItem;
  index: number;
  total: number;
  onCall: () => void;
  onResult: () => void;
  onSkip: () => void;
  onEnd: () => void;
  /** Kontakt mit einem Tipp öffnen (Ole, 16.11.2026) */
  kontaktHref: string;
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
          {item.urgent ? <div className="mb-2 text-base font-semibold text-rose-600">Sofort anrufen</div> : null}
          {item.overdue ? <div className="mb-2 text-base font-semibold text-amber-700">Überfällig</div> : null}
          {/* Name öffnet den Kontakt (Ole, 16.11.2026: „mit 1 Klick öffnen können“) */}
          <Link href={kontaktHref} onClick={onEnd} aria-label={`${item.name}: Kontakt öffnen`} className="group inline-flex min-h-11 items-center gap-1.5 self-start text-3xl font-semibold tracking-tight hover:text-[color:var(--brand)]" data-anruf-kontakt>
            {item.name}
            <ChevronRight className="h-6 w-6 shrink-0 text-[color:var(--muted)] group-hover:text-[color:var(--brand)]" />
          </Link>
          <p className="mt-2 text-base text-[color:var(--muted)]">{item.reason}</p>
          {/* Was im Gespräch zu tun ist, auf einen Blick (Ole, 16.11.2026) */}
          {(() => {
            const z = anrufZiel(item);
            return (
              <div className="mt-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3" data-anruf-ziel>
                <div className="text-sm font-semibold text-[color:var(--muted)]">
                  Ziel: <span className="text-[color:var(--foreground)]">{z.ziel}</span>
                </div>
                {/* Was der Assistent im Chat schon erfahren hat, damit der Vermittler nicht doppelt fragt (Ole, 16.11.2026) */}
                {item.einstieg ? (
                  <p className="mt-1.5 text-sm text-[color:var(--muted)]" data-anruf-einstieg>
                    <span className="font-medium text-[color:var(--foreground)]">Einstieg:</span> {item.einstieg}
                  </p>
                ) : null}
                {item.known ? (
                  <p className="mt-1.5 text-sm text-[color:var(--muted)]" data-anruf-bekannt>
                    <span className="font-medium text-[color:var(--foreground)]">Aus dem Chat:</span> {item.known}
                  </p>
                ) : null}
                <ol className="mt-2 space-y-1.5 text-base">
                  {z.schritte.map((s, i) => (
                    <li key={s} className="flex gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-semibold text-[color:var(--brand-dark)]">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })()}
          <a
            href={item.phone ? `tel:+${item.phone}` : undefined}
            onClick={onCall}
            className="mt-6 flex h-16 items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[color:var(--brand)] text-lg font-semibold text-white shadow-[var(--shadow-md)] active:scale-[0.99]"
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
