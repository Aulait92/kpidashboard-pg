import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AIRTABLE_SYNC_OFF: Sync überspringt nur Airtable, Rückschreiben wird No-op.
const { syncAirtable, syncMeta, syncCustomerAdSpend, syncOutbrain, syncTikTok, syncGoogleAds } = vi.hoisted(() => ({
  syncAirtable: vi.fn(),
  syncMeta: vi.fn(async () => ({ costs: 1, accounts: [], errors: [], unmatched: [] })),
  syncCustomerAdSpend: vi.fn(async () => ({ customers: 0, days: 0, errors: [] })),
  syncOutbrain: vi.fn(async () => ({ costs: 0 })),
  syncTikTok: vi.fn(async () => ({ costs: 0 })),
  syncGoogleAds: vi.fn(async () => ({ costs: 0 })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/airtable", () => ({ syncAirtable }));
vi.mock("@/lib/meta", () => ({ syncMeta, syncCustomerAdSpend }));
vi.mock("@/lib/outbrain", () => ({ syncOutbrain }));
vi.mock("@/lib/tiktok", () => ({ syncTikTok }));
vi.mock("@/lib/google", () => ({ syncGoogleAds }));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(), sendToBuyersOfCustomer: vi.fn(), sendToUser: vi.fn() }));
vi.mock("@/lib/team", () => ({ assignLead: vi.fn() }));

import { airtableSyncOff, AIRTABLE_SKIPPED_NOTE } from "@/lib/airtable-switch";
import { runFullSync, skippedAirtableResult, syncHeartbeat } from "@/lib/sync";
import { markLeadAsCancelled, updateLeadEditableFields } from "@/lib/airtable-write";

describe("AIRTABLE_SYNC_OFF", () => {
  const fetchSpy = vi.fn(async () => new Response("{}", { status: 500 }));
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("erkennt den Schalter nur bei „1“", () => {
    expect(airtableSyncOff({ AIRTABLE_SYNC_OFF: "1" })).toBe(true);
    expect(airtableSyncOff({ AIRTABLE_SYNC_OFF: " 1 " })).toBe(true);
    expect(airtableSyncOff({ AIRTABLE_SYNC_OFF: "0" })).toBe(false);
    expect(airtableSyncOff({ AIRTABLE_SYNC_OFF: "" })).toBe(false);
    expect(airtableSyncOff({})).toBe(false);
  });

  it("Herzschlag bleibt grün, wenn Airtable übersprungen wird", () => {
    expect(syncHeartbeat({ airtable: skippedAirtableResult() })).toEqual({ ok: true, note: AIRTABLE_SKIPPED_NOTE });
    expect(syncHeartbeat({ airtable: { ...skippedAirtableResult(), skipped: false, errors: ["Leads: 500"] } })).toEqual({ ok: false, note: "Leads: 500" });
    expect(syncHeartbeat({ airtable: { ...skippedAirtableResult(), skipped: undefined } })).toEqual({ ok: true, note: null });
  });

  it("Sync lässt nur Airtable aus, Werbekosten laufen weiter", async () => {
    vi.stubEnv("AIRTABLE_SYNC_OFF", "1");
    const r = await runFullSync();
    expect(syncAirtable).not.toHaveBeenCalled();
    expect(r.airtable.skipped).toBe(true);
    expect(syncMeta).toHaveBeenCalledTimes(1);
    expect(syncCustomerAdSpend).toHaveBeenCalledTimes(1);
    expect(syncOutbrain).toHaveBeenCalledTimes(1);
    expect(syncTikTok).toHaveBeenCalledTimes(1);
    expect(syncGoogleAds).toHaveBeenCalledTimes(1);
    expect(r.meta.ok).toBe(true);
  });

  it("ohne Schalter läuft der Airtable-Abgleich wie bisher", async () => {
    syncAirtable.mockResolvedValueOnce({ ...skippedAirtableResult(), skipped: undefined });
    const r = await runFullSync();
    expect(syncAirtable).toHaveBeenCalledTimes(1);
    expect(r.airtable.skipped).toBeUndefined();
  });

  it("Rückschreiben nach Airtable wird zur No-op (kein Fehler, kein Aufruf)", async () => {
    vi.stubEnv("AIRTABLE_SYNC_OFF", "1");
    vi.stubEnv("AIRTABLE_TOKEN", "");
    vi.stubEnv("AIRTABLE_BASE_ID", "");
    await expect(markLeadAsCancelled({ airtableId: "rec1", stornogrundRecordId: "rec2", bemerkung: "x" })).resolves.toBeUndefined();
    await expect(updateLeadEditableFields({ airtableId: "rec1", bearbeitungsstatus: "Storno", closeValue: 100 })).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ohne Schalter wird weiter geschrieben (Fehler wie bisher)", async () => {
    vi.stubEnv("AIRTABLE_TOKEN", "pat");
    vi.stubEnv("AIRTABLE_BASE_ID", "app1");
    await expect(updateLeadEditableFields({ airtableId: "rec1", notizen: "x" })).rejects.toThrow(/Airtable PATCH 500/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
