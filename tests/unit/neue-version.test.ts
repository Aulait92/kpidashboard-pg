import { describe, expect, it, vi } from "vitest";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { isNewVersionError, reloadForNewVersion, RELOAD_GUARD_MS } from "@/lib/neue-version";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("Neue Version, alte Tabs", () => {
  it("erkennt den Next-Fehler für unbekannte Server Actions", () => {
    expect(isNewVersionError(new UnrecognizedActionError('Server Action "abc" was not found on the server.'))).toBe(true);
    expect(isNewVersionError(new Error('Server Action "7f3a" was not found on the server. \nRead more: …'))).toBe(true);
    expect(isNewVersionError(new Error("Failed to find Server Action \"x\". This request might be from an older or newer deployment."))).toBe(true);
    expect(isNewVersionError(new Error("Netzwerkfehler"))).toBe(false);
    expect(isNewVersionError(null)).toBe(false);
  });

  it("lädt einmal neu, innerhalb einer Minute nicht noch einmal (keine Schleife)", () => {
    const storage = memory();
    const reload = vi.fn();
    const t0 = 1_000_000;
    expect(reloadForNewVersion({ now: t0, storage, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // nach dem Reload scheitert es wieder → Hinweis statt erneutem Reload
    expect(reloadForNewVersion({ now: t0 + 5_000, storage, reload })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    // später (nächster Deploy) wieder automatisch
    expect(reloadForNewVersion({ now: t0 + RELOAD_GUARD_MS + 1, storage, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("ohne sessionStorage (z. B. gesperrt): kein Reload, Hinweis", () => {
    const reload = vi.fn();
    expect(reloadForNewVersion({ storage: null, reload })).toBe(false);
    const broken = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => undefined };
    expect(reloadForNewVersion({ storage: broken, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
