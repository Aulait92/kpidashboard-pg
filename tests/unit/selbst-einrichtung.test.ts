import { describe, expect, it } from "vitest";
import {
  classifyDatasetAccess,
  consentText,
  datasetCandidates,
  dueReminder,
  explainMetaError,
  parseAdAccountId,
  parsePageInput,
  setupProgress,
  setupSteps,
  summarizeDatasets,
  videoEmbedUrl,
} from "@/lib/selbst-einrichtung";
import type { ChecklistItem } from "@/lib/onboarding";

const DAY = 86400000;

describe("Selbst-Einrichtung: Eingaben", () => {
  it("Werbekonto-ID aus act_…, Ziffern oder Werbeanzeigenmanager-Link", () => {
    expect(parseAdAccountId("act_123456789012345")).toBe("123456789012345");
    expect(parseAdAccountId(" 1234567890 ")).toBe("1234567890");
    expect(parseAdAccountId("https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=987654321012&nav_entry_point=x")).toBe("987654321012");
    // Kopiert aus dem Werbeanzeigenmanager (Ole, 15.11.2026): unsichtbare Zeichen, Leerzeichen, Name dahinter
    expect(parseAdAccountId("\u200eact_1088907616945081\u200f")).toBe("1088907616945081");
    expect(parseAdAccountId("act_ 1088907616945081")).toBe("1088907616945081");
    expect(parseAdAccountId("ACT_1088907616945081")).toBe("1088907616945081");
    expect(parseAdAccountId("act-1088907616945081")).toBe("1088907616945081");
    expect(parseAdAccountId("\u00a0act_1088907616945081\u00a0")).toBe("1088907616945081");
    expect(parseAdAccountId("Pferdeversicherung (act_1088907616945081)")).toBe("1088907616945081");
    expect(parseAdAccountId("1088907616945081 Pferdeversicherung")).toBe("1088907616945081");
    expect(parseAdAccountId("1 088 907 616 945 081")).toBe("1088907616945081");
    expect(parseAdAccountId("act_123456789 und 987654321")).toBe("123456789");
    expect(parseAdAccountId("123456789 oder 987654321")).toBeNull();
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
    expect(consentText("Agentur Muster")).toMatch(/WhatsApp.*Mit Klick auf „Senden“.*Agentur Muster.*STOPP/);
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
    expect(steps.map((s) => s.key)).toEqual(["login", "questionnaire", "calendar", "provision", "metaAccess", "whatsapp", "app", "consent", "testLead"]);
    const p = setupProgress(steps);
    expect(p).toMatchObject({ done: 4, total: 9 });
    expect(steps.find((s) => s.key === "testLead")?.owner).toBe("wir");
  });

  it("Nur Betreuung: ohne Kalender, WhatsApp und Einwilligung", () => {
    const steps = setupSteps({ package: "service" }, items, { appDone: false, provisionDone: true });
    expect(steps.map((s) => s.key)).toEqual(["login", "questionnaire", "provision", "metaAccess", "app", "testLead"]);
    expect(setupProgress(steps)).toMatchObject({ done: 3, total: 6 });
  });

  it("WhatsApp ohne Selbst-Verbinden (machen wir) zählt nicht als Kundenschritt", () => {
    const steps = setupSteps({ package: "software" }, items.map((i) => (i.key === "whatsapp" ? { ...i, owner: "du" as const } : i)), { appDone: false, provisionDone: false });
    expect(steps.find((s) => s.key === "whatsapp")?.owner).toBe("wir");
  });
});

describe("Selbst-Einrichtung: Datensatz (Pixel) für die Rückmeldung an Meta", () => {
  const PERM = "Unsupported get request. Object with ID '123456789012' does not exist, cannot be loaded due to missing permissions, or does not support this operation.";

  it("Datensätze aus act_…/adspixels: nur Ziffern-IDs, Namen getrimmt, höchstens 5, Fehler durchgereicht", () => {
    const r = datasetCandidates({
      ok: true,
      data: { data: [{ id: "111111111111", name: " Pixel A " }, { id: "kaputt" }, { id: 222222222222 }, { name: "ohne id" }, { id: "333333333333", name: "" }] },
    });
    expect(r).toEqual({ ok: true, items: [{ id: "111111111111", name: "Pixel A" }, { id: "222222222222" }, { id: "333333333333" }] });
    const many = datasetCandidates({ ok: true, data: { data: Array.from({ length: 8 }, (_, i) => ({ id: String(100000 + i) })) } });
    expect(many.ok && many.items).toHaveLength(5);
    expect(datasetCandidates({ ok: true, data: {} })).toEqual({ ok: true, items: [] });
    expect(datasetCandidates({ ok: false, error: "boom" })).toEqual({ ok: false, error: "boom" });
  });

  it("Zugriff einordnen: lesbar = ok, Berechtigungsfehler = gefunden, nicht freigegeben, sonst Fehler", () => {
    const ds = { id: "123456789012", name: "Pixel Agentur" };
    expect(classifyDatasetAccess(ds, { ok: true, data: { id: "123456789012", name: "Pixel Agentur Muster" } })).toEqual({ state: "ok", id: ds.id, name: "Pixel Agentur Muster" });
    expect(classifyDatasetAccess({ id: "123456789012" }, { ok: true, data: { id: "123456789012" } })).toEqual({ state: "ok", id: "123456789012" });
    const ns = classifyDatasetAccess(ds, { ok: false, error: PERM });
    expect(ns).toMatchObject({ state: "found_not_shared", id: ds.id, name: ds.name });
    expect(ns.error).toMatch(/Partner.*voller Kontrolle.*Verwalten/);
    expect(classifyDatasetAccess(ds, { ok: false, error: "(#10) Application does not have permission for this action" }).state).toBe("found_not_shared");
    expect(classifyDatasetAccess(ds, { ok: false, error: "(#200) Missing Permission" }).state).toBe("found_not_shared");
    // Antwort ohne passende ID gilt als nicht freigegeben
    expect(classifyDatasetAccess(ds, { ok: true, data: {} }).state).toBe("found_not_shared");
    const err = classifyDatasetAccess(ds, { ok: false, error: "The operation was aborted due to timeout" });
    expect(err).toMatchObject({ state: "error", id: ds.id });
    expect(err.error).toMatch(/nicht geprüft werden/);
  });

  it("Zusammenfassung: freigegebener gewinnt, sonst nicht freigegeben, sonst Fehler, leer = keiner", () => {
    const ok = { state: "ok" as const, id: "2" };
    const ns = { state: "found_not_shared" as const, id: "1" };
    const er = { state: "error" as const, id: "3", error: "x" };
    expect(summarizeDatasets([ns, ok])).toBe(ok);
    expect(summarizeDatasets([er, ns])).toBe(ns);
    expect(summarizeDatasets([er])).toBe(er);
    expect(summarizeDatasets([])).toMatchObject({ state: "none", error: expect.stringMatching(/Kein Datensatz vorhanden/) });
  });

  it("Erklärung zum Datensatz ohne Gedankenstriche, ohne Garantie", () => {
    const t = explainMetaError("dataset", PERM);
    expect(t).toMatch(/noch nicht für uns freigegeben/);
    expect(explainMetaError("dataset", "HTTP 500")).toMatch(/konnte nicht geprüft werden \(HTTP 500\)/);
    for (const s of [t, summarizeDatasets([]).error ?? ""]) {
      expect(s).not.toMatch(/[–—]/);
      expect(s).not.toMatch(/Garantie/i);
    }
  });
});
