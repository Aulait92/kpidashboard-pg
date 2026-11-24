// Renderer für Creatives mit echtem Browser (Ole, 24.11.2026): Der Request-Filter blockt eine fbcdn-Adresse wirklich,
// eingebettete Bilder (data:) funktionieren weiter. Läuft nur, wenn CHROMIUM_PATH auf einen Chromium bzw. Chrome zeigt
// (z. B. CHROMIUM_PATH=/usr/bin/google-chrome); ohne Browser prüft tests/unit/creative-renderer-filter.test.ts die Logik.
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GeblockteQuelleError, renderHtmlToImage } from "@/lib/html-to-png";

const browser = process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH);
// 1×1 Pixel, rot
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const seite = (bild: string, extra = "") =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;width:200px;height:200px;background:#fff}img{width:200px;height:200px}</style>${extra}</head><body><img src="${bild}"></body></html>`;
const istJpeg = (b: Buffer) => b.length > 100 && b[0] === 0xff && b[1] === 0xd8;

describe.skipIf(!browser)("renderHtmlToImage mit echtem Browser", () => {
  it("eingebettetes Bild (data:) wird wie bisher gerendert", async () => {
    const bild = await renderHtmlToImage(seite(PIXEL), { width: 200, height: 200 });
    expect(istJpeg(bild)).toBe(true);
  }, 60_000);

  it("ein Bild von fbcdn wird geblockt, es entsteht kein Creative", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fbcdn = "https://scontent-fra3-1.xx.fbcdn.net/v/t45.1600-4/lohmann-katze.jpg?oe=ABC123";
    await expect(renderHtmlToImage(seite(fbcdn), { width: 200, height: 200 })).rejects.toBeInstanceOf(GeblockteQuelleError);
    // auch als Hintergrundbild im CSS
    const css = `<style>body{background-image:url(https://www.facebook.com/ads/image/?d=AQ)}</style>`;
    await expect(renderHtmlToImage(seite(PIXEL, css), { width: 200, height: 200 })).rejects.toThrow(/facebook\.com/);
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/geblockt \(image\): scontent-fra3-1\.xx\.fbcdn\.net/);
    warn.mockRestore();
  }, 60_000);

  it("fremdes Skript und fremdes Stylesheet werden geblockt", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(renderHtmlToImage(seite(PIXEL, `<script src="https://cdn.beispiel.test/app.js"></script>`), { width: 200, height: 200 })).rejects.toThrow(/cdn\.beispiel\.test/);
    await expect(renderHtmlToImage(seite(PIXEL, `<link rel="stylesheet" href="https://cdn.beispiel.test/stil.css">`), { width: 200, height: 200 })).rejects.toThrow(/cdn\.beispiel\.test/);
    vi.restoreAllMocks();
  }, 60_000);
});
