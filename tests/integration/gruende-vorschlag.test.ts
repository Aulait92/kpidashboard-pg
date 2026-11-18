import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// „Gründe vorschlagen“ und die Frage „Beratungsdokumentation vorbereiten?“ (Ole, 18.11.2026) gegen die Test-DB.
// Keine echte KI: der Client ist gemockt.

import { prisma } from "@/lib/prisma";
import { bdFrageFaellig, ladeBeratungsdoku, setzeBeratungsdoku } from "@/lib/beratungsdoku-server";
import { gruendeVorschlag } from "@/lib/zusammenfassung-server";
import type { BedrockEu } from "@/lib/ki-eu-konfig";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const EU: BedrockEu = { art: "bedrock", region: "eu-central-1", accessKey: "a", secretKey: "b", model: "m" };
const T0 = new Date("2026-11-17T09:00:00.000Z");
const item = (sparte: string, tarif: string, beitragMonat: number, leistungen: string[] = []) => ({
  sparte,
  gesellschaft: "Allianz",
  tarif,
  beitragMonat,
  leistungen,
  empfohlen: true,
  gewaehlt: true,
  merkmale: [],
  bausteine: [],
});

describe("Gründe vorschlagen und Frage nach der Beratungsdokumentation", () => {
  let customerId = "";
  let n = 0;
  const ctx = () => ({ customerId, userId: null, teamRole: "owner" as const });

  async function termin(source: string, items: ReturnType<typeof item>[]) {
    const lead = await prisma.lead.create({
      data: {
        customerId,
        name: "Anna Becker",
        source,
        formData: [
          { label: "Lebenssituation", value: "Familie" },
          { label: "Vorerkrankungen", value: "Asthma" },
        ],
        phone: `49151500${String(++n).padStart(4, "0")}`,
        email: "anna@example.org",
        status: "Angebot gesendet",
      },
    });
    const t = await prisma.appointment.create({
      data: { customerId, leadId: lead.id, startsAt: new Date(T0.getTime() - 2 * 3600_000), status: "completed", mode: "video", offersJson: { items, quelle: [], schutz: [] } },
    });
    await prisma.leadHistory.create({ data: { leadId: lead.id, customerId, kind: "notiz", text: "Fahrrad soll mit rein" } });
    return t;
  }

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ leadAddress: "sie", beratungsdokuAn: true })).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Vorschlag aus Tarif und Wünschen, ohne Gesundheitsangaben; ohne EU-KI kein Knopf", async () => {
    const t = await termin("Privathaftpflicht", [item("Privathaftpflicht", "Komfort", 6.12, ["Schlüsselverlust"])]);
    const info = (await ladeBeratungsdoku(t.id, ctx(), T0))!;
    expect(info.vorschlag).toBeNull(); // Testumgebung ohne KI_EU_*
    const create = vi.fn(async () => ({ content: [{ type: "text", text: "GRÜNDE:\n• Das Fahrrad ist mitversichert, Schlüsselverlust ist enthalten." }] }));
    const r = await gruendeVorschlag(t.id, ctx(), info.entwurf.wuensche, { konfig: EU, client: { messages: { create } } });
    expect(r).toEqual({ ok: true, gruende: "• Das Fahrrad ist mitversichert, Schlüsselverlust ist enthalten.", strikt: false });
    const gesendet = JSON.stringify((create.mock.calls[0] as unknown[])[0]);
    expect(gesendet).toContain("Allianz Komfort, 6,12 € im Monat");
    expect(gesendet).toContain("Fahrrad soll mit rein");
    expect(gesendet).not.toContain("Asthma");
  });

  it("Gesundheitssparte: nur Sparte, Versicherer, Tarif und Beitrag gehen an die KI", async () => {
    const t = await termin("Berufsunfähigkeit", [item("Berufsunfähigkeit", "Plus", 78.4, ["Verzicht auf abstrakte Verweisung"])]);
    const create = vi.fn(async () => ({ content: [{ type: "text", text: "• Der Tarif Plus deckt den gewünschten Schutz ab." }] }));
    const r = await gruendeVorschlag(t.id, ctx(), "• Lebenssituation: Familie\n• Fahrrad soll mit rein\n• Rückenprobleme seit 2020", { konfig: EU, client: { messages: { create } } });
    expect(r.ok && r.strikt).toBe(true);
    const gesendet = JSON.stringify((create.mock.calls[0] as unknown[])[0]);
    expect(gesendet).toContain("Berufsunfähigkeit: Allianz Plus, 78,40 € im Monat");
    expect(gesendet).not.toMatch(/Familie|Fahrrad|Rücken|Verweisung/);
  });

  it("ohne gewählten Tarif: kein KI-Aufruf, Hinweis was fehlt", async () => {
    const t = await termin("Hausrat", []);
    const create = vi.fn();
    const r = await gruendeVorschlag(t.id, ctx(), "• Fahrrad soll mit rein", { konfig: EU, client: { messages: { create } } });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Tarif wählen") });
    expect(create).not.toHaveBeenCalled();
  });

  it("Frage: einmal für den Inhaber mit Software und Schalter aus; jede Antwort beendet sie", async () => {
    const c = await makeCustomer({});
    const s = await makeCustomer({ plan: "service" });
    try {
      const owner = { customerId: c.id, teamRole: "owner" };
      expect(await bdFrageFaellig(owner)).toBe(true);
      expect(await bdFrageFaellig({ ...owner, teamRole: "advisor" })).toBe(false);
      expect(await bdFrageFaellig({ ...owner, preview: true })).toBe(false);
      expect(await bdFrageFaellig(null)).toBe(false);
      expect(await bdFrageFaellig({ customerId: s.id, teamRole: "owner" })).toBe(false);
      expect(await bdFrageFaellig({ customerId, teamRole: "owner" })).toBe(false); // schon eingeschaltet
      expect(await setzeBeratungsdoku(owner, false, T0)).toBe(true);
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { beratungsdokuAn: true, beratungsdokuGefragtAt: true } })).toEqual({ beratungsdokuAn: false, beratungsdokuGefragtAt: T0 });
      expect(await bdFrageFaellig(owner)).toBe(false);
    } finally {
      await cleanupCustomer(c.id);
      await cleanupCustomer(s.id);
    }
  });
});
