// Live-Abfrage (lib/live-poll.ts): nur bei sichtbarer Seite, sofort beim Zurückkehren,
// Meldung nur bei geändertem Marker; Hinweis „Neue Nachricht“ für andere Chats.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newInboundElsewhere, startLivePoll, type ChatHintItem, type LivePollEnv } from "@/lib/live-poll";
import { attentionOf, fingerprintOf, adminChatFingerprintOf } from "@/lib/live-state";

function fakeEnv(visible: boolean) {
  let cb: (() => void) | null = null;
  const env: LivePollEnv & { set(v: boolean): void } = {
    isVisible: () => visible,
    onVisibilityChange(fn) {
      cb = fn;
      return () => (cb = null);
    },
    set(v) {
      visible = v;
      cb?.();
    },
  };
  return env;
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("startLivePoll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holt sofort den Ausgangswert, meldet erst eine Änderung und dann nichts mehr ohne Änderung", async () => {
    let marker = "a";
    const fetchMarker = vi.fn(async () => marker);
    const onChange = vi.fn();
    const stop = startLivePoll({ fetchMarker, onChange, intervalMs: 5000, env: fakeEnv(true) });
    await flush();
    expect(fetchMarker).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).not.toHaveBeenCalled();

    marker = "b";
    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b", "a");

    await vi.advanceTimersByTimeAsync(10_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("fragt im Hintergrund nicht ab und sieht beim Zurückkehren sofort nach", async () => {
    let marker = "a";
    const fetchMarker = vi.fn(async () => marker);
    const onChange = vi.fn();
    const env = fakeEnv(true);
    const stop = startLivePoll({ fetchMarker, onChange, intervalMs: 5000, env });
    await flush();
    env.set(false);
    marker = "b";
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMarker).toHaveBeenCalledTimes(1);

    env.set(true);
    await flush();
    expect(fetchMarker).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith("b", "a");
    stop();
  });

  it("startet nicht bei unsichtbarer Seite und hört nach dem Stoppen auf", async () => {
    const fetchMarker = vi.fn(async () => "a");
    const env = fakeEnv(false);
    const stop = startLivePoll({ fetchMarker, onChange: vi.fn(), intervalMs: 5000, env });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMarker).not.toHaveBeenCalled();
    env.set(true);
    await flush();
    expect(fetchMarker).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMarker).toHaveBeenCalledTimes(1);
  });

  it("übersteht Fehler und fehlende Marker (offline, abgemeldet)", async () => {
    const answers: (string | null | Error)[] = ["a", new Error("offline"), null, "a", "c"];
    const fetchMarker = vi.fn(async () => {
      const x = answers.length ? answers.shift()! : "c";
      if (x instanceof Error) throw x;
      return x;
    });
    const onChange = vi.fn();
    const stop = startLivePoll({ fetchMarker, onChange, intervalMs: 1000, env: fakeEnv(true) });
    await vi.advanceTimersByTimeAsync(4000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("c", "a");
    stop();
  });
});

describe("Marker", () => {
  it("Buyer-Marker ändert sich bei neuer Nachricht (Echo), Admin-Marker ebenso; Zähler „Braucht dich“ lesbar", () => {
    const base = {
      leads: { count: 1, lastCreated: null, lastStatus: null },
      conversations: { count: 2, lastUpdated: new Date("2026-11-16T10:00:00Z"), attention: 3 },
      appointments: { count: 0, lastUpdated: null },
      messages: { lastCreated: new Date("2026-11-16T10:00:00Z") },
    };
    const a = fingerprintOf(base);
    const b = fingerprintOf({ ...base, messages: { lastCreated: new Date("2026-11-16T10:00:05Z") } });
    expect(a).not.toBe(b);
    expect(attentionOf(a)).toBe(3);

    const adm = (at: string, attention = 1) =>
      adminChatFingerprintOf({ conversations: { count: 5, lastUpdated: new Date(at), attention }, messages: { lastCreated: new Date(at) } });
    expect(adm("2026-11-16T10:00:00Z")).not.toBe(adm("2026-11-16T10:00:01Z"));
    expect(attentionOf(adm("2026-11-16T10:00:00Z", 4))).toBe(4);
  });
});

describe("newInboundElsewhere", () => {
  const item = (id: string, inboundAt: number | null): ChatHintItem => ({ id, name: id, href: `/x?c=${id}`, inboundAt });

  it("kein Hinweis beim ersten Stand und ohne Änderung", () => {
    const list = [item("a", 100), item("b", 50)];
    expect(newInboundElsewhere(null, list, null)).toBeNull();
    expect(newInboundElsewhere(list, list, null)).toBeNull();
  });

  it("Hinweis für einen anderen Chat mit neuer eingehender Nachricht, nicht für den offenen", () => {
    const prev = [item("a", 100), item("b", 50)];
    expect(newInboundElsewhere(prev, [item("b", 200), item("a", 100)], "a")?.id).toBe("b");
    expect(newInboundElsewhere(prev, [item("b", 200), item("a", 100)], "b")).toBeNull();
  });

  it("neu auftauchender Chat nur mit einer Nachricht jünger als alles Bisherige", () => {
    const prev = [item("a", 100)];
    expect(newInboundElsewhere(prev, [item("n", 300), item("a", 100)], null)?.id).toBe("n");
    expect(newInboundElsewhere(prev, [item("a", 100), item("alt", 20)], null)).toBeNull();
  });
});
