// Pilot „Beiträge rechnen“ (Ole, 16.11.2026; docs/preise-pilot.md): Schalter je Gesellschaft und Sparte (Standard aus,
// Änderungsprotokoll), Richtwerte im gespeicherten Termin und Hinweis auf der Präsentationsseite.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { ladePreisPilot, preisPilotSetzen } from "@/lib/preise/pilot-server";
import { tarifauswahlSpeichern, ungepruefteSparten } from "@/lib/tarifauswahl-server";
import { preiseUebernehmen, startAuswahl } from "@/lib/tarifauswahl";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const k = ladeTarifkatalog(path.join(__dirname, "..", "fixtures", "tarifkatalog"));
let customerId = "";
let ctx: { customerId: string; userId: string | null; teamRole: "owner" | "advisor" };
let vorher: string[] | null = null;

describe("Beiträge rechnen (Datenbank)", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: `Allianz Agentur Preis ${Date.now()}` })).id;
    const u = await makeBuyer(customerId, "owner");
    ctx = { customerId, userId: u.id, teamRole: "owner" };
    vorher = (await prisma.preisPilot.findUnique({ where: { id: "default" } }))?.aktiv ?? null;
  });
  afterAll(async () => {
    // Zustand der gemeinsamen Testdatenbank wiederherstellen
    if (vorher) await prisma.preisPilot.update({ where: { id: "default" }, data: { aktiv: vorher } });
    else await prisma.preisPilot.deleteMany({ where: { id: "default" } });
    await cleanupCustomer(customerId);
  });

  it("Schalter: Standard aus, an und aus je Sparte, unbekannte abgelehnt, im Änderungsprotokoll", async () => {
    await prisma.preisPilot.deleteMany({ where: { id: "default" } });
    expect(await ladePreisPilot()).toEqual([]);
    expect(await preisPilotSetzen("allianz/kfz", true)).toEqual({ ok: false, error: "Unbekannte Sparte." });
    expect(await preisPilotSetzen("allianz/hausrat", true, { email: "ole@test", role: "ADMIN" })).toEqual({ ok: true, aktiv: ["allianz/hausrat"] });
    await preisPilotSetzen("allianz/katze-op", true, { email: "ole@test", role: "ADMIN" });
    expect(await ladePreisPilot()).toEqual(["allianz/katze-op", "allianz/hausrat"]);
    await preisPilotSetzen("allianz/katze-op", false, { email: "ole@test", role: "ADMIN" });
    expect(await ladePreisPilot()).toEqual(["allianz/hausrat"]);
    const log = await prisma.auditLog.findFirst({ where: { action: "preise.pilot", entityId: "allianz/katze-op" }, orderBy: { at: "desc" } });
    expect(log?.details).toMatchObject({ schluessel: "allianz/katze-op", an: false });
  });

  it("Richtwert bleibt im gespeicherten Termin, bis er bestätigt ist", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Verena Martin", source: "Privatschutz" } });
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "phone", startsAt: new Date(Date.now() + 86400000), status: "booked" } });
    const a = startAuswahl(k, ["hausrat"], { rolle: "vertreter", gesellschaften: ["allianz"] });
    const r = preiseUebernehmen(
      a,
      [{ sparte: "Hausrat", gesellschaft: "Allianz", tarif: "Hausrat Komfort", beitragMonat: 11.4, selbstbeteiligung: null, leistungen: [], ausschluesse: [], empfohlen: false, gewaehlt: false, merkmale: [], bausteine: [] }],
      { pruefen: () => true },
    );
    const s = await tarifauswahlSpeichern(appt.id, ctx, r.auswahl);
    expect(s.ok).toBe(true);
    expect(await ungepruefteSparten(appt.id, ctx)).toEqual([a.sparten[0].label]);
    // Bestätigt (Markierung entfernt) und gespeichert: kein Hinweis mehr
    const bestaetigt = structuredClone(r.auswahl);
    for (const t of bestaetigt.sparten[0].tarife) delete t.preisPruefen;
    await tarifauswahlSpeichern(appt.id, ctx, bestaetigt);
    expect(await ungepruefteSparten(appt.id, ctx)).toEqual([]);
    // Fremder Termin: nichts
    expect(await ungepruefteSparten(appt.id, { customerId: "gibtsnicht", userId: null, teamRole: "owner" })).toEqual([]);
  });
});
