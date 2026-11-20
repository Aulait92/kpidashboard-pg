// Onboarding Herr Lohmann (Ole, 20.11.2026): Pilot bis …, www.app-Umleitung, Merkmal „Passwort jetzt festlegen“,
// Erstinformation statt Website, Hinweis nach automatischem Reload. Nur reine Funktionen.
import { describe, expect, it } from "vitest";
import { berlinTag, parsePilotBis, pilotAbzeichen, pilotErinnerungen, pilotLaeuft } from "@/lib/pilot";
import { wwwAppRedirect } from "@/lib/www-app-host";
import { ANNAHME_TTL_MS, pruefeAnnahme, signAnnahme } from "@/lib/annahme-direktzugang";
import { erstinfoStattWebsite, KEINE_WEBSITE } from "@/lib/impressum-ersatz";
import { AKTUALISIERT_TEXT, isNewVersionError, reloadForNewVersion, takeReloadHinweis, RELOAD_GUARD_MS } from "@/lib/neue-version";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("Pilot bis …", () => {
  const bis = parsePilotBis("2026-12-15");
  if (!bis.ok || !bis.value) throw new Error("Datum");
  const ende = bis.value;

  it("liest das Datum aus dem Formular, leer = kein Pilot, Unsinn = Fehler", () => {
    expect(berlinTag(ende)).toBe("2026-12-15");
    expect(parsePilotBis("")).toEqual({ ok: true, value: null });
    expect(parsePilotBis("2026-02-30").ok).toBe(false);
    expect(parsePilotBis("15.12.2026").ok).toBe(false);
  });

  it("läuft bis einschließlich des letzten Tags (deutsche Zeit)", () => {
    expect(pilotLaeuft(ende, new Date("2026-12-15T22:30:00Z"))).toBe(true); // 23:30 Uhr am 15.12.
    expect(pilotLaeuft(ende, new Date("2026-12-15T23:30:00Z"))).toBe(false); // 00:30 Uhr am 16.12.
    expect(pilotLaeuft(null)).toBe(false);
  });

  it("Abzeichen „Pilot bis TT.MM.“, danach 30 Tage „Pilot endete“", () => {
    expect(pilotAbzeichen(ende, new Date("2026-11-20T10:00:00Z"))).toEqual({ text: "Pilot bis 15.12.", laeuft: true });
    expect(pilotAbzeichen(ende, new Date("2026-12-20T10:00:00Z"))).toEqual({ text: "Pilot endete 15.12.", laeuft: false });
    expect(pilotAbzeichen(ende, new Date("2027-02-01T10:00:00Z"))).toBeNull();
    expect(pilotAbzeichen(null)).toBeNull();
  });

  it("Erinnerungen 7 Tage vorher und am letzten Tag, nie in der Vergangenheit", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    const r = pilotErinnerungen("Allianz Lohmann", ende, now);
    expect(r.map((t) => t.dueAt.toISOString())).toEqual(["2026-12-08T08:00:00.000Z", "2026-12-15T08:00:00.000Z"]);
    expect(r[0].title).toContain("15.12.2026");
    expect(r[1].title).toContain("endet heute");
    // 3 Tage vor dem Ende: Vorab-Erinnerung sofort
    const kurz = pilotErinnerungen("X", ende, new Date("2026-12-12T10:00:00Z"));
    expect(kurz[0].dueAt.toISOString()).toBe("2026-12-12T10:00:00.000Z");
    // letzter Tag: nur „endet heute“; danach keine
    expect(pilotErinnerungen("X", ende, new Date("2026-12-15T06:00:00Z"))).toHaveLength(1);
    expect(pilotErinnerungen("X", ende, new Date("2026-12-16T10:00:00Z"))).toEqual([]);
  });
});

describe("www.app → app (308)", () => {
  it("entfernt www bei www.app.…, Pfad und Abfrage bleiben", () => {
    expect(wwwAppRedirect("www.app.performancegrowth.de", "/buyer/einrichtung", "?a=1&b=2")).toBe("https://app.performancegrowth.de/buyer/einrichtung?a=1&b=2");
    expect(wwwAppRedirect("WWW.App.Performancegrowth.de:443", "/", "")).toBe("https://app.performancegrowth.de/");
    expect(wwwAppRedirect("www.app.example.com, proxy", "/login", "?")).toBe("https://app.example.com/login");
  });

  it("lässt andere Hosts in Ruhe (Buchungsadresse, App ohne www)", () => {
    expect(wwwAppRedirect("app.performancegrowth.de", "/", "")).toBeNull();
    expect(wwwAppRedirect("www.dein-beratungstermin.de", "/book/x", "")).toBeNull();
    expect(wwwAppRedirect("www.apple.de", "/", "")).toBeNull();
    expect(wwwAppRedirect("www.app.", "/", "")).toBeNull();
    expect(wwwAppRedirect("", "/", "")).toBeNull();
  });
});

describe("Passwort jetzt festlegen: Merkmal des Annahme-Browsers", () => {
  const secret = "testsecret-testsecret-testsecret-12";
  const now = 1_800_000_000_000;

  it("gilt nur für dieses Angebot, mit diesem Schlüssel und 12 Stunden lang", () => {
    const v = signAnnahme("off_1", secret, now);
    expect(pruefeAnnahme(v, "off_1", secret, now + 1000)).toBe(true);
    expect(pruefeAnnahme(v, "off_2", secret, now)).toBe(false);
    expect(pruefeAnnahme(v, "off_1", "anderer-schluessel", now)).toBe(false);
    expect(pruefeAnnahme(v, "off_1", secret, now + ANNAHME_TTL_MS + 1)).toBe(false);
    expect(pruefeAnnahme(v, "off_1", null, now)).toBe(false);
  });

  it("verändertes oder kaputtes Merkmal zählt nicht", () => {
    const [id, exp, sig] = signAnnahme("off_1", secret, now).split(".");
    expect(pruefeAnnahme(`${id}.${Number(exp) + 999_999}.${sig}`, "off_1", secret, now)).toBe(false);
    expect(pruefeAnnahme(`${id}.${exp}.${sig.slice(0, -2)}xx`, "off_1", secret, now)).toBe(false);
    expect(pruefeAnnahme("off_1", "off_1", secret, now)).toBe(false);
    expect(pruefeAnnahme(undefined, "off_1", secret, now)).toBe(false);
  });
});

describe("Pflichtangaben ohne Website", () => {
  it("vollständige Erstinformation ersetzt das Impressum nur, wenn keine Website hinterlegt ist", () => {
    expect(erstinfoStattWebsite({ error: KEINE_WEBSITE }, true)).toBe(true);
    expect(erstinfoStattWebsite({ error: KEINE_WEBSITE }, false)).toBe(false);
    expect(erstinfoStattWebsite({ error: "Impressum nicht gefunden." }, true)).toBe(false);
    expect(erstinfoStattWebsite({}, true)).toBe(false);
    expect(erstinfoStattWebsite(null, true)).toBe(false);
  });
});

describe("Neue Version: Hinweis nach dem Reload", () => {
  it("erkennt auch fehlende Code-Teile und die 409-Antwort", () => {
    expect(isNewVersionError(Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" }))).toBe(true);
    expect(isNewVersionError(new Error("Loading chunk app/buyer/page failed."))).toBe(true);
    expect(isNewVersionError(new TypeError("Failed to fetch dynamically imported module: https://app/_next/x.js"))).toBe(true);
    expect(isNewVersionError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isNewVersionError(new Error("Server Action unavailable."))).toBe(true);
    expect(isNewVersionError(new Error("Failed to fetch"))).toBe(false);
  });

  it("nach dem automatischen Reload einmal der Hinweis, höchstens ein Reload je 30 Sekunden", () => {
    expect(RELOAD_GUARD_MS).toBe(30_000);
    expect(AKTUALISIERT_TEXT).toBe("Die App wurde aktualisiert. Bitte noch einmal tippen.");
    const storage = memory();
    let reloads = 0;
    const t0 = 5_000_000;
    expect(takeReloadHinweis({ now: t0, storage })).toBe(false);
    expect(reloadForNewVersion({ now: t0, storage, reload: () => reloads++ })).toBe(true);
    expect(takeReloadHinweis({ now: t0 + 2000, storage })).toBe(true);
    expect(takeReloadHinweis({ now: t0 + 3000, storage })).toBe(false); // nur einmal
    expect(reloadForNewVersion({ now: t0 + 10_000, storage, reload: () => reloads++ })).toBe(false);
    expect(reloadForNewVersion({ now: t0 + 31_000, storage, reload: () => reloads++ })).toBe(true);
    expect(reloads).toBe(2);
    // alter Hinweis (über eine Minute) wird verworfen
    expect(takeReloadHinweis({ now: t0 + 31_000 + 120_000, storage })).toBe(false);
    expect(takeReloadHinweis({ storage: null })).toBe(false);
  });
});
