// Weiche eigener Funnel gegen Perspective (Ole, 21.11.2026).
import { describe, expect, it } from "vitest";
import { anteilEigen, PERSPECTIVE_URL_DEFAULT, weichenArm, weichenZiel } from "@/lib/funnel/weiche";
import { decideFunnelHost } from "@/lib/funnel/host";

describe("Funnel-Weiche", () => {
  it("Anteil: Standard 50 %, begrenzt auf 0 bis 1", () => {
    expect(anteilEigen(undefined)).toBe(0.5);
    expect(anteilEigen("0,3")).toBe(0.3);
    expect(anteilEigen("2")).toBe(1);
    expect(anteilEigen("x")).toBe(0.5);
  });

  it("Arm nach Zufallszahl", () => {
    expect(weichenArm(0.1, 0.5)).toBe("eigen");
    expect(weichenArm(0.7, 0.5)).toBe("perspective");
    expect(weichenArm(0.99, 1)).toBe("eigen");
  });

  it("Ziel mit unveränderter Query", () => {
    expect(weichenZiel("eigen", "?utm_source=fb&fbclid=abc")).toBe("/?utm_source=fb&fbclid=abc");
    expect(weichenZiel("eigen", "")).toBe("/");
    expect(weichenZiel("perspective", "?utm_source=fb")).toBe(`${PERSPECTIVE_URL_DEFAULT}?utm_source=fb`);
    expect(weichenZiel("perspective", "", { perspectiveUrl: "https://x.de/a?b=1" })).toBe("https://x.de/a?b=1");
    expect(weichenZiel("perspective", "?c=2", { perspectiveUrl: "https://x.de/a?b=1" })).toBe("https://x.de/a?b=1&c=2");
  });

  it("/go auf der Funnel-Adresse wird zur Weiche umgeschrieben", () => {
    expect(decideFunnelHost({ host: "beitrag.pkv-tarife.com", pathname: "/go", search: "?utm_source=fb" })).toEqual({ kind: "rewrite", pathname: "/f/pkv-beitrag/go", funnel: "pkv-beitrag" });
  });
});
