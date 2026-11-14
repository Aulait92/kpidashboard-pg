// Microsoft-Admin-Freigabe: Link für die IT des Kunden (Ole, 14.11.2026)
import { afterEach, describe, expect, it } from "vitest";
import { microsoftAdminConsentRedirect, microsoftAdminConsentUrl } from "@/lib/microsoft-admin-consent";

describe("microsoftAdminConsentUrl", () => {
  const old = process.env.MICROSOFT_CLIENT_ID;
  afterEach(() => {
    if (old === undefined) delete process.env.MICROSOFT_CLIENT_ID;
    else process.env.MICROSOFT_CLIENT_ID = old;
  });

  it("enthält Client-ID, alle Rechte und den Rücksprung", () => {
    process.env.MICROSOFT_CLIENT_ID = "abc-123";
    const u = new URL(microsoftAdminConsentUrl("https://app.performancegrowth.de/")!);
    expect(u.origin + u.pathname).toBe("https://login.microsoftonline.com/organizations/v2.0/adminconsent");
    expect(u.searchParams.get("client_id")).toBe("abc-123");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.performancegrowth.de/microsoft-freigabe");
    expect(u.searchParams.get("scope")!.split(" ")).toEqual([
      "https://graph.microsoft.com/Calendars.ReadWrite",
      "https://graph.microsoft.com/Mail.Send",
      "https://graph.microsoft.com/User.Read",
      "offline_access",
    ]);
  });

  it("ohne Client-ID oder Adresse kein Link", () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    expect(microsoftAdminConsentUrl("https://x.test")).toBeNull();
    expect(microsoftAdminConsentRedirect(null)).toBeNull();
  });
});
