import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { whatsAppChatsWhere } from "@/lib/vertrieb/whatsapp-verlauf";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";

// WhatsApp-Verlauf in der Akte: welche Chats der Support-Nummer gehören zur Person?
describe("whatsAppChatsWhere", () => {
  it("ohne Kontakt, Kunde und Nummer: nichts suchen", () => {
    expect(whatsAppChatsWhere({})).toBeNull();
    expect(whatsAppChatsWhere({ phones: [null, "abc"] })).toBeNull();
  });

  it("nur Chats der Support-Nummer, zugeordnet über Kontakt bzw. Kunde", () => {
    expect(whatsAppChatsWhere({ salesContactId: "sc1", customerId: "c1" })).toEqual({
      customerId: SUPPORT_CUSTOMER_ID,
      OR: [{ salesContactId: "sc1" }, { linkedCustomerId: "c1" }],
    });
  });

  it("gleiche Nummer in jeder Schreibweise, aber nur bei noch nicht zugeordneten Chats", () => {
    const w = whatsAppChatsWhere({ salesContactId: "sc1", phones: ["0151 1234 5678", "+49 151 12345678", "+43 660 1234567"] });
    expect(w?.OR?.[1]).toEqual({
      phoneDigits: { in: ["15112345678", "436601234567"] },
      contactLinkManual: false,
      salesContactId: null,
      linkedCustomerId: null,
    });
  });
});
