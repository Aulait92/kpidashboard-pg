// Chats erst nach echter Verbindung, nicht schon bei Einladung (Ole, 15.11.2026).
import { describe, expect, it } from "vitest";
import { inboxReady } from "@/lib/whatsapp/access";

describe("inboxReady", () => {
  it("zählt Einladung und Einrichtung ohne Key nicht", () => {
    expect(inboxReady(null)).toBe(false);
    expect(inboxReady({ status: "invited", apiKeyEnc: null })).toBe(false);
    expect(inboxReady({ status: "pending", apiKeyEnc: null })).toBe(false);
  });
  it("zählt verbundene Konten bzw. Konten mit Key", () => {
    expect(inboxReady({ status: "connected", apiKeyEnc: "x" })).toBe(true);
    expect(inboxReady({ status: "connected", apiKeyEnc: null })).toBe(true);
    expect(inboxReady({ status: "pending", apiKeyEnc: "x" })).toBe(true);
  });
});
