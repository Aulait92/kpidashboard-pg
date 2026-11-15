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
  stepsAfterInvite,
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
    expect(g.steps.some((s) => s.text.includes("Sie wählen: „Yes, Business app“"))).toBe(true);
    // kein SMS-Code beim Business-App-Weg
    expect(g.steps.some((s) => /Verify your phone number/.test(s.title))).toBe(false);
    expect(g.checklist.join(" ")).toMatch(/7 Tage/);
  });

  it("Ablauf wie im echten Durchlauf (Ole, 15.11.2026): Einladung, Log in mit Code, +49, Embedded Signup, Meta, Fast geschafft", () => {
    for (const p of CONNECT_PATHS) {
      const all = GUIDES[p].steps.map((s) => `${s.title} ${s.text} ${s.pitfall ?? ""}`);
      const idx = (re: RegExp) => all.findIndex((t) => re.test(t));
      const order = [
        /Jetzt WhatsApp verbinden/,
        /Join 360Dialog Hub/,
        /„Log in“/,
        /Verify it's you/,
        /USA \(\+1\).*Deutschland \(\+49\)/,
        /already on WhatsApp/,
        /Embedded Signup/,
        /Seamlessly connect your account to 360Dialog/,
        /Add your WhatsApp phone number/,
        /Create a WhatsApp account/,
        /Europe\/Berlin/,
        /Review what you'll share/,
        /Share Cloud API events/,
        /Fast geschafft/,
      ].map(idx);
      expect(order.every((i) => i >= 0), `${p}: ${order.join(",")}`).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(all.join(" ")).toMatch(/Instruct Meta to automatically identify order and lead events/);
      expect(all.join(" ")).toMatch(/Verbindung prüfen/);
      expect(all.join(" ")).toMatch(/Use Meta-provided number/);
    }
    // Neue Nummer: SMS-Code vor dem Meta-Fenster
    const neu = GUIDES.neu.steps.map((s) => s.title);
    expect(neu.findIndex((t) => /Verify your phone number/.test(t))).toBeLessThan(neu.findIndex((t) => /Embedded Signup/.test(t)));
    // Bilder aus dem echten Durchlauf an den passenden Schritten
    const img = (re: RegExp) => GUIDES.neu.steps.find((s) => re.test(s.title))?.image?.src;
    expect(img(/E-Mail von 360dialog/)).toMatch(/01-einladung/);
    expect(img(/already on WhatsApp/)).toMatch(/04-schon-bei-whatsapp/);
    expect(img(/Embedded Signup/)).toMatch(/06-meta-signup/);
  });

  it("Einladungsansicht: Schritte beginnen mit der Anmeldung bei 360dialog", () => {
    for (const p of CONNECT_PATHS) {
      const rest = stepsAfterInvite(p);
      expect(rest[0].title).toMatch(/Log in/);
      expect(rest.some((s) => /Join 360Dialog Hub/.test(s.text))).toBe(false);
      expect(rest[rest.length - 1].where).toBe("app");
    }
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
