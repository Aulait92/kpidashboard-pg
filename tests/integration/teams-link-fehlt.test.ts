import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Teams-Link fehlt (Ole, 26.11.2026): Microsoft ohne Teams-Lizenz liefert keinen Videoraum. Einmal Push, Hinweis im Kalender-Schritt.
const st = vi.hoisted(() => ({ link: null as string | null, n: 0 }));
vi.mock("@/lib/calendar/microsoft", () => ({
  microsoftGetBusy: vi.fn(async () => []),
  microsoftCreateEvent: vi.fn(async () => ({ eventId: `ev-${++st.n}`, videoUrl: st.link })),
  microsoftDeleteEvent: vi.fn(async () => {}),
  microsoftUpdateEventEnd: vi.fn(async () => {}),
  microsoftUpdateEventTime: vi.fn(async () => {}),
  microsoftGetResponses: vi.fn(async () => []),
}));
vi.mock("@/lib/calendar/lead-email", () => ({ sendLeadEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock("@/lib/lead-progress", () => ({ recordLeadProgress: vi.fn(async () => {}) }));
vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => {}),
}));

import { prisma } from "@/lib/prisma";
import { sendToBuyersOfCustomer } from "@/lib/push";
import { bookAppointment, TEAMS_LINK_FEHLT_PUSH } from "@/lib/calendar";
import { loadCalendarSetup } from "@/lib/calendar/setup-view";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

let id = "";
beforeAll(async () => {
  requireTestDb();
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  id = (await makeCustomer()).id;
  await prisma.calendarConnection.create({ data: { customerId: id, provider: "microsoft", status: "connected" } });
  await prisma.agentConfig.upsert({ where: { customerId: id }, create: { customerId: id }, update: {} });
});
afterAll(async () => {
  if (id) await cleanupCustomer(id);
});

const zeit = (tage: number) => new Date(Date.now() + tage * 86400_000).toISOString();

describe("Teams-Link fehlt", () => {
  it("ohne Teams-Link: einmal Push, Hinweis; mit Teams-Link wieder weg", async () => {
    expect((await loadCalendarSetup(id, id)).videoWeg).toBe("microsoft");
    await bookAppointment({ customerId: id, start: zeit(2), mode: "video", summary: "T1", notifyLead: false });
    await bookAppointment({ customerId: id, start: zeit(3), mode: "video", summary: "T2", notifyLead: false });
    const pushes = vi.mocked(sendToBuyersOfCustomer).mock.calls.filter((c) => c[1].title === TEAMS_LINK_FEHLT_PUSH.title);
    expect(pushes).toHaveLength(1);
    expect(pushes[0][1].body).toBe("Für Ihren Termin konnte kein Teams-Link erstellt werden. Bitte tragen Sie in der Einrichtung Ihren Videolink ein.");
    expect((await loadCalendarSetup(id, id)).teamsLinkFehlt).toBe(true);

    // Telefontermin ändert nichts
    await bookAppointment({ customerId: id, start: zeit(4), mode: "phone", summary: "T3", notifyLead: false });
    expect((await loadCalendarSetup(id, id)).teamsLinkFehlt).toBe(true);

    st.link = "https://teams.microsoft.com/l/meetup-join/abc";
    await bookAppointment({ customerId: id, start: zeit(5), mode: "video", summary: "T4", notifyLead: false });
    expect((await loadCalendarSetup(id, id)).teamsLinkFehlt).toBe(false);
  });
});
