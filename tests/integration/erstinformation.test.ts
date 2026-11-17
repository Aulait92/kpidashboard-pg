// Erstinformation nach § 15/16 VersVermV (Ole, 15.11.2026) gegen die echte Test-Datenbank: Einrichtung speichern
// je Status (Makler, Ausschließlichkeitsvertreter mit einem Versicherer, Mehrfachvertreter mit Liste), eigenes PDF,
// Inhalt des PDFs unter /erstinformation/<token>/pdf, PDF als WhatsApp-Dokument nach der ersten Antwort.
import zlib from "node:zlib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ customerId: "", userId: "", script: [] as Array<{ content: unknown[] }> }));
vi.mock("@/lib/buyer-context", () => ({
  getBuyerContext: async () => ({ customerId: st.customerId, userId: st.userId, email: "inhaber@example.test", preview: false, teamRole: "owner" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: async () => st.script.shift() ?? { content: [{ type: "text", text: "Gern, wann passt es Ihnen?" }] } };
  },
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { saveErstinfoAction } from "@/app/buyer/einrichtung/actions";
import { GET as pdfGET } from "@/app/erstinformation/[token]/pdf/route";
import { loadErstinfo } from "@/lib/erstinformation";
import { loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };
const WEB = {
  companyName: "Agentur Meier GmbH",
  representative: "Susanne Meier",
  address: "Hauptstraße 1, 80331 München",
  phone: "089 123456",
  email: "info@meier.de",
  registerNumber: "D-1ABC-DEF12-34",
  registerType: null,
  chamber: "IHK München und Oberbayern",
  sourceUrl: "https://vertretung.allianz.de/susanne.meier",
};

/** Text aus einem mit pdf-lib erzeugten PDF (Hex-Strings in den Inhalts-Streams), Zeilen mit Leerzeichen verbunden. */
function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const parts: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content = Buffer.from(m[1], "latin1");
    try {
      content = zlib.inflateSync(content);
    } catch {
      /* nicht komprimiert */
    }
    for (const t of content.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) parts.push(Buffer.from(t[1], "hex").toString("latin1"));
  }
  return parts.join(" ").replace(/\s+/g, " ");
}

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
}
const base = { registerNummer: "D-1ABC-DEF12-34", name: "Susanne Meier", firma: "Agentur Meier GmbH", anschrift: "Hauptstraße 1, 80331 München", ihk: "IHK München und Oberbayern", beratung: "ja" };

async function pdfFor(customerId: string): Promise<{ res: Response; text: string; bytes: Uint8Array }> {
  const e = await prisma.erstinformation.findUniqueOrThrow({ where: { customerId } });
  const res = await pdfGET(new Request(`https://app.example.de/erstinformation/${e.token}/pdf`), { params: Promise.resolve({ token: e.token }) });
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { res, bytes, text: pdfText(bytes) };
}

async function setup(vermittlerTyp: string, leadAddress = "sie") {
  st.customerId = (await makeCustomer({ name: "Agentur Susanne Meier", vermittlerTyp, leadAddress, plan: "software" })).id;
  st.userId = (await prisma.user.create({ data: { email: `${Math.random().toString(36).slice(2, 10)}@test.local`, passwordHash: "x", role: "BUYER", customerId: st.customerId, teamRole: "owner" } })).id;
  await prisma.onboarding.create({ data: { customerId: st.customerId, package: "software", websiteInfo: WEB } });
}

beforeAll(() => requireTestDb());
beforeEach(() => {
  process.env.APP_URL = "https://app.example.de";
  process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  st.script.length = 0;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  if (st.customerId) await cleanupCustomer(st.customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

describe("Einrichtung: Erstinformation speichern", () => {
  it("Vorbelegung aus Impressum und Angebot, erst nach Bestätigung vollständig", async () => {
    await setup("vertreter");
    const before = await loadErstinfo(st.customerId);
    expect(before.daten).toMatchObject({ name: "Susanne Meier", firma: "Agentur Meier GmbH", ihk: "IHK München und Oberbayern", versicherer: ["Allianz"], verguetung: ["provision"] });
    expect(before.fehlt).toEqual(["Bestätigung der Angaben"]);
    const ob = await loadOnboarding({ customerId: st.customerId });
    expect(onboardingChecklist(ob!, null).find((i) => i.key === "erstinfo")?.done).toBe(false);
  });

  it("Makler: Courtage, Status mit Erlaubnis nach Abs. 1, PDF mit allen Pflichtangaben", async () => {
    await setup("makler");
    expect(await saveErstinfoAction({}, form({ ...base, status: "makler", verguetung: ["courtage", "honorar"], zuwendungen: "1" }))).toEqual({ ok: true });
    const e = await prisma.erstinformation.findUniqueOrThrow({ where: { customerId: st.customerId } });
    expect(e).toMatchObject({ verguetung: ["courtage", "honorar"], zuwendungen: true, versicherer: [], erlaubnis: null, beratung: true, beteiligungen: null, ihk: "IHK München und Oberbayern" });
    expect(e.bestaetigtAt).toBeInstanceOf(Date);
    expect((await loadErstinfo(st.customerId)).vollstaendig).toBe(true);
    const ob = await loadOnboarding({ customerId: st.customerId });
    expect(onboardingChecklist(ob!, null).find((i) => i.key === "erstinfo")?.done).toBe(true);

    const { res, bytes, text } = await pdfFor(st.customerId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("Erstinformation_Agentur_Meier_GmbH.pdf");
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("%PDF");
    for (const s of [
      "Susanne Meier",
      "Agentur Meier GmbH",
      "Hauptstraße 1, 80331 München",
      "Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO.",
      "Registrierungsnummer D-1ABC-DEF12-34",
      "www.vermittlerregister.info",
      "IHK München und Oberbayern",
      "wird eine Beratung angeboten",
      "Courtage vom Versicherungsunternehmen",
      "Honorar, das direkt vom Kunden zu zahlen ist",
      "Daneben werden andere Zuwendungen",
      "Verknüpfung",
      "Es bestehen keine unmittelbaren oder mittelbaren Beteiligungen",
      "Versicherungsombudsmann e. V., Postfach 08 06 32, 10006 Berlin",
      "Ombudsmann Private Kranken- und Pflegeversicherung, Postfach 06 02 22, 10052 Berlin",
      "Auf Wunsch erhalten Sie diese Erstinformation auch kostenlos auf Papier.",
    ]) {
      expect(text).toContain(s);
    }
  });

  it("Ausschließlichkeitsvertreter: genau ein Versicherer, Pflicht ohne eigenes PDF", async () => {
    await setup("vertreter", "du");
    expect(await saveErstinfoAction({}, form({ ...base, status: "vertreter", versicherer: "", verguetung: "provision" }))).toEqual({ error: "Bitte eintragen, für welchen Versicherer Sie tätig sind." });
    expect(await saveErstinfoAction({}, form({ ...base, status: "vertreter", versicherer: "Allianz AG\nERGO AG", verguetung: "provision" }))).toMatchObject({ error: expect.stringContaining("genau einen Versicherer") });
    expect(await saveErstinfoAction({}, form({ ...base, ihk: "", status: "vertreter", versicherer: "Allianz Versicherungs-AG", verguetung: "provision" }))).toMatchObject({ error: expect.stringContaining("IHK") });
    expect(await saveErstinfoAction({}, form({ ...base, status: "vertreter", versicherer: "Allianz Versicherungs-AG", verguetung: "provision", beratung: "nein" }))).toEqual({ ok: true });
    const e = await prisma.erstinformation.findUniqueOrThrow({ where: { customerId: st.customerId } });
    expect(e).toMatchObject({ versicherer: ["Allianz Versicherungs-AG"], erlaubnis: null, beratung: false, verguetung: ["provision"] });
    const { text } = await pdfFor(st.customerId);
    expect(text).toContain("Gebundener Versicherungsvertreter nach § 34d Abs. 7 Satz 1 Nr. 1 GewO, tätig ausschließlich für die Allianz Versicherungs-AG.");
    expect(text).toContain("Zuständige Registrierungsbehörde");
    expect(text).toContain("Es wird keine Beratung angeboten.");
    expect(text).toContain("Provision vom Versicherungsunternehmen, sie ist in der Versicherungsprämie enthalten");
    expect(text).toContain("Auf Wunsch bekommst du diese Erstinformation auch kostenlos auf Papier.");
  });

  it("Mehrfachvertreter: Liste der Versicherer (mindestens einer), Erlaubnisart, Beteiligung", async () => {
    await setup("mehrfachvertreter");
    expect(await saveErstinfoAction({}, form({ ...base, status: "mehrfachvertreter", erlaubnis: "abs1", versicherer: "\n", verguetung: "provision" }))).toMatchObject({ error: expect.stringContaining("mindestens einen Versicherer") });
    expect(
      await saveErstinfoAction(
        {},
        form({ ...base, status: "mehrfachvertreter", erlaubnis: "abs7", versicherer: "Gothaer Allgemeine Versicherung AG\nHallesche Krankenversicherung a. G.", verguetung: "provision", beteiligungenJa: "1", beteiligungen: "Muster Versicherung AG hält 25 % am Kapital." }),
      ),
    ).toEqual({ ok: true });
    const e = await prisma.erstinformation.findUniqueOrThrow({ where: { customerId: st.customerId } });
    expect(e).toMatchObject({ versicherer: ["Gothaer Allgemeine Versicherung AG", "Hallesche Krankenversicherung a. G."], erlaubnis: "abs7", beteiligungen: "Muster Versicherung AG hält 25 % am Kapital." });
    const { text } = await pdfFor(st.customerId);
    expect(text).toContain("Gebundener Versicherungsvertreter nach § 34d Abs. 7 Satz 1 Nr. 1 GewO (Mehrfachvertreter)");
    expect(text).toContain("Gothaer Allgemeine Versicherung AG");
    expect(text).toContain("Hallesche Krankenversicherung a. G.");
    expect(text).toContain("Muster Versicherung AG hält 25 % am Kapital.");
    expect(text).not.toContain("Es bestehen keine unmittelbaren");
  });

  it("eigenes PDF (Vorlage der Gesellschaft) wird zur Erstinformation, Tippgeber abgelehnt", async () => {
    await setup("vertreter");
    expect(await saveErstinfoAction({}, form({ status: "tippgeber", registerNummer: "" }))).toEqual({ tippgeber: true });
    const pdf = new TextEncoder().encode("%PDF-1.4 Erstinformation der Gesellschaft");
    const fd = form({ status: "vertreter", registerNummer: "D-1ABC-DEF12-34", name: "", anschrift: "", ihk: "", versicherer: "", verguetung: "provision" });
    fd.append("pdf", new File([pdf], "ao-erstinfo.pdf", { type: "application/pdf" }));
    expect(await saveErstinfoAction({}, fd)).toEqual({ ok: true });
    expect((await loadErstinfo(st.customerId)).vollstaendig).toBe(true);
    const { res, bytes } = await pdfFor(st.customerId);
    expect(res.headers.get("content-disposition")).toContain("ao-erstinfo.pdf");
    expect(Buffer.from(bytes).toString()).toBe("%PDF-1.4 Erstinformation der Gesellschaft");
  });
});

describe("WhatsApp: Erstinformation als PDF-Dokument (§ 16 VersVermV)", () => {
  const sent: Array<{ to: string; type: string; text?: { body: string }; document?: { link: string; filename: string; caption?: string } }> = [];
  let phoneNumberId = "";
  async function inbound(from: string, body: string) {
    // Der Assistent antwortet nur Leads (lib/whatsapp/nur-leads.ts): Kontakt als Lead aus dem Formular
    if (!(await prisma.lead.count({ where: { customerId: st.customerId, phone: from } }))) {
      await prisma.lead.create({ data: { customerId: st.customerId, name: "Julia Schneider", phone: from, outreachAt: new Date(), outreachStatus: "skipped_contact" } });
    }
    await handleInboundPayload({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, contacts: [{ profile: { name: "Julia Schneider" } }], messages: [{ from, id: `wamid.in.${Math.random()}`, type: "text", text: { body } }] } }] }],
    });
  }
  beforeEach(() => {
    sent.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/messages")) {
          sent.push(JSON.parse(String(init?.body)));
          return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${Math.random()}` }] }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  it("unvollständig: PDF im aktuellen Stand statt Link; vollständig: erste Antwort, danach das PDF, einmal je Unterhaltung", async () => {
    await setup("vertreter");
    phoneNumberId = `pn-erstinfo-${Math.random().toString(36).slice(2, 8)}`;
    await prisma.whatsAppAccount.create({ data: { customerId: st.customerId, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret("k"), phoneNumberId } });
    await prisma.agentConfig.create({ data: { customerId: st.customerId, active: true } });

    // Noch nicht bestätigt (unvollständig): das PDF im aktuellen Stand statt nur des Links (Ole, 17.11.2026)
    await inbound("4917699990001", "Hallo");
    expect(sent.filter((s) => s.type === "document" && s.to === "4917699990001")).toHaveLength(1);
    expect(sent.filter((s) => s.type === "text").some((s) => s.text?.body.includes("/erstinformation/"))).toBe(false);

    expect(await saveErstinfoAction({}, form({ ...base, status: "vertreter", versicherer: "Allianz Versicherungs-AG", verguetung: "provision" }))).toEqual({ ok: true });
    await inbound("4917699990002", "Hallo, ich möchte einen Termin");
    const idx = sent.findIndex((s) => s.type === "document" && s.to === "4917699990002");
    expect(idx).toBeGreaterThan(0);
    expect(sent[idx - 1].type).toBe("text"); // erst Begrüßung mit KI-Assistent und Antwort (Nachricht 1), dann das PDF (Nachricht 2)
    expect(sent[idx - 1].text?.body).toMatch(/^Hallo Julia Schneider, danke für Ihre Nachricht! Ich bin der digitale KI-Assistent von Susanne Meier\.\n\n/);
    expect(sent[idx - 1].text?.body).not.toContain("/erstinformation/");
    const e = await prisma.erstinformation.findUniqueOrThrow({ where: { customerId: st.customerId } });
    expect(sent[idx]).toMatchObject({ to: "4917699990002", document: { filename: "Erstinformation_Agentur_Meier_GmbH.pdf" } });
    // Öffentliche Adresse mit Token und Hash der Angaben (neues PDF, neue Adresse, wenn sich etwas ändert)
    expect(sent[idx].document?.link).toMatch(new RegExp(`^https://app\\.example\\.de/erstinformation/${e.token}/pdf\\?v=[0-9a-f]{16}$`));
    expect(sent[idx].document?.caption).toBe("Unsere Erstinformation als Versicherungsvermittler, wie gesetzlich vorgesehen.");
    const v1 = sent[idx].document!.link;
    // Gleiche Angaben: gleiches PDF aus dem Zwischenspeicher, gleiche Adresse; geänderte Angaben: neuer Hash
    const { erstinfoPdfFuerWhatsApp } = await import("@/lib/erstinformation");
    expect((await erstinfoPdfFuerWhatsApp(st.customerId))?.link).toBe(v1);
    await prisma.erstinformation.update({ where: { customerId: st.customerId }, data: { telefon: "089 999999" } });
    expect((await erstinfoPdfFuerWhatsApp(st.customerId))?.link).not.toBe(v1);
    const msg = await prisma.message.findFirstOrThrow({ where: { kind: "document", conversation: { customerId: st.customerId, contactPhone: "4917699990002" } } });
    expect(msg).toMatchObject({ direction: "outbound", sentBy: "bot" });

    // Zweite Nachricht: kein weiteres Dokument
    await inbound("4917699990002", "Morgen?");
    expect(sent.filter((s) => s.type === "document" && s.to === "4917699990002")).toHaveLength(1);
  });

  it("PDF lässt sich nicht senden: Rückfall auf den Link zur Erstinformation (einmal), Fehler protokolliert", async () => {
    await setup("vertreter");
    phoneNumberId = `pn-erstinfo-${Math.random().toString(36).slice(2, 8)}`;
    await prisma.whatsAppAccount.create({ data: { customerId: st.customerId, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret("k"), phoneNumberId } });
    await prisma.agentConfig.create({ data: { customerId: st.customerId, active: true } });
    expect(await saveErstinfoAction({}, form({ ...base, status: "vertreter", versicherer: "Allianz Versicherungs-AG", verguetung: "provision" }))).toEqual({ ok: true });
    // 360dialog lehnt das Dokument ab
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/messages")) {
          const body = JSON.parse(String(init?.body));
          if (body.type === "document") return new Response("media download failed", { status: 400 });
          sent.push(body);
          return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${Math.random()}` }] }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await inbound("4917699990003", "Hallo");
    const texts = sent.filter((x) => x.to === "4917699990003" && x.type === "text").map((x) => x.text?.body ?? "");
    expect(texts).toHaveLength(2);
    expect(texts[1]).toMatch(/^Erstinformation zu .+ als Versicherungsvermittler: https:\/\/app\.example\.de\/erstinformation\/[\w-]+$/);
    expect(err.mock.calls.some((c) => String(c[0]).includes("Erstinformation als PDF"))).toBe(true);
    err.mockRestore();
    // Nächste Antwort: kein zweiter Link
    await inbound("4917699990003", "Morgen?");
    expect(sent.filter((x) => x.to === "4917699990003" && x.type === "text" && x.text?.body.includes("/erstinformation/"))).toHaveLength(1);
  });
});
