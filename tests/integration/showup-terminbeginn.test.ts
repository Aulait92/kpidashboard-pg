// Show-up-Paket (Ole, 17.11.2026): Terminbeginn („Ist … da?“), „Fehlt noch“ mit WhatsApp, Rückfrage nach dem Termin,
// No-Show-Rettung. WhatsApp und Push simuliert, Rest gegen die Test-DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => send(...a) };
});
const zeiten = vi.fn(async (): Promise<unknown> => null);
vi.mock("@/lib/whatsapp/termin-vorschlaege", () => ({ zweiTerminvorschlaege: () => zeiten() }));

import { prisma } from "@/lib/prisma";
import { runTerminBeginn, setzeAnwesenheit } from "@/lib/showup-server";
import { runSequences, startSequence } from "@/lib/lead-sequences";
import { NoTemplateError } from "@/lib/whatsapp/templates";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

describe("Show-up: Terminbeginn und No-Show-Rettung", () => {
  let customerId = "";
  let beraterId = "";
  let n = 0;
  const push = vi.fn(async () => null);
  const termin = async (opts: { startedAgo: number; mode?: string; assigned?: boolean }) => {
    const now = Date.now();
    const phone = `49151444${String(++n).padStart(4, "0")}`;
    const lead = await prisma.lead.create({
      data: { customerId, name: "Anna Becker", phone, formData: [{ label: "Anrede", value: "Frau" }], assignedUserId: opts.assigned ? beraterId : null },
    });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, contactName: "Anna Becker", leadId: lead.id } });
    const appt = await prisma.appointment.create({
      data: {
        customerId,
        leadId: lead.id,
        conversationId: conv.id,
        mode: opts.mode ?? "video",
        meetUrl: "https://meet.google.com/abc-defg-hij",
        status: "booked",
        startsAt: new Date(now - opts.startedAgo),
        endsAt: new Date(now - opts.startedAgo + 30 * MIN),
        createdAt: new Date(now - 2 * DAY),
      },
    });
    return { appt, lead, phone };
  };

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: "Agentur Ole Kannapinn" })).id;
    beraterId = (await makeBuyer(customerId, "advisor")).id;
    await prisma.erstinformation.create({ data: { customerId, name: "Ole Kannapinn", anrede: "Herr", token: `t${customerId}` } });
    await prisma.agentConfig.create({ data: { customerId, active: true, followUpSequencesEnabled: true } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", apiKeyEnc: "x" } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ mode: "text", conversationId: "c" });
    push.mockClear();
    zeiten.mockReset();
    zeiten.mockResolvedValue(null);
  });

  it("Push „Ist Frau Becker da?“ zum Beginn eines Videotermins, an den zuständigen Berater, genau einmal", async () => {
    const { appt } = await termin({ startedAgo: 2 * MIN, assigned: true });
    const tel = await termin({ startedAgo: 2 * MIN, mode: "phone" });
    await Promise.all([runTerminBeginn(new Date(), { push }), runTerminBeginn(new Date(), { push })]);
    const calls = push.mock.calls as unknown as [string | null, string, { title: string; url: string }][];
    const mine = calls.filter((c) => c[2].url === `/buyer/termine/${appt.id}`);
    expect(mine).toHaveLength(1);
    expect(mine[0][0]).toBe(beraterId);
    expect(mine[0][2].title).toBe("Ist Frau Becker da?");
    expect(calls.some((c) => c[2].url === `/buyer/termine/${tel.appt.id}`)).toBe(false);
    // Ohne Reaktion: keine Nachricht an den Lead
    expect(send).not.toHaveBeenCalled();
  });

  it("„Fehlt noch“: WhatsApp „wartet schon im Videoraum“ einmal; danach Rückfrage nach dem Termin; „Ja, da“ → erschienen", async () => {
    const { appt, phone } = await termin({ startedAgo: 3 * MIN });
    const r = await setzeAnwesenheit(appt.id, "fehlt", { customerId });
    expect(r).toMatchObject({ ok: true, anwesenheit: "fehlt", wa: "gesendet" });
    const arg = send.mock.calls[0][0] as { purpose: string; text: string; to: string; manuell: boolean };
    expect(arg).toMatchObject({ purpose: "appt_waiting", to: phone, manuell: true });
    expect(arg.text).toBe("Guten Tag Frau Becker, Herr Kannapinn wartet schon im Videoraum auf Sie: https://meet.google.com/abc-defg-hij");
    await setzeAnwesenheit(appt.id, "fehlt", { customerId });
    expect(send).toHaveBeenCalledTimes(1);
    // vor dem Ende keine Rückfrage, danach genau eine
    await runTerminBeginn(new Date(), { push });
    expect((push.mock.calls as unknown as [unknown, unknown, { url: string; title: string }][]).filter((c) => c[2].title.includes("noch gekommen"))).toHaveLength(0);
    await runTerminBeginn(new Date(Date.now() + 31 * MIN), { push });
    await runTerminBeginn(new Date(Date.now() + 36 * MIN), { push });
    const nachher = (push.mock.calls as unknown as [unknown, unknown, { url: string; title: string }][]).filter((c) => c[2].url === `/buyer/termine/${appt.id}` && c[2].title.includes("noch gekommen"));
    expect(nachher).toHaveLength(1);
    expect(nachher[0][2].title).toBe("Ist Frau Becker noch gekommen?");
    const da = await setzeAnwesenheit(appt.id, "da", { customerId });
    expect(da).toMatchObject({ ok: true, anwesenheit: "erschienen" });
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(row.attendance).toBe("erschienen");
    expect(row.status).toBe("booked"); // Ergebnis kommt weiter über „Wie lief es?“
  });

  it("„Fehlt noch“ ohne Fenster und ohne freigegebene Vorlage: nicht möglich, Anruf-Knopf", async () => {
    send.mockRejectedValue(new NoTemplateError("appt_waiting"));
    const { appt } = await termin({ startedAgo: 1 * MIN });
    expect(await setzeAnwesenheit(appt.id, "fehlt", { customerId })).toMatchObject({ ok: true, wa: "nicht_moeglich" });
    const h = await prisma.leadHistory.findFirst({ where: { leadId: appt.leadId! }, orderBy: { createdAt: "desc" } });
    expect(h?.text).toContain("bitte anrufen");
  });

  it("No-Show-Rettung: gleich zwei neue Zeiten mit Knöpfen, am nächsten Tag einmal nachfassen, dann Ende", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Anna Becker", phone: "491514449999", formData: [{ label: "Anrede", value: "Frau" }] } });
    // Di 17.11.2026, 15:00 Uhr Berlin
    const T0 = new Date("2026-11-17T14:00:00.000Z");
    const starts = ["2026-11-18T09:00:00.000Z", "2026-11-19T15:00:00.000Z"];
    zeiten.mockResolvedValue({ labels: ["Mi., 18.11. um 10:00 Uhr", "Do., 19.11. um 16:00 Uhr"], starts, payloads: [`slot:${starts[0]}`, `slot:${starts[1]}`, "andere_zeit"] });
    const seq = await startSequence(lead.id, "no_show", T0);
    await runSequences(T0);
    const first = send.mock.calls[0][0] as { purpose: string; text: string; textButtons: string[]; buttonPayloads: string[] };
    expect(first.purpose).toBe("followup_noshow");
    expect(first.text).toBe("Guten Tag Frau Becker, kein Problem, so etwas passiert. Sollen wir einen neuen Termin finden? Passt Ihnen morgen um 10 Uhr oder Donnerstag, 19.11. um 16 Uhr?");
    expect(first.textButtons).toEqual(["Morgen 10 Uhr", "Do 19.11. 16 Uhr", "Andere Zeit"]);
    expect(first.buttonPayloads[0]).toBe(`slot:${starts[0]}`);
    await runSequences(new Date(T0.getTime() + DAY));
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[1][0] as { purpose: string; text: string }).text).toContain("kurze Nachfrage zum neuen Termin");
    const s = await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq!.id } });
    expect(s.stopReason).toBe("Abgeschlossen");
    await runSequences(new Date(T0.getTime() + 5 * DAY));
    expect(send).toHaveBeenCalledTimes(2);
    // keine Anruf-Aufgabe mehr aus der Abfolge
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBeNull();
  });
});
