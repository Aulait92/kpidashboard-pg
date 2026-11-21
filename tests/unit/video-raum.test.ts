// Video-Link prüfen (Ole, 21.11.2026): Links zu einzelnen Webex-Meetings verfallen und werden abgelehnt.
import { describe, expect, it } from "vitest";
import { istEinzelMeetingLink, pruefeVideoLink } from "@/lib/video-raum";

describe("pruefeVideoLink", () => {
  it("persönlicher Raum ok, ohne https wird ergänzt, leer = entfernen", () => {
    expect(pruefeVideoLink("https://allianz-agn.webex.com/meet/max.muster")).toEqual({ ok: true, url: "https://allianz-agn.webex.com/meet/max.muster" });
    expect(pruefeVideoLink("allianz.webex.com/meet/max.muster")).toEqual({ ok: true, url: "https://allianz.webex.com/meet/max.muster" });
    expect(pruefeVideoLink("  ")).toEqual({ ok: true, url: null });
    expect(pruefeVideoLink("https://meet.google.com/abc-defg-hij").ok).toBe(true);
  });

  it("Link zu einem einzelnen Meeting wird abgelehnt", () => {
    const einzeln = "https://allianz-agn.webex.com/wbxmjs/joinservice/sites/allianz-agn/meeting/download/5993da01316847b9b442b51b8b2a8a3f?MTID=m0908f3a947c00afd7b1895d7674e1d6a";
    expect(istEinzelMeetingLink(einzeln)).toBe(true);
    expect(istEinzelMeetingLink("https://allianz.webex.com/allianz/j.php?MTID=m123")).toBe(true);
    const r = pruefeVideoLink(einzeln);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/persönlichen Raums/);
  });

  it("kein Link", () => {
    expect(pruefeVideoLink("webex").ok).toBe(false);
  });
});
