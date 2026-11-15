import { describe, expect, it } from "vitest";
import { bildTyp, logoKandidaten, svgBereinigen } from "@/lib/branding-logo";
import { folien, markeFuer, praesentationHtml } from "@/lib/praesentation";

describe("logoKandidaten", () => {
  it("nimmt das Logo im Kopfbereich vor Social-Icons und og:image", () => {
    const html = `<html><head><link rel="apple-touch-icon" href="/touch.png"><meta property="og:image" content="https://cdn.x.de/og.jpg"></head>
<body><header><a href="/"><img src="/assets/allianz-logo.svg" alt="Allianz Logo"></a></header>
<main><img src="/team.jpg" alt="Team"></main><footer><img src="/facebook-logo.png" alt="facebook"></footer></body></html>`;
    const k = logoKandidaten(html, "https://agentur-lohmann.allianz.de/");
    expect(k[0]).toBe("https://agentur-lohmann.allianz.de/assets/allianz-logo.svg");
    expect(k).toContain("https://agentur-lohmann.allianz.de/touch.png");
    // og:image (meist ein Foto) nur, wenn es sonst keinen Kandidaten gibt (Ole, 15.11.2026)
    expect(k).not.toContain("https://cdn.x.de/og.jpg");
    expect(k.indexOf("https://agentur-lohmann.allianz.de/facebook-logo.png")).toBeGreaterThan(0);
    expect(k).not.toContain("https://agentur-lohmann.allianz.de/team.jpg");
  });

  it("liest srcset und data-src, eingebettete Bilder (data:) sind Kandidaten", () => {
    const k = logoKandidaten(`<img class="site-logo" data-src="logo@2x.png"><img alt="logo" src="data:image/png;base64,AAA">`, "https://makler.de/seite/");
    expect(k).toEqual(["https://makler.de/seite/logo@2x.png", "data:image/png;base64,AAA"]);
  });
});

describe("bildTyp und svgBereinigen", () => {
  it("erkennt Formate am Inhalt", () => {
    expect(bildTyp("", new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(bildTyp("", new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBe("image/svg+xml");
    expect(bildTyp("text/html", new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("entfernt Skripte und Handler", () => {
    const s = svgBereinigen(`<svg onload="alert(1)"><script>alert(2)</script><a href="javascript:x"><rect/></a></svg>`);
    expect(s).not.toMatch(/script|onload|javascript/);
  });
});

describe("Logo auf den Folien", () => {
  it("zeigt das bestätigte Logo auf der Titelfolie und im Fuß", () => {
    const m = markeFuer({ name: "Allianz Agentur Lohmann" }, "data:image/png;base64,QUJD");
    const d = {
      lead: { name: "Anna Muster", telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
      termin: { startsAt: new Date("2026-11-20T10:00:00Z"), mode: "video", berater: "Max Lohmann", meetUrl: null },
      zusammenfassung: null,
      formular: [],
      angaben: null,
      vorbereitetAm: null,
    };
    const fs = folien(d as never, null, m);
    expect(fs[0].html).toContain('class="titellogo" src="data:image/png;base64,QUJD"');
    expect(praesentationHtml(fs, m, "x")).toContain('<span class="marke"><img src="data:image/png;base64,QUJD"');
    const ohne = folien(d as never, null, markeFuer({ name: "Makler Muster" }));
    expect(ohne[0].html).not.toContain("titellogo");
  });
});

// Ole, 15.11.2026: Allianz-Agenturseite (vertretung.allianz.de/agentur.lohmann) mit Inline-SVG im Kopf
describe("Logo als eingebettetes SVG (Allianz-Agenturseiten)", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40"><text x="0" y="30">Allianz</text><script>alert(1)</script></svg>`;
  const b64 = Buffer.from(svg).toString("base64");
  const html = `<html><head>
    <link rel="icon" href="/favicon.jpg" sizes="192x192">
    <meta property="og:image" content="https://vertretung.allianz.de/buehne.jpg">
  </head><body><header>
    <img class="c-header__logo-image-mobile" alt="Zur Startseite: Allianz Versicherung" src="data:image/svg+xml;base64,${Buffer.from(svg.replace("Allianz<", "A<")).toString("base64")}">
    <img class="c-header__logo-image" alt="Zur Startseite: Allianz Versicherung" src="data:image/svg+xml;base64,${b64}">
  </header><img src="https://www.google.com/logo-bewertungen.png" class="google-logo"></body></html>`;

  it("nimmt die Desktop-Wortmarke als ersten Kandidaten, og:image fällt weg", async () => {
    const { logoKandidaten, bildAusDataUri } = await import("@/lib/branding-logo");
    const k = logoKandidaten(html, "https://vertretung.allianz.de/agentur.lohmann/");
    expect(k[0]).toBe(`data:image/svg+xml;base64,${b64}`);
    expect(k).not.toContain("https://vertretung.allianz.de/buehne.jpg");
    const img = bildAusDataUri(k[0])!;
    expect(img.type).toBe("image/svg+xml");
    const text = new TextDecoder().decode(img.data);
    expect(text).toContain("Allianz");
    expect(text).not.toContain("<script");
  });

  it("og:image nur als letzter Rückfall, data:-URIs anderer Typen nicht", async () => {
    const { logoKandidaten, bildAusDataUri } = await import("@/lib/branding-logo");
    expect(logoKandidaten(`<meta property="og:image" content="/foto.jpg">`, "https://x.de/")).toEqual(["https://x.de/foto.jpg"]);
    expect(logoKandidaten(`<img class="logo" src="data:text/html;base64,PGh0bWw+">`, "https://x.de/")).toEqual([]);
    expect(bildAusDataUri("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%2F%3E%3C%2Fsvg%3E")?.type).toBe("image/svg+xml");
  });
});
