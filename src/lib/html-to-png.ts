import { chromium, type Browser } from "playwright";

// Singleton-Browser. Playwright's Chromium-Cold-Start kostet ~500-800ms,
// also halten wir die Instance über Requests. Bei Node-Reload (z.B. Hot-
// Reload im Dev) wird die Instance neu erzeugt — kein Memory-Leak.
//
// DEPLOYMENT-NOTE: Server-Container braucht Chromium-Binary. Nach
// `npm install` einmalig `npx playwright install chromium --with-deps`
// ausführen. In Docker: `RUN npx playwright install chromium --with-deps`
// im build-stage. Auf Vercel Serverless funktioniert das NICHT — dann
// stattdessen einen externen Render-Service (HCTI/Browserless).

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

export type RenderOptions = {
  width?: number;
  height?: number;
  // JPEG-Qualität 1-100. PNG ignoriert das Feld.
  quality?: number;
  format?: "jpeg" | "png";
};

export async function renderHtmlToImage(
  html: string,
  opts: RenderOptions = {},
): Promise<Buffer> {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1080;
  const format = opts.format ?? "jpeg";
  const quality = opts.quality ?? 92;

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(html, { waitUntil: "networkidle", timeout: 15_000 });
    // Fonts können nach networkidle noch nachladen — kurzer Wait.
    await page.evaluate(() => document.fonts?.ready);

    const screenshot = await page.screenshot({
      type: format,
      ...(format === "jpeg" ? { quality } : {}),
      clip: { x: 0, y: 0, width, height },
      omitBackground: false,
    });
    return Buffer.from(screenshot);
  } finally {
    await context.close();
  }
}
