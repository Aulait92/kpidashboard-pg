// Erstanschreiben v10/v11 (Ole, 19.11.2026): Knopf auf die feste erste Frage (Vorlage oder Freitext, Fassung a oder b)
// wird sofort im Feld der Frage festgehalten, der Assistent bekommt einen Hinweis und fragt nicht erneut (knopf.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleButtonReply } from "@/lib/whatsapp/knopf";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

describe("Knopf auf die feste erste Frage (v10/v11)", () => {
  let customerId = "";
  let n = 0;

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(async () => {
    await cleanupCustomer(customerId);
  });

  async function chat(purpose: string, body: string, angaben?: Record<string, string>) {
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: `4917900000${String(++n).padStart(3, "0")}`, ...(angaben ? { qualificationData: angaben } : {}) } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", kind: "template", body, purpose, sentBy: "system" } });
    return conv.id;
  }

  it("TKV Vorlage (a): „Nur Operationen“ → tarifwunsch „nur OP-Schutz“, Hinweis an den Assistenten", async () => {
    const id = await chat("outreach_tkv", "[Erstinformation als PDF]\nHallo Herr Pan, schön, dass Sie Minka gut absichern möchten 🐾 *Was soll abgesichert sein?*\n\nKI-Assistent", { tier: "Katze Minka" });
    const r = await handleButtonReply(id, { kind: "button", text: "Nur Operationen", payload: "Nur Operationen" });
    expect(r.handled).toBe(false);
    expect(r.hint).toContain("angaben.tarifwunsch = „nur OP-Schutz“");
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    // bisherige Angaben bleiben erhalten
    expect(conv.qualificationData).toEqual({ tier: "Katze Minka", tarifwunsch: "nur OP-Schutz" });
    const log = await prisma.message.findFirstOrThrow({ where: { conversationId: id, direction: "internal", kind: "qualification" } });
    expect(JSON.parse(log.body ?? "{}")).toEqual({ angaben: { tarifwunsch: "nur OP-Schutz" }, via: "erstfrage_knopf" });
  });

  it("TKV Freitext (b, interaktiv): „Auch Behandlungen“ bzw. „Noch unsicher“", async () => {
    const id = await chat("outreach_tkv", "Hallo Peter, *was soll für Minka abgesichert sein?* 🐾\n\n_KI-Assistent_");
    await handleButtonReply(id, { kind: "interactive", text: "Auch Behandlungen", payload: "Auch Behandlungen" });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id } })).qualificationData).toEqual({ tarifwunsch: "volle Krankenversicherung (auch Tierarztbehandlung)" });
    await handleButtonReply(id, { kind: "interactive", text: "Noch unsicher", payload: "Noch unsicher" });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id } })).qualificationData).toEqual({ tarifwunsch: "offen" });
  });

  it("Zahn neutral, PKV Beruf; fremder Knopf bzw. getippt: nichts festgehalten", async () => {
    const zahn = await chat("outreach_zahn", "Hallo, *was ist Ihnen bei der Zahnzusatzversicherung am wichtigsten?* Danke für Ihre Anfrage!");
    await handleButtonReply(zahn, { kind: "button", text: "Starker Zahnersatz" });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: zahn } })).qualificationData).toEqual({ tarifwunsch: "Tarif mit starkem Zahnersatz-Baustein" });
    const pkv = await chat("outreach_pkv", "Hallo, danke für Ihre Anfrage zur privaten Krankenversicherung! *Wie sind Sie beruflich aufgestellt?*");
    expect((await handleButtonReply(pkv, { kind: "button", text: "Katze" })).hint).toBeUndefined();
    expect((await handleButtonReply(pkv, { kind: "text", text: "Beamter" })).hint).toBeUndefined();
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: pkv } })).qualificationData).toBeNull();
    await handleButtonReply(pkv, { kind: "button", text: "Beamter" });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: pkv } })).qualificationData).toEqual({ beruf: "Beamter" });
    // ältere Fassung (v9) im Chat: Knopf wird nicht als v10-Antwort gedeutet
    const alt = await chat("outreach_pkv", "Hallo, danke für Ihre Anfrage zur privaten Krankenversicherung! *Wie sind Sie aktuell beruflich aufgestellt?*");
    expect((await handleButtonReply(alt, { kind: "button", text: "Beamter" })).hint).toBeUndefined();
  });
});
