// Link in der Einwilligung „Unterlagen per WhatsApp“ (Usability-Check 18.11.2026): Die Adresse aus
// policenDatenschutzUrl (/datenschutz/policen?k=<Token der Erstinformation>, je Vermittler) führt auf eine echte Seite
// mit den Angaben des Vermittlers; ohne bzw. mit unbekanntem Token kein 404, sondern ein Hinweis.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Fußzeile ist eine asynchrone Server-Komponente mit eigenem Test (impressum-fehlt.test.ts)
vi.mock("@/components/lead-legal-footer", () => ({ LeadLegalFooter: () => null }));

import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { policenDatenschutzUrl } from "@/lib/policen/verantwortlicher";
import { einwilligungText } from "@/lib/policen/bitte";
import { DATENSCHUTZ_VERSION } from "@/lib/policen/regeln";
import DatenschutzPolicenPage from "@/app/datenschutz/policen/page";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];
const seite = async (k?: string) => renderToStaticMarkup(await DatenschutzPolicenPage({ searchParams: Promise.resolve(k === undefined ? {} : { k }) }));

describe("Datenschutzhinweis zu Unterlagen: verlinkte Seite existiert", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("die Adresse im Einwilligungstext zeigt auf eine Seite mit den Angaben des Vermittlers", async () => {
    const c = await makeCustomer({ name: "Agentur Datenschutz Test" });
    ids.push(c.id);
    await prisma.erstinformation.create({ data: { customerId: c.id, token: `dsp${Date.now()}abc`, firma: "Agentur Muster GmbH" } });
    const url = await policenDatenschutzUrl(c.id);
    const text = einwilligungText({ an: "sie", wer: "Susanne Muster", firma: "Agentur Muster GmbH", link: url, gesundheitAn: true });
    expect(text).toContain(url);

    const u = new URL(url);
    expect(u.pathname).toBe("/datenschutz/policen");
    // Die Route gibt es wirklich (App Router: src/app/<Pfad>/page.tsx)
    expect(fs.existsSync(path.join(__dirname, "..", "..", "src", "app", u.pathname, "page.tsx"))).toBe(true);

    const html = await seite(u.searchParams.get("k")!);
    expect(html).toContain("data-datenschutz-policen");
    expect(html).toContain("Agentur Muster GmbH");
    expect(html).toContain(`Fassung ${DATENSCHUTZ_VERSION}`);
  });

  it("ohne oder mit unbekanntem Token: Hinweis mit nächster Handlung statt 404", async () => {
    for (const k of [undefined, "", "unbekannt123456"]) {
      const html = await seite(k);
      expect(html).toContain("data-datenschutz-policen-ohne-link");
      expect(html).toContain("WhatsApp-Nachricht");
    }
  });
});
