// Versand an 360dialog: Verbindungsaufbau-Fehler werden wiederholt, andere nicht (Ole, 19.11.2026: Antwort des
// Assistenten ging nach einem Neustart mit „Connect Timeout“ verloren).
import { afterEach, describe, expect, it, vi } from "vitest";
import { istVerbindungsaufbauFehler, sendText } from "@/lib/whatsapp/dialog360";

const fehler = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

describe("360dialog: Wiederholung beim Verbindungsaufbau", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("erkennt Verbindungsaufbau-Fehler, nicht aber Abbrüche nach dem Senden", () => {
    expect(istVerbindungsaufbauFehler(fehler("UND_ERR_CONNECT_TIMEOUT"))).toBe(true);
    expect(istVerbindungsaufbauFehler(fehler("ECONNREFUSED"))).toBe(true);
    expect(istVerbindungsaufbauFehler(fehler("ECONNRESET"))).toBe(false);
    expect(istVerbindungsaufbauFehler(new Error("360dialog 400"))).toBe(false);
  });
  it("sendet nach einem Connect-Timeout erneut und liefert die Nachrichten-ID", async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockRejectedValueOnce(fehler("UND_ERR_CONNECT_TIMEOUT")).mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const p = sendText("key", "4915112345678", "Hallo");
    await vi.runAllTimersAsync();
    await expect(p).resolves.toMatchObject({ messageId: "wamid.1" });
    expect(f).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it("wiederholt keinen Abbruch nach dem Senden (keine doppelte Nachricht)", async () => {
    const f = vi.fn().mockRejectedValue(fehler("ECONNRESET"));
    vi.stubGlobal("fetch", f);
    await expect(sendText("key", "4915112345678", "Hallo")).rejects.toThrow("fetch failed");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
