// Live-Abfrage ohne React und ohne Datenbank (testbar in tests/unit/live-poll.test.ts):
// fragt alle paar Sekunden einen kleinen „Änderungs-Marker“ ab, nur solange die Seite
// sichtbar ist, und meldet sich nur, wenn er sich geändert hat. Wird die Seite wieder
// sichtbar, sofort einmal nachsehen (was in der Zwischenzeit passiert ist, kommt so an).

import { nextLiveState } from "@/lib/live-state";

export type LivePollEnv = {
  isVisible(): boolean;
  /** Meldet Wechsel der Sichtbarkeit; gibt eine Abmelde-Funktion zurück. */
  onVisibilityChange(cb: () => void): () => void;
};

export type LivePollOptions = {
  /** Marker holen; null = gerade nicht verfügbar (offline, abgemeldet), dann nichts tun. */
  fetchMarker: () => Promise<string | null>;
  /** Marker hat sich gegenüber dem letzten bekannten Stand geändert. */
  onChange: (marker: string, prev: string) => void;
  intervalMs: number;
  env?: LivePollEnv;
};

export const documentEnv: LivePollEnv = {
  isVisible: () => typeof document === "undefined" || document.visibilityState === "visible",
  onVisibilityChange(cb) {
    document.addEventListener("visibilitychange", cb);
    return () => document.removeEventListener("visibilitychange", cb);
  },
};

/** Startet die Abfrage und gibt die Stopp-Funktion zurück. */
export function startLivePoll({ fetchMarker, onChange, intervalMs, env = documentEnv }: LivePollOptions): () => void {
  let last: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;
  let disposed = false;

  const poll = async () => {
    if (disposed || busy || !env.isVisible()) return;
    busy = true;
    try {
      const marker = await fetchMarker();
      if (disposed || marker === null) return;
      const prev = last;
      const s = nextLiveState(last, marker);
      last = s.last;
      if (s.changed && prev !== null) onChange(marker, prev);
    } catch {
      /* offline o. Ä.: nächster Versuch im nächsten Takt */
    } finally {
      busy = false;
    }
  };
  const start = () => {
    if (timer || disposed) return;
    void poll();
    timer = setInterval(() => void poll(), intervalMs);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const off = env.onVisibilityChange(() => (env.isVisible() ? start() : stop()));
  if (env.isVisible()) start();

  return () => {
    disposed = true;
    stop();
    off();
  };
}

export type ChatHintItem = {
  id: string;
  name: string;
  href: string;
  /** Zeitpunkt der letzten eingehenden Nachricht (ms) oder null. */
  inboundAt: number | null;
};

/** Welcher Chat hat seit dem letzten Stand eine neue eingehende Nachricht? (rein, testbar) */
export function newInboundElsewhere(
  prev: ChatHintItem[] | null,
  next: ChatHintItem[],
  activeId: string | null,
): ChatHintItem | null {
  if (!prev) return null;
  const before = new Map(prev.map((i) => [i.id, i.inboundAt ?? 0]));
  // Chats, die neu in der Liste auftauchen, zählen nur mit einer Nachricht jünger als alles Bisherige.
  const newest = Math.max(0, ...prev.map((i) => i.inboundAt ?? 0));
  let best: ChatHintItem | null = null;
  for (const i of next) {
    if (i.id === activeId || i.inboundAt == null) continue;
    const was = before.get(i.id);
    const fresh = was === undefined ? i.inboundAt > newest : i.inboundAt > was;
    if (fresh && (!best || i.inboundAt > (best.inboundAt ?? 0))) best = i;
  }
  return best;
}
