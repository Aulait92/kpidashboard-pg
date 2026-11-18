// Maklervollmacht per WhatsApp und „Wer schickt sie?“ (Ole, 18.11.2026), gegen die Test-DB; WhatsApp und Push simuliert:
//   im 24-h-Fenster freie Nachricht, außerhalb nur mit freigegebener Vorlage, sonst kein Versand (Karte bietet E-Mail)
//   ohne WhatsApp-Chat kein Versand; genau eine Erinnerung nach 2 Tagen, Stopp bei Unterschrift und Abmeldung
//   „Eigene Vollmacht liegt vor“ sperrt Versand und Link; Nicht-Makler bekommen nichts; Entscheidungsfrage speichern
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const waSend = vi.fn(async (..._a: unknown[]) => ({ messageId: `wamid.${Math.random().toString(36).slice(2)}` }));
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return {
    ...real,
    sendText: (...a: unknown[]) => waSend("text", ...a),
    sendTemplate: (...a: unknown[]) => waSend("template", ...a),
    sendButtons: (...a: unknown[]) => waSend("buttons", ...a),
  };
});
vi.mock("@/lib/push", () => ({
  sendToAdmins: async () => ({ sent: 1, removed: 0, errors: [] }),
  sendToBuyersOfCustomer: async () => ({ sent: 1, removed: 0, errors: [] }),
  sendToUser: async () => ({ sent: 1, removed: 0, errors: [] }),
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { pruefeEingabe } from "@/lib/maklervollmacht/regeln";
import { eigeneVollmacht, ladeSeite, setzeVollmachtVersand, unterschreiben, vollmachtAnlegen, vollmachtVersandStand } from "@/lib/maklervollmacht/server";
import { runVollmachtErinnerungen, sendeVollmachtWhatsApp, whatsAppStand } from "@/lib/maklervollmacht/whatsapp";
import { templateBodyFor, templateNameFor, TEMPLATE_VERSION } from "@/lib/whatsapp/template-plan";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";
import { testPng } from "../helpers/test-png";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
// 12 Uhr Berlin (Erinnerungen nur 9 bis 19 Uhr)
const mittag = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T11:00:00Z`);

describe("Maklervollmacht per WhatsApp", () => {
  let makler = "";
  let vertreter = "";

  async function kontakt(opts: { fensterH?: number | null; chat?: boolean; customerId?: string } = {}) {
    const customerId = opts.customerId ?? makler;
    const phone = newPhone();
    const lead = await prisma.lead.create({ data: { customerId, name: "Katrin Wolf", phone, email: "katrin.wolf@example.com", status: "Im Gespräch", formData: [{ label: "Anrede", value: "Frau" }] } });
    if (opts.chat !== false) {
      const h = opts.fensterH === undefined ? 20 : opts.fensterH;
      await prisma.conversation.create({
        data: { customerId, leadId: lead.id, contactPhone: phone, contactName: "Katrin Wolf", windowExpiresAt: h === null ? null : new Date(Date.now() + h * HOUR), lastMessageAt: new Date() },
      });
    }
    return lead;
  }
  async function vollmacht(leadId: string, customerId = makler) {
    const a = await vollmachtAnlegen(leadId, customerId);
    if (!a.ok) throw new Error(a.error);
    return a.vollmacht;
  }
  const gesendet = (purpose: string) => prisma.message.findMany({ where: { purpose, conversation: { customerId: makler } }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    makler = (await makeCustomer({ vermittlerTyp: "makler", leadAddress: "sie" })).id;
    vertreter = (await makeCustomer({ vermittlerTyp: "vertreter" })).id;
    for (const id of [makler, vertreter]) {
      await prisma.whatsAppAccount.create({ data: { customerId: id, status: "connected", phoneNumberId: `pnid-vv-${id}`, apiKeyEnc: encryptSecret("k") } });
    }
    await prisma.erstinformation.create({ data: { customerId: makler, token: `vvwa-${makler}`, name: "Max Berger", anrede: "Herr", firma: "Berger Makler GmbH", anschrift: "Marktplatz 2, 84028 Landshut" } });
  });
  afterAll(async () => {
    await cleanupCustomer(makler);
    await cleanupCustomer(vertreter);
  });
  beforeEach(() => waSend.mockClear());

  it("im 24-h-Fenster: freie Nachricht im Chat, Verlauf, Zeitpunkt gespeichert", async () => {
    const l = await kontakt({ fensterH: 20 });
    expect(await whatsAppStand(l.id, makler)).toMatchObject({ chat: true, moeglich: true, offen: true });
    const v = await vollmacht(l.id);
    expect(await sendeVollmachtWhatsApp(v.id, makler, { userId: null })).toEqual({ ok: true });
    expect(waSend).toHaveBeenCalledTimes(1);
    expect(waSend.mock.calls[0][0]).toBe("text");
    const msg = (await gesendet("maklervollmacht")).find((m) => (m.body ?? "").includes(v.token))!;
    expect(msg.body ?? "").toMatch(/^Damit Herr Berger Ihre bestehenden Verträge übernehmen und für Sie betreuen kann, unterschreiben Sie hier bitte kurz digital die Maklervollmacht\. Das dauert etwa 2 Minuten: http/);
    expect(msg.body ?? "").not.toMatch(/[–—]/);
    expect((await prisma.maklervollmacht.findUniqueOrThrow({ where: { id: v.id } })).waSentAt).toBeInstanceOf(Date);
    expect(await prisma.leadHistory.count({ where: { leadId: l.id, text: "Maklervollmacht per WhatsApp gesendet" } })).toBe(1);
  });

  it("außerhalb des Fensters: ohne freigegebene Vorlage kein Versand (E-Mail statt WhatsApp), mit Vorlage als Vorlage", async () => {
    const l = await kontakt({ fensterH: -5 });
    const v = await vollmacht(l.id);
    expect(await whatsAppStand(l.id, makler)).toMatchObject({ chat: true, moeglich: false, grund: "fenster_zu" });
    expect(await sendeVollmachtWhatsApp(v.id, makler)).toMatchObject({ ok: false, grund: "fenster_zu" });
    expect(waSend).not.toHaveBeenCalled();
    // Vorlage freigegeben (wie nach dem Einreichen über template-submit.ts)
    const names = { firm: "Berger Makler GmbH", advisor: "Max Berger", vermittler: { name: "Max Berger", anrede: "Herr" as const } };
    for (const form of ["sie", "sie_ohne_name"] as const) {
      await prisma.messageTemplate.create({
        data: { customerId: makler, name: templateNameFor("maklervollmacht", TEMPLATE_VERSION, form), purpose: "maklervollmacht", category: "utility", status: "approved", auto: true, body: templateBodyFor("maklervollmacht", names, form) },
      });
    }
    expect(await whatsAppStand(l.id, makler)).toMatchObject({ moeglich: true, offen: false, vorlage: true });
    expect(await sendeVollmachtWhatsApp(v.id, makler)).toEqual({ ok: true });
    expect(waSend.mock.calls[0][0]).toBe("template");
    const msg = (await gesendet("maklervollmacht")).find((m) => (m.body ?? "").includes(v.token))!;
    expect(msg.body ?? "").toContain("Guten Tag Frau Wolf, damit Herr Berger Ihre bestehenden Verträge übernehmen");
    expect(msg.body ?? "").toMatch(/Vielen Dank!$/);
  });

  it("ohne WhatsApp-Chat: kein Versand, Karte bleibt bei E-Mail/Link", async () => {
    const l = await kontakt({ chat: false });
    expect(await whatsAppStand(l.id, makler)).toMatchObject({ chat: false, moeglich: false });
    const v = await vollmacht(l.id);
    expect(await sendeVollmachtWhatsApp(v.id, makler)).toMatchObject({ ok: false, grund: "kein_chat" });
    expect(waSend).not.toHaveBeenCalled();
  });

  it("genau eine Erinnerung nach 2 Tagen, nicht nach der Unterschrift, gestoppt nach Abmeldung", async () => {
    const jetzt = mittag(new Date());
    // a) offen, vor 3 Tagen per WhatsApp gesendet, Fenster offen → Erinnerung
    const la = await kontakt({ fensterH: 20 });
    const va = await vollmacht(la.id);
    await prisma.maklervollmacht.update({ where: { id: va.id }, data: { waSentAt: new Date(jetzt.getTime() - 3 * DAY) } });
    // b) vor 1 Tag gesendet → noch nicht
    const lb = await kontakt({ fensterH: 20 });
    const vb = await vollmacht(lb.id);
    await prisma.maklervollmacht.update({ where: { id: vb.id }, data: { waSentAt: new Date(jetzt.getTime() - 1 * DAY) } });
    // c) unterschrieben → nie
    const lc = await kontakt({ fensterH: 20 });
    const vc = await vollmacht(lc.id);
    await prisma.maklervollmacht.update({ where: { id: vc.id }, data: { waSentAt: new Date(jetzt.getTime() - 3 * DAY) } });
    const o: Record<string, string> = {
      vorname: "Katrin", nachname: "Wolf", strasse: "Lindenweg 4", plz: "84028", ort: "Landshut", geburtsdatum: "12.03.1980", email: "",
      vertraege: JSON.stringify([{ versicherer: "Allianz", sparte: "haftpflicht", vertragsnummer: "" }]), zustimmung: "ja", unterschrift: testPng(),
    };
    const e = pruefeEingabe((k) => o[k] ?? null);
    if (!e.ok) throw new Error(e.fehler);
    expect(await unterschreiben(vc.token, e.eingabe, { ip: null, ua: null })).toMatchObject({ ok: true });
    // d) abgemeldet (STOPP) → gestoppt, keine Nachricht
    const ld = await kontakt({ fensterH: 20 });
    const vd = await vollmacht(ld.id);
    await prisma.maklervollmacht.update({ where: { id: vd.id }, data: { waSentAt: new Date(jetzt.getTime() - 3 * DAY) } });
    await prisma.conversation.updateMany({ where: { leadId: ld.id }, data: { optedOutAt: new Date() } });

    const r1 = await runVollmachtErinnerungen(jetzt);
    expect(r1.gesendet).toBe(1);
    expect(r1.gestoppt).toBeGreaterThanOrEqual(1);
    const erinnerungen = await gesendet("maklervollmacht_erinnerung");
    expect(erinnerungen.filter((m) => (m.body ?? "").includes(va.token))).toHaveLength(1);
    expect(erinnerungen[0].body ?? "").toMatch(/^Kurze Erinnerung: Damit Herr Berger Ihre bestehenden Verträge/);
    expect(await prisma.maklervollmacht.findUniqueOrThrow({ where: { id: va.id } })).toMatchObject({ erinnerungStatus: "gesendet" });
    expect(await prisma.maklervollmacht.findUniqueOrThrow({ where: { id: vb.id } })).toMatchObject({ erinnerungAt: null });
    expect(await prisma.maklervollmacht.findUniqueOrThrow({ where: { id: vc.id } })).toMatchObject({ erinnerungAt: null, status: "unterschrieben" });
    expect(await prisma.maklervollmacht.findUniqueOrThrow({ where: { id: vd.id } })).toMatchObject({ erinnerungStatus: "gestoppt" });
    expect(erinnerungen.some((m) => (m.body ?? "").includes(vd.token) || (m.body ?? "").includes(vc.token) || (m.body ?? "").includes(vb.token))).toBe(false);
    // Zweiter Lauf: keine zweite Erinnerung
    waSend.mockClear();
    const r2 = await runVollmachtErinnerungen(new Date(jetzt.getTime() + HOUR));
    expect(r2.gesendet).toBe(0);
    expect(waSend).not.toHaveBeenCalled();
    // Nachts nichts
    expect(await runVollmachtErinnerungen(new Date(`${jetzt.toISOString().slice(0, 10)}T01:00:00Z`))).toEqual({ gesendet: 0, gestoppt: 0, wartet: 0 });
  });

  it("„Eigene Vollmacht liegt vor“: kein Versand, kein Link, rückgängig wieder offen", async () => {
    const l = await kontakt({ fensterH: 20 });
    const v = await vollmacht(l.id);
    expect(await eigeneVollmacht(l.id, makler, true, null)).toEqual({ ok: true });
    expect(await sendeVollmachtWhatsApp(v.id, makler)).toMatchObject({ ok: false, grund: "eigene" });
    expect(await vollmachtAnlegen(l.id, makler)).toMatchObject({ ok: false });
    expect(await ladeSeite(v.token)).toEqual({ zustand: "ungueltig" });
    expect(waSend).not.toHaveBeenCalled();
    expect(await prisma.leadHistory.count({ where: { leadId: l.id, text: { contains: "Eigene Maklervollmacht liegt vor" } } })).toBe(1);
    // Ohne vorherige Vollmacht: legt eine „eigene“ an
    const l2 = await kontakt({ fensterH: 20 });
    expect(await eigeneVollmacht(l2.id, makler, true, null)).toEqual({ ok: true });
    expect(await prisma.maklervollmacht.findFirstOrThrow({ where: { leadId: l2.id } })).toMatchObject({ status: "eigene" });
    // Rückgängig
    expect(await eigeneVollmacht(l.id, makler, false, null)).toEqual({ ok: true });
    expect(await ladeSeite(v.token)).toMatchObject({ zustand: "offen" });
  });

  it("Nicht-Makler: kein Versand, keine Frage, keine Vorlagen", async () => {
    const l = await kontakt({ fensterH: 20, customerId: vertreter });
    expect(await vollmachtAnlegen(l.id, vertreter)).toMatchObject({ ok: false });
    const fremd = await prisma.maklervollmacht.create({ data: { customerId: vertreter, leadId: l.id, token: `t${Date.now()}vertreterxxxxxxx` } });
    expect(await sendeVollmachtWhatsApp(fremd.id, vertreter)).toMatchObject({ ok: false });
    expect(waSend).not.toHaveBeenCalled();
    expect(await vollmachtVersandStand(vertreter)).toEqual({ makler: false, versand: null });
    expect(await setzeVollmachtVersand({ customerId: vertreter, teamRole: "owner" }, "app")).toBe(false);
    expect(await eigeneVollmacht(l.id, vertreter, true, null)).toMatchObject({ ok: false });
  });

  it("Entscheidungsfrage: ohne Vorauswahl, nur gültige Antworten, nur Inhaber", async () => {
    expect(await vollmachtVersandStand(makler)).toEqual({ makler: true, versand: null });
    expect(await setzeVollmachtVersand({ customerId: makler, teamRole: "owner" }, "egal")).toBe(false);
    expect(await setzeVollmachtVersand({ customerId: makler, teamRole: "advisor" }, "app")).toBe(false);
    expect(await setzeVollmachtVersand({ customerId: makler, teamRole: "owner", preview: true }, "app")).toBe(false);
    expect(await vollmachtVersandStand(makler)).toEqual({ makler: true, versand: null });
    expect(await setzeVollmachtVersand({ customerId: makler, teamRole: "owner" }, "app")).toBe(true);
    expect(await vollmachtVersandStand(makler)).toEqual({ makler: true, versand: "app" });
    expect(await setzeVollmachtVersand({ customerId: makler, teamRole: "owner" }, "eigene")).toBe(true);
    expect(await vollmachtVersandStand(makler)).toEqual({ makler: true, versand: "eigene" });
  });
});
