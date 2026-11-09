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
      // Optional: eigener Chromium-Pfad (z. B. lokal, wenn die gebündelte
      // Browser-Version nicht installiert ist).
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
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

/**
 * Rendert eine (interne) URL als A4-PDF – z. B. die Druckansicht eines
 * Angebots. Die URL muss vom Server selbst erreichbar sein.
 */
export async function renderUrlToPdf(url: string): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 794, height: 1123 } });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    await page.evaluate(() => document.fonts?.ready);
    // Seitenränder kommen aus dem CSS der Seite (@page), damit z. B. ein
    // Deckblatt randlos sein kann.
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}
