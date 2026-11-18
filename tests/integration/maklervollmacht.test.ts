import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { decryptBytes } from "@/lib/encryption";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";
import { pruefeEingabe } from "@/lib/maklervollmacht/regeln";
import { ladeSeite, unterschreiben, vollmachtAnlegen, vollmachtFuerLead, vollmachtPdfFuer, widerrufen } from "@/lib/maklervollmacht/server";
import { testPng } from "../helpers/test-png";

const eingabe = (extra: Record<string, string> = {}) => {
  const o: Record<string, string> = {
    vorname: "Anna",
    nachname: "Muster",
    strasse: "Hauptstraße 1",
    plz: "80331",
    ort: "München",
    geburtsdatum: "12.03.1980",
    email: "",
    vertraege: JSON.stringify([
      { versicherer: "Allianz", sparte: "haftpflicht", vertragsnummer: "AS-123" },
      { versicherer: "HUK-Coburg", sparte: "bu", vertragsnummer: "B-9" },
    ]),
    zustimmung: "ja",
    unterschrift: testPng(),
    ...extra,
  };
  const r = pruefeEingabe((k) => o[k] ?? null);
  if (!r.ok) throw new Error(r.fehler);
  return r.eingabe;
};

describe("Maklervollmacht (Datenbank)", () => {
  let makler = "";
  let vertreter = "";
  let leadId = "";
  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    makler = (await makeCustomer({ vermittlerTyp: "makler", leadAddress: "sie" })).id;
    vertreter = (await makeCustomer({ vermittlerTyp: "vertreter" })).id;
    await prisma.erstinformation.create({ data: { customerId: makler, token: `vv-${makler}`, name: "Max Berger", firma: "Berger Makler GmbH", anschrift: "Marktplatz 2, 84028 Landshut", registerNummer: "D-ABCD-EFGHI-12" } });
    leadId = (await prisma.lead.create({ data: { customerId: makler, name: "Anna Muster", status: "Im Gespräch" } })).id;
  });
  afterAll(async () => {
    await cleanupCustomer(makler);
    await cleanupCustomer(vertreter);
  });

  it("nur für Makler; legt einmal an und gibt den offenen Link wieder zurück", async () => {
    const l2 = await prisma.lead.create({ data: { customerId: vertreter, name: "X Y" } });
    expect(await vollmachtAnlegen(l2.id, vertreter)).toMatchObject({ ok: false });
    const a = await vollmachtAnlegen(leadId, makler);
    const b = await vollmachtAnlegen(leadId, makler);
    expect(a.ok && b.ok && a.vollmacht.id === b.vollmacht.id).toBe(true);
    const s = await ladeSeite(a.ok ? a.vollmacht.token : "");
    expect(s).toMatchObject({ zustand: "offen", an: "sie", vorschlag: { vorname: "Anna", nachname: "Muster" } });
    expect(await ladeSeite("x".repeat(30))).toEqual({ zustand: "ungueltig" });
  });

  it("unterschreiben: gespeichert, PDF verschlüsselt, Verlauf; zweites Mal abgelehnt", async () => {
    const v = await prisma.maklervollmacht.findFirstOrThrow({ where: { leadId } });
    const r = await unterschreiben(v.token, eingabe({ gesundheit: "ja" }), { ip: "203.0.113.7", ua: "Testgerät" });
    expect(r).toEqual({ ok: true, mailGesendet: false });
    const s = await prisma.maklervollmacht.findUniqueOrThrow({ where: { id: v.id } });
    expect(s).toMatchObject({ status: "unterschrieben", gesundheit: true, textVersion: "maklervollmacht-2026-11-18", signedIp: "203.0.113.7" });
    expect(decryptBytes(s.pdf!).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await prisma.leadHistory.count({ where: { leadId, text: { contains: "Maklervollmacht unterschrieben" } } })).toBe(1);
    expect(await unterschreiben(v.token, eingabe(), { ip: null, ua: null })).toMatchObject({ ok: false });
    expect(await ladeSeite(v.token)).toMatchObject({ zustand: "fertig" });
    // Kundenakte: Versicherer je einmal, Schreiben je Versicherer als PDF
    const k = await vollmachtFuerLead(leadId, makler);
    expect(k?.versicherer).toEqual(["Allianz", "HUK-Coburg"]);
    const pdf = await vollmachtPdfFuer(v.id, makler, "HUK-Coburg");
    expect(pdf?.name).toMatch(/^Uebertragung-HUK-Coburg-Muster-/);
    expect(Buffer.from(pdf!.pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(await vollmachtPdfFuer(v.id, vertreter, null)).toBeNull();
    expect(await vollmachtPdfFuer(v.id, makler, "Unbekannt AG")).toBeNull();
  });

  it("abgelaufener Link (14 Tage) und Widerruf", async () => {
    const l = await prisma.lead.create({ data: { customerId: makler, name: "Bernd Alt" } });
    const a = await vollmachtAnlegen(l.id, makler);
    if (!a.ok) throw new Error();
    await prisma.maklervollmacht.update({ where: { id: a.vollmacht.id }, data: { createdAt: new Date(Date.now() - 15 * 86_400_000) } });
    expect(await ladeSeite(a.vollmacht.token)).toMatchObject({ zustand: "abgelaufen" });
    expect(await unterschreiben(a.vollmacht.token, eingabe(), { ip: null, ua: null })).toMatchObject({ ok: false });
    // abgelaufen → neuer Link
    const b = await vollmachtAnlegen(l.id, makler);
    expect(b.ok && b.vollmacht.id !== a.vollmacht.id).toBe(true);
    expect(await widerrufen(b.ok ? b.vollmacht.id : "", makler, null)).toBe(true);
    expect(await ladeSeite(b.ok ? b.vollmacht.token : "")).toEqual({ zustand: "ungueltig" });
  });
});
