import { beforeEach, describe, expect, it, vi } from "vitest";

// „Termin verschoben“: eigene Vorlage, solange noch nicht freigegeben die Bestätigungs-Vorlage.
const sent: string[] = [];
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return {
    ...real,
    sendWhatsAppNotice: vi.fn(async (o: { purpose: string }) => {
      sent.push(o.purpose);
      if (o.purpose === "reschedule" && approved.reschedule === false) throw new real.NoTemplateError("reschedule");
      return { mode: "template" as const, conversationId: "c1" };
    }),
  };
});
const approved: { reschedule: boolean } = { reschedule: true };

import { sendRescheduleNotice } from "@/lib/whatsapp/reminders";
import { SUGGESTED_TEMPLATE_TEXT, PURPOSE_PARAMS } from "@/lib/whatsapp/templates";

const base = { customerId: "k1", to: "4917000000", name: "Julia Muster", startsAt: new Date("2026-12-14T09:00:00Z"), mode: "phone", meetUrl: null, manageUrl: "https://app.example/book/manage/x" };

describe("Termin verschoben", () => {
  beforeEach(() => {
    sent.length = 0;
  });
  it("nutzt die eigene Vorlage", async () => {
    approved.reschedule = true;
    await sendRescheduleNotice(base);
    expect(sent).toEqual(["reschedule"]);
  });
  it("fällt auf die Bestätigungs-Vorlage zurück, solange „Termin verschoben“ nicht freigegeben ist", async () => {
    approved.reschedule = false;
    await sendRescheduleNotice(base);
    expect(sent).toEqual(["reschedule", "booking_confirmation"]);
  });
  it("Text: vier Platzhalter, Berater, keine Gedankenstriche", () => {
    const t = SUGGESTED_TEMPLATE_TEXT.reschedule;
    expect(t.match(/\{\{\d\}\}/g)).toHaveLength(PURPOSE_PARAMS.reschedule.length);
    expect(t).toContain("[Berater]");
    expect(t).not.toMatch(/[–—]/);
  });
});
