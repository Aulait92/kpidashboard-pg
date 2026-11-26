// Splittest wa_weiter_knopf (Ole, 26.11.2026): Block „Weiter auf WhatsApp“ auf der Erfolgsansicht der Buchungsseite.
// Fassung a unverändert, Fassung b mit WhatsApp-Knopf, Fortschritt, Nutzen-Satz und QR-Code am Rechner.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { EXPERIMENTE, zuteilen } from "@/lib/experimente";
import { SPLITTEST_HYPOTHESE } from "@/lib/ab-hypothesen";
import { WA_GRUEN, WaWeiterBlock, type WaWeiterProps } from "@/app/book/[slug]/wa-weiter";

const html = (p: Partial<WaWeiterProps> = {}) =>
  renderToStaticMarkup(createElement(WaWeiterBlock, { an: "sie", variante: "a", person: "Herr Schwarzkopf", href: "/book/manage/tok/whatsapp", ...p }));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function kontrast(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (l + 0.05);
}

describe("wa_weiter_knopf", () => {
  it("ist eingetragen: Ziel ist der Klick der Klick-Route, mit Hypothese", () => {
    expect(EXPERIMENTE.wa_weiter_knopf.ziel).toBe("wa_weiter_klick");
    expect(SPLITTEST_HYPOTHESE.wa_weiter_knopf).toMatch(/WhatsApp/);
    // Die Klick-Route meldet genau dieses Ziel mit Lead-, Chat- und Termin-ID (Einheit der Zuteilung ist eine davon)
    expect(readFileSync("src/lib/whatsapp/buchung-whatsapp.ts", "utf8")).toContain('zielErreicht([t.leadId, t.conversationId, t.id], "wa_weiter_klick")');
  });

  it("Zuteilung: fest je Einheit, beide Fassungen kommen vor, unabhängig vom Komplettcheck-Test", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `lead-${i}`);
    const b = ids.filter((id) => zuteilen("wa_weiter_knopf", id) === "b").length;
    expect(b).toBeGreaterThan(150);
    expect(b).toBeLessThan(250);
    for (const id of ids.slice(0, 20)) expect(zuteilen("wa_weiter_knopf", id)).toBe(zuteilen("wa_weiter_knopf", id));
    const gleich = ids.filter((id) => zuteilen("wa_weiter_knopf", id) === zuteilen("komplettcheck_text", id)).length;
    expect(gleich).toBeGreaterThan(150);
    expect(gleich).toBeLessThan(250);
    // Seite: Zuteilung nur, wenn der Block erscheint, Einheit wie beim Komplettcheck
    const page = readFileSync("src/app/book/[slug]/page.tsx", "utf8");
    expect(page).toContain('waZeigen ? await variante("wa_weiter_knopf", appt.leadId ?? appt.conversationId ?? appt.id) : "a"');
  });

  it("Fassung a wie bisher: Titel, Satz, Knopf „Weiter auf WhatsApp“ in Markenfarbe", () => {
    const sie = text(html());
    expect(sie).toContain("Ihr Angebot schneller bekommen");
    expect(sie).toContain("Beantworten Sie jetzt ein paar kurze Fragen per WhatsApp, dann kann Herr Schwarzkopf Ihr Angebot schon vorbereiten.");
    expect(sie).toContain("Weiter auf WhatsApp");
    expect(sie).not.toContain("Noch ein Schritt");
    const h = html();
    expect(h).toContain('href="/book/manage/tok/whatsapp"');
    expect(h).not.toContain(WA_GRUEN);
    expect(h).not.toContain("data-wa-qr");
    expect(text(html({ an: "du", person: "Anid" }))).toContain("Beantworte jetzt ein paar kurze Fragen per WhatsApp, dann kann Anid dein Angebot schon vorbereiten.");
  });

  it("Fassung b: Fortschritt, Nutzen, WhatsApp-Knopf mit Logo, Sie und Du", () => {
    const h = html({ variante: "b", komplettcheck: true, qr: "data:image/png;base64,AAAA" });
    const t = text(h);
    expect(t).toContain("Noch ein Schritt");
    expect(t).toContain("Termin gebucht");
    expect(t).toContain("Komplettcheck");
    expect(h).toContain("<strong");
    expect(t).toContain("Angaben fürs Angebot 1 Minute per WhatsApp");
    expect(t).toContain("Dann hat Herr Schwarzkopf Ihr Angebot im Termin schon vorbereitet.");
    expect(t).toContain("Jetzt Fragen beantworten (1 Minute)");
    expect(t).toContain("öffnet WhatsApp");
    expect(h).toContain("data-wa-logo");
    expect(h).toContain(`background-color:${WA_GRUEN}`);
    expect(h).toContain('href="/book/manage/tok/whatsapp"');
    // Ein Knopf, QR-Code nur ab sm
    expect(h.match(/data-wa-weiter-knopf/g)).toHaveLength(1);
    expect(h).toMatch(/hidden items-center gap-3 sm:flex" data-wa-qr/);
    expect(h).toContain('src="data:image/png;base64,AAAA"');
    const du = text(html({ variante: "b", an: "du", person: "Anid" }));
    expect(du).toContain("Dann hat Anid dein Angebot im Termin schon vorbereitet.");
    expect(du).toContain("Jetzt Fragen beantworten (1 Minute)");
    for (const x of [t, du]) {
      expect(x).not.toMatch(/[–—]/);
      expect(x).not.toMatch(/garantie|versprech|fertig/i);
    }
  });

  it("Fassung b: Komplettcheck nur bei Ja; ohne QR der Hinweis am Rechner", () => {
    const ohne = html({ variante: "b", komplettcheck: false, qr: null });
    expect(text(ohne)).not.toContain("Komplettcheck");
    expect(ohne).not.toContain("data-wa-qr ");
    expect(text(ohne)).toContain("Oder am Handy: Die Fragen kommen auch per WhatsApp.");
    expect(ohne).toMatch(/hidden text-sm[^"]*sm:block" data-wa-qr-text/);
  });

  it("WhatsApp-Grün mit weißer Schrift erfüllt Kontrast 4,5 : 1", () => {
    expect(kontrast(WA_GRUEN)).toBeGreaterThanOrEqual(4.5);
    expect(kontrast("#25D366")).toBeLessThan(4.5);
  });

  it("Seite: Fassung b direkt unter der Terminkarte vor dem Bestätigungssatz, Fassung a an der bisherigen Stelle; ein Primärknopf", () => {
    const page = readFileSync("src/app/book/[slug]/page.tsx", "utf8");
    const b = page.indexOf("{waB ? waBlock : null}");
    const satz = page.indexOf("bestaetigungKurz(an, appt.mode, appt.ort)");
    const kc = page.indexOf("data-komplettcheck>");
    const aStelle = page.indexOf("{waB ? null : waBlock}");
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(satz);
    expect(aStelle).toBeGreaterThan(kc);
    expect(page).toContain('buttonClass(kcFrage || waWeiter ? "secondary" : "primary"');
  });
});
