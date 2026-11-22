// Einrichtung (Ole, 15.11.2026): Schritt E-Mail-Postfach, „Meine Gesellschaft erlaubt das nicht“ schaltet
// E-Mail-Funktionen ab und erledigt den Schritt, Kalender/WhatsApp mit Grund überspringen, Schritte nur für
// gebuchte Module (Kundenliste, Bewertungslink, Team).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { customerSetupProgress, loadOnboarding, onboardingChecklist, stepSkipOf } from "@/lib/onboarding";
import { channelAvailability } from "@/lib/bestand/campaigns";
import { mailFeaturesOffFor } from "@/lib/mail/postfach";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

let customerId = "";
let userId = "";

const checklist = async () => {
  const ob = await loadOnboarding({ customerId });
  return onboardingChecklist(ob!, null);
};
const item = async (k: string) => (await checklist()).find((i) => i.key === k);

describe("Einrichtung: E-Mail-Postfach und Überspringen mit Grund", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ plan: "software" })).id;
    userId = (await makeBuyer(customerId, "owner")).id;
    await prisma.onboarding.create({ data: { customerId, package: "software" } });
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Postfach-Schritt offen, erledigt mit Verbindung oder „Gesellschaft erlaubt das nicht“", async () => {
    expect(await item("mailbox")).toMatchObject({ owner: "kunde", done: false });
    const progress = customerSetupProgress(await checklist(), { appDone: true, provisionDone: true });
    expect(progress.open.map((o) => o.key)).toContain("mailbox");

    await prisma.customer.update({ where: { id: customerId }, data: { mailFeaturesOff: true } });
    expect(await item("mailbox")).toMatchObject({ done: true });
    expect(await mailFeaturesOffFor(customerId)).toBe(true);

    // Auch mit verbundenem Postfach: E-Mail-Kanal bei Bestandskampagnen aus, solange abgeschaltet
    await prisma.mailConnection.create({ data: { userId, customerId, provider: "smtp", email: "berater@example.de" } });
    expect((await channelAvailability(customerId, "review", userId)).mailbox).toBeNull();
    await prisma.customer.update({ where: { id: customerId }, data: { mailFeaturesOff: false } });
    expect((await channelAvailability(customerId, "review", userId)).mailbox).toMatchObject({ email: "berater@example.de" });
    expect(await item("mailbox")).toMatchObject({ done: true });
  });

  it("Kalender und WhatsApp mit Grund überspringen", async () => {
    expect(await item("calendar")).toMatchObject({ done: false });
    await prisma.onboarding.update({
      where: { customerId },
      data: { stepSkips: { calendar: { at: new Date().toISOString(), reason: "gesellschaft" }, whatsapp: { at: new Date().toISOString(), reason: "nicht_noetig" } } },
    });
    // Go-live-Prüfung 22.11.2026: Auch nach „Mein Versicherer erlaubt das nicht“ braucht es den Link für Videotermine
    expect(await item("calendar")).toMatchObject({ done: false });
    await prisma.agentConfig.upsert({ where: { customerId }, create: { customerId, videoRoomUrl: "https://x.webex.com/meet/max.muster" }, update: { videoRoomUrl: "https://x.webex.com/meet/max.muster" } });
    expect(await item("calendar")).toMatchObject({ done: true });
    expect(await item("whatsapp")).toMatchObject({ done: true });
    const ob = await loadOnboarding({ customerId });
    expect(stepSkipOf(ob!.stepSkips, "calendar")).toMatchObject({ reason: "gesellschaft" });
    expect(stepSkipOf(ob!.stepSkips, "team")).toBeNull();
  });

  it("Schritte nur für gebuchte Module", async () => {
    expect(await item("bestandImport")).toBeUndefined();
    expect(await item("reviewLink")).toBeUndefined();
    expect(await item("team")).toBeUndefined();
    await prisma.customer.update({ where: { id: customerId }, data: { existingCustomersEnabled: true, empfehlungEnabled: true, seatsBilled: 2 } });
    expect(await item("bestandImport")).toMatchObject({ owner: "kunde", done: false });
    expect(await item("reviewLink")).toMatchObject({ done: false });
    expect(await item("team")).toMatchObject({ done: false });

    await prisma.existingCustomer.create({ data: { customerId, firstName: "Erika", lastName: "Bestand" } });
    await prisma.reviewSettings.create({ data: { customerId, googleReviewUrl: "https://g.page/r/test/review" } });
    await makeBuyer(customerId, "advisor");
    expect(await item("bestandImport")).toMatchObject({ done: true });
    expect(await item("reviewLink")).toMatchObject({ done: true });
    expect(await item("team")).toMatchObject({ done: true });
    const progress = customerSetupProgress(await checklist(), { appDone: true, provisionDone: true });
    expect(progress.open.map((o) => o.key)).not.toContain("team");
  });
});
