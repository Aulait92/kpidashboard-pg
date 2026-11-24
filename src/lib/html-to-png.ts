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

// ─── Erlaubte Quellen beim Rendern von Creatives ─────────────────────
// (Ole, 24.11.2026) Das HTML eines Creatives schreibt ein Sprachmodell. Der Renderer lädt deshalb nicht mehr beliebige
// Adressen, sondern nur die Quellen, die die Creative-Erzeugung selbst vorsieht:
// - data:-URLs (KI-Bilder aus lib/openai-image.ts, Platzhalter-Grau, eingebettete SVGs)
// - Stock-Fotos als Ersatz für KI-Bilder (lib/unsplash.ts): Unsplash und Pexels
// - Schriftarten: Google Fonts (per <link>, lib/creative-gen.ts)
// - eigener Bildspeicher (R2_PUBLIC_URL)
// - Bild-Adressen von OpenAI, falls die Bild-Schnittstelle eine Adresse statt Daten liefert
// Alles andere wird geblockt, ausdrücklich auch Meta (fbcdn, facebook, instagram): Ein Bild aus einer Anzeige, auch
// aus der eines anderen Kunden, kann so nie 1:1 in einem Creative landen.

const FESTE_QUELLEN = ["fonts.googleapis.com", "fonts.gstatic.com", "unsplash.com", "pexels.com", "oaidalleapiprodscus.blob.core.windows.net"];
/** Nie erlaubt, auch nicht über eine Einstellung. */
const GESPERRTE_QUELLEN = ["fbcdn.net", "facebook.com", "facebook.net", "fb.com", "fbsbx.com", "instagram.com", "cdninstagram.com", "meta.com"];

const passt = (host: string, liste: string[]) => liste.some((h) => host === h || host.endsWith(`.${h}`));

function hostAus(wert: string | undefined): string | null {
  const t = (wert ?? "").trim().toLowerCase();
  if (!t) return null;
  try {
    return new URL(/^[a-z]+:\/\//.test(t) ? t : `https://${t}`).hostname || null;
  } catch {
    return null;
  }
}

/** Erlaubte Hosts: feste Liste, eigener Bildspeicher (R2_PUBLIC_URL) und CREATIVE_RENDER_HOSTS (kommagetrennt). */
export function creativeQuellen(env: NodeJS.ProcessEnv = process.env): string[] {
  const zusatz = (env.CREATIVE_RENDER_HOSTS ?? "").split(",").map((h) => hostAus(h));
  return [...FESTE_QUELLEN, hostAus(env.R2_PUBLIC_URL), ...zusatz].filter((h): h is string => !!h && !passt(h, GESPERRTE_QUELLEN));
}

/** Darf der Renderer diese Adresse für ein Creative laden? Nur https zu erlaubten Hosts, dazu data:, blob: und about:. */
export function creativeQuelleErlaubt(rawUrl: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol === "data:" || url.protocol === "blob:" || url.protocol === "about:") return true;
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (passt(host, GESPERRTE_QUELLEN)) return false;
  return passt(host, creativeQuellen(env));
}

/**
 * Ein Creative verweist auf Bilder, Stylesheets oder Skripte aus einer nicht erlaubten Quelle: Es wird nicht erzeugt
 * (statt mit Lücke oder ohne Gestaltung). Geblockte Schriftdateien führen nur zur Ersatzschrift.
 */
export class GeblockteQuelleError extends Error {
  constructor(readonly hosts: string[]) {
    super(`Creative verweist auf nicht erlaubte Quellen (${hosts.join(", ")}). Erlaubt sind nur die Platzhalter für Fotos und Illustrationen sowie Google Fonts.`);
  }
}

/** Ohne diese Inhalte wäre das Creative sichtbar kaputt: ein geblockter Abruf bricht das Rendern ab. */
const PFLICHT_INHALTE = ["image", "media", "stylesheet", "script"];

const hostFuerMeldung = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.hostname : url.protocol;
  } catch {
    return "ungültige Adresse";
  }
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
  // Request-Filter: nur die Quellen der Creative-Erzeugung (siehe oben). Gilt für alles, was die Seite lädt.
  const geblockt = new Set<string>();
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    // Schließt die Seite schon (Bild fertig), darf ein später Abruf nicht als Fehler hochkommen
    if (creativeQuelleErlaubt(url)) return route.continue().catch(() => undefined);
    const host = hostFuerMeldung(url);
    console.warn(`[html-to-png] geblockt (${request.resourceType()}): ${host}`);
    if (PFLICHT_INHALTE.includes(request.resourceType())) geblockt.add(host);
    return route.abort("blockedbyclient").catch(() => undefined);
  });
  const page = await context.newPage();
  // Weiterleitungen laufen am Filter vorbei: führt eine erlaubte Adresse auf eine nicht erlaubte, zählt das als geblockt
  page.on("request", (request) => {
    if (request.redirectedFrom() && !creativeQuelleErlaubt(request.url())) geblockt.add(hostFuerMeldung(request.url()));
  });

  try {
    await page.setContent(html, { waitUntil: "networkidle", timeout: 15_000 });
    // Fonts können nach networkidle noch nachladen — kurzer Wait.
    await page.evaluate(() => document.fonts?.ready);
    if (geblockt.size) throw new GeblockteQuelleError([...geblockt]);

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

/** Rendert fertiges HTML als A4-PDF (Seitenränder aus dem CSS, @page). Für Seiten hinter dem Login (z. B. Terminvorbereitung). */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 794, height: 1123 } });
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle", timeout: 20_000 });
    await page.evaluate(() => document.fonts?.ready);
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}
