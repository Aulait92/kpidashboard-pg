import { beforeEach, describe, expect, it, vi } from "vitest";

// Zugang für die App-Store-Prüfung (lib/app-demo/app-review.ts): reservierte E-Mail + Passwort aus der Umgebung führt
// in die App-Demo (eigene Demo-Datenbank, nur lesend), nie in eine echte Sitzung.

const h = vi.hoisted(() => ({
  fehlversuche: 0,
  audits: [] as { action: string; actor?: { email?: string | null; role?: string | null } }[],
  gesetzt: [] as { name: string; value: string; opts: Record<string, unknown> }[],
  demo: true,
}));

vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { count: vi.fn(async () => h.fehlversuche) } } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async (action: string, opts: { actor?: { email?: string | null } }) => void h.audits.push({ action, actor: opts.actor })) }));
vi.mock("@/lib/app-demo/db", () => ({ appDemoEingerichtet: () => h.demo }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (name: string, value: string, opts: Record<string, unknown>) => void h.gesetzt.push({ name, value, opts }) }),
}));

import { APP_REVIEW_EMAIL, APP_REVIEW_MAX_FEHLVERSUCHE, appReviewPasswort, istAppReviewEmail, passwortStimmt, pruefeAppReview } from "@/lib/app-demo/app-review";
import { appReviewLogin } from "@/lib/app-demo/app-review-server";
import { APP_REVIEW_COOKIE, prueferDemoZiel } from "@/lib/app-demo/weiche";
import { hatPrueferCookie } from "@/components/app-demo-rahmen";

const PW = "sehr-geheimes-pruefer-passwort";
const env = { APP_REVIEW_PASSWORT: PW };

describe("App-Store-Prüfer: Entscheidung", () => {
  it("nur die reservierte E-Mail (Groß/Klein, Leerzeichen egal) ist ein Prüfer", () => {
    expect(istAppReviewEmail(" AppReview@PerformanceGrowth.de ", {})).toBe(true);
    expect(istAppReviewEmail("kunde@example.com", {})).toBe(false);
    expect(istAppReviewEmail("review@example.com", { APP_REVIEW_EMAIL: "Review@example.com" })).toBe(true);
    expect(pruefeAppReview({ email: "kunde@example.com", passwort: PW, demoEingerichtet: true, fehlversuche: 0, env }).kind).toBe("kein-pruefer");
  });

  it("richtiges Passwort: ok; falsches: falsch", () => {
    expect(pruefeAppReview({ email: APP_REVIEW_EMAIL, passwort: PW, demoEingerichtet: true, fehlversuche: 0, env }).kind).toBe("ok");
    expect(pruefeAppReview({ email: APP_REVIEW_EMAIL, passwort: PW + "x", demoEingerichtet: true, fehlversuche: 0, env }).kind).toBe("falsch");
    expect(pruefeAppReview({ email: APP_REVIEW_EMAIL, passwort: "", demoEingerichtet: true, fehlversuche: 0, env }).kind).toBe("falsch");
  });

  it("ohne Passwort in der Umgebung, mit zu kurzem Passwort oder ohne Demo: Zugang aus (auch mit „richtigem“ Passwort)", () => {
    expect(appReviewPasswort({})).toBeNull();
    expect(appReviewPasswort({ APP_REVIEW_PASSWORT: "kurz" })).toBeNull();
    expect(pruefeAppReview({ email: APP_REVIEW_EMAIL, passwort: "", demoEingerichtet: true, fehlversuche: 0, env: {} }).kind).toBe("aus");
    expect(pruefeAppReview({ email: APP_REVIEW_EMAIL, passwort: "kurz", demoEingerichtet: true, fehlversuche: 0, env: { APP_REVIEW_PASSWORT: "kurz" } }).kind).toBe("aus");
    expect(pruefeAppReview({ email: APP_REVIEW_EMAIL, passwort: PW, demoEingerichtet: false, fehlversuche: 0, env }).kind).toBe("aus");
  });

  it("nach zu vielen Fehlversuchen gesperrt, auch mit richtigem Passwort", () => {
    expect(pruefeAppReview({ email: APP_REVIEW_EMAIL, passwort: PW, demoEingerichtet: true, fehlversuche: APP_REVIEW_MAX_FEHLVERSUCHE, env }).kind).toBe("gesperrt");
  });

  it("Passwortvergleich", () => {
    expect(passwortStimmt(PW, PW)).toBe(true);
    expect(passwortStimmt(PW.slice(0, -1), PW)).toBe(false);
  });
});

describe("App-Store-Prüfer: Anmeldung (Server)", () => {
  beforeEach(() => {
    h.fehlversuche = 0;
    h.audits = [];
    h.gesetzt = [];
    h.demo = true;
    vi.stubEnv("APP_REVIEW_PASSWORT", PW);
  });

  it("richtig: Ziel /app-demo, Kennzeichen-Cookie, Protokoll – keine Sitzung", async () => {
    const r = await appReviewLogin(APP_REVIEW_EMAIL, PW);
    expect(r).toEqual({ ok: true, redirectTo: "/app-demo" });
    expect(h.gesetzt).toHaveLength(1);
    expect(h.gesetzt[0]).toMatchObject({ name: APP_REVIEW_COOKIE, value: "1" });
    expect(h.gesetzt.some((c) => c.name === "kpi_session")).toBe(false);
    expect(h.audits.map((a) => a.action)).toEqual(["app_review.login"]);
  });

  it("falsch: gleiche Meldung wie bei der normalen Anmeldung, Fehlversuch protokolliert, kein Cookie", async () => {
    const r = await appReviewLogin(APP_REVIEW_EMAIL, "falsch");
    expect(r).toEqual({ ok: false, error: "E-Mail oder Passwort falsch." });
    expect(h.audits.map((a) => a.action)).toEqual(["app_review.failed"]);
    expect(h.gesetzt).toHaveLength(0);
  });

  it("Zugang aus (Variable fehlt): gleiche Meldung, nichts gesetzt", async () => {
    vi.stubEnv("APP_REVIEW_PASSWORT", "");
    expect(await appReviewLogin(APP_REVIEW_EMAIL, PW)).toEqual({ ok: false, error: "E-Mail oder Passwort falsch." });
    expect(h.gesetzt).toHaveLength(0);
  });

  it("gesperrt nach Fehlversuchen (über alle IPs gezählt)", async () => {
    h.fehlversuche = APP_REVIEW_MAX_FEHLVERSUCHE;
    const r = await appReviewLogin(APP_REVIEW_EMAIL, PW);
    expect(r.ok).toBe(false);
    expect(h.gesetzt).toHaveLength(0);
  });
});

describe("App-Store-Prüfer: Weiche /buyer → Demo", () => {
  it("nur ohne Sitzung und mit Kennzeichen", () => {
    expect(prueferDemoZiel("/buyer", { hatSitzung: false, prueferCookie: "1" })).toBe("/app-demo");
    expect(prueferDemoZiel("/buyer/kontakte", { hatSitzung: false, prueferCookie: "1" })).toBe("/app-demo/kontakte");
    expect(prueferDemoZiel("/buyer", { hatSitzung: true, prueferCookie: "1" })).toBeNull();
    expect(prueferDemoZiel("/buyer", { hatSitzung: false, prueferCookie: undefined })).toBeNull();
    expect(prueferDemoZiel("/buyer", { hatSitzung: false, prueferCookie: "0" })).toBeNull();
    expect(prueferDemoZiel("/admin", { hatSitzung: false, prueferCookie: "1" })).toBeNull();
  });

  it("Banner erkennt das Kennzeichen", () => {
    expect(hatPrueferCookie(`a=b; ${APP_REVIEW_COOKIE}=1`)).toBe(true);
    expect(hatPrueferCookie(`${APP_REVIEW_COOKIE}=0`)).toBe(false);
    expect(hatPrueferCookie("")).toBe(false);
  });
});
