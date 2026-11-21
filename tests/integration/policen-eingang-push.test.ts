// „Unterlagen sind da“ (Persona-Test 20.11.2026): Push an den Vermittler nach Eingang, nur Name und Anzahl.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { eingangPushText, eingangPushZuruecksetzen, meldeUnterlagen } from "@/lib/policen/eingang-push";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const MIN = 60 * 1000;

describe("Policen: Push „Unterlagen sind da“", () => {
  let customerId = "";
  let beraterId = "";
  let n = 0;
  const push = vi.fn(async () => null);
  const lead = async (o: { assigned?: boolean; termin?: boolean } = {}) => {
    const l = await prisma.lead.create({
      data: { customerId, name: "Markus Meier", phone: `49151555${String(++n).padStart(4, "0")}`, formData: [{ label: "Anrede", value: "Herr" }], assignedUserId: o.assigned ? beraterId : null },
    });
    const appt = o.termin
      ? await prisma.appointment.create({ data: { customerId, leadId: l.id, mode: "video", status: "booked", startsAt: new Date(Date.now() + 24 * 60 * MIN), endsAt: new Date(Date.now() + 25 * 60 * MIN) } })
      : null;
    return { l, appt };
  };
  const doc = (leadId: string, o: { createdAt?: Date; ausgelesen?: boolean } = {}) =>
    prisma.leadDocument
      .create({ data: { customerId, leadId, status: "gespeichert", mimeType: "image/jpeg", fileName: "Foto.jpg", size: 1, sparte: "hausrat", createdAt: o.createdAt } })
      .then(async (d) => {
        if (o.ausgelesen) await prisma.policenAuszug.create({ data: { customerId, leadId, documentId: d.id, status: "ausgelesen", sparte: "hausrat", versuche: 1 } });
        return d;
      });

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: "Agentur Test" })).id;
    beraterId = (await makeBuyer(customerId, "advisor")).id;
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    push.mockClear();
    eingangPushZuruecksetzen();
  });

  it("an den zuständigen Berater, mit Link zur Vertragsseite des Termins, ohne Inhalte", async () => {
    const { l, appt } = await lead({ assigned: true, termin: true });
    await doc(l.id, { ausgelesen: true });
    await doc(l.id, { ausgelesen: true });
    expect(await meldeUnterlagen(l.id, new Date(), { push })).toBe(true);
    expect(push).toHaveBeenCalledWith(beraterId, customerId, {
      title: "Herr Meier hat 2 Unterlagen geschickt",
      body: "Der Vergleich ist fertig. Bitte vor dem Termin mit dem Original prüfen.",
      url: `/buyer/termine/${appt!.id}/vorbereitung/vertraege`,
      tag: `policen-eingang:${l.id}`,
    });
  });

  it("mehrere Fotos hintereinander: ein Push in 10 Minuten", async () => {
    const { l } = await lead();
    await doc(l.id);
    const t = new Date();
    expect(await meldeUnterlagen(l.id, t, { push })).toBe(true);
    await doc(l.id);
    expect(await meldeUnterlagen(l.id, new Date(t.getTime() + 2 * MIN), { push })).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]).toMatchObject([null, customerId, { title: "Herr Meier hat eine Unterlage geschickt", url: `/buyer/leads/${l.id}` }]);
  });

  it("kein Push ohne frischen Eingang (alte Unterlage, spätere Antwort im Chat)", async () => {
    const { l } = await lead();
    await doc(l.id, { createdAt: new Date(Date.now() - 60 * MIN) });
    expect(await meldeUnterlagen(l.id, new Date(), { push })).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("Texte ohne Gedankenstriche", () => {
    const t = eingangPushText({ name: "Frau Becker", anzahl: 1, ausgelesen: 0, termin: true });
    expect(t).toEqual({ title: "Frau Becker hat eine Unterlage geschickt", body: "Sie liegen in der Terminvorbereitung." });
    expect(JSON.stringify(t)).not.toMatch(/[–—]/);
  });
});
