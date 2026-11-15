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
    expect(k).toContain("https://cdn.x.de/og.jpg");
    expect(k.indexOf("https://agentur-lohmann.allianz.de/facebook-logo.png")).toBeGreaterThan(0);
    expect(k).not.toContain("https://agentur-lohmann.allianz.de/team.jpg");
  });

  it("liest srcset und data-src, ignoriert data:-URLs", () => {
    const k = logoKandidaten(`<img class="site-logo" data-src="logo@2x.png"><img alt="logo" src="data:image/png;base64,AAA">`, "https://makler.de/seite/");
    expect(k).toEqual(["https://makler.de/seite/logo@2x.png"]);
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
