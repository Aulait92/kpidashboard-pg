"use client";

// Nächster Schritt (Ole, 14.11.2026): „Jeder Lead hat einen nächsten Schritt oder ist Gewonnen bzw. Verloren.“
// - NextStepSheet: „Wie geht es weiter?“ mit 1-Klick-Optionen (Wiedervorlage, Termin anbieten, Nicht
//   erreicht, Gewonnen, Verloren). Schließen ohne Wahl legt „Nächsten Schritt festlegen“ für morgen an.
// - LostSheet: „Warum verloren?“ mit Gründen. Oben „Nicht erreicht?“: Versuch eintragen, nächsten Versuch
//   planen, Lead bleibt offen. Nie erreicht und unter 6 Versuchen: Warnung mit „Weiter versuchen“.
// - NotReachedSheet: nach „nicht erreicht“ die Nachricht „Nicht erreicht“ per WhatsApp bzw. E-Mail anbieten.
// - NextStepPrompt: im Kontakt nach jeder Aktion (Anruf, Notiz, E-Mail, Chat) bzw. nach einem
//   vorbeigegangenen Termin ohne Ergebnis automatisch fragen, wenn der Lead keinen nächsten Schritt hat.
// Überall dieselben Komponenten: Kontakt, Pipeline, Heute, Anrufliste, Kontakte-Liste, Handy.
// Vermittler-Oberfläche in Sie-Form; Texte an Leads nach Ansprache (Du/Sie) vom Server.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  Loader2,
  Mail,
  MessageCircle,
  PhoneMissed,
  Send,
  ThumbsDown,
  Trophy,
  UserX,
} from "lucide-react";
import {
  appointmentOutcomeResult,
  callbackOutcomeResult,
  setFollowUpResult,
  undoInboxAction,
  type InboxResult,
} from "@/app/buyer/inbox-actions";
import {
  appointmentTextsAction,
  keepTryingResult,
  laterTodayResult,
  leadStepInfoAction,
  logNotReachedWhatsAppAction,
  markLeadLostResult,
  needsNextStepAction,
  nextStepTaskResult,
  notReachedResult,
  notReachedTextsAction,
  offerAppointmentResult,
  sendNotReachedMailResult,
  type LeadStepInfo,
} from "@/app/buyer/next-step-actions";
import { AbschlussSheet, asksCloseValue } from "@/components/abschluss-sheet";
import { fmtDay, LaterDateSheet } from "@/components/later-date-sheet";
import { useProvisionRates } from "@/components/provision-context";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { CALL_ATTEMPTS_TARGET, LOST_REASONS, lostWarningText, needsLostWarning, type LostReasonKey } from "@/lib/lead-lost";
import { cn } from "@/lib/utils";

/** Nach einer Aktion im Kontakt (Anruf, Notiz, E-Mail …): fragt NextStepPrompt nach dem nächsten Schritt. */
export const LEAD_ACTION_EVENT = "pg-lead-action";
export function emitLeadAction(leadId: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LEAD_ACTION_EVENT, { detail: { leadId } }));
}

/** Ergebnis an den Aufrufer (Toast, Rückgängig, Zeile ausblenden macht er); status = neuer Status bei Verloren. */
export type StepDone = (res: InboxResult, message: string, status?: string) => void;

/** Nach „nicht erreicht“ (Anrufliste, Heute, Kontakt): Nachricht „Nicht erreicht“ anbieten (NotReachedOfferHost). */
export const NOT_REACHED_OFFER_EVENT = "pg-not-reached-offer";
export function emitNotReachedOffer(leadId: string, name: string, attempt: Attempt) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(NOT_REACHED_OFFER_EVENT, { detail: { leadId, name, attempt } }));
}

/** Einmal in der Shell: zeigt nach „nicht erreicht“ das Angebot „Nicht erreicht“ per WhatsApp bzw. E-Mail. */
export function NotReachedOfferHost() {
  const [offer, setOffer] = useState<{ leadId: string; name: string; attempt: Attempt } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ leadId: string; name: string; attempt: Attempt }>).detail;
      if (d?.leadId && d.attempt) setOffer(d);
    };
    window.addEventListener(NOT_REACHED_OFFER_EVENT, on);
    return () => window.removeEventListener(NOT_REACHED_OFFER_EVENT, on);
  }, []);
  if (!offer) return null;
  return <NotReachedSheet key={offer.leadId} leadId={offer.leadId} name={offer.name} attempt={offer.attempt} onClose={() => setOffer(null)} />;
}

type Attempt = NonNullable<Extract<InboxResult, { ok: true }>["attempt"]>;

/** Standard: Toast mit „Rückgängig“ und Seite neu laden. */
export function useStepDone(): { done: StepDone } {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const done: StepDone = useCallback(
    (res, message) => {
      if (!res.ok) {
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      const undo = res.undo;
      toast.show({
        message: res.attempt ? attemptMessage(message, res.attempt) : message,
        ...(undo ? { actionLabel: "Rückgängig", onAction: () => start(async () => { await undoInboxAction(undo); router.refresh(); }) } : {}),
      });
      router.refresh();
    },
    [router, toast],
  );
  return { done };
}

/** Ergebnis nach angezeigtem Angebot markieren, damit der Aufrufer es nicht noch einmal anbietet. */
function offered(res: InboxResult): InboxResult {
  return res.ok && res.attempt ? { ...res, attempt: { ...res.attempt, offered: true } } : res;
}

/** Toast nach „nicht erreicht“: „Lisa: Versuch 2 von 6 eingetragen, nächster Versuch heute 16:30 Uhr“. */
export function attemptMessage(prefix: string, a: Attempt): string {
  const name = prefix.split(":")[0];
  if (!a.counted && a.attempts > 0 && !a.nextLabel) return `${name}: Versuch wurde in den letzten 30 Minuten schon gezählt`;
  const head = a.counted ? `${name}: Versuch ${Math.min(a.attempts, CALL_ATTEMPTS_TARGET)} von ${CALL_ATTEMPTS_TARGET} eingetragen` : `${name}: nächster Versuch geplant`;
  if (a.nextLabel) return `${head}, nächster Versuch ${a.nextLabel}`;
  if (a.attempts >= CALL_ATTEMPTS_TARGET) return `${head}. Alle Versuche gemacht`;
  return head;
}

/** „Versuch 3 von 6“ (der Versuch, der eingetragen würde) bzw. „6 von 6 gemacht“. */
function attemptBadge(done: number): string {
  return done >= CALL_ATTEMPTS_TARGET ? `${CALL_ATTEMPTS_TARGET} von ${CALL_ATTEMPTS_TARGET} gemacht` : `Versuch ${done + 1} von ${CALL_ATTEMPTS_TARGET}`;
}

function useStepInfo(leadId: string) {
  const [info, setInfo] = useState<LeadStepInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    leadStepInfoAction(leadId).then((r) => {
      if (!alive) return;
      if (r.ok) setInfo(r.info);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [leadId]);
  return { info, error };
}

const rowCls =
  "flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-[color:var(--surface-sunken)] active:bg-[color:var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

function Loading() {
  return (
    <div className="flex items-center gap-2 px-5 py-6 text-sm text-[color:var(--muted)]">
      <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
    </div>
  );
}

// ─── Verloren ──────────────────────────────────────────────────────────────

export function LostSheet({
  leadId,
  name,
  appointmentId = null,
  onClose,
  onDone,
}: {
  leadId: string;
  name: string;
  /** Vorbeigegangener Termin: Ergebnis gleich mit eintragen (der Lead war erreicht). */
  appointmentId?: string | null;
  onClose: () => void;
  onDone: StepDone;
}) {
  const toast = useToast();
  const { info, error } = useStepInfo(leadId);
  const [step, setStep] = useState<"pick" | "note" | "warn" | "override" | "offer">("pick");
  const [reason, setReason] = useState<LostReasonKey | null>(null);
  const [note, setNote] = useState("");
  const [busy, startBusy] = useTransition();
  const [offer, setOffer] = useState<{ res: InboxResult; attempt: Attempt } | null>(null);
  const attempts = info?.callAttempts ?? 0;
  const guard = { reached: (info?.reached ?? false) || !!appointmentId, callAttempts: attempts };

  const submit = (key: LostReasonKey, text: string, override = false) =>
    startBusy(async () => {
      const res = await markLeadLostResult(leadId, { reason: key, note: text, override, appointmentId });
      if (!res.ok && "warn" in res) {
        setReason(key);
        setStep("warn");
        return;
      }
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      const r = LOST_REASONS.find((x) => x.key === key);
      onDone(res, `${name}: verloren (${r?.label ?? "Grund"})`, r?.status);
      onClose();
    });

  const choose = (key: LostReasonKey) => {
    setReason(key);
    const r = LOST_REASONS.find((x) => x.key === key)!;
    if (r.needsNote) return setStep("note");
    if (needsLostWarning(guard, key)) return setStep("warn");
    submit(key, "");
  };

  const notReached = () =>
    startBusy(async () => {
      const res = await notReachedResult(leadId);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      if (res.attempt) {
        setOffer({ res, attempt: res.attempt });
        setStep("offer");
      } else {
        onDone(res, `${name}: nicht erreicht`);
        onClose();
      }
    });

  const keepTrying = () =>
    startBusy(async () => {
      const res = await keepTryingResult(leadId);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      if (res.attempt) {
        setOffer({ res, attempt: res.attempt });
        setStep("offer");
      } else {
        onDone(res, `${name}: weiter versuchen`);
        onClose();
      }
    });

  if (step === "offer" && offer) {
    return (
      <NotReachedSheet
        leadId={leadId}
        name={name}
        attempt={offer.attempt}
        onClose={() => {
          onDone(offered(offer.res), `${name}: nicht erreicht`);
          onClose();
        }}
      />
    );
  }

  const an = info?.ansprache ?? "sie";
  if (step === "warn" || step === "override") {
    return (
      <Sheet open onClose={onClose} title="Noch nicht aufgeben" message={name}>
        <div className="space-y-3 p-5" data-lost-warning>
          <div className="flex gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{lostWarningText(attempts)}</span>
          </div>
          {step === "warn" ? (
            <>
              <Button variant="primary" size="md" icon={PhoneMissed} className="w-full" disabled={busy} onClick={keepTrying} data-keep-trying>
                Weiter versuchen
              </Button>
              <p className="text-center text-xs text-[color:var(--muted)]">Legt den nächsten Anrufversuch nach Plan an und bietet die Nachricht „Nicht erreicht“ an.</p>
              <Button variant="ghost" size="md" className="w-full" disabled={busy} onClick={() => setStep("override")} data-lost-anyway>
                Trotzdem verloren
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Warum ist der Lead trotzdem verloren?</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={busy} onClick={() => submit("falsche_daten", "Nummer existiert nicht")} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-sm hover:border-[color:var(--brand)]">
                  Nummer existiert nicht
                </button>
                <button type="button" disabled={busy} onClick={() => submit("nicht_angefragt", "Lead sagt, er hat nichts angefragt")} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-sm hover:border-[color:var(--brand)]">
                  Lead sagt, er hat nichts angefragt
                </button>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Begründung (Pflicht)"
                aria-label="Begründung"
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-base outline-none focus:border-[color:var(--brand)]"
                data-lost-note
              />
              <Button variant="danger" size="md" className="w-full" disabled={busy || note.trim().length < 3 || !reason} onClick={() => reason && submit(reason, note, true)} data-lost-confirm>
                Als verloren speichern
              </Button>
            </>
          )}
        </div>
      </Sheet>
    );
  }

  if (step === "note") {
    return (
      <Sheet open onClose={onClose} title="Sonstiger Grund" message={name}>
        <div className="space-y-3 p-5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Warum ist der Lead verloren? (Pflicht)"
            aria-label="Begründung"
            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-base outline-none focus:border-[color:var(--brand)]"
          />
          <Button variant="danger" size="md" className="w-full" disabled={busy || note.trim().length < 3} onClick={() => submit("sonstiges", note)}>
            Als verloren speichern
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Warum verloren?" message={name}>
      {!info ? (
        error ? <p className="px-5 py-4 text-sm text-rose-700">{error}</p> : <Loading />
      ) : (
        <div data-lost-sheet>
          {!appointmentId ? (
            <button type="button" onClick={notReached} disabled={busy} className={cn(rowCls, "border-b border-[color:var(--border)] bg-[color:var(--brand-soft)]")} data-not-reached>
              <PhoneMissed className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[color:var(--brand)]" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[color:var(--brand)]">Nicht erreicht?</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[color:var(--brand)]">
                    {attemptBadge(attempts)}
                  </span>
                </span>
                <span className="block text-xs text-[color:var(--muted)]">
                  Nicht auf Verloren setzen. Wir planen die nächsten Versuche {an === "du" ? "für dich" : "für Sie"}.
                </span>
              </span>
            </button>
          ) : null}
          <ul className="divide-y divide-[color:var(--border)]">
            {LOST_REASONS.map((r) => {
              const locked = r.key === "nicht_erreichbar" && !info.canUnreachable;
              return (
                <li key={r.key}>
                  <button type="button" disabled={busy || locked} onClick={() => choose(r.key)} className={rowCls} data-lost-reason={r.key}>
                    <ThumbsDown className="mt-0.5 h-[18px] w-[18px] shrink-0 text-rose-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px]">{r.label}</span>
                      <span className="block text-xs text-[color:var(--muted)]">
                        {locked ? `Erst nach ${CALL_ATTEMPTS_TARGET} Versuchen, bisher ${Math.min(attempts, CALL_ATTEMPTS_TARGET)}` : r.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

// ─── Nicht erreicht: Nachricht anbieten ────────────────────────────────────

export function NotReachedSheet({ leadId, name, attempt, onClose }: { leadId: string; name: string; attempt: Attempt; onClose: () => void }) {
  const toast = useToast();
  const { info } = useStepInfo(leadId);
  const [texts, setTexts] = useState<{ whatsapp: string; subject: string; body: string } | null>(null);
  const [mail, setMail] = useState<{ subject: string; body: string } | null>(null);
  const [busy, startBusy] = useTransition();
  useEffect(() => {
    let alive = true;
    notReachedTextsAction(leadId).then((r) => {
      if (alive && r.ok) setTexts({ whatsapp: r.whatsapp, subject: r.subject, body: r.body });
    });
    return () => {
      alive = false;
    };
  }, [leadId]);

  const n = Math.min(attempt.attempts, CALL_ATTEMPTS_TARGET);
  const title = attempt.counted ? `Versuch ${n} von ${CALL_ATTEMPTS_TARGET} eingetragen` : attempt.nextLabel ? "Nächster Versuch geplant" : "Versuch schon eingetragen";
  const message = attempt.nextLabel
    ? `Nächster Anrufversuch ${attempt.nextLabel}. Er steht dann auf „Heute“.`
    : attempt.attempts >= CALL_ATTEMPTS_TARGET
      ? `Alle ${CALL_ATTEMPTS_TARGET} Versuche gemacht. Sie können den Lead jetzt als „nicht erreichbar“ eintragen.`
      : attempt.keptFollowUp
        ? "Ihre Wiedervorlage bleibt bestehen."
        : !attempt.counted
          ? "In den letzten 30 Minuten wurde schon ein Versuch gezählt."
          : "";

  if (mail) {
    return (
      <Sheet open onClose={onClose} title="E-Mail „Nicht erreicht“" message={info?.email ?? name}>
        <div className="space-y-3 p-5">
          <input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} aria-label="Betreff" className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-base outline-none focus:border-[color:var(--brand)]" />
          <textarea value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} rows={9} aria-label="Text" className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-base outline-none focus:border-[color:var(--brand)]" />
          <Button
            variant="primary"
            size="md"
            icon={Send}
            className="w-full"
            disabled={busy || !mail.subject.trim() || !mail.body.trim()}
            onClick={() =>
              startBusy(async () => {
                const r = await sendNotReachedMailResult(leadId, mail.subject, mail.body);
                if (!r.ok) return toast.show({ message: r.error, tone: "error" });
                toast.show({ message: `E-Mail an ${info?.email ?? name} gesendet` });
                onClose();
              })
            }
          >
            Senden
          </Button>
        </div>
      </Sheet>
    );
  }

  const waHref = info?.phone && texts ? (info.conversationId ? `/buyer/chats?c=${info.conversationId}` : `https://wa.me/${info.phone}?text=${encodeURIComponent(texts.whatsapp)}`) : null;
  const mailto = info?.email && texts && !info.mailReady ? `mailto:${info.email}?subject=${encodeURIComponent(texts.subject)}&body=${encodeURIComponent(texts.body)}` : null;
  return (
    <Sheet open onClose={onClose} title={title} message={message}>
      <div className="space-y-2 p-5" data-not-reached-offer>
        {!info || !texts ? (
          <Loading />
        ) : (
          <>
            <p className="text-sm font-medium">Nachricht „Nicht erreicht“ schicken?</p>
            {attempt.auto ? <p className="text-sm text-[color:var(--muted)]">Ihr Assistent schickt automatisch eine WhatsApp.</p> : null}
            {waHref && !attempt.auto ? (
              <a
                href={waHref}
                target={info.conversationId ? undefined : "_blank"}
                rel="noreferrer"
                onClick={() => {
                  if (info.conversationId) void navigator.clipboard?.writeText(texts.whatsapp).catch(() => {});
                  void logNotReachedWhatsAppAction(leadId);
                  if (info.conversationId) toast.show({ message: "Text kopiert. Im Chat einfügen und senden." });
                }}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> Per WhatsApp
              </a>
            ) : null}
            {info.mailReady ? (
              <Button size="md" icon={Mail} className="w-full" onClick={() => setMail({ subject: texts.subject, body: texts.body })}>
                Per E-Mail
              </Button>
            ) : mailto ? (
              <a href={mailto} className="flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] text-sm font-semibold">
                <Mail className="h-4 w-4" /> Per E-Mail
              </a>
            ) : null}
            <Button variant="ghost" size="md" className="w-full" onClick={onClose}>
              Fertig
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ─── Wie geht es weiter? ───────────────────────────────────────────────────

export function NextStepSheet({
  leadId,
  name,
  source = null,
  appointmentId = null,
  title = "Wie geht es weiter?",
  fallbackOnClose = true,
  onClose,
  onDone,
}: {
  leadId: string;
  name: string;
  source?: string | null;
  /** Termin vorbei ohne Ergebnis: Ergebnis-Optionen dazu. */
  appointmentId?: string | null;
  title?: string;
  /** Schließen ohne Wahl legt „Nächsten Schritt festlegen“ für morgen an. */
  fallbackOnClose?: boolean;
  onClose: () => void;
  onDone: StepDone;
}) {
  const toast = useToast();
  const rates = useProvisionRates();
  const { info } = useStepInfo(leadId);
  const [step, setStep] = useState<"pick" | "date" | "termin" | "terminMail" | "win" | "lost" | "offer">("pick");
  const [busy, startBusy] = useTransition();
  const [termin, setTermin] = useState<{ link: string; whatsapp: string; subject: string; body: string } | null>(null);
  const [offer, setOffer] = useState<{ res: InboxResult; attempt: Attempt } | null>(null);
  const chosen = useRef(false);

  const dismiss = () => {
    if (!chosen.current && fallbackOnClose) {
      void nextStepTaskResult(leadId).then((r) => {
        if (r.ok && r.created) toast.show({ message: `${name}: Aufgabe für morgen „Nächsten Schritt festlegen“` });
      });
    }
    onClose();
  };
  const run = (message: string, action: () => Promise<InboxResult>) => {
    chosen.current = true;
    startBusy(async () => {
      const res = await action();
      if (!res.ok) {
        chosen.current = false;
        return toast.show({ message: res.error, tone: "error" });
      }
      if (res.attempt) {
        setOffer({ res, attempt: res.attempt });
        setStep("offer");
        return;
      }
      onDone(res, message);
      onClose();
    });
  };
  const openTermin = () =>
    startBusy(async () => {
      const r = await appointmentTextsAction(leadId);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      setTermin({ link: r.link, whatsapp: r.whatsapp, subject: r.subject, body: r.body });
      setStep("termin");
    });
  const won = () => {
    if (asksCloseValue(source, rates)) return setStep("win");
    run(`${name}: Abschluss`, () => (appointmentId ? appointmentOutcomeResult(appointmentId, "closed", null) : callbackOutcomeResult(leadId, "won", null)));
  };

  if (step === "offer" && offer) {
    return (
      <NotReachedSheet
        leadId={leadId}
        name={name}
        attempt={offer.attempt}
        onClose={() => {
          onDone(offered(offer.res), `${name}: nicht erreicht`);
          onClose();
        }}
      />
    );
  }
  if (step === "lost") {
    return (
      <LostSheet
        leadId={leadId}
        name={name}
        appointmentId={appointmentId}
        onClose={() => {
          if (!chosen.current) setStep("pick");
          else onClose();
        }}
        onDone={(res, msg, status) => {
          chosen.current = true;
          onDone(res, msg, status);
        }}
      />
    );
  }
  if (step === "date") {
    return (
      <LaterDateSheet
        open
        title={`Wiedervorlage für ${name}`}
        onClose={() => setStep("pick")}
        onPick={(date) => run(`${name}: Wiedervorlage am ${fmtDay(date)}`, () => setFollowUpResult(leadId, { date }))}
      />
    );
  }
  if (step === "win") {
    return (
      <AbschlussSheet
        open
        title={`Abschluss mit ${name}`}
        source={source}
        onClose={() => setStep("pick")}
        onSave={(v, sp) => run(`${name}: Abschluss`, () => (appointmentId ? appointmentOutcomeResult(appointmentId, "closed", v, sp) : callbackOutcomeResult(leadId, "won", v, sp)))}
      />
    );
  }
  if (step === "terminMail" && termin) {
    return (
      <Sheet open onClose={() => setStep("termin")} title="Terminlink per E-Mail" message={info?.email ?? name}>
        <div className="space-y-3 p-5">
          <input value={termin.subject} onChange={(e) => setTermin({ ...termin, subject: e.target.value })} aria-label="Betreff" className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-base outline-none focus:border-[color:var(--brand)]" />
          <textarea value={termin.body} onChange={(e) => setTermin({ ...termin, body: e.target.value })} rows={8} aria-label="Text" className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-base outline-none focus:border-[color:var(--brand)]" />
          <Button
            variant="primary"
            size="md"
            icon={Send}
            className="w-full"
            disabled={busy}
            onClick={() => run(`${name}: Terminlink gesendet`, () => offerAppointmentResult(leadId, "mail", { subject: termin.subject, body: termin.body }))}
          >
            Senden
          </Button>
        </div>
      </Sheet>
    );
  }
  if (step === "termin" && termin) {
    const waHref = info?.phone ? (info.conversationId ? `/buyer/chats?c=${info.conversationId}` : `https://wa.me/${info.phone}?text=${encodeURIComponent(termin.whatsapp)}`) : null;
    return (
      <Sheet open onClose={() => setStep("pick")} title="Termin anbieten" message="Mit Ihrem persönlichen Terminlink. Bucht der Lead nicht, erinnert die App Sie in 2 Werktagen.">
        <div className="space-y-2 p-5" data-termin-offer>
          <p className="whitespace-pre-line rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm">{termin.whatsapp}</p>
          {info?.mailReady ? (
            <Button size="md" variant="primary" icon={Mail} className="w-full" onClick={() => setStep("terminMail")}>
              Per E-Mail senden
            </Button>
          ) : null}
          {waHref ? (
            <a
              href={waHref}
              target={info?.conversationId ? undefined : "_blank"}
              rel="noreferrer"
              onClick={() => {
                if (info?.conversationId) void navigator.clipboard?.writeText(termin.whatsapp).catch(() => {});
                run(`${name}: Terminlink per WhatsApp angeboten`, () => offerAppointmentResult(leadId, "whatsapp"));
              }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" /> Per WhatsApp
            </a>
          ) : null}
          <Button
            size="md"
            icon={Copy}
            className="w-full"
            onClick={() => {
              void navigator.clipboard?.writeText(termin.link).catch(() => {});
              run(`${name}: Terminlink kopiert`, () => offerAppointmentResult(leadId, "copy"));
            }}
          >
            Link kopieren
          </Button>
        </div>
      </Sheet>
    );
  }

  const chip =
    "flex h-11 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm font-medium hover:border-[color:var(--brand)] hover:text-[color:var(--brand)] disabled:opacity-50";
  return (
    <Sheet open onClose={dismiss} title={title} message={name}>
      <div className="max-h-[75dvh] space-y-4 overflow-y-auto p-5" data-next-step-sheet>
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            <BellRing className="h-3.5 w-3.5" /> Wiedervorlage
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" className={chip} disabled={busy} onClick={() => run(`${name}: heute später wieder`, () => laterTodayResult(leadId))} data-step="heute">
              Heute später
            </button>
            <button type="button" className={chip} disabled={busy} onClick={() => run(`${name}: morgen wieder`, () => setFollowUpResult(leadId, { days: 1 }))} data-step="morgen">
              Morgen
            </button>
            <button type="button" className={chip} disabled={busy} onClick={() => run(`${name}: in 3 Tagen wieder`, () => setFollowUpResult(leadId, { days: 3 }))} data-step="3tage">
              In 3 Tagen
            </button>
            <button type="button" className={chip} disabled={busy} onClick={() => setStep("date")} data-step="datum">
              Datum …
            </button>
          </div>
        </section>
        <section className="space-y-2">
          {appointmentId ? (
            <>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                <Clock className="h-3.5 w-3.5" /> Ergebnis des Termins
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={chip} disabled={busy} onClick={() => run(`${name}: Angebot gesendet`, () => appointmentOutcomeResult(appointmentId, "offer", null))}>
                  <Send className="h-4 w-4" /> Angebot gesendet
                </button>
                <button type="button" className={chip} disabled={busy} onClick={() => run(`${name}: nicht erschienen`, () => appointmentOutcomeResult(appointmentId, "no_show", null))}>
                  <UserX className="h-4 w-4" /> Nicht erschienen
                </button>
              </div>
            </>
          ) : null}
          <button type="button" className={cn(chip, "w-full justify-start px-4")} disabled={busy || (info != null && !info.terminlink)} onClick={openTermin} data-step="termin">
            <CalendarPlus className="h-4 w-4" />
            <span className="flex-1 text-left">Termin anbieten</span>
            {info && !info.terminlink ? <span className="text-xs text-[color:var(--muted)]">Kalender verbinden</span> : <ArrowRight className="h-4 w-4" />}
          </button>
          {!appointmentId ? (
            <button type="button" className={cn(chip, "w-full justify-start px-4")} disabled={busy} onClick={() => run(`${name}: nicht erreicht`, () => notReachedResult(leadId))} data-step="nicht-erreicht">
              <PhoneMissed className="h-4 w-4" />
              <span className="flex-1 text-left">Nicht erreicht</span>
              {info ? <span className="text-xs text-[color:var(--muted)]">{attemptBadge(info.callAttempts)}</span> : null}
            </button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={cn(chip, "border-emerald-200 text-emerald-700")} disabled={busy} onClick={won} data-step="gewonnen">
              <Trophy className="h-4 w-4" /> Abschluss
            </button>
            <button type="button" className={cn(chip, "border-rose-200 text-rose-700")} disabled={busy} onClick={() => setStep("lost")} data-step="verloren">
              <ThumbsDown className="h-4 w-4" /> Verloren
            </button>
          </div>
        </section>
        {busy ? (
          <p className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Speichert …
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

// ─── Im Kontakt: nach jeder Aktion fragen ──────────────────────────────────

/**
 * Hört auf LEAD_ACTION_EVENT (Anrufergebnis, Notiz, E-Mail, übernommener Chat) und fragt, wenn der Lead danach
 * keinen nächsten Schritt hat. Termin vorbei ohne Ergebnis: fragt beim Öffnen des Kontakts (einmal je Sitzung).
 */
export function NextStepPrompt({
  leadId,
  name,
  source,
  resultMissingAppointmentId = null,
  autoOpen = false,
}: {
  leadId: string;
  name: string;
  source: string | null;
  resultMissingAppointmentId?: string | null;
  /** Gleich beim Öffnen fragen (z. B. nach einem übernommenen Chat oder einem vorbeigegangenen Termin). */
  autoOpen?: boolean;
}) {
  const { done } = useStepDone();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onAction = (e: Event) => {
      const d = (e as CustomEvent<{ leadId?: string }>).detail;
      if (d?.leadId !== leadId) return;
      void needsNextStepAction(leadId).then((needs) => {
        if (needs) setOpen(true);
      });
    };
    window.addEventListener(LEAD_ACTION_EVENT, onAction);
    return () => window.removeEventListener(LEAD_ACTION_EVENT, onAction);
  }, [leadId]);
  useEffect(() => {
    if (!autoOpen && !resultMissingAppointmentId) return;
    const key = `pg-next-step:${leadId}:${resultMissingAppointmentId ?? "auto"}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* ohne Speicher trotzdem fragen */
    }
    const t = setTimeout(() => {
      void needsNextStepAction(leadId).then((needs) => {
        if (needs) setOpen(true);
      });
    }, 400);
    return () => clearTimeout(t);
  }, [leadId, autoOpen, resultMissingAppointmentId]);
  if (!open) return null;
  return (
    <NextStepSheet
      leadId={leadId}
      name={name}
      source={source}
      appointmentId={resultMissingAppointmentId}
      title={resultMissingAppointmentId ? "Termin vorbei: Wie geht es weiter?" : "Wie geht es weiter?"}
      onClose={() => setOpen(false)}
      onDone={done}
    />
  );
}

/** Kleiner Knopf „Nächster Schritt“ (Kontakte-Liste, Pipeline-Karte). */
export function NextStepButton({
  leadId,
  name,
  source = null,
  appointmentId = null,
  resultMissing = false,
  className,
  label,
}: {
  leadId: string;
  name: string;
  source?: string | null;
  appointmentId?: string | null;
  resultMissing?: boolean;
  className?: string;
  /** Beschriftung (Standard: „Nächster Schritt“ bzw. „Ergebnis eintragen“) */
  label?: string;
}) {
  const { done } = useStepDone();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100",
          className,
        )}
        data-next-step-button
      >
        <Check className="h-3.5 w-3.5" />
        {resultMissing ? "Ergebnis eintragen" : (label ?? "Nächster Schritt")}
      </button>
      {open
        ? createPortal(
            // Klicks im Fenster nicht an die Tabellenzeile weitergeben (React reicht Ereignisse durch Portale durch).
            <div onClick={(e) => e.stopPropagation()}>
              <NextStepSheet leadId={leadId} name={name} source={source} appointmentId={appointmentId} fallbackOnClose={false} onClose={() => setOpen(false)} onDone={done} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
