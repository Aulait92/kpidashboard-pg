"use client";

// „Wie lief's?“ nach einem Anruf (neue Oberfläche): Wer in der App auf
// „Anrufen“ tippt und danach zurückkommt, bekommt automatisch die Ergebnis-
// Auswahl. Nutzt ausschließlich die bestehenden Aktionen (inbox-actions).

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarPlus, Check, Clock, PhoneMissed, Send, ThumbsDown, Trophy } from "lucide-react";
import {
  callbackOutcomeResult,
  clearFollowUpResult,
  setFollowUpResult,
  type InboxResult,
} from "@/app/buyer/inbox-actions";
import { ActionSheet, type SheetAction } from "@/components/ui/sheet";
import { AbschlussSheet, asksCloseValue } from "@/components/abschluss-sheet";

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

  return useCallback((key: string) => {
    pending.current = { key, at: Date.now(), hidden: false };
  }, []);
}

export type CallOutcomeTarget = {
  leadId: string;
  name: string;
  /** Produkt (Lead.source): bestimmt das Feld beim Abschluss (Monats-/Jahresbeitrag). */
  source?: string | null;
  /** Wiedervorlage: „Erledigt“ statt „Nicht erreicht“ als erste Wahl. */
  kind?: "callback" | "followup" | "lead";
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
  bookingSlug,
  onClose,
  onPick,
}: {
  target: CallOutcomeTarget | null;
  bookingSlug: string | null;
  onClose: () => void;
  onPick: (message: string, action: () => Promise<InboxResult>) => void;
}) {
  const [step, setStep] = useState<"pick" | "win" | "later">("pick");
  const close = () => {
    setStep("pick");
    onClose();
  };
  if (!target) return null;
  const t = target;
  const pick = (message: string, action: () => Promise<InboxResult>) => {
    close();
    onPick(message, action);
  };

  const actions: SheetAction[] = [];
  if (t.kind === "followup") {
    actions.push({ label: "Gesprochen – erledigt", icon: Check, tone: "primary", onSelect: () => pick(`${t.name}: erledigt`, () => clearFollowUpResult(t.leadId)) });
  }
  actions.push({ label: "Nicht erreicht", icon: PhoneMissed, onSelect: () => pick(`${t.name}: morgen wieder in der Liste`, () => callbackOutcomeResult(t.leadId, "not_reached")) });
  if (bookingSlug) actions.push({ label: "Termin vereinbart", icon: CalendarPlus, href: `/book/${bookingSlug}?lead=${t.leadId}` });
  actions.push(
    { label: "Angebot gesendet", icon: Send, onSelect: () => pick(`${t.name}: Angebot gesendet`, () => callbackOutcomeResult(t.leadId, "offer")) },
    // keepOpen: Folgeschritt statt Schließen.
    asksCloseValue(t.source)
      ? { label: "Abschluss", icon: Trophy, keepOpen: true, onSelect: () => setStep("win") }
      : { label: "Abschluss", icon: Trophy, onSelect: () => pick(`${t.name}: Abschluss`, () => callbackOutcomeResult(t.leadId, "won", null)) },
    { label: "Später nochmal", icon: Clock, keepOpen: true, onSelect: () => setStep("later") },
    { label: "Kein Interesse", icon: ThumbsDown, tone: "danger", onSelect: () => pick(`${t.name}: kein Interesse`, () => callbackOutcomeResult(t.leadId, "lost")) },
  );

  if (step === "later") {
    return (
      <ActionSheet
        open
        onClose={close}
        title={`${t.name} später anrufen`}
        actions={LATER.map((o) => ({
          label: o.label,
          onSelect: () => pick(`${t.name}: ${o.label === "Morgen" ? "morgen" : o.label.toLowerCase()} wieder`, () => setFollowUpResult(t.leadId, { days: o.days })),
        }))}
      />
    );
  }
  if (step === "win") {
    return (
      <AbschlussSheet
        open
        title={`Abschluss mit ${t.name}`}
        source={t.source}
        onClose={close}
        onSave={(v) => pick(`${t.name}: Abschluss`, () => callbackOutcomeResult(t.leadId, "won", v))}
      />
    );
  }
  return <ActionSheet open onClose={close} title={`Wie lief's mit ${t.name}?`} message="Ein Tipp – den Rest trägt die App ein." actions={actions} />;
}
