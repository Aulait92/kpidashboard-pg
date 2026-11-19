// Messung der Beratungspräsentation (Ole, 19.11.2026) mit Datenbank: Folie erreicht und Zusage je Termin nur einmal,
// Variante fest je Lead, Zusage auf der Folie und im Kundenlink, Abschlussquote je Präsentation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { demoAngebote } from "@/lib/demo-beratung";
import { abschlussquoteLaden, ereignisSpeichern, zusageAm } from "@/lib/praesentation-messung";
import { kundenlinkErstellen, kundenlinkTermin, loadKundenPraesentation, loadPraesentation } from "@/lib/termin-vorbereitung-server";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

let customerId = "";
let ctx: { customerId: string; userId: string | null; teamRole: "owner" | "advisor" };

async function termin(name = "Dominik Schmid") {
  const lead = await prisma.lead.create({ data: { customerId, name, source: "Privatschutz" } });
  const appt = await prisma.appointment.create({
    data: { customerId, leadId: lead.id, mode: "video", startsAt: new Date(Date.now() - 3600_000), status: "booked", offersJson: demoAngebote() as unknown as Prisma.InputJsonValue, offersConfirmedAt: new Date() },
  });
  return { lead, appt };
}

describe("Präsentation: Messung und Zusage (Datenbank)", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: `Agentur Messung ${Date.now()}` })).id;
    const u = await makeBuyer(customerId, "owner");
    ctx = { customerId, userId: u.id, teamRole: "owner" };
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Folie und Zusage je Termin nur einmal, Variante fest je Lead", async () => {
    const { lead, appt } = await termin();
    const t = { customerId, appointmentId: appt.id, leadId: lead.id };
    expect(await ereignisSpeichern({ ...t, quelle: "termin", art: "folie", folie: "empfehlung" })).toBe(true);
    expect(await ereignisSpeichern({ ...t, quelle: "termin", art: "folie", folie: "empfehlung" })).toBe(false);
    expect(await ereignisSpeichern({ ...t, quelle: "termin", art: "folie", folie: "<script>" })).toBe(false);
    expect(await zusageAm(appt.id)).toBeNull();
    expect(await ereignisSpeichern({ ...t, quelle: "termin", art: "zusage" })).toBe(true);
    expect(await ereignisSpeichern({ ...t, quelle: "termin", art: "zusage" })).toBe(false);
    expect(await zusageAm(appt.id)).toBeInstanceOf(Date);
    const rows = await prisma.praesentationEreignis.findMany({ where: { appointmentId: appt.id } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.variante))).toEqual(new Set(["B"]));
    // Ohne eingetragenen Test keine Zuteilung im Experiment-Modul (die Zusage-Meldung ist dann ohne Wirkung)
    expect(await prisma.experimentZuteilung.count({ where: { experiment: "praesentation" } })).toBe(0);
  });

  it("Präsentation und Kundenlink kennen Variante, Zusage und Abschluss-Daten", async () => {
    const { lead, appt } = await termin("Julia Neu");
    const p = (await loadPraesentation(appt.id, ctx))!;
    expect(p.variante).toBe("B");
    expect(p.einwaende).toHaveLength(4);
    expect(p.abschluss.produkte).toEqual(["Haftpflicht Komfort"]);
    expect(p.abschluss.summe).toBe(8.4);
    expect(p.folien.map((f) => f.id).includes("risiken")).toBe(false);
    const link = (await kundenlinkErstellen(appt.id, ctx))!;
    const t = (await kundenlinkTermin(link.token))!;
    expect(t).toMatchObject({ appointmentId: appt.id, customerId, leadId: lead.id });
    expect(await kundenlinkTermin("x".repeat(30))).toBeNull();
    await ereignisSpeichern({ ...t, quelle: "kundenlink", art: "zusage" });
    const k = (await loadKundenPraesentation(link.token))!;
    expect(k.zugesagtAm).toBeInstanceOf(Date);
    // Kundenlink ohne Sprechhinweise
    expect(k.folien.every((f) => !("hinweis" in f))).toBe(true);
    expect(k.variante).toBe("B");
    expect(k.folien.find((f) => f.id === "entscheidung")!.html).toContain("✓ Zugesagt");
  });

  it("Abschlussquote je Präsentation: Zusage oder abgeschlossener Kontakt", async () => {
    const { lead, appt } = await termin("Klaus Abschluss");
    await ereignisSpeichern({ customerId, appointmentId: appt.id, leadId: lead.id, quelle: "termin", art: "folie", folie: "beitrag" });
    await prisma.lead.update({ where: { id: lead.id }, data: { closedAt: new Date() } });
    const { appt: ohne, lead: l2 } = await termin("Petra Offen");
    await ereignisSpeichern({ customerId, appointmentId: ohne.id, leadId: l2.id, quelle: "termin", art: "folie", folie: "beitrag" });
    const r = (await abschlussquoteLaden(new Date(Date.now() - 86400_000), customerId))[customerId];
    const summe = (k: "praesentationen" | "abschluesse") => r.A[k] + r.B[k];
    // Termin 1 (Zusage), Klaus (abgeschlossen), Petra (offen); Julia nur Zusage im Link ohne gezeigte Folie
    expect(summe("praesentationen")).toBe(3);
    expect(summe("abschluesse")).toBe(2);
  });
});
