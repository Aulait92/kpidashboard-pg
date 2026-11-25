// Resend ohne Leserecht (Sentry „restricted_api_key“, 83 Ereignisse seit 22.11.2026): einmal melden, Zustand im
// Systemzustand und auf Admin › Heute, kein Fluten bei jedem Cron-Lauf; nach dem Schlüsseltausch wieder ok.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ fehler: null as null | { name: string; message: string }, gemeldet: [] as string[] }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { receiving: { list: async () => (st.fehler ? { data: null, error: st.fehler } : { data: { data: [], has_more: false }, error: null }) } };
  },
}));
vi.mock("@/lib/monitoring", async (orig) => ({ ...(await orig<typeof import("@/lib/monitoring")>()), reportError: (_e: unknown, where: string) => void st.gemeldet.push(where) }));

import { prisma } from "@/lib/prisma";
import { belegePostfachAbholen } from "@/lib/belege/eingang";
import { EMPFANG_HEARTBEAT, empfangsSchluesselName, istFehlendesLeserecht, leserechtHinweis } from "@/lib/mail/resend-empfang";
import { mailEingang } from "@/lib/admin-neu/systemzustand";
import { requireTestDb } from "./db";

const RESTRICTED = { name: "restricted_api_key", message: "This API key is restricted to only send emails" };

describe("Resend-Leserecht", () => {
  const vorher = { a: process.env.RESEND_API_KEY, b: process.env.RESEND_EMPFANG_API_KEY };
  beforeEach(async () => {
    requireTestDb();
    process.env.RESEND_API_KEY = "re_test_senden";
    delete process.env.RESEND_EMPFANG_API_KEY;
    st.fehler = null;
    st.gemeldet = [];
    await prisma.systemHeartbeat.deleteMany({ where: { key: EMPFANG_HEARTBEAT } });
  });
  afterAll(async () => {
    process.env.RESEND_API_KEY = vorher.a;
    if (vorher.b) process.env.RESEND_EMPFANG_API_KEY = vorher.b;
    await prisma.systemHeartbeat.deleteMany({ where: { key: EMPFANG_HEARTBEAT } });
  });

  it("erkennt den Fehler und nennt den Schlüssel", () => {
    expect(istFehlendesLeserecht(RESTRICTED)).toBe(true);
    expect(istFehlendesLeserecht(new Error("mail_eingang:resend_receiving_get:restricted_api_key"))).toBe(true);
    expect(istFehlendesLeserecht(new Error("resend_receiving_get:rate_limit_exceeded"))).toBe(false);
    expect(empfangsSchluesselName({ RESEND_API_KEY: "x" })).toBe("RESEND_API_KEY");
    expect(empfangsSchluesselName({ RESEND_API_KEY: "x", RESEND_EMPFANG_API_KEY: "y" })).toBe("RESEND_EMPFANG_API_KEY");
    expect(leserechtHinweis("RESEND_API_KEY")).toMatch(/Full access/);
  });

  it("Cron: kein Werfen, Sentry nur beim ersten Lauf, Zustand für Systemzustand; nach dem Tausch wieder ok", async () => {
    st.fehler = RESTRICTED;
    for (let i = 0; i < 4; i++) await expect(belegePostfachAbholen()).resolves.toEqual({ gesehen: 0, verarbeitet: 0 });
    expect(st.gemeldet).toEqual(["cron-belege-postfach"]);
    const hb = await prisma.systemHeartbeat.findUniqueOrThrow({ where: { key: EMPFANG_HEARTBEAT } });
    expect(hb.ok).toBe(false);
    expect(hb.note).toMatch(/RESEND_EMPFANG_API_KEY fehlt/);
    expect(mailEingang(hb, "RESEND_API_KEY").ampel).toBe("fehler");

    st.fehler = null;
    process.env.RESEND_EMPFANG_API_KEY = "re_test_voll";
    await belegePostfachAbholen();
    const ok = await prisma.systemHeartbeat.findUniqueOrThrow({ where: { key: EMPFANG_HEARTBEAT } });
    expect(ok.ok).toBe(true);
    expect(mailEingang(ok, "RESEND_EMPFANG_API_KEY").ampel).toBe("ok");
  });

  it("andere Fehler werfen weiter (echte Fehler werden nicht verschluckt)", async () => {
    st.fehler = { name: "internal_server_error", message: "x" };
    await expect(belegePostfachAbholen()).rejects.toThrow(/resend_receiving_list:internal_server_error/);
  });
});
