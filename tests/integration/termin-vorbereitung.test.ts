// Terminvorbereitung: Aufgabe auf „Heute“ (36 Std. vorher bis abgehakt), Sichtbereich, Daten aus Lead und Chat.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { angeboteSpeichern, auslesenUndSpeichern, bausteinUmschalten, kundenlinkBeenden, kundenlinkErstellen, kundenlinkStand, loadKundenPraesentation, tarifUmschalten, listVorbereitungen, loadAngebote, loadPraesentation, loadVorbereitung, setPrepared } from "@/lib/termin-vorbereitung-server";
import { loadLogoStand, logoBestaetigen, logoEntfernen, logoHochladen } from "@/lib/branding-logo-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const HOUR = 60 * 60 * 1000;

describe("Terminvorbereitung", () => {
  let customerId = "";
  let otherId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: "Agentur Susanne Meier" })).id;
    otherId = (await makeCustomer()).id;
  });
  afterAll(async () => {
    await cleanupCustomer(customerId);
    await cleanupCustomer(otherId);
  });

  it("listet Termine der nächsten 36 Std. bis „Vorbereitet“; lädt Angaben aus Formular und Chat", async () => {
    const now = new Date();
    const lead = await prisma.lead.create({
      data: { customerId, name: "Julia Schneider", phone: "4915133330001", source: "Privatschutz", formData: [{ label: "Versicherungsinteresse", value: "Hausratversicherung" }] },
    });
    const conv = await prisma.conversation.create({
      data: { customerId, leadId: lead.id, contactPhone: "4915133330001", qualificationSummary: "Möchte Hausrat.", qualificationData: { geburt: "22.08.1992", wohnflaeche: "78 m²" } },
    });
    const soon = await prisma.appointment.create({ data: { customerId, leadId: lead.id, conversationId: conv.id, mode: "phone", status: "booked", startsAt: new Date(now.getTime() + 20 * HOUR) } });
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "phone", status: "booked", startsAt: new Date(now.getTime() + 72 * HOUR) } });
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "phone", status: "cancelled", startsAt: new Date(now.getTime() + 5 * HOUR) } });
    const ctx = { customerId, userId: null, teamRole: "owner" as const };

    const list = await listVorbereitungen(ctx, now);
    expect(list.map((t) => t.id)).toEqual([soon.id]);
    expect(list[0]).toMatchObject({ name: "Julia Schneider", produkt: "Privatschutz" });

    const d = await loadVorbereitung(soon.id, ctx);
    expect(d?.zusammenfassung).toBe("Möchte Hausrat.");
    expect(d?.termin.berater).toBe("Susanne Meier");
    expect(d?.formular[0].label).toBe("Versicherungsinteresse");

    // fremder Kunde sieht den Termin nicht
    expect(await loadVorbereitung(soon.id, { customerId: otherId, userId: null, teamRole: "owner" })).toBeNull();
    expect(await setPrepared(soon.id, { customerId: otherId, userId: null, teamRole: "owner" }, true)).toBe(false);

    expect(await setPrepared(soon.id, ctx, true)).toBe(true);
    expect(await listVorbereitungen(ctx, now)).toHaveLength(0);
    expect(await setPrepared(soon.id, ctx, false)).toBe(true);
    expect(await listVorbereitungen(ctx, now)).toHaveLength(1);
  });

  it("Angebote: speichern, bestätigen, Präsentation mit Allianz-Marke; Auslesen nur für Testkunden", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Max Weber", phone: "4915133330002", source: "Privatschutz" } });
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", status: "booked", startsAt: new Date(Date.now() + 10 * HOUR) } });
    const ctx = { customerId, userId: null, teamRole: "owner" as const };
    // Kein Testkunde → Auslesen gesperrt (Datenschutz), von Hand eintragen geht
    const r = await auslesenUndSpeichern(appt.id, ctx);
    expect(r.ok).toBe(false);
    expect(await angeboteSpeichern(appt.id, ctx, { items: [{ sparte: "Hausrat", tarif: "Komfort", beitragMonat: 8.2, empfohlen: true }] }, false)).toBe(true);
    let p = await loadPraesentation(appt.id, ctx);
    expect(p?.angeboteBestaetigt).toBe(false);
    expect(p?.folien.find((f) => f.id === "empfehlung")?.html).toContain("im Gespräch");
    await prisma.customer.update({ where: { id: customerId }, data: { name: "Allianz Agentur Lohmann" } });
    expect(await angeboteSpeichern(appt.id, ctx, (await loadAngebote(appt.id, ctx))!.angebote, true)).toBe(true);
    p = await loadPraesentation(appt.id, ctx);
    expect(p?.angeboteBestaetigt).toBe(true);
    expect(p?.marke.gesellschaft).toBe("Allianz");
    expect(p?.folien.find((f) => f.id === "beitrag")?.html).toContain("8,20");
    expect(p?.folien.find((f) => f.id === "empfehlung")?.html).not.toContain("8,20");
    expect(await loadPraesentation(appt.id, { customerId: otherId, userId: null, teamRole: "owner" })).toBeNull();
  });

  it("Logo: hochladen, erst nach Bestätigung auf den Folien, entfernen", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Lea Logo", phone: "4915133330003", source: "Privatschutz" } });
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", status: "booked", startsAt: new Date(Date.now() + 10 * HOUR) } });
    const ctx = { customerId, userId: null, teamRole: "owner" as const };
    const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" onload="x()"><rect width="200" height="60" fill="#003781"/></svg>`);
    expect((await logoHochladen(customerId, "logo.svg", new TextEncoder().encode("kein bild"))).ok).toBe(false);
    expect((await logoHochladen(customerId, "logo.svg", svg)).ok).toBe(true);
    let s = await loadLogoStand(customerId);
    expect(s.bestaetigt).toBe(false);
    expect(s.dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(s.dataUri!.split(",")[1], "base64").toString()).not.toContain("onload");
    expect((await loadPraesentation(appt.id, ctx))?.marke.logoUrl).toBeNull();
    expect(await logoBestaetigen(customerId)).toBe(true);
    s = await loadLogoStand(customerId);
    expect(s.bestaetigt).toBe(true);
    const p = await loadPraesentation(appt.id, ctx);
    expect(p?.marke.logoUrl).toBe(s.dataUri);
    expect(p?.folien[0].html).toContain("titellogo");
    await logoEntfernen(customerId);
    expect((await loadPraesentation(appt.id, ctx))?.marke.logoUrl).toBeNull();
    expect(await logoBestaetigen(customerId)).toBe(false);
  });

  it("Bausteine im Termin umschalten: nur bestätigte Angebote, gespeichert, neue Folien", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Bea Baustein", phone: "4915133330004", source: "Tierkranken" } });
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", status: "booked", startsAt: new Date(Date.now() + 10 * HOUR) } });
    const ctx = { customerId, userId: null, teamRole: "owner" as const };
    const daten = { items: [{ sparte: "Tierkranken", beitragMonat: 14.2, empfohlen: true, bausteine: [{ name: "Zahnbehandlung", beitrag: 4.1 }] }] };
    await angeboteSpeichern(appt.id, ctx, daten, false);
    expect(await bausteinUmschalten(appt.id, ctx, 0, 0, false)).toBeNull();
    await angeboteSpeichern(appt.id, ctx, daten, true);
    const p = await bausteinUmschalten(appt.id, ctx, 0, 0, false);
    expect(p?.folien.find((f) => f.id === "beitrag")?.html).toContain("14,20");
    expect((await loadAngebote(appt.id, ctx))?.angebote.items[0].bausteine[0].aktiv).toBe(false);
    expect((await loadAngebote(appt.id, ctx))?.bestaetigt).not.toBeNull();
    expect(await bausteinUmschalten(appt.id, { customerId: otherId, userId: null, teamRole: "owner" }, 0, 0, true)).toBeNull();
  });

  it("Tarif im Termin wählen und Kundenlink: nur Stand, ohne Sprechzettel, läuft ab, beendbar", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Tim Tarif", phone: "4915133330005", source: "Tierhalterhaftpflicht" } });
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", status: "booked", startsAt: new Date(Date.now() + 10 * HOUR) } });
    const ctx = { customerId, userId: null, teamRole: "owner" as const };
    const daten = { items: [
      { sparte: "Tierhalterhaftpflicht", tarif: "Smart", beitragMonat: 6.15 },
      { sparte: "Tierhalterhaftpflicht", tarif: "Komfort", beitragMonat: 8.15, empfohlen: true },
    ] };
    await angeboteSpeichern(appt.id, ctx, daten, false);
    expect(await kundenlinkErstellen(appt.id, ctx)).toBeNull();
    await angeboteSpeichern(appt.id, ctx, daten, true);
    const p = await tarifUmschalten(appt.id, ctx, 0);
    expect(p?.folien.find((f) => f.id === "beitrag")?.html).toContain("6,15");

    const now = new Date();
    const l = await kundenlinkErstellen(appt.id, ctx, now);
    expect(l?.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect((await kundenlinkErstellen(appt.id, ctx, now))?.token).toBe(l!.token);
    expect((await kundenlinkStand(appt.id, ctx))?.token).toBe(l!.token);
    const k = await loadKundenPraesentation(l!.token);
    expect(k?.name).toBe("Tim Tarif");
    expect(k?.folien.find((f) => f.id === "beitrag")?.html).toContain("6,15");
    expect(JSON.stringify(k)).not.toContain("notizen");
    expect(await loadKundenPraesentation(l!.token, new Date(now.getTime() + 15 * 24 * HOUR))).toBeNull();
    expect(await loadKundenPraesentation("x".repeat(32))).toBeNull();
    expect(await kundenlinkErstellen(appt.id, { customerId: otherId, userId: null, teamRole: "owner" })).toBeNull();
    expect(await kundenlinkBeenden(appt.id, ctx)).toBe(true);
    expect(await loadKundenPraesentation(l!.token)).toBeNull();
  });
});
