import { describe, expect, it } from "vitest";
import { APP_DEMO_MAX_AGE_MS, signiereDemoMarke } from "@/lib/app-demo/marke";
import { pruefeDemoMarke } from "@/lib/app-demo/marke-pruefen";
import { demoDatenbankUrl } from "@/lib/app-demo/konfig";
import { DEMO_NICHTS_GESPEICHERT, buyerZuDemo, demoActionAntwort, demoPfadAlsBuyer, demoWeiche, vonDemoSeite } from "@/lib/app-demo/weiche";
import { tourSchritte } from "@/components/app-demo-rahmen";

// Öffentliche App-Demo (/app-demo, Ole 16.11.2026): Signatur, Weiche der Middleware, Konfiguration.

const SECRET = "localtestsecret_localtestsecret_0123456789";

describe("App-Demo: signiertes Kennzeichen", () => {
  it("Middleware-Signatur (Web Crypto) wird vom Server (node:crypto) erkannt", async () => {
    const now = Date.now();
    const v = await signiereDemoMarke(SECRET, now);
    expect(v).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(pruefeDemoMarke(v, SECRET, now)).toBe(true);
    expect(pruefeDemoMarke(v, SECRET, now + 60_000)).toBe(true);
  });

  it("gefälscht, verändert, falsches Geheimnis oder abgelaufen: abgelehnt", async () => {
    const now = Date.now();
    const v = (await signiereDemoMarke(SECRET, now))!;
    const [ts, sig] = v.split(".");
    expect(pruefeDemoMarke("1", SECRET, now)).toBe(false);
    expect(pruefeDemoMarke("", SECRET, now)).toBe(false);
    expect(pruefeDemoMarke(null, SECRET, now)).toBe(false);
    expect(pruefeDemoMarke(`${ts}.${"0".repeat(64)}`, SECRET, now)).toBe(false);
    expect(pruefeDemoMarke(`${Number(ts) + 1}.${sig}`, SECRET, now)).toBe(false);
    const kippen = sig.slice(0, 63) + (sig.endsWith("0") ? "1" : "0");
    expect(pruefeDemoMarke(`${ts}.${kippen}`, SECRET, now)).toBe(false);
    expect(pruefeDemoMarke(v, SECRET + "x", now)).toBe(false);
    expect(pruefeDemoMarke(v, SECRET, now + APP_DEMO_MAX_AGE_MS + 1)).toBe(false);
    // aus der Zukunft (mehr als eine Minute Uhrabweichung)
    expect(pruefeDemoMarke(v, SECRET, now - 2 * 60_000)).toBe(false);
    // ohne bzw. mit zu kurzem Geheimnis gibt es keine Demo
    expect(await signiereDemoMarke(undefined, now)).toBeNull();
    expect(await signiereDemoMarke("kurz", now)).toBeNull();
    expect(pruefeDemoMarke(v, "", now)).toBe(false);
  });
});

describe("App-Demo: Weiche", () => {
  it("freigegebene Seiten werden auf /buyer umgeschrieben", () => {
    const ok: [string, string][] = [
      ["/app-demo", "/buyer"],
      ["/app-demo/", "/buyer"],
      ["/app-demo/kontakte", "/buyer/kontakte"],
      ["/app-demo/kontakte/abc123", "/buyer/kontakte/abc123"],
      ["/app-demo/kanban", "/buyer/kanban"],
      ["/app-demo/leads/abc", "/buyer/leads/abc"],
      ["/app-demo/chats", "/buyer/chats"],
      ["/app-demo/termine/t1/vorbereitung", "/buyer/termine/t1/vorbereitung"],
      ["/app-demo/termine/t1/praesentation", "/buyer/termine/t1/praesentation"],
      ["/app-demo/zahlen", "/buyer/zahlen"],
      ["/app-demo/wachstum", "/buyer/wachstum"],
    ];
    for (const [p, ziel] of ok) expect(demoWeiche({ pathname: p, method: "GET", serverAction: false }), p).toEqual({ kind: "rewrite", pathname: ziel });
    expect(demoWeiche({ pathname: "/app-demo/zahlen", method: "HEAD", serverAction: false }).kind).toBe("rewrite");
  });

  it("ausgeblendete Module, Einstellungen, Konto und alles andere: zurück zum Demo-Start", () => {
    for (const p of [
      "/app-demo/bestand",
      "/app-demo/bestand/import",
      "/app-demo/empfehlungen",
      "/app-demo/empfehlen",
      "/app-demo/einstellungen",
      "/app-demo/konto",
      "/app-demo/konto/export",
      "/app-demo/team",
      "/app-demo/postfach",
      "/app-demo/bestand/einwilligungslinks",
      "/app-demo/kontakte/../konto",
      "/app-demo/termine/t1/vorbereitung/x",
      "/app-demo/einrichtung",
    ]) {
      const d = demoWeiche({ pathname: p, method: "GET", serverAction: false });
      expect(d, p).toEqual({ kind: "redirect", location: "/app-demo?hinweis=nicht-in-der-demo" });
    }
  });

  it("Server Actions beantwortet die Weiche selbst, andere Schreib-Methoden 405", () => {
    expect(demoWeiche({ pathname: "/app-demo/kontakte", method: "POST", serverAction: true })).toEqual({ kind: "action" });
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(demoWeiche({ pathname: "/app-demo", method: m, serverAction: false }), m).toEqual({ kind: "method" });
    }
    expect(demoWeiche({ pathname: "/app-demo", method: "PUT", serverAction: true })).toEqual({ kind: "method" });
  });

  it("Antwort auf eine Server Action: RSC mit { ok: false, error }", () => {
    const a = demoActionAntwort();
    expect(a.headers["content-type"]).toBe("text/x-component");
    expect(a.body).toBe(`0:${JSON.stringify({ a: { ok: false, error: DEMO_NICHTS_GESPEICHERT } })}\n`);
  });

  it("Links der echten Seiten bleiben in der Demo, nur vom gleichen Host", () => {
    expect(buyerZuDemo("/buyer")).toBe("/app-demo");
    expect(buyerZuDemo("/buyer/kontakte/x")).toBe("/app-demo/kontakte/x");
    expect(buyerZuDemo("/buyerx")).toBeNull();
    expect(buyerZuDemo("/admin")).toBeNull();
    expect(demoPfadAlsBuyer("/app-demo/kontakte")).toBe("/buyer/kontakte");
    expect(demoPfadAlsBuyer("/app-demo")).toBe("/buyer");
    expect(demoPfadAlsBuyer("/buyer/zahlen")).toBe("/buyer/zahlen");
    expect(vonDemoSeite("https://app.performancegrowth.de/app-demo/kanban", "app.performancegrowth.de")).toBe(true);
    expect(vonDemoSeite("https://boese.example/app-demo", "app.performancegrowth.de")).toBe(false);
    expect(vonDemoSeite("https://app.performancegrowth.de/buyer", "app.performancegrowth.de")).toBe(false);
    expect(vonDemoSeite("https://app.performancegrowth.de/app-demonstration", "app.performancegrowth.de")).toBe(false);
    expect(vonDemoSeite(null, "app.performancegrowth.de")).toBe(false);
  });
});

describe("App-Demo: eigene Datenbank", () => {
  it("ohne Variable keine Demo, nie Rückfall auf die echte Datenbank", () => {
    expect(demoDatenbankUrl({ DATABASE_URL: "postgresql://u:p@db:5432/railway" })).toBeNull();
    expect(demoDatenbankUrl({ DATABASE_URL: "postgresql://u:p@db:5432/railway", APP_DEMO_DATABASE_URL: " " })).toBeNull();
    // gleiche Datenbank (auch mit anderem Passwort/Parametern/Groß-Klein beim Host) → keine Demo
    expect(demoDatenbankUrl({ DATABASE_URL: "postgresql://u:p@db:5432/railway", APP_DEMO_DATABASE_URL: "postgresql://x:y@DB/railway?sslmode=require" })).toBeNull();
    expect(demoDatenbankUrl({ DATABASE_URL: "postgresql://u:p@db:5432/railway", APP_DEMO_DATABASE_URL: "postgresql://u:p@db:5432/appdemo" })).toBe("postgresql://u:p@db:5432/appdemo");
  });
});

describe("App-Demo: Rundgang", () => {
  it("4 bis 6 Hinweise, alle in der Demo, ohne Gedankenstriche", () => {
    const voll = tourSchritte({ chat: "c1", termin: "t1" });
    expect(voll).toHaveLength(6);
    expect(tourSchritte({ chat: null, termin: null }).length).toBeGreaterThanOrEqual(3);
    for (const s of voll) {
      expect(s.pfad.startsWith("/app-demo")).toBe(true);
      expect(`${s.titel} ${s.text}`).not.toMatch(/[–—]/);
      expect(s.text).not.toMatch(/Garantie|Bestand|Empfehlung/);
    }
  });
});
