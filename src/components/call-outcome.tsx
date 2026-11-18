"use client";

import { openLeadBooking } from "@/components/lead-booking";
// „Wie lief's?“ nach einem Anruf (neue Oberfläche): Wer in der App auf
// „Anrufen“ tippt und danach zurückkommt, bekommt automatisch die Ergebnis-
// Auswahl. Nutzt ausschließlich die bestehenden Aktionen (inbox-actions).

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CalendarPlus, Check, Clock, PhoneMissed, Send, ThumbsDown, Trophy } from "lucide-react";
import {
  callbackOutcomeResult,
  clearFollowUpResult,
  followUpNotReachedResult,
  setFollowUpResult,
  type InboxResult,
} from "@/app/buyer/inbox-actions";
import { ActionSheet, type SheetAction } from "@/components/ui/sheet";
import { abschlussEinTipp } from "@/components/abschluss-nachher";
import { fmtDay, LaterDateSheet } from "@/components/later-date-sheet";
import { emitLeadAction, emitNotReachedOffer, LostSheet, useStepDone } from "@/components/next-step";
import { BedarfSheet } from "@/components/bedarf-sheet";
import { callStartedAction } from "@/app/buyer/telefonat-actions";

/** Rückkehr erst nach mind. 3 s zählt (kein Fehlalarm), höchstens 10 Min. */
const MIN_MS = 3_000;
const MAX_MS = 10 * 60_000;

/**
 * Merkt sich einen gestarteten Anruf und meldet, wenn die Seite danach
 * wieder sichtbar wird (Telefon-App → zurück in die App).
 */
export function useCallReturn(onReturn: (key: string) => void) {
  const pending = useRef<{ key: string; at: number; hidden: boolean } | null>(null);
  const cb = useRef(onReturn);
  useEffect(() => {
    cb.current = onReturn;
  }, [onReturn]);

  useEffect(() => {
    const check = () => {
      const p = pending.current;
      if (!p) return;
      if (document.visibilityState === "hidden") {
        p.hidden = true;
        return;
      }
      const age = Date.now() - p.at;
      // Am Rechner wird die Seite oft nicht unsichtbar (tel: öffnet eine andere App) –
      // dann zählt die Rückkehr des Fensterfokus.
      if (age > MAX_MS) {
        pending.current = null;
        return;
      }
      if (age >= MIN_MS || p.hidden) {
        pending.current = null;
        cb.current(p.key);
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  // Mit leadId: Assistent pausiert für diesen Lead, bis ein Ergebnis eingetragen ist (lib/telefonat.ts)
  return useCallback((key: string, leadId?: string | null) => {
    pending.current = { key, at: Date.now(), hidden: false };
    if (leadId) void callStartedAction(leadId).catch(() => undefined);
  }, []);
}

/**
 * Ergebnis aus „Wie lief es?“ (oder einer Wiedervorlage) für einen Kontakt ausführen: Toast mit „Rückgängig“,
 * Seite neu laden; nach „nicht erreicht“ die Nachricht anbieten, sonst nach dem nächsten Schritt fragen.
 */
export function useLeadResult(leadId: string, name: string) {
  const { done } = useStepDone();
  const [, start] = useTransition();
  return useCallback(
    (message: string, action: () => Promise<InboxResult>) =>
      start(async () => {
        const res = await action();
        done(res, message);
        if (!res.ok) return;
        if (res.attempt && !res.attempt.offered) emitNotReachedOffer(leadId, name, res.attempt);
        else if (!res.attempt) emitLeadAction(leadId);
      }),
    [done, leadId, name],
  );
}

/**
 * „Anrufen“ als Link mit „Wie lief es?“ nach der Rückkehr, z. B. im Chat (Ole, 17.11.2026: wie im Kontakt). Pausiert
 * den Assistenten für diesen Lead wie überall (lib/telefonat.ts). Ohne Lead nur ein normaler tel:-Link.
 */
export function AnrufLink({
  lead,
  href,
  children,
  ...rest
}: {
  lead: { id: string; name: string; source?: string | null; followUp?: boolean } | null;
  href: string;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const [open, setOpen] = useState(false);
  const markCall = useCallReturn(() => setOpen(true));
  const run = useLeadResult(lead?.id ?? "", lead?.name ?? "Lead");
  return (
    <>
      <a {...rest} href={href} onClick={lead ? () => markCall(lead.id, lead.id) : undefined}>
        {children}
      </a>
      {lead ? (
        <CallOutcomeSheet
          target={open ? { leadId: lead.id, name: lead.name, source: lead.source, kind: lead.followUp ? "followup" : "lead" } : null}
          onClose={() => setOpen(false)}
          onPick={run}
        />
      ) : null}
    </>
  );
}

export type CallOutcomeTarget = {
  leadId: string;
  name: string;
  /** Produkt (Lead.source): bestimmt das Feld beim Abschluss (Monats-/Jahresbeitrag). */
  source?: string | null;
  /** Wiedervorlage: „Erledigt“ statt „Nicht erreicht“ als erste Wahl. */
  kind?: "callback" | "followup" | "lead";
  /** Wiedervorlage ohne weiteren Schritt abhaken nur, wenn ein Termin geplant ist bzw. nach dem Abschluss */
  erledigtOk?: boolean;
};

const LATER = [
  { label: "Morgen", days: 1 },
  { label: "In 3 Tagen", days: 3 },
  { label: "In 1 Woche", days: 5 },
  { label: "In 2 Wochen", days: 10 },
];

/**
 * Ergebnis-Auswahl nach dem Anruf. `onPick` führt die Aktion aus (Toast,
 * Rückgängig, Ausblenden macht der Aufrufer) – so bleibt die Logik dort, wo
 * sie heute schon ist.
 */
export function CallOutcomeSheet({
  target,
  onClose,
  onPick,
}: {
  target: CallOutcomeTarget | null;
  /** Nicht mehr nötig: „Termin vereinbart“ gibt es auch ohne Kalender (Formular von Hand). */
  bookingSlug?: string | null;
  onClose: () => void;
  onPick: (message: string, action: () => Promise<InboxResult>) => void;
}) {
  const [step, setStep] = useState<"pick" | "later" | "date" | "lost" | "need">("pick");
  // Erreicht (Termin, Angebot, später): erst „Was haben Sie besprochen?“, danach das gewählte Ergebnis (Ole, 15.11.2026)
  const [after, setAfter] = useState<{ termin: boolean; run: () => void } | null>(null);
  const close = () => {
    setStep("pick");
    setAfter(null);
    onClose();
  };
  if (!target) return null;
  const t = target;
  const pick = (message: string, action: () => Promise<InboxResult>) => {
    close();
    onPick(message, action);
  };
  const needThen = (run: () => void, termin = false) => {
    setAfter({ termin, run });
    setStep("need");
  };

  const actions: SheetAction[] = [];
  actions.push({
    label: "Nicht erreicht",
    icon: PhoneMissed,
    onSelect: () =>
      pick(`${t.name}: morgen wieder in der Liste`, () => (t.kind === "followup" ? followUpNotReachedResult(t.leadId) : callbackOutcomeResult(t.leadId, "not_reached"))),
  });
  // Auch ohne verbundenen Kalender: das Buchungsfenster bietet dann „von Hand eintragen“ (UX Runde 4)
  actions.push({ label: "Termin vereinbart", icon: CalendarPlus, keepOpen: true, onSelect: () => needThen(() => openLeadBooking(t.leadId, t.name), true) });
  actions.push(
    {
      label: "Angebot gesendet",
      icon: Send,
      keepOpen: true,
      onSelect: () => needThen(() => onPick(`${t.name}: Angebot gesendet`, () => callbackOutcomeResult(t.leadId, "offer"))),
    },
    // keepOpen: Folgeschritt statt Schließen.
    // Abschluss mit einem Tipp (P4): sofort speichern, Beitrag und Glückwunsch danach im Blatt (abschluss-nachher)
    { label: "Abschluss", icon: Trophy, onSelect: () => abschlussEinTipp(t.leadId, t.name, (v, sp) => pick(`${t.name}: Abschluss`, () => callbackOutcomeResult(t.leadId, "won", v, sp))) },
    { label: "Später nochmal", icon: Clock, keepOpen: true, onSelect: () => setStep("later") },
    // Wiedervorlage ohne neuen Schritt abhaken (Ole, 16.11.2026: „Was heißt gesprochen, erledigt?“). Klarer benannt,
    // nicht mehr als erste, blaue Wahl: bei „Angebot nachfassen“ sind Abschluss bzw. Später nochmal die Regel.
    // Nur, wenn danach trotzdem ein Schritt bleibt (Termin, Abschluss); sonst Abschluss, Später nochmal oder Verloren
    // (Ole, 16.11.2026: „Wenn ich sage erledigt … ist der Kontakt danach ohne weiteren Schritt“)
    ...(t.kind === "followup" && t.erledigtOk
      ? [{ label: "Erledigt, kein weiterer Anruf nötig", icon: Check, onSelect: () => pick(`${t.name}: Wiedervorlage erledigt`, () => clearFollowUpResult(t.leadId)) }]
      : []),
    // Verloren mit Grund; nie erreicht und unter 6 Versuchen: Warnung (Ole, 14.11.2026). Nach einem Anruf meist
    // „Kein Interesse“, die Gründe (auch falsche Nummer, nicht erreichbar) stehen im nächsten Schritt.
    { label: "Kein Interesse", icon: ThumbsDown, tone: "danger", keepOpen: true, onSelect: () => setStep("lost") },
  );

  if (step === "need" && after) {
    const run = after.run;
    return (
      <BedarfSheet
        leadId={t.leadId}
        name={t.name}
        termin={after.termin}
        // Weggewischt: Ergebnis trotzdem eintragen (Termin buchen, Angebot, Wiedervorlage), nur ohne Bedarf
        onClose={() => {
          close();
          run();
        }}
        onDone={() => {
          close();
          run();
        }}
      />
    );
  }

  if (step === "lost") {
    return (
      <LostSheet
        leadId={t.leadId}
        name={t.name}
        onClose={close}
        onDone={(res, message) => {
          close();
          onPick(message, async () => res);
        }}
      />
    );
  }

  if (step === "later") {
    return (
      <ActionSheet
        open
        onClose={close}
        title={`${t.name} später anrufen`}
        actions={[
          ...LATER.map((o) => ({
            label: o.label,
            keepOpen: true,
            onSelect: () => needThen(() => onPick(`${t.name}: ${o.label === "Morgen" ? "morgen" : o.label.toLowerCase()} wieder`, () => setFollowUpResult(t.leadId, { days: o.days }))),
          })),
          { label: "Anderer Tag …", keepOpen: true, onSelect: () => setStep("date") },
        ]}
      />
    );
  }
  if (step === "date") {
    return (
      <LaterDateSheet
        open
        title={`${t.name} später anrufen`}
        onClose={close}
        onPick={(date, time) => needThen(() => onPick(time ? `${t.name}: Rückruf ${fmtDay(date)} ${time} Uhr` : `${t.name}: am ${fmtDay(date)} wieder`, () => setFollowUpResult(t.leadId, { date, time })))}
      />
    );
  }
  return <ActionSheet open onClose={close} title={`Wie lief es mit ${t.name}?`} message="Ein Tipp, den Rest trägt die App ein." actions={actions} />;
}
