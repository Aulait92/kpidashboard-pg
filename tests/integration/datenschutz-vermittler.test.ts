// Datenschutzhinweise im Namen des Vermittlers (Ole, 20.11.2026: „unter Datenschutz ist PG, unter Impressum Lohmann“)
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/lead-legal-footer", () => ({ LeadLegalFooter: () => null }));

import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { datenschutzUrlFor } from "@/lib/erstinformation";
import DatenschutzVermittlerPage from "@/app/erstinformation/[token]/datenschutz/page";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];

describe("Datenschutzhinweise des Vermittlers", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("mit Name und Anschrift: Link auf die Seite mit dem Vermittler als Verantwortlichem", async () => {
    const c = await makeCustomer({ name: "Allianz Versicherung Henrik Test Generalvertretung" });
    ids.push(c.id);
    const token = `dsv${Date.now()}abc`;
    await prisma.erstinformation.create({ data: { customerId: c.id, token, name: "Henrik Test", anschrift: "Schützenstr. 35, 21244 Buchholz", email: "henrik.test@allianz.de" } });
    const url = await datenschutzUrlFor(c.id);
    expect(url).toMatch(new RegExp(`/erstinformation/${token}/datenschutz$`));
    const html = renderToStaticMarkup(await DatenschutzVermittlerPage({ params: Promise.resolve({ token }) }));
    expect(html).toContain("data-datenschutz-vermittler");
    expect(html).toContain("Henrik Test");
    expect(html).toContain("Schützenstr. 35, 21244 Buchholz");
    expect(html).not.toMatch(/[–—]/);
  });

  it("ohne Anschrift: kein Link (dann bleibt die allgemeine Erklärung)", async () => {
    const c = await makeCustomer({ name: "Agentur ohne Anschrift" });
    ids.push(c.id);
    await prisma.erstinformation.create({ data: { customerId: c.id, token: `dsv${Date.now()}xyz`, name: "Anna Test" } });
    expect(await datenschutzUrlFor(c.id)).toBeNull();
  });
});
