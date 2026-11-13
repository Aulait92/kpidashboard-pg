"use client";

// Lead-Verlauf (Ole, 13.11.2026): Notiz schreiben → „Speichern“ → steht als Eintrag im Verlauf,
// zusammen mit Anrufen, Statuswechseln, Wiedervorlagen, Abschluss und Police.
// Diktieren läuft über das Mikrofon der Handy-Tastatur (kein eigener Spracherkennungsdienst).

import { useEffect, useRef, useState, useTransition } from "react";
import { BellRing, CheckCircle2, FileCheck2, Loader2, Mic, Phone, RefreshCw, StickyNote, Trash2, Trophy } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { addLeadNoteAction, deleteLeadNoteAction, setPolicyDoneAction } from "@/app/buyer/lead-history-actions";
import type { LeadHistoryEntry, LeadHistoryKind } from "@/lib/lead-history";
import { cn } from "@/lib/utils";

const ICON: Record<LeadHistoryKind, typeof Phone> = {
  notiz: StickyNote,
  anruf: Phone,
  status: RefreshCw,
  wiedervorlage: BellRing,
  abschluss: Trophy,
  police: FileCheck2,
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function LeadHistory({
  leadId,
  initial,
  legacyNote,
  readOnly = false,
}: {
  leadId: string;
  initial: LeadHistoryEntry[];
  /** Bisherige Notiz aus dem alten Notizfeld (nur Anzeige). */
  legacyNote?: string | null;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const [history, setHistory] = useState(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [touch, setTouch] = useState(false);
  const [dictateHint, setDictateHint] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  // Neue Daten vom Server (z. B. nach Wiedervorlage oder Anruf) übernehmen
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setHistory(initial);
  }
  useEffect(() => {
    const t = setTimeout(() => setTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false), 0);
    return () => clearTimeout(t);
  }, []);

  const save = () =>
    start(async () => {
      const res = await addLeadNoteAction(leadId, text);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      setHistory(res.history);
      setText("");
      setDictateHint(false);
      toast.show({ message: "Notiz gespeichert" });
    });
  const remove = (id: string) =>
    start(async () => {
      const res = await deleteLeadNoteAction(leadId, id);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      setHistory(res.history);
    });

  return (
    <Card className="mt-6" data-lead-history>
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Notizen & Verlauf</h2>
        {touch && !readOnly ? (
          <button
            type="button"
            onClick={() => {
              area.current?.focus();
              setDictateHint(true);
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[color:var(--border-strong)] px-3 text-sm font-medium hover:border-[color:var(--brand)]"
          >
            <Mic className="h-4 w-4" /> Diktieren
          </button>
        ) : null}
      </div>
      {!readOnly ? (
        <div className="border-b border-[color:var(--border)] px-5 py-4">
          <textarea
            ref={area}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
                e.preventDefault();
                save();
              }
            }}
            placeholder="Was wurde besprochen? Nächster Schritt?"
            className="block w-full resize-y rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2.5 text-base outline-none focus:border-[color:var(--brand)]"
            data-note-input
          />
          {dictateHint ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-[color:var(--brand-dark)]">
              <Mic className="h-4 w-4 shrink-0" /> Tippen Sie in der Tastatur auf das Mikrofon und sprechen Sie. Danach auf „Speichern“.
            </p>
          ) : null}
          <div className="mt-2 flex justify-end">
            <Button variant="primary" size="md" disabled={!text.trim() || pending} onClick={save} data-note-save>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Speichern
            </Button>
          </div>
        </div>
      ) : null}
      {history.length === 0 && !legacyNote ? (
        <p className="px-5 py-4 text-sm text-[color:var(--muted)]">Noch keine Einträge. Anrufe, Wiedervorlagen und Abschlüsse erscheinen hier von selbst.</p>
      ) : (
        <ol className="divide-y divide-[color:var(--border)]">
          {history.map((h) => {
            const Icon = ICON[h.kind] ?? StickyNote;
            const note = h.kind === "notiz";
            return (
              <li key={h.id} className="flex gap-3 px-5 py-3" data-history-kind={h.kind}>
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    note ? "bg-amber-100 text-amber-800" : h.kind === "abschluss" || h.kind === "police" ? "bg-emerald-100 text-emerald-700" : "bg-[color:var(--surface-sunken,#f1f5f9)] text-[color:var(--muted)]",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("whitespace-pre-line break-words text-[15px]", !note && "text-[color:var(--foreground,#0f172a)]")}>{h.text}</p>
                  <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                    {when(h.at)}
                    {h.author ? ` · ${h.author}` : ""}
                  </p>
                </div>
                {note && h.mine && !readOnly ? (
                  <button
                    type="button"
                    onClick={() => remove(h.id)}
                    aria-label="Notiz löschen"
                    className="self-start rounded-full p-1.5 text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken,#f1f5f9)] hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
          {legacyNote ? (
            <li className="flex gap-3 px-5 py-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                <StickyNote className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line break-words text-[15px]">{legacyNote}</p>
                <p className="mt-0.5 text-xs text-[color:var(--muted)]">Frühere Notiz</p>
              </div>
            </li>
          ) : null}
        </ol>
      )}
    </Card>
  );
}

/** Abschluss-Karte: Beitrag, geschätzte Provision und „Police fertig machen“. */
export function AbschlussCard({
  leadId,
  closedAt,
  beitrag,
  provision,
  policyDoneAt,
  readOnly = false,
}: {
  leadId: string;
  closedAt: string | null;
  beitrag: string | null;
  provision: string | null;
  policyDoneAt: string | null;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const [doneAt, setDoneAt] = useState(policyDoneAt);
  const [pending, start] = useTransition();
  const toggle = (next: boolean) =>
    start(async () => {
      const res = await setPolicyDoneAction(leadId, next);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      setDoneAt(next ? new Date().toISOString() : null);
      toast.show({ message: next ? "Police abgehakt" : "Police wieder offen" });
    });
  const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  return (
    <Card className="mb-5 border-emerald-200" data-abschluss-card>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <div className="flex items-center gap-2 font-semibold text-emerald-800">
          <Trophy className="h-5 w-5" /> Abschluss{closedAt ? ` am ${day(closedAt)}` : ""}
        </div>
        <div className="text-sm">
          <span className="text-[color:var(--muted)]">Beitrag </span>
          <b>{beitrag ?? "nicht eingetragen"}</b>
        </div>
        <div className="text-sm">
          <span className="text-[color:var(--muted)]">Provision </span>
          <b>{provision ?? "–"}</b>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] px-5 py-3 text-sm">
        {doneAt ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Police fertig gemacht am {day(doneAt)}</span>
            {!readOnly ? (
              <button type="button" disabled={pending} onClick={() => toggle(false)} className="ml-auto text-xs text-[color:var(--muted)] underline">
                Wieder öffnen
              </button>
            ) : null}
          </>
        ) : (
          <>
            <FileCheck2 className="h-4 w-4 text-amber-600" />
            <span className="font-medium">Nächster Schritt: Police fertig machen</span>
            {!readOnly ? (
              <Button variant="primary" size="sm" className="ml-auto" disabled={pending} onClick={() => toggle(true)} data-police-done>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Police erledigt
              </Button>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
