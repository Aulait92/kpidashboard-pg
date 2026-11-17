// Lead-Stammdaten im Kontakt korrigieren (Ole, 14.11.2026): Prüfung, Verlauf, WhatsApp-Chat zieht um,
// Dubletten-Hinweis, Formularantworten bleiben, Anrede aus der Korrektur.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { applyStammdatenToFields, currentStammdaten, diffText, formWithOverrides, parseStammdaten, saveLeadStammdaten } from "@/lib/lead-stammdaten";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

let customerId = "";

describe("Lead-Stammdaten bearbeiten", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("prüft und normalisiert Eingaben", () => {
    expect(parseStammdaten({ firstName: " Anna ", phone: "0171 123 4567", email: " Anna@Example.DE " })).toMatchObject({
      ok: true,
      data: { firstName: "Anna", phone: "491711234567", email: "anna@example.de", salutation: null },
    });
    expect(parseStammdaten({ firstName: "A", phone: "+43 660 1234567", salutation: "Frau" })).toMatchObject({ ok: true, data: { phone: "436601234567", salutation: "Frau" } });
    expect(parseStammdaten({ firstName: "A", phone: "12" })).toMatchObject({ ok: false });
    expect(parseStammdaten({ firstName: "A", email: "anna@" })).toMatchObject({ ok: false });
    expect(parseStammdaten({ firstName: "", lastName: "" })).toMatchObject({ ok: false });
  });

  it("Verlaufstext nennt alt und neu, ohne Gedankenstriche", () => {
    const base = { salutation: null, firstName: "Anna", lastName: "Beispiel", phone: "4915100000001", email: null, weitereEmails: "", street: "", zip: "", city: "" };
    const t = diffText(base, { ...base, phone: "4917612345678", salutation: "Frau" });
    expect(t).toEqual(["Anrede geändert von leer auf Frau", "Telefon geändert von +4915100000001 auf +4917612345678"]);
    expect(t.join(" ")).not.toMatch(/[–—]/);
  });

  it("speichert, protokolliert, zieht den WhatsApp-Chat um und lässt die Formularantworten unverändert", async () => {
    const form = [
      { label: "Vorname", value: "Ana" },
      { label: "Nachname", value: "Beispeil" },
      { label: "Rasse", value: "Maine Coon" },
    ];
    const lead = await prisma.lead.create({ data: { customerId, name: "Ana Beispeil", phone: "4915100000001", email: "anna@example.com", formData: form } });
    const conv = await prisma.conversation.create({
      data: { customerId, leadId: lead.id, contactPhone: "4915100000001", contactName: "Ana Beispeil", windowExpiresAt: new Date(Date.now() + 3600_000) },
    });
    const other = await prisma.lead.create({ data: { customerId, name: "Doppelt", phone: "4917612345678" } });

    const r = await saveLeadStammdaten({
      leadId: lead.id,
      customerId,
      userId: null,
      input: { salutation: "Frau", firstName: "Anna", lastName: "Beispiel", phone: "0176 12345678", email: "ole.kannapinn+demo@gmail.com", street: "Hauptstr. 1", zip: "10115", city: "Berlin" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toContain("Telefon geändert von +4915100000001 auf +4917612345678");
    expect(r.changed).toContain("Vorname geändert von Ana auf Anna");
    expect(r.hinweise.join(" ")).toMatch(/WhatsApp-Chat läuft ab jetzt über die neue Nummer/);
    expect(r.hinweise.join(" ")).toMatch(/Dublette/);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after).toMatchObject({ name: "Anna Beispiel", phone: "4917612345678", email: "ole.kannapinn+demo@gmail.com" });
    expect(after.formData).toEqual(form);
    expect(after.contactEditedAt).not.toBeNull();

    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c).toMatchObject({ contactPhone: "4917612345678", contactName: "Anna Beispiel", contactEmail: "ole.kannapinn+demo@gmail.com", windowExpiresAt: null });

    const h = await prisma.leadHistory.findFirstOrThrow({ where: { leadId: lead.id, kind: "stammdaten" } });
    expect(h.text).toMatch(/E-Mail geändert von anna@example.com auf ole.kannapinn\+demo@gmail.com/);

    // Anrede und Name aus der Korrektur, nicht aus dem Formular
    expect(kontaktFromLead(after)).toMatchObject({ firstName: "Anna", lastName: "Beispiel", salutation: "Frau" });
    expect(currentStammdaten(after)).toMatchObject({ street: "Hauptstr. 1", zip: "10115", city: "Berlin" });
    const fields = applyStammdatenToFields({ Vorname: "Ana", Telefonnummer: "+4915100000001", Rasse: "Maine Coon" }, after);
    expect(fields).toMatchObject({ Vorname: "Anna", Nachname: "Beispiel", Telefonnummer: "+4917612345678", Anrede: "Frau", Ort: "Berlin", Rasse: "Maine Coon" });

    // Ohne Änderung: nichts protokollieren
    const again = await saveLeadStammdaten({
      leadId: lead.id,
      customerId,
      userId: null,
      input: { salutation: "Frau", firstName: "Anna", lastName: "Beispiel", phone: "+49 176 12345678", email: "ole.kannapinn+demo@gmail.com", street: "Hauptstr. 1", zip: "10115", city: "Berlin" },
    });
    expect(again).toEqual({ ok: true, changed: [], hinweise: [] });
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, kind: "stammdaten" } })).toBe(1);
    await prisma.lead.delete({ where: { id: other.id } });
  });

  it("weitere E-Mail bearbeiten: speichern, ohne Feld unverändert lassen, Haupt-E-Mail nie doppelt", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Eva Weiter", email: "eva@example.com", weitereEmails: ["eva.alt@example.com"] } });
    const base = { firstName: "Eva", lastName: "Weiter", email: "eva@example.com" };
    // Ohne Feld (z. B. älteres Formular): weitere Adressen bleiben
    expect(await saveLeadStammdaten({ leadId: lead.id, customerId, userId: null, input: { ...base, city: "Köln" } })).toMatchObject({ ok: true });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).weitereEmails).toEqual(["eva.alt@example.com"]);
    // Bearbeitet: zweite Adresse dazu, Verlauf nennt die Änderung
    const r = await saveLeadStammdaten({ leadId: lead.id, customerId, userId: null, input: { ...base, city: "Köln", weitereEmails: "eva.alt@example.com, EVA2@example.com" } });
    expect(r).toMatchObject({ ok: true, changed: ["Weitere E-Mail geändert von eva.alt@example.com auf eva.alt@example.com, eva2@example.com"] });
    // Haupt-E-Mail auf eine der weiteren: dort nicht doppelt
    await saveLeadStammdaten({ leadId: lead.id, customerId, userId: null, input: { ...base, email: "eva2@example.com", city: "Köln", weitereEmails: "eva.alt@example.com, eva2@example.com" } });
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { email: true, weitereEmails: true } })).toEqual({ email: "eva2@example.com", weitereEmails: ["eva.alt@example.com"] });
  });

  it("fremder Kunde kann nicht bearbeiten", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Fremd Test" } });
    const r = await saveLeadStammdaten({ leadId: lead.id, customerId: "anderer-kunde", userId: null, input: { firstName: "X" } });
    expect(r).toMatchObject({ ok: false });
  });

  it("formWithOverrides lässt Formular ohne Korrektur unverändert", () => {
    const form = [{ label: "Anrede", value: "Herr" }];
    expect(formWithOverrides(form, null)).toBe(form);
  });
});
