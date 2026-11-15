// Einladung von 360dialog: passender Webmail-Link zur Login-Adresse (Ole, 15.11.2026).
import { describe, expect, it } from "vitest";
import { webmailLink } from "@/app/buyer/einrichtung/wa-invited";

describe("webmailLink", () => {
  it("kennt die großen Anbieter", () => {
    expect(webmailLink("ole+test6@gmail.com")?.label).toBe("Gmail öffnen");
    expect(webmailLink("a@outlook.de")?.label).toBe("Outlook öffnen");
    expect(webmailLink("a@gmx.de")?.label).toBe("GMX öffnen");
  });
  it("ohne bekannten Anbieter kein Link", () => {
    expect(webmailLink("info@agentur-muster.de")).toBeNull();
  });
});
