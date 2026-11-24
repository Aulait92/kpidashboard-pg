// Renderer für Creatives (Ole, 24.11.2026): lädt nur noch die Quellen, die die Creative-Erzeugung selbst vorsieht.
// Alles andere wird geblockt, ausdrücklich Meta (fbcdn, facebook, instagram): Ein Bild aus einer Anzeige, auch aus der
// eines anderen Kunden, kann so nie 1:1 in einem Creative landen. Der Browser ist hier nachgebildet; mit echtem Browser
// prüft tests/unit/creative-renderer-browser.test.ts (nur mit CHROMIUM_PATH).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Abruf = { url: string; art: string; weitergeleitetVon?: string };
type RouteHandler = (route: { request: () => { url: () => string; resourceType: () => string }; continue: () => Promise<void>; abort: (code?: string) => Promise<void> }) => Promise<unknown>;

const h = vi.hoisted(() => ({
  muster: null as string | null,
  handler: null as RouteHandler | null,
  onRequest: null as ((r: { url: () => string; redirectedFrom: () => unknown }) => void) | null,
  abrufe: [] as Abruf[],
  log: [] as string[],
  screenshots: 0,
  geschlossen: 0,
  kontexte: 0,
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: async () => ({
      newContext: async () => {
        h.kontexte++;
        h.muster = null;
        h.handler = null;
        return {
          route: async (muster: string, handler: RouteHandler) => {
            h.muster = muster;
            h.handler = handler;
          },
          newPage: async () => ({
            on: (ereignis: string, fn: (r: { url: () => string; redirectedFrom: () => unknown }) => void) => {
              if (ereignis === "request") h.onRequest = fn;
            },
            // Die Seite „lädt“ die vorgegebenen Abrufe: jeder läuft durch den Filter des Renderers (wenn es einen gibt)
            setContent: async () => {
              for (const a of h.abrufe) {
                h.onRequest?.({ url: () => a.url, redirectedFrom: () => (a.weitergeleitetVon ? {} : null) });
                if (a.weitergeleitetVon) continue; // Weiterleitungen laufen im echten Browser am Filter vorbei
                if (!h.handler) {
                  h.log.push(`ungefiltert ${a.url}`);
                  continue;
                }
                await h.handler({
                  request: () => ({ url: () => a.url, resourceType: () => a.art }),
                  continue: async () => void h.log.push(`geladen ${a.url}`),
                  abort: async (code?: string) => void h.log.push(`geblockt ${a.url} (${code})`),
                });
              }
            },
            goto: async () => undefined,
            evaluate: async () => undefined,
            screenshot: async () => (h.screenshots++, Buffer.from("bild")),
            pdf: async () => Buffer.from("pdf"),
          }),
          close: async () => void h.geschlossen++,
        };
      },
    }),
  },
}));

import { GeblockteQuelleError, creativeQuelleErlaubt, creativeQuellen, renderHtmlToImage, renderHtmlToPdf } from "@/lib/html-to-png";

const FBCDN = "https://scontent-fra3-1.xx.fbcdn.net/v/t45.1600-4/lohmann-katze.jpg?oe=ABC123";
const DATA = "data:image/png;base64,iVBORw0KGgo=";
const ENV = { R2_PUBLIC_URL: "https://bilder.performancegrowth.test/creatives" } as unknown as NodeJS.ProcessEnv;

const vorher = { ...process.env };
beforeEach(() => {
  Object.assign(h, { muster: null, handler: null, onRequest: null, abrufe: [], log: [], screenshots: 0, geschlossen: 0, kontexte: 0 });
  process.env.R2_PUBLIC_URL = "https://bilder.performancegrowth.test/creatives";
  delete process.env.CREATIVE_RENDER_HOSTS;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...vorher };
  vi.restoreAllMocks();
});

describe("Erlaubte Quellen der Creative-Erzeugung", () => {
  it("lässt durch: eingebettete Bilder, Stock-Fotos, Google Fonts, eigener Bildspeicher, OpenAI-Bildadresse", () => {
    for (const url of [
      DATA,
      "data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E",
      "about:blank",
      "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=1080",
      "https://plus.unsplash.com/premium_photo-1.jpg",
      "https://images.pexels.com/photos/1/pexels-photo-1.jpeg",
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;900&display=swap",
      "https://fonts.gstatic.com/s/inter/v13/abc.woff2",
      "https://bilder.performancegrowth.test/creatives/kampagnen/run1/1-1.jpg",
      "https://oaidalleapiprodscus.blob.core.windows.net/private/img.png?sig=x",
    ]) {
      expect(creativeQuelleErlaubt(url, ENV), url).toBe(true);
    }
  });

  it("blockt Meta (fbcdn, facebook, instagram) und alles andere", () => {
    for (const url of [
      FBCDN,
      "https://scontent.xx.fbcdn.net/v/x.jpg",
      "https://external-fra3-1.xx.fbcdn.net/emg1/v/t13/1.jpg",
      "https://www.facebook.com/ads/image/?d=AQ",
      "https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=1",
      "https://scontent.cdninstagram.com/v/t51/1.jpg",
      "https://www.instagram.com/p/abc/media",
      "https://upload.wikimedia.org/wikipedia/commons/a/a2/Allianz.svg",
      "https://example.com/katze.jpg",
      "https://cdn.tailwindcss.com",
      "http://images.unsplash.com/photo-1.jpg", // ohne https
      "https://images.unsplash.com.boese.test/photo-1.jpg", // nur ähnlicher Name
      "https://boese-unsplash.com/photo-1.jpg",
      "file:///etc/passwd",
      "ws://example.com/socket",
      "keine adresse",
    ]) {
      expect(creativeQuelleErlaubt(url, ENV), url).toBe(false);
    }
  });

  it("weitere Hosts nur über CREATIVE_RENDER_HOSTS, Meta lässt sich auch darüber nicht freischalten", () => {
    const env = { CREATIVE_RENDER_HOSTS: "cdn.beispiel.test, https://fbcdn.net, scontent.xx.fbcdn.net", R2_PUBLIC_URL: "https://facebook.com/x" } as unknown as NodeJS.ProcessEnv;
    expect(creativeQuellen(env)).toContain("cdn.beispiel.test");
    expect(creativeQuellen(env).some((h2) => /fbcdn|facebook/.test(h2))).toBe(false);
    expect(creativeQuelleErlaubt("https://cdn.beispiel.test/a.png", env)).toBe(true);
    expect(creativeQuelleErlaubt(FBCDN, env)).toBe(false);
    expect(creativeQuelleErlaubt("https://facebook.com/x/bild.jpg", env)).toBe(false);
    expect(creativeQuelleErlaubt("https://cdn.beispiel.test/a.png", {} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("renderHtmlToImage: Request-Filter", () => {
  it("bestehende Creatives: erlaubte Quellen werden geladen, das Bild entsteht", async () => {
    h.abrufe = [
      { url: "https://fonts.googleapis.com/css2?family=Inter:wght@900", art: "stylesheet" },
      { url: "https://fonts.gstatic.com/s/inter/v13/abc.woff2", art: "font" },
      { url: "https://images.unsplash.com/photo-1514888286974?w=1080", art: "image" },
      { url: "https://images.pexels.com/photos/1/a.jpeg", art: "image" },
      { url: "https://bilder.performancegrowth.test/creatives/logo.png", art: "image" },
    ];
    const bild = await renderHtmlToImage("<html><body><img src='x'></body></html>");
    expect(bild.toString()).toBe("bild");
    expect(h.muster).toBe("**/*");
    expect(h.log).toEqual(h.abrufe.map((a) => `geladen ${a.url}`));
    expect(h.geschlossen).toBe(1);
  });

  it("blockt eine fbcdn-Adresse: kein Abruf, kein Bild, klare Meldung", async () => {
    h.abrufe = [
      { url: "https://fonts.googleapis.com/css2?family=Inter", art: "stylesheet" },
      { url: FBCDN, art: "image" },
    ];
    const lauf = renderHtmlToImage(`<html><body><img src="${FBCDN}"></body></html>`);
    await expect(lauf).rejects.toBeInstanceOf(GeblockteQuelleError);
    await expect(lauf).rejects.toThrow(/nicht erlaubte Quellen \(scontent-fra3-1\.xx\.fbcdn\.net\)/);
    expect(h.log).toEqual(["geladen https://fonts.googleapis.com/css2?family=Inter", `geblockt ${FBCDN} (blockedbyclient)`]);
    expect(h.screenshots).toBe(0);
    expect(h.geschlossen).toBe(1); // Browser-Kontext wird auch im Fehlerfall geschlossen
  });

  it("geblockte Stylesheets und Skripte brechen ab, eine geblockte Schriftdatei führt nur zur Ersatzschrift", async () => {
    h.abrufe = [{ url: "https://fonts.beispiel.test/inter.woff2", art: "font" }];
    expect((await renderHtmlToImage("<html></html>")).toString()).toBe("bild");
    expect(h.log).toEqual(["geblockt https://fonts.beispiel.test/inter.woff2 (blockedbyclient)"]);
    for (const art of ["stylesheet", "script", "media"]) {
      h.abrufe = [{ url: "https://cdn.beispiel.test/x", art }];
      await expect(renderHtmlToImage("<html></html>"), art).rejects.toThrow(/cdn\.beispiel\.test/);
    }
  });

  it("Weiterleitung einer erlaubten Adresse auf eine nicht erlaubte zählt als geblockt", async () => {
    h.abrufe = [
      { url: "https://images.unsplash.com/photo-1?w=1080", art: "image" },
      { url: FBCDN, art: "image", weitergeleitetVon: "https://images.unsplash.com/photo-1?w=1080" },
    ];
    await expect(renderHtmlToImage("<html></html>")).rejects.toThrow(/fbcdn\.net/);
    expect(h.screenshots).toBe(0);
    // Weiterleitung innerhalb der erlaubten Quellen ist in Ordnung
    h.abrufe = [{ url: "https://images.unsplash.com/photo-2", art: "image", weitergeleitetVon: "https://unsplash.com/photos/2/download" }];
    expect((await renderHtmlToImage("<html></html>")).toString()).toBe("bild");
  });

  it("PDF-Rendern (Angebot, Präsentation) bleibt ohne diesen Filter", async () => {
    h.abrufe = [{ url: "https://app.example.de/logo.png", art: "image" }];
    expect((await renderHtmlToPdf("<html></html>")).toString()).toBe("pdf");
    expect(h.muster).toBeNull();
    expect(h.log).toEqual(["ungefiltert https://app.example.de/logo.png"]);
  });
});
