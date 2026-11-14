import { describe, expect, it } from "vitest";
import { a, asAnsprache, begruessung } from "@/lib/ansprache";
import { isTemplateRevisionOf, templateBodyFor, templateNameFor } from "@/lib/whatsapp/template-plan";
import { isSieTemplateName, SIE_TEMPLATE_TEXT, SUGGESTED_TEMPLATE_TEXT, templateTextFor } from "@/lib/whatsapp/templates";

describe("Ansprache Sie/Du (14.11.2026)", () => {
  it("Standard ist Sie; Begrüßung je Ansprache", () => {
    expect(asAnsprache(undefined)).toBe("sie");
    expect(asAnsprache("du")).toBe("du");
    expect(a("sie", "dich", "Sie")).toBe("Sie");
    expect(begruessung("sie", "Anna Beispiel")).toBe("Hallo Anna Beispiel");
    expect(begruessung("sie", "Anna")).toBe("Guten Tag");
    expect(begruessung("du", "Anna Beispiel")).toBe("Hallo Anna");
  });

  it("WhatsApp: eigener Vorlagenname und Text für die Sie-Fassung, Kampagnen unverändert", () => {
    expect(templateNameFor("outreach", "v1", "sie")).toBe("pg_outreach_v1_sie");
    expect(templateNameFor("outreach", "v1", "du")).toBe("pg_outreach_v1");
    expect(templateNameFor("campaign_review", "v1", "sie")).toBe("pg_campaign_review_v1");
    expect(templateTextFor("outreach", "sie")).toContain("Ihre Anfrage");
    expect(templateBodyFor("outreach", "Anid Brand", "sie")).toContain("Anid Brand");
    expect(isSieTemplateName("pg_outreach_v1_sie_r2")).toBe(true);
    expect(isSieTemplateName("pg_outreach_v1_r2")).toBe(false);
    expect(isTemplateRevisionOf("pg_outreach_v1_r3", "pg_outreach_v1")).toBe(true);
    expect(isTemplateRevisionOf("pg_outreach_v1_sie", "pg_outreach_v1")).toBe(false);
  });

  it("keine Gedankenstriche und kein Duzen in den Sie-Fassungen", () => {
    for (const t of Object.values(SIE_TEMPLATE_TEXT)) {
      expect(t).not.toMatch(/[–—]/);
      expect(t).not.toMatch(/\b(du|dich|dir|dein|deine)\b/i);
    }
    for (const t of Object.values(SUGGESTED_TEMPLATE_TEXT)) expect(t).not.toMatch(/[–—]/);
  });
});
