import { describe, expect, it } from "vitest";
import { fromFlatPayload, fromMetaLead } from "@/lib/lead-intake";
import { leadScope, conversationScope } from "@/lib/team";

describe("Lead-Eingang: Formate", () => {
  it("Meta-Lead: Felder, Formular und Kampagne", () => {
    const inc = fromMetaLead(
      {
        id: "L1",
        created_time: "2026-11-10T08:00:00+0000",
        form_id: "F1",
        campaign_name: "Privatschutz Berlin",
        field_data: [
          { name: "full_name", values: ["Julia Muster"] },
          { name: "phone_number", values: ["+491711234567"] },
          { name: "wofür_interessieren_sie_sich?", values: ["Haftpflicht", "Hausrat"] },
        ],
      },
      "P1",
    );
    expect(inc.externalId).toBe("L1");
    expect(inc.formId).toBe("F1");
    expect(inc.pageId).toBe("P1");
    expect(inc.fields.full_name).toBe("Julia Muster");
    expect(inc.fields["wofür_interessieren_sie_sich?"]).toBe("Haftpflicht, Hausrat");
    expect(inc.createdAt).toBe("2026-11-10T08:00:00.000Z");
  });

  it("Zapier-JSON: technische Felder werden nicht zu Antworten", () => {
    const inc = fromFlatPayload({ id: "Z9", form_id: "F2", ad_name: "Anzeige A", full_name: "Max", email: "max@example.com", platform: "fb" });
    expect(inc.externalId).toBe("Z9");
    expect(inc.formId).toBe("F2");
    expect(inc.adName).toBe("Anzeige A");
    expect(Object.keys(inc.fields).sort()).toEqual(["email", "full_name"]);
  });

  it("ungültiges Datum → jetzt", () => {
    const inc = fromFlatPayload({ created_time: "kein datum" });
    expect(Number.isNaN(new Date(inc.createdAt).getTime())).toBe(false);
  });
});

describe("Team: Sichtbarkeit", () => {
  it("Inhaber sieht alle Leads des Kunden", () => {
    expect(leadScope({ customerId: "c1", userId: "u1", teamRole: "owner" })).toEqual({ customerId: "c1" });
  });
  it("Berater sieht nur zugeteilte Leads", () => {
    expect(leadScope({ customerId: "c1", userId: "u2", teamRole: "advisor" })).toEqual({ customerId: "c1", assignedUserId: "u2" });
  });
  it("Admin-Vorschau (ohne Login-ID) wird nie als Berater behandelt", () => {
    expect(leadScope({ customerId: "c1", userId: null, teamRole: "advisor" })).toEqual({ customerId: "c1" });
  });
  it("Chats eines Beraters: eigene Leads oder selbst übernommen", () => {
    expect(conversationScope({ customerId: "c1", userId: "u2", teamRole: "advisor" })).toEqual({
      customerId: "c1",
      AND: [{ OR: [{ lead: { assignedUserId: "u2" } }, { assignedUserId: "u2" }] }],
    });
  });
});
