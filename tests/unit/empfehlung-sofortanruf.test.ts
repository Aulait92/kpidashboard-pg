// Paket 3 (20.11.2026): Empfohlene Person trägt sich ein → Push „Empfehlung von {Vorname}: jetzt anrufen“
// (Tag empfehlung-lead) und der Kontakt steht ganz oben auf „Heute“ mit Gesprächseinstieg, bis zum ersten Anruf.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    lead: { findUnique: vi.fn(), findMany: vi.fn() },
    agentConfig: { findUnique: vi.fn() },
    appointment: { count: vi.fn() },
  },
  notifyLeadPush: vi.fn(),
  assignLead: vi.fn(),
  runOutreach: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/team", () => ({ assignLead: m.assignLead, notifyLeadPush: m.notifyLeadPush }));
// Push „Neuer Lead“ läuft seit 26.11.2026 über lib/lead-benachrichtigung.ts (gleiche Signatur wie notifyLeadPush)
vi.mock("@/lib/lead-benachrichtigung", () => ({ neuerLeadPush: m.notifyLeadPush, neuerLeadMail: vi.fn(async () => []) }));
vi.mock("@/lib/whatsapp/lead-link", () => ({ attachLeadToContact: vi.fn(async () => {}) }));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn() }));
vi.mock("@/lib/onboarding-cron", () => ({ emailLeads: vi.fn(async () => {}) }));
vi.mock("@/lib/testlead", () => ({ logTestLead: vi.fn(), inboundLeadIsTest: vi.fn(async () => false) }));
vi.mock("@/lib/lead-erneut", () => ({ tryReentry: vi.fn() }));
vi.mock("@/lib/vertrieb/inbound", () => ({ handleInboundLead: vi.fn() }));

import { processNewLead } from "@/lib/lead-intake";
import { getCallbackLeads } from "@/lib/whatsapp/outreach";

const NOW = new Date("2026-11-17T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  m.assignLead.mockResolvedValue(undefined);
  m.notifyLeadPush.mockResolvedValue(undefined);
  m.prisma.agentConfig.findUnique.mockResolvedValue({ active: true, outreachEnabled: true, outreachDelayMin: 30 });
  m.prisma.appointment.count.mockResolvedValue(0);
});

describe("Push bei neuer Empfehlung", () => {
  it("Quelle Empfehlung: eigener Push mit Tag empfehlung-lead, Gesprächseinstieg, ohne Nummern", async () => {
    m.prisma.lead.findUnique.mockResolvedValue({
      id: "l9",
      name: "Tom Becker",
      source: "Empfehlung",
      customerId: "c1",
      isTest: false,
      customer: { plan: "x" },
      referralLink: { kind: "contact", lead: { name: "Julia Schneider" }, existingCustomer: null },
    });
    await processNewLead("l9");
    expect(m.notifyLeadPush).toHaveBeenCalledTimes(1);
    const [leadId, p] = m.notifyLeadPush.mock.calls[0];
    expect(leadId).toBe("l9");
    expect(p.tag).toMatch(/^empfehlung-lead:/);
    expect(p.title).toBe("Empfehlung von Julia: jetzt anrufen");
    expect(p.body).toContain("Julia hat mir erzählt");
    expect(JSON.stringify(p)).not.toMatch(/\d{6,}/);
  });

  it("allgemeiner Link: ohne Namen; andere Quellen: der bisherige Push", async () => {
    m.prisma.lead.findUnique.mockResolvedValue({ id: "l8", name: "A", source: "Empfehlung", customerId: "c1", isTest: false, customer: { plan: "x" }, referralLink: { kind: "general", lead: null, existingCustomer: null } });
    await processNewLead("l8");
    expect(m.notifyLeadPush.mock.calls[0][1].title).toBe("Neue Empfehlung: jetzt anrufen");
    m.prisma.lead.findUnique.mockResolvedValue({ id: "l7", name: "B", source: "Meta", customerId: "c1", isTest: false, customer: { plan: "x" }, referralLink: null });
    await processNewLead("l7");
    expect(m.notifyLeadPush.mock.calls[1][1].tag).toBe("lead-buyer:l7");
  });
});

describe("Heute: Empfehlung ganz oben bis zum ersten Anruf", () => {
  const row = (o: Record<string, unknown>) => ({
    id: "x",
    name: "X",
    phone: "491700000000",
    source: "Meta",
    createdAt: new Date(NOW.getTime() - 60 * 60_000),
    firstContactAt: null,
    callStartedAt: null,
    referralLink: null,
    outreachAt: null,
    outreachStatus: null,
    waConsent: null,
    waUnavailableAt: null,
    mailStrecke: null,
    appointments: [],
    conversations: [],
    ...o,
  });

  it("steht vor „Kein WhatsApp“, mit Grund und Gesprächseinstieg", async () => {
    m.prisma.lead.findMany.mockResolvedValue([
      row({ id: "kein-wa", waUnavailableAt: new Date(), createdAt: new Date(NOW.getTime() - 5 * 60_000) }),
      row({
        id: "emp",
        source: "Empfehlung",
        outreachAt: new Date(NOW.getTime() - 30 * 60 * 60_000),
        outreachStatus: "skipped_contact",
        createdAt: new Date(NOW.getTime() - 30 * 60 * 60_000),
        referralLink: { kind: "contact", lead: { name: "Julia Schneider" }, existingCustomer: null },
      }),
    ]);
    const out = await getCallbackLeads("c1");
    expect(out.map((c) => c.id)).toEqual(["emp", "kein-wa"]);
    expect(out[0]).toMatchObject({ urgent: true, reason: "Empfehlung von Julia", empfehlung: { einstieg: "„Julia hat mir erzählt, dass …“" } });
  });

  it("nach dem ersten Anruf nicht mehr oben, sondern „nachfassen“", async () => {
    m.prisma.lead.findMany.mockResolvedValue([
      row({
        id: "emp",
        source: "Empfehlung",
        firstContactAt: new Date(NOW.getTime() - 20 * 60 * 60_000),
        outreachAt: new Date(NOW.getTime() - 30 * 60 * 60_000),
        outreachStatus: "skipped_contact",
        createdAt: new Date(NOW.getTime() - 30 * 60 * 60_000),
        referralLink: { kind: "contact", lead: { name: "Julia" }, existingCustomer: null },
      }),
    ]);
    const [c] = await getCallbackLeads("c1");
    expect(c.urgent).toBeUndefined();
    expect(c.empfehlung).toBeUndefined();
    expect(c.reason).toBe("Empfehlung, noch kein Termin: nachfassen");
  });
});
