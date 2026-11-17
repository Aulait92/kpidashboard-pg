// Hilfen für die Klick-Tests: Browser, angemeldeter Vermittler, Testdaten.
import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { prisma } from "@/lib/prisma";
import { signSession } from "@/lib/auth";
import { BASE } from "./server";

export { BASE };

const uid = () => Math.random().toString(36).slice(2, 8);

/** Chromium von Playwright; ohne passende Installation das vorinstallierte (E2E_CHROMIUM bzw. /opt/pw-browsers). */
export async function browser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (e) {
    const fallback = process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium";
    if (!existsSync(fallback)) throw e;
    return chromium.launch({ executablePath: fallback, args: ["--headless=new", "--no-sandbox"] });
  }
}

/** Handy (390 px) oder Desktop, Berliner Zeitzone wie bei den Vermittlern. */
export async function context(b: Browser, opts: { mobile?: boolean; token?: string } = {}): Promise<BrowserContext> {
  const ctx = await b.newContext({
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    timezoneId: "Europe/Berlin",
    locale: "de-DE",
  });
  if (opts.token) {
    const host = new URL(BASE).hostname;
    await ctx.addCookies([{ name: "kpi_session", value: opts.token, domain: host, path: "/" }]);
  }
  return ctx;
}

/** Vermittler mit neuer Oberfläche und angemeldetem Inhaber; gibt Kunde, Nutzer und Sitzungs-Token zurück. */
export async function vermittler(name = `E2E Agentur ${uid()}`) {
  const customer = await prisma.customer.create({ data: { name, newUi: true, isTest: true } });
  const user = await prisma.user.create({
    data: { email: `e2e-${uid()}@test.local`, passwordHash: "x", role: "BUYER", customerId: customer.id, teamRole: "owner", displayName: "Eva Test", receivesLeads: true },
  });
  const token = await signSession({ userId: user.id, email: user.email, role: "BUYER", customerId: customer.id, sv: 0 } as never);
  return { customer, user, token };
}

export async function aufraeumen(customerId: string) {
  await prisma.customer.delete({ where: { id: customerId } }).catch(() => {});
}
