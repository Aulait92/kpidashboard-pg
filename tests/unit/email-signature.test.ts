import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mail-guard", () => ({ mailClient: () => ({}) }));
import { signatureHtml, signatureText } from "@/lib/email";

describe("E-Mail-Signatur", () => {
  it("enthält Gruß, Absender und Firmenangaben", () => {
    const t = signatureText();
    expect(t).toMatch(/^Viele Grüße\nOle Kannapinn\nperformancegrowth/);
    expect(t).toContain("Ole Kannapinn UG (haftungsbeschränkt)");
    expect(t).toContain("Geschäftsführer: Ole Kannapinn");
  });
  it("verlinkt E-Mail und Website getrennt (kein kaputtes HTML)", () => {
    const h = signatureHtml("performancegrowth");
    expect(h).toContain('<a href="mailto:ole.kannapinn@performancegrowth.de" style="color:#66758f">ole.kannapinn@performancegrowth.de</a>');
    expect(h).toContain('<a href="https://performancegrowth.de"');
    expect(h).not.toContain('</a>" style=');
  });
});
