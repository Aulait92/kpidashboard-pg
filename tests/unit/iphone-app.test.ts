// iPhone-App (Ole, 24.11.2026): Geräteerkennung, welche Karte wann, Wortlaute im Einrichtungsschritt und auf „Heute“,
// Knopf in der Neuigkeit.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/buyer/einrichtung/actions", () => ({ skipSetupStepAction: async () => ({}) }));
vi.mock("@/app/buyer/app-hinweis-actions", () => ({ appHinweisWegklickenAction: async () => undefined }));

import { appHinweisArt, geraetAusUserAgent, IOS_APP_STORE_URL } from "@/lib/app-store";
import { AppHinweisKarte, IphoneAppSchritt } from "@/components/iphone-app";
import { RichText } from "@/components/neuigkeiten";

const UA = {
  app: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 performancegrowthApp/1.0",
  appAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 performancegrowthApp/1.0",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
};

describe("iPhone-App: Gerät und Karte", () => {
  it("erkennt App, iPhone, Android und Computer am User-Agent", () => {
    expect(geraetAusUserAgent(UA.app)).toBe("app");
    expect(geraetAusUserAgent(UA.appAndroid)).toBe("app");
    expect(geraetAusUserAgent(UA.iphone)).toBe("iphone");
    expect(geraetAusUserAgent(UA.android)).toBe("android");
    expect(geraetAusUserAgent(UA.ipad)).toBe("desktop");
    expect(geraetAusUserAgent(UA.windows)).toBe("desktop");
    expect(geraetAusUserAgent(null)).toBe("desktop");
  });

  it("zeigt die Karte nie in der App, nie nach App-Anmeldung oder Wegklicken; am Computer nur nach einem iPhone", () => {
    const basis = { appAngemeldet: false, weggeklickt: false, iphoneGesehen: false };
    expect(appHinweisArt({ ...basis, geraet: "app" })).toBeNull();
    expect(appHinweisArt({ ...basis, geraet: "iphone" })).toBe("iphone");
    expect(appHinweisArt({ ...basis, geraet: "android" })).toBe("android");
    expect(appHinweisArt({ ...basis, geraet: "desktop" })).toBeNull();
    expect(appHinweisArt({ ...basis, geraet: "desktop", iphoneGesehen: true })).toBe("desktop");
    for (const g of ["iphone", "android", "desktop"] as const) {
      expect(appHinweisArt({ ...basis, iphoneGesehen: true, geraet: g, appAngemeldet: true })).toBeNull();
      expect(appHinweisArt({ ...basis, iphoneGesehen: true, geraet: g, weggeklickt: true })).toBeNull();
    }
  });

  it("Store-Link ist der veröffentlichte App-Store-Eintrag", () => {
    expect(IOS_APP_STORE_URL).toBe("https://apps.apple.com/de/app/performancegrowth/id6838442707");
  });
});

describe("iPhone-App: Oberfläche", () => {
  const schritt = (geraet: "iphone" | "desktop" | "android" | "app", angemeldet = false) =>
    renderToStaticMarkup(createElement(IphoneAppSchritt, { geraet, appUrl: "app.example.org", readOnly: false, angemeldet }));

  it("Einrichtung: Hauptknopf zum Store, „Ich habe kein iPhone“, am Computer zusätzlich der QR-Code", () => {
    const iphone = schritt("iphone");
    expect(iphone).toContain("Installieren Sie zum Schluss die iPhone-App, damit Sie jeden neuen Lead sofort sehen und noch in den ersten Minuten anrufen können.");
    expect(iphone).toContain("iPhone-App installieren");
    expect(iphone).toContain(`href="${IOS_APP_STORE_URL}"`);
    expect(iphone).toContain("Ich habe kein iPhone");
    expect(iphone).not.toContain("Kamera");
    const desktop = schritt("desktop");
    expect(desktop).toContain("iPhone-App installieren");
    expect(desktop).toContain("Kamera Ihres iPhones");
    // Android: gleich der Hinweis auf die Android-App und der Web-App-Weg
    expect(schritt("android")).toContain("Die Android-App kommt bald, bis dahin sehen Sie alle neuen Leads wie gewohnt hier im Browser.");
    expect(schritt("desktop", true)).toContain("Sie sind in der iPhone-App angemeldet.");
  });

  it("Heute: Karte je Gerät mit den freigegebenen Wortlauten", () => {
    const iphone = renderToStaticMarkup(createElement(AppHinweisKarte, { art: "iphone" }));
    expect(iphone).toContain("Laden Sie die App, dann sehen Sie jeden neuen Lead sofort und können in den ersten 5 Minuten anrufen.");
    expect(iphone).toContain(">App laden<");
    expect(iphone).toContain(IOS_APP_STORE_URL);
    expect(iphone).toContain("Hinweis schließen");
    const desktop = renderToStaticMarkup(createElement(AppHinweisKarte, { art: "desktop" }));
    expect(desktop).toContain("Halten Sie die Kamera Ihres iPhones auf den Code, dann öffnet sich die App direkt im App Store.");
    const android = renderToStaticMarkup(createElement(AppHinweisKarte, { art: "android" }));
    expect(android).toContain("Die Android-App kommt bald, bis dahin sehen Sie alle neuen Leads wie gewohnt hier im Browser.");
    expect(android).not.toContain(IOS_APP_STORE_URL);
  });

  it("Neuigkeiten: Zeile nur mit Link wird ein Knopf, Links im Text bleiben Links, nur https", () => {
    const html = renderToStaticMarkup(
      createElement(RichText, { text: `Text mit **fett** und [Link](https://example.org/a).\n\n[Jetzt im App Store laden](${IOS_APP_STORE_URL})\n\n[böse](javascript:alert(1))` }),
    );
    expect(html).toContain("<b");
    expect(html).toContain('href="https://example.org/a"');
    expect(html).toMatch(/data-update-knopf[^>]*>Jetzt im App Store laden</);
    expect(html).not.toContain('href="javascript');
  });
});
