import { describe, expect, it } from "vitest";
import { istMaschine, zaehltAlsGeoeffnet } from "@/lib/offer-view";

// „Vom Interessenten geöffnet“ nur für echte Aufrufe ohne Sitzung (Ole, 18.11.2026, Fall PG-2026-0150)
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const EDGE_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1";

describe("Angebot geöffnet: wer zählt", () => {
  it("Link-Vorschauen und Scanner zählen nicht", () => {
    for (const ua of [
      "Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com",
      "WhatsApp/2.23.20.0",
      "facebookexternalhit/1.1",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17531; Pro)",
      "TelegramBot (like TwitterBot)",
      "",
      null,
    ]) expect(istMaschine(ua), String(ua)).toBe(true);
  });
  it("Browser von Menschen zählen", () => {
    for (const ua of [CHROME_MAC, EDGE_WIN, IPHONE]) expect(istMaschine(ua)).toBe(false);
  });
  it("eingeloggte Admins und Vermittler zählen nie", () => {
    expect(zaehltAlsGeoeffnet({ sessionRole: "ADMIN", userAgent: CHROME_MAC })).toBe(false);
    expect(zaehltAlsGeoeffnet({ sessionRole: "BUYER", userAgent: IPHONE })).toBe(false);
    expect(zaehltAlsGeoeffnet({ sessionRole: null, userAgent: EDGE_WIN })).toBe(true);
    expect(zaehltAlsGeoeffnet({ sessionRole: null, userAgent: "Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5" })).toBe(false);
  });
});
