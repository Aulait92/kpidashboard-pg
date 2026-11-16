// KI-Kennzeichnung, Beratungssperre, Erstinformation, Einwilligung im Leadformular, STOPP und Gesundheitsangaben
// (Anwalts-Memo, Ole 15.11.2026): Abläufe gegen die echte Test-Datenbank, 360dialog und Claude nachgebildet.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  script: [] as Array<{ content: unknown[] }>,
  calls: [] as Array<{ system: string; messages: unknown[] }>,
}));

vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (req: { system: string; messages: unknown[] }) => {
        h.calls.push(req);
        return h.script.shift() ?? { content: [{ type: "text", text: "Gern, wann passt es Ihnen?" }] };
      },
    };
  },
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { sendToBuyersOfCustomer } from "@/lib/push";
import { handleInboundPayload, sendWhatsAppMessage } from "@/lib/whatsapp/gateway";
import { sendWhatsAppNotice } from "@/lib/whatsapp/templates";
import { WhatsAppNoConsentError, WhatsAppOptOutError } from "@/lib/whatsapp/stopp";
import { runOutreach } from "@/lib/whatsapp/outreach";
import { ingestLead, type IncomingLead } from "@/lib/lead-intake";
import { saveErstinfo } from "@/lib/erstinformation";
import { saveCustomerProvision } from "@/lib/provision-server";
import { loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };
const API_KEY = "d360-ki-key";
const sent: Array<{ to: string; type: string; text?: { body: string }; template?: { name: string; components?: { parameters: { text: string }[] }[] } }> = [];

function fake360(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/messages")) {
    sent.push(JSON.parse(String(init?.body)));
    return Promise.resolve(new Response(JSON.stringify({ messages: [{ id: `wamid.ki${sent.length}.${Math.random()}` }] }), { status: 200 }));
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

let customerId = "";
let phoneNumberId = "";
let n = 0;
const uid = () => Math.random().toString(36).slice(2, 10);

/** Der Assistent antwortet nur Leads (lib/whatsapp/nur-leads.ts): Kontakt als Lead aus dem Formular anlegen. */
async function leadFor(phone: string) {
  await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, status: "Neuer Lead", outreachAt: new Date(), outreachStatus: "skipped_contact" } });
}

async function inbound(from: string, body: string) {
  await handleInboundPayload({
    entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, contacts: [{ profile: { name: "Julia Schneider" } }], messages: [{ from, id: `wamid.in${++n}.${uid()}`, type: "text", text: { body } }] } }] }],
  });
}
const lastText = () => sent.filter((s) => s.type === "text").at(-1)?.text?.body ?? "";
/** Vorletzte Textnachricht (die letzte ist der Link zur Erstinformation, wenn das PDF nicht möglich ist). */
const prevText = () => sent.filter((s) => s.type === "text").at(-2)?.text?.body ?? "";
const conv = (phone: string) => prisma.conversation.findFirstOrThrow({ where: { customerId, contactPhone: phone }, include: { messages: { orderBy: { createdAt: "asc" } } } });

beforeAll(() => requireTestDb());
beforeEach(async () => {
  process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  process.env.APP_URL = "https://app.example.de";
  sent.length = 0;
  h.script.length = 0;
  h.calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(fake360));
  vi.mocked(sendToBuyersOfCustomer).mockClear();
  // Fester Name (Berater „Susanne Meier“); Reste eines abgebrochenen Laufs vorher entfernen
  await prisma.customer.deleteMany({ where: { name: "Agentur Susanne Meier" } });
  customerId = (await makeCustomer({ name: "Agentur Susanne Meier", leadAddress: "sie" })).id;
  phoneNumberId = `pn-ki-${uid()}`;
  await prisma.whatsAppAccount.create({ data: { customerId, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret(API_KEY), phoneNumberId } });
  await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, outreachDelayMin: 0 } });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.leadSource.deleteMany({ where: { customerId } });
  await prisma.lead.deleteMany({ where: { customerId } });
  await cleanupCustomer(customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

describe("Assistent: KI-Hinweis, Erstinformation, Übergabe an einen Menschen, Beratungssperre", () => {
  it("erste Antwort an einen neuen Kontakt: eine Begrüßung, KI-Assistent mit Nutzen, kein „Mensch“; Erstinformation danach (ohne fertiges PDF als Link), danach nicht wieder", async () => {
    const phone = "4917611110000";
    await leadFor(phone);
    h.script.push({ content: [{ type: "text", text: "Für wen soll die Zahnzusatzversicherung sein?" }] });
    await inbound(phone, "Hallo, ich interessiere mich für eine Zahnzusatz");
    const first = prevText();
    // Erstanschreiben v5 (Ole, 16.11.2026): Lead hat zuerst geschrieben → „danke für Ihre Nachricht“
    expect(first).toBe(
      "Hallo Frau Schneider, danke für Ihre Nachricht!\nIch bin der digitale KI-Assistent von Susanne und helfe Ihnen, schnell einen passenden Gesprächstermin zu finden.\n\nFür wen soll die Zahnzusatzversicherung sein?",
    );
    expect(first).not.toMatch(/Mensch|berate nicht/);
    // Erstinformation unvollständig (kein PDF möglich): Rückfall auf den Link als eigene Nachricht
    const e = await prisma.erstinformation.findUniqueOrThrow({ where: { customerId } });
    expect(lastText()).toBe(`Erstinformation zu Susanne Meier als Versicherungsvermittler: https://app.example.de/erstinformation/${e.token}`);
    // System-Prompt: Hinweis wird vorangestellt, Regeln gegen Beratung und Vermenschlichung
    expect(h.calls[0].system).toContain("Begrüße deshalb nicht und stell dich nicht vor");
    expect(h.calls[0].system).toContain("Gib dich nie als Mensch aus");

    // Zweite Antwort: kein Hinweis mehr; „Was kostet die Zahnzusatz bei der Allianz?“ → Sperre greift
    h.script.push({ content: [{ type: "text", text: "Bei der Allianz kostet die Zahnzusatz etwa 20 € im Monat, das ist günstiger als bei der HUK." }] });
    await inbound(phone, "Was kostet die Zahnzusatz bei der Allianz?");
    const second = lastText();
    expect(second).toBe("Das klärt Susanne Meier im Termin mit Ihnen. Soll ich Ihnen dafür ein paar freie Zeiten vorschlagen?");
    const c = await conv(phone);
    const blocked = c.messages.find((m) => m.kind === "advice_blocked");
    expect(blocked?.direction).toBe("internal");
    expect(JSON.parse(blocked!.body!).original).toContain("Allianz");

    // „Welche BU ist die beste?“ → ebenfalls ersetzt
    h.script.push({ content: [{ type: "text", text: "Die beste BU ist meist die von der Alten Leipziger." }] });
    await inbound(phone, "Welche BU ist die beste?");
    expect(lastText()).toBe("Das klärt Susanne Meier im Termin mit Ihnen. Soll ich Ihnen dafür ein paar freie Zeiten vorschlagen?");
  });

  it("„Bist du ein Bot?“ → wahrheitsgemäße Antwort, Assistent pausiert, Vermittler bekommt eine Mitteilung", async () => {
    const phone = "4917611110001";
    await leadFor(phone);
    await inbound(phone, "Bist du ein Bot?");
    expect(h.calls).toHaveLength(0); // ohne KI beantwortet
    const reply = prevText();
    expect(reply).toMatch(/^Guten Tag Frau Schneider, hier schreibt der digitale KI-Assistent von Agentur Susanne Meier\. Ich bin kein Mensch und berate nicht zu Tarifen\./);
    expect(reply).toContain("meldet sich persönlich bei Ihnen");
    expect(lastText()).toContain("/erstinformation/");
    const c = await conv(phone);
    expect(c.botActive).toBe(false);
    expect(c.needsAttention).toBe(true);
    expect(c.messages.some((m) => m.kind === "ki_handover")).toBe(true);
    expect(sendToBuyersOfCustomer).toHaveBeenCalled();
    // Weitere Nachrichten beantwortet der Assistent nicht mehr (Vermittler übernimmt)
    const before = sent.length;
    await inbound(phone, "Hallo?");
    expect(sent.length).toBe(before);
  });

  it("„Mensch“ in einem laufenden Chat → Übergabe ohne erneuten vollständigen Hinweis", async () => {
    const phone = "4917611110002";
    await leadFor(phone);
    await inbound(phone, "Hallo");
    await inbound(phone, "Mensch");
    expect(lastText()).toBe(
      "Ich bin der digitale KI-Assistent von Agentur Susanne Meier, kein Mensch. Ich habe Susanne Meier Bescheid gegeben, Susanne Meier meldet sich persönlich bei Ihnen.",
    );
    expect((await conv(phone)).botActive).toBe(false);
  });

  it("Wunsch nach Anruf oder dem Vermittler jederzeit → Übergabe mit Push (Ole, 16.11.2026)", async () => {
    for (const [phone, text] of [["4917611110005", "Können Sie mich bitte anrufen?"], ["4917611110006", "Kann ich mit Susanne Meier sprechen?"]] as const) {
      await leadFor(phone);
      await inbound(phone, "Hallo");
      vi.mocked(sendToBuyersOfCustomer).mockClear();
      const calls = h.calls.length;
      await inbound(phone, text);
      expect(h.calls.length, text).toBe(calls); // ohne KI übergeben
      expect(lastText(), text).toContain("meldet sich persönlich bei Ihnen");
      const c = await conv(phone);
      expect(c.botActive, text).toBe(false);
      expect(sendToBuyersOfCustomer, text).toHaveBeenCalled();
    }
  });

  it("nach über 30 Tagen Pause wiederholt der Assistent den Hinweis", async () => {
    const phone = "4917611110003";
    await leadFor(phone);
    await inbound(phone, "Hallo");
    const c = await conv(phone);
    await prisma.message.updateMany({ where: { conversationId: c.id }, data: { createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } });
    h.script.push({ content: [{ type: "text", text: "Schön, von Ihnen zu hören. Worum geht es?" }] });
    await inbound(phone, "Hallo, ich bin es nochmal");
    const t = lastText();
    expect(t.startsWith("Kurzer Hinweis: Hier schreibt weiterhin der digitale KI-Assistent von Agentur Susanne Meier. Ich bin kein Mensch und berate nicht zu Tarifen.")).toBe(true);
    expect(t).not.toContain("/erstinformation/"); // schon geschickt
    expect(t.endsWith("Worum geht es?")).toBe(true);
  });

  it("Gesundheitsangaben aus dem Formular gehen nicht an die KI", async () => {
    const phone = "4917611110004";
    const lead = await prisma.lead.create({
      data: {
        customerId,
        name: "Julia Schneider",
        phone,
        source: "Zahnzusatz",
        formData: [
          { label: "Versicherungsinteresse", value: "Zahnzusatz" },
          { label: "Laufende Behandlung beim Zahnarzt?", value: "Ja, Wurzelbehandlung" },
          { label: "Vorerkrankungen", value: "Diabetes" },
        ],
      },
    });
    await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: lead.id, botActive: true } });
    await inbound(phone, "Hallo");
    const system = h.calls[0].system;
    expect(system).toContain("Versicherungsinteresse: Zahnzusatz");
    expect(system).not.toContain("Wurzelbehandlung");
    expect(system).not.toContain("Diabetes");
    expect(system).toContain("Weitere Angaben zur Gesundheit liegen nur dem Berater vor");
  });
});

describe("Erstanschreiben (Vorlage v3 mit Link) und Rückfall auf ältere Vorlage", () => {
  it("v3-Vorlage bekommt Name und Link, ältere Vorlage nur den Namen", async () => {
    await prisma.messageTemplate.create({
      data: { customerId, name: "pg_outreach_v2_sie", language: "de", purpose: "outreach", category: "marketing", status: "approved", auto: true, body: "Guten Tag {{1}}, vielen Dank für Ihre Anfrage! Hier ist der digitale Assistent von X. Haben Sie kurz Zeit?" },
    });
    const l1 = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone: "4917622220001", status: "Neuer Lead" } });
    await runOutreach(customerId);
    const t1 = sent.find((s) => s.to === "4917622220001")!;
    expect(t1.template?.name).toBe("pg_outreach_v2_sie");
    expect(t1.template?.components?.[0].parameters.map((p) => p.text)).toEqual(["Frau Schneider"]); // Anrede aus eindeutigem Vornamen (Ole, 16.11.2026)
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l1.id } })).outreachStatus).toBe("sent");

    // Bis zur Freigabe: der Assistent holt KI-Kennzeichnung (erste Antwort) und Erstinformation (danach) nach
    await inbound("4917622220001", "Ja, gern");
    expect(prevText()).toMatch(/^Hallo Frau Schneider, danke für Ihre Nachricht!\nIch bin der digitale KI-Assistent von Susanne /);
    expect(lastText()).toContain("/erstinformation/");

    await prisma.messageTemplate.create({
      data: {
        customerId,
        name: "pg_outreach_v3_sie",
        language: "de",
        purpose: "outreach",
        category: "marketing",
        status: "approved",
        auto: true,
        body: "Guten Tag {{1}}, vielen Dank für Ihre Anfrage! Hier schreibt der digitale KI-Assistent von X. Ich bin kein Mensch und berate nicht zu Tarifen. Erstinformation zu Y als Versicherungsvermittler: {{2}} Haben Sie kurz Zeit für zwei Fragen?",
      },
    });
    await prisma.lead.create({ data: { customerId, name: "Max Weber", phone: "4917622220002", status: "Neuer Lead" } });
    await runOutreach(customerId);
    const t2 = sent.find((s) => s.to === "4917622220002")!;
    expect(t2.template?.name).toBe("pg_outreach_v3_sie");
    const params = t2.template?.components?.[0].parameters.map((p) => p.text) ?? [];
    expect(params[0]).toBe("Herr Weber");
    expect(params[1]).toMatch(/^https:\/\/app\.example\.de\/erstinformation\/[\w-]+$/);
    // Antwort darauf: Hinweis und Link sind schon da → kein Vorspann
    h.script.push({ content: [{ type: "text", text: "Prima. Für wen soll die Versicherung sein?" }] });
    await inbound("4917622220002", "Ja");
    expect(lastText()).toBe("Prima. Für wen soll die Versicherung sein?");
  });
});

describe("STOPP beendet alle Nachrichten", () => {
  it("Bestätigung, Sperre für Assistent, Vorlagen, Freitext und Erstanschreiben; schreibt der Kontakt wieder, ist die Sperre aufgehoben", async () => {
    const phone = "4917633330001";
    const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, status: "Im Gespräch" } });
    await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: lead.id, botActive: true } });
    await prisma.leadSequence.create({ data: { leadId: lead.id, customerId, kind: "offer", step: 0, startedAt: new Date(), nextAt: new Date(Date.now() + 86400000) } });
    await inbound(phone, "STOPP");
    expect(h.calls).toHaveLength(0);
    expect(lastText()).toBe("Alles klar, wir schreiben Ihnen hier keine weiteren Nachrichten.");
    const c = await conv(phone);
    expect(c.optedOutAt).not.toBeNull();
    expect(c.botActive).toBe(false);
    expect(c.messages.some((m) => m.kind === "opt_out")).toBe(true);
    expect((await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id } })).stoppedAt).not.toBeNull();

    await expect(sendWhatsAppMessage({ customerId, to: phone, body: "Noch eine Frage", sentBy: "agent" })).rejects.toBeInstanceOf(WhatsAppOptOutError);
    await expect(
      sendWhatsAppNotice({ customerId, to: phone, purpose: "followup", params: ["Julia"], text: "x", leadId: lead.id }),
    ).rejects.toBeInstanceOf(WhatsAppOptOutError);
    // Neuer Lead mit derselben Nummer: kein Erstanschreiben
    const again = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, status: "Neuer Lead" } });
    await runOutreach(customerId);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: again.id } })).outreachStatus).toBe("skipped_optout");

    // Kontakt schreibt später selbst wieder: Sperre aufgehoben, Assistent bleibt aus, Vermittler antwortet
    const before = sent.length;
    await inbound(phone, "Hallo, ich hätte doch gern einen Termin");
    const c2 = await conv(phone);
    expect(c2.optedOutAt).toBeNull();
    expect(c2.botActive).toBe(false);
    expect(c2.needsAttention).toBe(true);
    expect(sent.length).toBe(before);
  });
});

describe("Einwilligung im Meta-Leadformular", () => {
  const inc = (formId: string, disclaimer: IncomingLead["disclaimer"], phone: string): IncomingLead => ({
    externalId: `ext-${uid()}`,
    formId,
    pageId: "p1",
    createdAt: new Date().toISOString(),
    campaignName: null,
    adName: null,
    // Je Nummer eine eigene E-Mail (gleiche E-Mail wäre eine erneute Eintragung, lib/lead-erneut.ts)
    fields: { full_name: "Julia Schneider", phone_number: phone, email: `julia${phone.replace(/\D/g, "")}@example.com` },
    disclaimer,
  });

  it("Häkchen gesetzt → Nachweis am Lead und WhatsApp; fehlt → kein WhatsApp, Rückruf per Telefon/E-Mail; ohne Hinweis → wie bisher mit Warnung", async () => {
    const formId = `form-ki-${uid()}`;
    await prisma.messageTemplate.create({
      data: { customerId, name: "pg_outreach_v3_sie", language: "de", purpose: "outreach", category: "marketing", status: "approved", auto: true, body: "Guten Tag {{1}}, Hinweis. Erstinformation: {{2}} Haben Sie kurz Zeit?" },
    });
    await prisma.leadSource.create({ data: { formId, customerId, productKey: "Zahnzusatz", consentVersion: "2026-11-15", consentText: "Ich willige ein, dass …" } });

    const ja = await ingestLead(inc(formId, [{ key: "einwilligung_kontakt", checked: true }], "0176 44440001"), "meta");
    const lJa = await prisma.lead.findUniqueOrThrow({ where: { id: ja.leadId! } });
    expect(lJa.waConsent).toBe("ja");
    expect(lJa.consentData).toMatchObject({ formId, textVersion: "2026-11-15", text: "Ich willige ein, dass …", responses: [{ key: "einwilligung_kontakt", checked: true }] });
    expect(lJa.outreachStatus).toBe("sent");

    const nein = await ingestLead(inc(formId, [{ key: "einwilligung_kontakt", checked: false }], "0176 44440002"), "meta");
    const lNein = await prisma.lead.findUniqueOrThrow({ where: { id: nein.leadId! } });
    expect(lNein.waConsent).toBe("nein");
    expect(lNein.outreachStatus).toBe("skipped_no_consent");
    expect(sent.some((s) => s.to === "4917644440002")).toBe(false);
    // Auch Termin-Nachrichten und Nachfassen nicht per WhatsApp
    await expect(
      sendWhatsAppNotice({ customerId, to: "4917644440002", purpose: "booking_confirmation", params: ["Julia", "Mo", "Telefon", "x"], text: "x", leadId: lNein.id }),
    ).rejects.toBeInstanceOf(WhatsAppNoConsentError);
    // Schreibt der Lead selbst per WhatsApp, darf der Assistent antworten
    await inbound("4917644440002", "Hallo, ich habe eine Frage");
    expect(sent.some((s) => s.to === "4917644440002" && s.type === "text")).toBe(true);

    const ohne = await ingestLead(inc(formId, null, "0176 44440003"), "meta");
    const lOhne = await prisma.lead.findUniqueOrThrow({ where: { id: ohne.leadId! } });
    expect(lOhne.waConsent).toBeNull();
    expect(lOhne.outreachStatus).toBe("sent");
    expect((await prisma.leadSource.findUniqueOrThrow({ where: { formId } })).lastConsentState).toBe("ohne");
  });
});

describe("Erstinformation in der Einrichtung", () => {
  it("Tippgeber nicht erlaubt, Registernummer geprüft, Mehrfachvertreter bleibt beim Speichern der Provisionen", async () => {
    expect(await saveErstinfo(customerId, { status: "tippgeber", registerNummer: "" })).toEqual({ ok: false, error: "tippgeber" });
    expect(await saveErstinfo(customerId, { status: "mehrfachvertreter", registerNummer: "123", url: "https://meier.de/erstinfo" })).toMatchObject({ ok: false });
    expect(await saveErstinfo(customerId, { status: "mehrfachvertreter", registerNummer: "D-1ABC-DEF12-34" })).toMatchObject({ ok: false }); // ohne PDF/Link
    const pdf = new TextEncoder().encode("%PDF-1.4 Erstinformation");
    expect(await saveErstinfo(customerId, { status: "mehrfachvertreter", registerNummer: "d1abcdef1234", file: { name: "erstinfo.pdf", data: pdf } })).toEqual({ ok: true });
    const e = await prisma.erstinformation.findUniqueOrThrow({ where: { customerId } });
    expect(e).toMatchObject({ registerNummer: "D-1ABC-DEF12-34", fileName: "erstinfo.pdf", contentType: "application/pdf" });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).vermittlerTyp).toBe("mehrfachvertreter");
    await saveCustomerProvision(customerId, { typ: "vertreter", rates: {} });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).vermittlerTyp).toBe("mehrfachvertreter");

    await prisma.onboarding.create({ data: { customerId, package: "software" } });
    const ob = (await loadOnboarding({ customerId }))!;
    expect(onboardingChecklist(ob, null).find((i) => i.key === "erstinfo")).toMatchObject({ done: true, owner: "kunde" });
    await prisma.erstinformation.update({ where: { customerId }, data: { registerNummer: null } });
    const ob2 = (await loadOnboarding({ customerId }))!;
    expect(onboardingChecklist(ob2, null).find((i) => i.key === "erstinfo")?.done).toBe(false);
  });
});

describe("Schon über die Buchungsseite gebucht (z. B. Meta-Leadformular)", () => {
  it("Privatschutz: Assistent meldet sich trotzdem; andere Produkte ohne Angaben-Katalog: kein Erstanschreiben", async () => {
    const mk = async (phone: string, source: string) => {
      const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, status: "Neuer Lead", source } });
      const conv = await prisma.conversation.create({ data: { customerId, leadId: lead.id, contactPhone: phone, contactName: "Julia Schneider" } });
      await prisma.appointment.create({ data: { customerId, leadId: lead.id, conversationId: conv.id, mode: "phone", status: "booked", startsAt: new Date(Date.now() + 2 * 86_400_000) } });
      return lead;
    };
    await prisma.messageTemplate.create({
      data: { customerId, name: "pg_outreach_v3_sie", language: "de", purpose: "outreach", category: "marketing", status: "approved", auto: true, body: "Guten Tag {{1}}, vielen Dank für Ihre Anfrage! Erstinformation: {{2}} Haben Sie kurz Zeit für zwei Fragen?" },
    });
    const ps = await mk("4917622220011", "Privatschutz");
    const tkv = await mk("4917622220012", "Zahnzusatz");
    await runOutreach(customerId);
    expect(sent.some((s) => s.to === "4917622220011")).toBe(true);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: ps.id } })).outreachStatus).toBe("sent_booked");
    expect(sent.some((s) => s.to === "4917622220012")).toBe(false);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: tkv.id } })).outreachStatus).toBe("skipped_booked");
  });
});
