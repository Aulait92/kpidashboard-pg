// Angebote auslesen (Art. 9 DSGVO, Zusage im AVV): Erkennt die KI eine Gesundheitssparte (hier „Zahnzusatz“), wird das
// Ergebnis verworfen, nichts gespeichert, der Vermittler auf die Handeingabe verwiesen und das Ereignis protokolliert.
// Beide Wege: „Angebote auslesen“ (Terminvorbereitung) und „Angebot ablegen“ (neue Terminvorbereitung, Tarifkatalog).
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ items: [] as unknown[], calls: 0 }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => {
        h.calls++;
        return { content: [{ type: "tool_use", id: "t1", name: "save_angebote", input: { items: h.items } }] };
      },
    };
  },
}));

import { prisma } from "@/lib/prisma";
import { auslesenUndSpeichern, loadVorbereitung } from "@/lib/termin-vorbereitung-server";
import { ladeTarifvorbereitung, preiseAuslesen } from "@/lib/tarifauswahl-server";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const ZAHN = [{ sparte: "Zahnzusatz", gesellschaft: "Barmenia", tarif: "Mehr Zahn 100", beitragMonat: 24.9, bausteine: [], selbstbeteiligung: null, leistungen: ["100 % Zahnersatz"], ausschluesse: [] }];
const HAUSRAT = [{ sparte: "Hausrat", gesellschaft: "Allianz", tarif: "Komfort", beitragMonat: 8.2, bausteine: [], selbstbeteiligung: null, leistungen: ["Neuwert"], ausschluesse: [] }];
const ALT = { items: [{ sparte: "Hausrat", tarif: "Alt", beitragMonat: 5, empfohlen: true }] };

let customerId = "";
let ctx: { customerId: string; userId: string | null; teamRole: "owner" | "advisor" };
const ENV = { ...process.env };

async function termin() {
  const lead = await prisma.lead.create({ data: { customerId, name: "Tina Test", source: "Privatschutz" } });
  await prisma.leadFile.create({
    data: { leadId: lead.id, customerId, kind: "angebot", fileName: "angebot.pdf", contentType: "application/pdf", size: 4, data: Buffer.from("%PDF") },
  });
  return prisma.appointment.create({
    data: { customerId, leadId: lead.id, mode: "phone", status: "booked", startsAt: new Date(Date.now() + 86400000), offersJson: ALT },
  });
}

describe("Angebote auslesen: Gesundheitssparten werden verworfen", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.ANGEBOTE_AUSLESEN;
    customerId = (await makeCustomer({ name: `Agentur Gesundheit ${Date.now()}` })).id;
    const u = await makeBuyer(customerId, "owner");
    ctx = { customerId, userId: u.id, teamRole: "owner" };
  });
  afterAll(async () => {
    process.env = { ...ENV };
    await prisma.auditLog.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("Zahnzusatz: offersJson bleibt unverändert, Fehlertext erscheint, Ereignis im Protokoll", async () => {
    const appt = await termin();
    h.items = ZAHN;
    const r = await auslesenUndSpeichern(appt.id, ctx);
    expect(h.calls).toBe(1);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("Angebote mit Gesundheitsangaben (Zahnzusatz) lesen wir nicht aus, bitte tragen Sie sie von Hand ein.");
    const nachher = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { offersJson: true, offersConfirmedAt: true } });
    expect(nachher.offersJson).toEqual(ALT);
    const log = await prisma.auditLog.findFirst({ where: { customerId, action: "angebote.gesundheit_verworfen", entityId: appt.id } });
    expect(log?.details).toMatchObject({ sparten: ["Zahnzusatz"], weg: "angebote" });
    expect(log?.actorId).toBe(ctx.userId);
  });

  it("Gegenprobe Hausrat: wird gespeichert", async () => {
    const appt = await termin();
    h.items = HAUSRAT;
    const r = await auslesenUndSpeichern(appt.id, ctx);
    expect(r).toEqual({ ok: true, anzahl: 1 });
    const nachher = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { offersJson: true } });
    expect(JSON.stringify(nachher.offersJson)).toContain("Komfort");
  });

  it("Angebot ablegen (neue Terminvorbereitung): keine Preise übernommen, nichts gespeichert", async () => {
    const appt = await termin();
    const k = ladeTarifkatalog(path.join(__dirname, "..", "fixtures", "tarifkatalog"));
    const v = await ladeTarifvorbereitung(appt.id, ctx, (await loadVorbereitung(appt.id, ctx))!, k);
    expect(v).not.toBeNull();
    const vorher = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { offersJson: true, tarifauswahl: true } });
    h.items = ZAHN;
    const r = await preiseAuslesen(appt.id, ctx, v!.auswahl);
    expect(r.ok === false && r.error).toMatch(/^Angebote mit Gesundheitsangaben \(Zahnzusatz\)/);
    const nachher = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { offersJson: true, tarifauswahl: true } });
    expect(nachher).toEqual(vorher);
    expect(await prisma.auditLog.count({ where: { customerId, action: "angebote.gesundheit_verworfen", entityId: appt.id } })).toBe(1);
  });
});
