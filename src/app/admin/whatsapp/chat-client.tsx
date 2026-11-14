"use client";

// Admin-Chat (WhatsApp): Eingabeleiste wie bei WhatsApp Web und der Termin-
// Dialog mit Admin-Aktionen. Die Seite selbst rendert serverseitig (page.tsx).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Clock, FileText, Send, Smile } from "lucide-react";
import { RescheduleButton, type RescheduleActions, type RescheduleStep } from "@/components/reschedule-dialog";
import { Button } from "@/components/ui";
import { ToastProvider } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { sendReplyAction, sendTemplateAction, takeOverAction } from "./actions";
import { cancelAppointmentAdminAction, loadRescheduleDialogAdmin, rescheduleAppointmentAdminAction } from "./appointment-actions";

// ─── Termin verschieben/absagen (Admin-Rechte, gleicher Dialog wie im Kundenbereich) ───

const ADMIN_RESCHEDULE: RescheduleActions = {
  load: loadRescheduleDialogAdmin,
  reschedule: rescheduleAppointmentAdminAction,
  cancel: cancelAppointmentAdminAction,
  calendarHint: "Bitte in der Kundenakte unter „WhatsApp“ prüfen, ob der Kalender des Kunden verbunden ist.",
};

export function AdminRescheduleButton({
  appointmentId,
  initialStep = "move",
  className,
  children,
}: {
  appointmentId: string;
  initialStep?: RescheduleStep;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <ToastProvider>
      <RescheduleButton
        appointmentId={appointmentId}
        initialStep={initialStep}
        actions={ADMIN_RESCHEDULE}
        onChanged={() => router.refresh()}
        className={className}
      >
        {children}
      </RescheduleButton>
    </ToastProvider>
  );
}

// ─── Eingabeleiste ─────────────────────────────────────────────────────

export type Snippet = { label: string; text: string };
export type TemplateOption = { purpose: string; label: string; preview: string; approved: boolean };

const EMOJIS = ["🙂", "😊", "😀", "😉", "👍", "🙏", "👋", "🎉", "✅", "📅", "📞", "💻", "📄", "✍️", "🤝", "💡", "❤️", "👌", "😅", "🤔", "⏰", "📍", "✨", "🙌"];

/** „noch 23 Std.“ bzw. „noch 40 Min.“ bis zum Ende des 24h-Fensters. */
function remaining(expiresAt: number, now: number): string {
  const min = Math.max(0, Math.round((expiresAt - now) / 60000));
  if (min < 60) return `noch ${Math.max(1, min)} Min.`;
  return `noch ${Math.floor(min / 60)} Std.`;
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const ICON_BTN =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--muted)] transition hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] disabled:opacity-40";

export function ChatComposer({
  conversationId,
  botActive: initialBotActive,
  windowExpiresAt,
  snippets,
  templates,
  suggestedPurpose,
  blockedReason,
}: {
  conversationId: string;
  botActive: boolean;
  /** Ende des 24h-Fensters (ms) oder null. */
  windowExpiresAt: number | null;
  /** Textbausteine zum Einfügen (offenes Fenster). */
  snippets: Snippet[];
  /** Freigegebene bzw. vorbereitete Nachfass-Vorlagen (geschlossenes Fenster). */
  templates: TemplateOption[];
  suggestedPurpose: string | null;
  /** Nachfassen gesperrt (z. B. Termin steht), dann nur der Hinweis. */
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState("");
  const [botActive, setBotActive] = useState(initialBotActive);
  // Server-Stand übernehmen (z. B. „Bot aktivieren“ oben), ohne den Entwurf zu verlieren.
  const [serverBotActive, setServerBotActive] = useState(initialBotActive);
  if (serverBotActive !== initialBotActive) {
    setServerBotActive(initialBotActive);
    setBotActive(initialBotActive);
  }
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<"snippets" | "emoji" | null>(null);
  const [pending, startTransition] = useTransition();
  const [taking, startTaking] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useOutsideClose(menu !== null, () => setMenu(null));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Textfeld wächst mit (1 bis ca. 6 Zeilen).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 6 * 22 + 20)}px`;
  }, [text]);

  const open = windowExpiresAt != null && windowExpiresAt > now;

  const takeOver = () => {
    if (!botActive) return;
    setBotActive(false);
    startTaking(async () => {
      const r = await takeOverAction(conversationId);
      if (!r.ok) {
        setBotActive(true);
        setError(r.error);
      }
      router.refresh();
    });
  };

  const insert = (piece: string) => {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + piece + text.slice(end);
    setText(next);
    takeOver();
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = start + piece.length;
      ta?.setSelectionRange(pos, pos);
    });
  };

  const send = () => {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await sendReplyAction(conversationId, body);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setText("");
      setBotActive(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <ClosedWindow
        conversationId={conversationId}
        templates={templates}
        suggestedPurpose={suggestedPurpose}
        blockedReason={blockedReason}
      />
    );
  }

  return (
    <div className="border-t border-[color:var(--border)] bg-white px-3 pb-3 pt-2 sm:px-4" data-composer>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface-sunken)] px-2.5 py-0.5 text-xs text-[color:var(--muted)]"
          title="WhatsApp erlaubt freie Nachrichten nur innerhalb von 24 Stunden nach der letzten Nachricht des Kontakts."
          data-window-chip
        >
          <Clock className="h-3.5 w-3.5" />
          Antwortfenster: {remaining(windowExpiresAt!, now)}
        </span>
      </div>
      {botActive ? (
        <div
          className="mb-2 flex items-center gap-2 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900"
          data-bot-hint
        >
          <Bot className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="sm:hidden">Der KI-Bot antwortet gerade.</span>
            <span className="hidden sm:inline">Der KI-Bot antwortet gerade. Übernehmen, um selbst zu schreiben.</span>
          </span>
          <button
            type="button"
            onClick={takeOver}
            disabled={taking}
            className="shrink-0 rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Übernehmen
          </button>
        </div>
      ) : null}

      <div className="relative" ref={menuRef}>
        {menu === "snippets" ? (
          <div className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-[min(420px,calc(100vw-32px))] overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-1 shadow-[var(--shadow-md)]" role="menu">
            {snippets.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[color:var(--muted)]">Für diesen Kunden sind noch keine Vorlagen angelegt.</p>
            ) : (
              snippets.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    insert(s.text);
                    setMenu(null);
                  }}
                  className="block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left hover:bg-[color:var(--surface-sunken)]"
                >
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="line-clamp-2 text-xs text-[color:var(--muted)]">{s.text}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
        {menu === "emoji" ? (
          <div className="absolute bottom-full left-0 z-20 mb-2 grid w-[264px] grid-cols-6 gap-1 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-2 shadow-[var(--shadow-md)]" role="menu">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                role="menuitem"
                aria-label={`Emoji ${e}`}
                onClick={() => {
                  insert(e);
                  setMenu(null);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-lg hover:bg-[color:var(--surface-sunken)]"
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-1 rounded-[24px] border border-[color:var(--border)] bg-white py-1 pl-1 pr-1 shadow-[var(--shadow-sm)] transition focus-within:border-[color:var(--brand)] focus-within:ring-2 focus-within:ring-[color:var(--brand)]/15"
        >
          <button type="button" className={ICON_BTN} aria-label="Vorlage einfügen" title="Vorlage einfügen" onClick={() => setMenu(menu === "snippets" ? null : "snippets")}>
            <FileText className="h-[18px] w-[18px]" />
          </button>
          <button type="button" className={ICON_BTN} aria-label="Emoji einfügen" title="Emoji" onClick={() => setMenu(menu === "emoji" ? null : "emoji")}>
            <Smile className="h-[18px] w-[18px]" />
          </button>
          <textarea
            ref={taRef}
            name="body"
            rows={1}
            value={text}
            aria-label="Nachricht"
            placeholder="Nachricht schreiben"
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) takeOver();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              // Handy: Enter macht eine neue Zeile, gesendet wird mit dem Knopf.
              if (window.matchMedia("(pointer: coarse)").matches) return;
              e.preventDefault();
              send();
            }}
            className="max-h-[152px] min-h-[36px] flex-1 resize-none self-center bg-transparent px-2 py-[7px] text-sm leading-[22px] outline-none placeholder:text-[color:var(--muted)]"
          />
          <button
            type="submit"
            aria-label="Senden"
            title="Senden"
            disabled={!text.trim() || pending}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)] text-white shadow-[var(--shadow-sm)] transition hover:bg-[color:var(--brand-dark)] disabled:bg-[color:var(--surface-sunken)] disabled:text-[color:var(--muted)] disabled:shadow-none"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
      {error ? <p className="mt-1.5 px-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

function ClosedWindow({
  conversationId,
  templates,
  suggestedPurpose,
  blockedReason,
}: {
  conversationId: string;
  templates: TemplateOption[];
  suggestedPurpose: string | null;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(suggestedPurpose ?? templates[0]?.purpose ?? null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const option = templates.find((t) => t.purpose === picked) ?? null;

  const send = () => {
    if (!option) return;
    setError(null);
    startTransition(async () => {
      const r = await sendTemplateAction(conversationId, option.purpose);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSent(true);
      router.refresh();
    });
  };

  return (
    <div className="border-t border-[color:var(--border)] bg-white px-3 py-3 sm:px-4" data-window-closed>
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Clock className="h-4 w-4 text-[color:var(--muted)]" />
        Fenster geschlossen, nur Vorlagen möglich
      </div>
      {blockedReason ? (
        <p className="mt-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm">{blockedReason}</p>
      ) : templates.length === 0 ? (
        <p className="mt-2 text-xs text-[color:var(--muted)]">Für diesen Kunden sind noch keine Vorlagen angelegt.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Vorlage">
            {templates.map((t) => (
              <button
                key={t.purpose}
                type="button"
                role="radio"
                aria-checked={picked === t.purpose}
                onClick={() => setPicked(t.purpose)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  picked === t.purpose
                    ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]"
                    : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:border-[color:var(--border-strong)]",
                )}
              >
                {t.label}
                {t.approved ? "" : " (nicht freigegeben)"}
              </button>
            ))}
          </div>
          {option ? (
            <div className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 py-2">
              <p className="whitespace-pre-wrap text-sm">{option.preview}</p>
            </div>
          ) : null}
          <div className="mt-2 flex items-center justify-end gap-3">
            {option && !option.approved ? (
              <span className="text-xs text-[color:var(--muted)]">Noch nicht von Meta freigegeben.</span>
            ) : sent ? (
              <span className="text-xs text-emerald-700">Vorlage gesendet.</span>
            ) : null}
            <Button variant="primary" size="md" icon={Send} onClick={send} disabled={!option?.approved || pending}>
              {pending ? "Sendet …" : "Vorlage senden"}
            </Button>
          </div>
        </>
      )}
      {error ? <p className="mt-1.5 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
