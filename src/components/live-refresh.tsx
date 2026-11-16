"use client";

// Live-Aktualisierung: fragt alle 5 s einen kleinen Änderungs-Marker ab (useLivePoll,
// nur bei sichtbarer Seite) und lädt die Server-Daten der Seite neu, sobald sich bei
// Leads, Chats oder Terminen etwas ändert. Stört niemanden beim Tippen (wartet bis zum
// Verlassen des Feldes bzw. 5 s Ruhe); Eingaben, Scrollstand und Client-Zustand bleiben.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, MessageCircle, X } from "lucide-react";
import { attentionOf } from "@/lib/live-state";
import { notification } from "@/lib/haptics";
import { useLivePoll } from "@/components/use-live-poll";
import { newInboundElsewhere, type ChatHintItem } from "@/lib/live-poll";

export type { ChatHintItem } from "@/lib/live-poll";

const DEBOUNCE_MS = 400;
const TYPING_IDLE_MS = 5_000;

function isEditing(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !["button", "submit", "checkbox", "radio", "hidden", "range", "color", "file"].includes(el.type);
  return (el as HTMLElement).isContentEditable === true;
}

/** Mehr Leads oder mehr Chats „Braucht dich“ als vorher? (Fingerabdruck aus lib/live-state.ts) */
function grew(prev: string, next: string): boolean {
  const leads = (f: string) => Number(f.match(/^l(\d+)\./)?.[1] ?? NaN);
  return leads(next) > leads(prev) || attentionOf(next) > attentionOf(prev);
}

export function LiveRefresh({
  endpoint = "/api/buyer/updates",
  safetyMs = 60_000,
  haptics = true,
  fullPaths,
}: {
  endpoint?: string;
  /** Sicherheitsnetz: so oft ohnehin neu laden (0 = aus). */
  safetyMs?: number;
  haptics?: boolean;
  /**
   * Nur auf diesen Seiten bei jeder Änderung neu laden (und das Sicherheitsnetz nutzen). Auf allen
   * anderen nur, wenn sich die Zahl „Braucht dich“ ändert (Zähler in der Navigation). Fehlt = überall.
   */
  fullPaths?: string[];
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const full = !fullPaths || fullPaths.includes(pathname);
  const state = useRef({ pending: false, timer: null as ReturnType<typeof setTimeout> | null, lastKeyAt: 0, lastRefreshAt: 0 });

  const doRefresh = useRef(() => {});
  useEffect(() => {
    doRefresh.current = () => {
      const s = state.current;
      s.timer = null;
      if (!s.pending) return;
      // Nicht beim Tippen neu laden: warten, bis das Feld verlassen wurde oder 5 s Ruhe ist.
      if (isEditing(document.activeElement) && Date.now() - s.lastKeyAt < TYPING_IDLE_MS) {
        s.timer = setTimeout(() => doRefresh.current(), 1_000);
        return;
      }
      s.pending = false;
      s.lastRefreshAt = Date.now();
      router.refresh();
    };
  }, [router]);

  const schedule = () => {
    const s = state.current;
    s.pending = true;
    if (!s.timer) s.timer = setTimeout(() => doRefresh.current(), DEBOUNCE_MS);
  };

  useLivePoll(endpoint, (marker, prev) => {
    if (!full && attentionOf(marker) === attentionOf(prev)) return;
    // Neuer Lead oder neue Nachricht, die Aufmerksamkeit braucht: kurz spürbar (nur App).
    if (haptics && grew(prev, marker)) notification();
    schedule();
  });

  useEffect(() => {
    const s = state.current;
    s.lastRefreshAt = Date.now();
    const onKey = () => {
      s.lastKeyAt = Date.now();
    };
    const onFocusOut = () => {
      if (s.pending && !s.timer) s.timer = setTimeout(() => doRefresh.current(), DEBOUNCE_MS);
    };
    // Sicherheitsnetz (z. B. Wiedervorlage fällig geworden, ohne dass sich Daten ändern).
    const safety =
      safetyMs > 0 && full
        ? setInterval(() => {
            if (document.visibilityState === "visible" && Date.now() - s.lastRefreshAt >= safetyMs) {
              s.pending = true;
              doRefresh.current();
            }
          }, safetyMs)
        : null;
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      if (safety) clearInterval(safety);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, [safetyMs, full]);

  return null;
}

const NEAR_BOTTOM_PX = 260;
const PILL =
  "pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-[color:var(--foreground)] px-3 py-1.5 text-xs font-semibold text-white shadow-[var(--shadow-md)] transition hover:opacity-90";

/**
 * Im Chat ans Ende scrollen: beim Öffnen und wenn neue Nachrichten dazukommen,
 * aber nur, wenn man ohnehin unten war. Wer hochgescrollt hat, wird nicht gestört
 * und sieht unten den Hinweis „Neue Nachricht“ (Klick springt nach unten).
 * Als letztes Kind in den scrollbaren Nachrichtenbereich setzen.
 */
export function StickToBottom({ count, chatId }: { count: number; chatId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<{ chatId: string; count: number } | null>(null);
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const p = prev.current;
    const firstView = !p || p.chatId !== chatId;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
    const added = !firstView && count > (p?.count ?? 0);
    if (firstView || (added && nearBottom)) box.scrollTop = box.scrollHeight;
    const show = added && !nearBottom;
    const raf = requestAnimationFrame(() => setUnseen((u) => (firstView ? false : u || show)));
    prev.current = { chatId, count };
    return () => cancelAnimationFrame(raf);
  }, [count, chatId]);

  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const onScroll = () => {
      if (box.scrollHeight - box.scrollTop - box.clientHeight < 80) setUnseen(false);
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={ref} className="pointer-events-none sticky bottom-0 flex h-0 items-end justify-center overflow-visible" data-stick-bottom>
      {unseen ? (
        <button
          type="button"
          className={`${PILL} -translate-y-3`}
          onClick={() => {
            const box = ref.current?.parentElement;
            box?.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
            setUnseen(false);
          }}
          data-new-message-below
        >
          <ArrowDown className="h-3.5 w-3.5" />
          Neue Nachricht
        </button>
      ) : null}
    </div>
  );
}

const HINT_MS = 15_000;

/**
 * Dezenter Hinweis oben im Chat-Rahmen, wenn in einem anderen (nicht geöffneten) Chat eine
 * Nachricht eingeht. Klick öffnet den Chat. Mit `key` je Liste/Filter einbinden, damit ein
 * Filterwechsel keinen Hinweis auslöst. Elternelement braucht `relative`.
 */
export function NewMessageHint({ items, activeId }: { items: ChatHintItem[]; activeId: string | null }) {
  const sig = items.map((i) => `${i.id}:${i.inboundAt ?? ""}`).join(",");
  const [seen, setSeen] = useState<{ sig: string; items: ChatHintItem[] } | null>(null);
  const [hint, setHint] = useState<ChatHintItem | null>(null);
  if (seen?.sig !== sig) {
    const found = newInboundElsewhere(seen?.items ?? null, items, activeId);
    setSeen({ sig, items });
    if (found) setHint(found);
  }
  const visible = hint && hint.id !== activeId ? hint : null;

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setHint(null), HINT_MS);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[60px] z-30 flex justify-center px-3" role="status" data-new-message-hint>
      <span className={`${PILL} max-w-[min(100%,340px)] pr-1`}>
        <Link href={visible.href} onClick={() => setHint(null)} className="flex min-w-0 items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Neue Nachricht von {visible.name}</span>
        </Link>
        <button type="button" aria-label="Hinweis schließen" onClick={() => setHint(null)} className="ml-0.5 rounded-full p-1 hover:bg-white/15">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}
