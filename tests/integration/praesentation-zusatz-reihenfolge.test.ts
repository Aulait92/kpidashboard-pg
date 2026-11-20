// Cross-Selling im Termin (Ole, 18.11.2026) mit Datenbank: „Mit anschauen“ speichert die Reihenfolge des Hinzufügens
// (offersJson.zusatzFolge); Präsentation nach Neuladen, PDF-Daten und Kundenlink zeigen dieselbe Folienfolge.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanAngebote } from "@/lib/angebote-daten";
import { demoAngebote } from "@/lib/demo-beratung";
import { kundenlinkErstellen, loadKundenPraesentation, loadPraesentation, sparteUmschalten } from "@/lib/termin-vorbereitung-server";
import { cleanupCustomer, makeBuyer, makeCustomer, nurFassungB, requireTestDb } from "./db";

// Fassung vor dem 19.11.2026: nur Haftpflicht im Vergleich, die übrigen Sparten per „Mit anschauen“ (diese Tests prüfen
// Paketwahl und Reihenfolge der hinzugefügten Sparten; die Live-Demo hat seitdem drei Sparten im Vergleich)
const nurHaftpflicht = () => {
  const d = demoAngebote();
  return { ...d, items: d.items.map((i) => (i.kombi?.sparte !== "haftpflicht" ? { ...i, zusatz: true, gewaehlt: false } : i)) };
};

// Prüft Fassung B (Standard) der Präsentation
nurFassungB();

let customerId = "";
let ctx: { customerId: string; userId: string | null; teamRole: "owner" | "advisor" };

async function termin() {
  const lead = await prisma.lead.create({ data: { customerId, name: "Dominik Schmid", source: "Privatschutz" } });
  return prisma.appointment.create({
    data: {
      customerId,
      leadId: lead.id,
      mode: "video",
      startsAt: new Date(Date.now() + 86400000),
      status: "booked",
      offersJson: nurHaftpflicht() as unknown as Prisma.InputJsonValue,
      offersConfirmedAt: new Date(),
    },
  });
}

const idx = (sparte: string) => demoAngebote().items.findIndex((i) => i.sparte === sparte);
const ids = (fs: { id: string }[]) => fs.map((f) => f.id);

describe("Präsentation: Reihenfolge hinzugefügter Produkte (Datenbank)", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: `Agentur Folienfolge ${Date.now()}` })).id;
    const u = await makeBuyer(customerId, "owner");
    ctx = { customerId, userId: u.id, teamRole: "owner" };
  });
  afterAll(() => cleanupCustomer(customerId));

  it("0 Produkte: Kundenlink wie Präsentation, Überblick direkt vor dem Beitrag", async () => {
    const appt = await termin();
    const p = (await loadPraesentation(appt.id, ctx))!;
    const x = ids(p.folien);
    expect(x.indexOf("ueberblick")).toBe(x.indexOf("beitrag") - 1);
    const link = (await kundenlinkErstellen(appt.id, ctx))!;
    expect(ids((await loadKundenPraesentation(link.token))!.folien)).toEqual(x);
  });

  it("1 und 2 Produkte: hinter dem Überblick in Reihenfolge des Hinzufügens, gespeichert, nach Neuladen und im Kundenlink gleich", async () => {
    const appt = await termin();
    const eins = (await sparteUmschalten(appt.id, ctx, idx("Rechtsschutz")))!;
    let x = ids(eins.folien);
    expect(x.indexOf("vergleich-rechtsschutz-2")).toBe(x.indexOf("ueberblick") + 1);
    expect(x.indexOf("beitrag")).toBe(x.indexOf("vergleich-rechtsschutz-2") + 1);

    const zwei = (await sparteUmschalten(appt.id, ctx, idx("Hausrat")))!;
    x = ids(zwei.folien);
    const u = x.indexOf("ueberblick");
    // Hausrat steht im Angebot vor Rechtsschutz, kam aber als zweites dazu
    expect(x.slice(u, u + 4)).toEqual(["ueberblick", "vergleich-rechtsschutz-2", "vergleich-hausrat-1", "beitrag"]);
    expect(x.at(-1)).toBe("danke");
    expect(zwei.folien.find((f) => f.id === "beitrag")!.html).toContain("Kombi-Rabatt");

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { offersJson: true } });
    expect(cleanAngebote(row.offersJson).zusatzFolge).toEqual(["Rechtsschutz", "Hausrat"]);
    // Neuladen der Seite
    expect(ids((await loadPraesentation(appt.id, ctx))!.folien)).toEqual(x);
    // Kundenlink (öffentliche Ansicht)
    const link = (await kundenlinkErstellen(appt.id, ctx))!;
    expect(ids((await loadKundenPraesentation(link.token))!.folien)).toEqual(x);
  });
});
