import { describe, expect, it } from "vitest";
import {
  consentText,
  dueReminder,
  explainMetaError,
  parseAdAccountId,
  parsePageInput,
  setupProgress,
  setupSteps,
  videoEmbedUrl,
} from "@/lib/selbst-einrichtung";
import type { ChecklistItem } from "@/lib/onboarding";

const DAY = 86400000;

describe("Selbst-Einrichtung: Eingaben", () => {
  it("Werbekonto-ID aus act_…, Ziffern oder Werbeanzeigenmanager-Link", () => {
    expect(parseAdAccountId("act_123456789012345")).toBe("123456789012345");
    expect(parseAdAccountId(" 1234567890 ")).toBe("1234567890");
    expect(parseAdAccountId("https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=987654321012&nav_entry_point=x")).toBe("987654321012");
    expect(parseAdAccountId("Mein Konto")).toBeNull();
    expect(parseAdAccountId("")).toBeNull();
  });

  it("Facebook-Seite aus ID, profile.php, Name mit ID am Ende oder Seitenname", () => {
    expect(parsePageInput("123456789012345")).toEqual({ id: "123456789012345" });
    expect(parsePageInput("https://www.facebook.com/profile.php?id=61550000000000")).toEqual({ id: "61550000000000" });
    expect(parsePageInput("facebook.com/Agentur-Muster-112233445566")).toEqual({ id: "112233445566" });
    expect(parsePageInput("https://facebook.com/agentur.muster/")).toEqual({ slug: "agentur.muster" });
    expect(parsePageInput("https://example.com/agentur")).toBeNull();
    expect(parsePageInput("https://facebook.com/groups/abc")).toBeNull();
  });

  it("verständliche Meldungen statt Meta-Fehlertext", () => {
    expect(explainMetaError("adAccount", "(#200) Ad account owner has NOT grant ads_management or ads_read permission")).toMatch(/Kampagnen verwalten/);
    expect(explainMetaError("page", "Unsupported get request. Object with ID '1' does not exist")).toMatch(/Volle Kontrolle/);
    expect(explainMetaError("leads", "x")).toMatch(/Leads/);
  });

  it("Videos: Loom und YouTube werden eingebettet, anderes bleibt Link", () => {
    expect(videoEmbedUrl("https://www.loom.com/share/abc123def")).toBe("https://www.loom.com/embed/abc123def");
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://vimeo.com/123")).toBeNull();
    expect(videoEmbedUrl(null)).toBeNull();
  });

  it("Einwilligungstext nennt die Agentur und WhatsApp", () => {
    expect(consentText("Agentur Muster")).toMatch(/Agentur Muster.*WhatsApp.*widerrufen/);
  });
});

describe("Selbst-Einrichtung: Erinnerungen Tag 1/3/7", () => {
  const base = new Date("2026-11-10T08:00:00Z");
  const at = (days: number) => new Date(base.getTime() + days * DAY);

  it("vor Tag 1 nichts, danach die höchste erreichte Stufe genau einmal", () => {
    expect(dueReminder(base, at(0.5), {})).toBeNull();
    expect(dueReminder(base, at(1.1), {})).toBe(1);
    expect(dueReminder(base, at(1.5), { "1": "x" })).toBeNull();
    expect(dueReminder(base, at(3.2), { "1": "x" })).toBe(3);
    expect(dueReminder(base, at(5), { "1": "x", "3": "x" })).toBeNull();
    expect(dueReminder(base, at(7.1), { "1": "x", "3": "x" })).toBe(7);
    expect(dueReminder(base, at(10), { "1": "x", "3": "x", "7": "x" })).toBeNull();
  });

  it("verpasste Stufen werden nicht nachgeholt (nur eine Mail)", () => {
    expect(dueReminder(base, at(8), {})).toBe(7);
  });
});

describe("Selbst-Einrichtung: Fortschritt", () => {
  const item = (key: string, done: boolean, owner: ChecklistItem["owner"] = "kunde"): ChecklistItem => ({ key, label: key, owner, done, at: null });
  const items = [
    item("login", true),
    item("questionnaire", true),
    item("metaAccess", false),
    item("calendar", true),
    item("whatsapp", false),
    item("consent", false),
    item("testLead", false, "du"),
  ];

  it("Software: alle Schritte inkl. App, Provisionen und Testlead", () => {
    const steps = setupSteps({ package: "software" }, items, { appDone: true, provisionDone: false });
    expect(steps.map((s) => s.key)).toEqual(["login", "questionnaire", "app", "calendar", "provision", "metaAccess", "whatsapp", "consent", "testLead"]);
    const p = setupProgress(steps);
    expect(p).toMatchObject({ done: 4, total: 9 });
    expect(steps.find((s) => s.key === "testLead")?.owner).toBe("wir");
  });

  it("Nur Betreuung: ohne Kalender, WhatsApp und Einwilligung", () => {
    const steps = setupSteps({ package: "service" }, items, { appDone: false, provisionDone: true });
    expect(steps.map((s) => s.key)).toEqual(["login", "questionnaire", "app", "provision", "metaAccess", "testLead"]);
    expect(setupProgress(steps)).toMatchObject({ done: 3, total: 6 });
  });

  it("WhatsApp ohne Selbst-Verbinden (machen wir) zählt nicht als Kundenschritt", () => {
    const steps = setupSteps({ package: "software" }, items.map((i) => (i.key === "whatsapp" ? { ...i, owner: "du" as const } : i)), { appDone: false, provisionDone: false });
    expect(steps.find((s) => s.key === "whatsapp")?.owner).toBe("wir");
  });
});
