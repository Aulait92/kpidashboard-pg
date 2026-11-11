import { describe, expect, it } from "vitest";
import {
  businessCanStart,
  COEX_QUESTION,
  COEX_WITH_PROVIDER,
  CONNECT_PATHS,
  ERROR_HELP,
  GUIDES,
  PATH_OPTIONS,
  parseConnectPath,
  PROVIDER_QUESTION,
  PROVIDER_UNSURE,
  PROVIDER_YES,
} from "@/lib/whatsapp/connect-guide";

describe("Anleitung WhatsApp verbinden", () => {
  it("?weg= wird gelesen (auch a/b/c), Unbekanntes ergibt keine Vorauswahl", () => {
    expect(parseConnectPath("business")).toBe("business");
    expect(parseConnectPath("B")).toBe("business");
    expect(parseConnectPath("a")).toBe("neu");
    expect(parseConnectPath("neu")).toBe("neu");
    expect(parseConnectPath("c")).toBe("privat");
    expect(parseConnectPath("x")).toBeNull();
    expect(parseConnectPath(undefined)).toBeNull();
  });

  it("Reihenfolge nach Häufigkeit: Business-App zuerst, keine Wertung", () => {
    expect(PATH_OPTIONS.map((o) => o.path)).toEqual(["business", "neu", "privat"]);
    for (const o of PATH_OPTIONS) {
      expect(`${o.label} ${o.hint}`).not.toMatch(/empfohlen/i);
    }
  });

  it("jeder Weg hat Checkliste und Schritte und endet zurück bei uns", () => {
    for (const p of CONNECT_PATHS) {
      const g = GUIDES[p];
      expect(g.checklist.length).toBeGreaterThan(0);
      expect(g.steps.length).toBeGreaterThan(0);
      expect(g.steps[g.steps.length - 1].where).toBe("app");
      expect(g.canStart).toBe(true);
    }
  });

  it("Business-App-Weg: QR-Code und Hinweis auf die Business-App-Auswahl", () => {
    const g = GUIDES.business;
    expect(g.steps.some((s) => /QR-Code/.test(s.title))).toBe(true);
    expect(g.steps.some((s) => /WhatsApp Business App verbunden/.test(s.title + s.text))).toBe(true);
    expect(g.checklist.join(" ")).toMatch(/7 Tage/);
  });

  it("Privat-Weg: Löschen zuerst, Alternative WhatsApp Business genannt", () => {
    const g = GUIDES.privat;
    expect(g.tone).toBe("warn");
    expect(g.steps[0].title).toMatch(/löschen/i);
    expect(g.intro).toMatch(/WhatsApp Business/);
    expect(g.intro).toMatch(/Chats bleiben dabei erhalten/);
  });

  it("Business-Weg: anderer Anbieter → selbst starten nur ohne parallele Business-App, sonst Hilfetermin", () => {
    expect(businessCanStart(null, null)).toBe(false);
    expect(businessCanStart("nein", null)).toBe(true);
    expect(businessCanStart("ja", null)).toBe(false);
    expect(businessCanStart("ja", "nein")).toBe(true);
    expect(businessCanStart("ja", "ja")).toBe(false);
    expect(businessCanStart("unklar", null)).toBe(false);
    expect(PROVIDER_QUESTION.question).toMatch(/Superchat/);
    expect(PROVIDER_YES).toMatch(/nichts kündigen/);
    expect(COEX_WITH_PROVIDER).toMatch(/15-Minuten-Hilfetermin/);
  });

  it("keine Gedankenstriche als Stilmittel in den Kundentexten", () => {
    const all = [
      PROVIDER_QUESTION.question,
      PROVIDER_YES,
      COEX_QUESTION,
      COEX_WITH_PROVIDER,
      ...PROVIDER_UNSURE,
      ...PATH_OPTIONS.flatMap((o) => [o.label, o.hint]),
      ...CONNECT_PATHS.flatMap((p) => [GUIDES[p].intro, ...GUIDES[p].checklist, ...GUIDES[p].steps.flatMap((s) => [s.title, s.text, s.pitfall ?? ""])]),
      ...ERROR_HELP,
    ];
    for (const t of all) expect(t).not.toMatch(/ – /);
  });
});
