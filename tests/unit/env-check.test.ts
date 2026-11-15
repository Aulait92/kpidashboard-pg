// Pflichtvariablen der Produktion (Ole, 15.11.2026): Status ohne Werte.
import { describe, expect, it } from "vitest";
import { pruefeVariablen } from "@/lib/env-check";

const voll = {
  DATABASE_URL: "postgres://x",
  AUTH_SECRET: "a".repeat(40),
  APP_URL: "https://app.performancegrowth.de",
  STRIPE_SECRET_KEY: "sk_live_abc",
  STRIPE_WEBHOOK_SECRET: "whsec_abc",
  RESEND_API_KEY: "re_abc",
  ENCRYPTION_KEY: "k",
  DIALOG360_PARTNER_ID: "p",
  DIALOG360_PARTNER_API_KEY: "k",
  GOOGLE_MAIL_VERIFIED: "1",
  SUPPORT_EMAIL: "support@example.org",
};

describe("Pflichtvariablen", () => {
  it("alles gesetzt: alles ok", () => {
    expect(pruefeVariablen(voll).every((s) => s.status === "ok")).toBe(true);
  });
  it("Testschlüssel, fehlende Partner-ID und Google ohne 1 werden gemeldet, ohne Werte", () => {
    const r = pruefeVariablen({ ...voll, STRIPE_SECRET_KEY: "sk_test_abc", DIALOG360_PARTNER_ID: "", GOOGLE_MAIL_VERIFIED: "0" });
    const bad = Object.fromEntries(r.filter((s) => s.status !== "ok").map((s) => [s.name, s.status]));
    expect(bad).toEqual({ STRIPE_SECRET_KEY: "ungültig", DIALOG360_PARTNER_ID: "fehlt", GOOGLE_MAIL_VERIFIED: "ungültig" });
    expect(JSON.stringify(r)).not.toContain("sk_test_abc");
  });
});
