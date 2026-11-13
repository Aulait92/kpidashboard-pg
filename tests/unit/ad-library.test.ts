// Gewinner aus der Meta-Werbebibliothek (Ole, 13.11.2026).
import { afterEach, describe, expect, it } from "vitest";
import { libraryWinners, suchbegriffe, winnersBlock } from "@/lib/kampagnen/ad-library";

const NOW = new Date("2026-11-13T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("Meta-Werbebibliothek", () => {
  const before = { ...process.env };
  afterEach(() => {
    process.env = { ...before };
  });

  it("Suchbegriffe je Produkt", () => {
    expect(suchbegriffe("TKV-Katze")).toContain("Katzenversicherung");
    expect(suchbegriffe("Sterbegeld")).toEqual(["Sterbegeldversicherung"]);
    expect(suchbegriffe("Exotisch")).toEqual(["Exotisch"]);
  });

  it("ohne Token keine Abfrage", async () => {
    delete process.env.META_AD_LIBRARY_TOKEN;
    delete process.env.META_ACCESS_TOKEN;
    let called = false;
    const r = await libraryWinners("TKV-Katze", { fetchFn: (async () => ((called = true), new Response("{}"))) as unknown as typeof fetch });
    expect(r).toEqual([]);
    expect(called).toBe(false);
  });

  it("nur aktive, mindestens 30 Tage laufende Anzeigen, ohne Doppelte und ohne eigene Seite, längste zuerst", async () => {
    process.env.META_AD_LIBRARY_TOKEN = "tok";
    const data = [
      { page_name: "Tierversicherer A", ad_creative_bodies: ["Die letzte Tierarztrechnung war zu hoch?"], ad_delivery_start_time: daysAgo(90) },
      { page_name: "Tierversicherer B", ad_creative_bodies: ["Neu gestartet"], ad_delivery_start_time: daysAgo(5) },
      { page_name: "Tierversicherer C", ad_creative_bodies: ["Beendet"], ad_delivery_start_time: daysAgo(200), ad_delivery_stop_time: daysAgo(10) },
      { page_name: "Tierversicherer D", ad_creative_bodies: ["OP-Kosten für Katzen steigen"], ad_creative_link_titles: ["Jetzt vergleichen"], ad_delivery_start_time: daysAgo(45) },
      { page_name: "Agentur Muster", ad_creative_bodies: ["Unsere eigene Anzeige"], ad_delivery_start_time: daysAgo(120) },
    ];
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await libraryWinners("TKV-Katze", { now: NOW, fetchFn, excludePages: ["Agentur Muster"] });
    expect(r.map((a) => a.page)).toEqual(["Tierversicherer A", "Tierversicherer D"]);
    expect(r[0].days).toBe(90);
    expect(urls[0]).toContain("ads_archive");
    expect(decodeURIComponent(urls[0])).toContain('ad_reached_countries=["DE"]');
    expect(winnersBlock(r)).toContain("läuft seit 90 Tagen");
    expect(winnersBlock([])).toBeNull();
  });
});
