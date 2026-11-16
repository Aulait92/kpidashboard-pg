import { describe, expect, it } from "vitest";
import { neuPfadAusReferer, neuRuecksprungAusCookie, neuRuecksprungCookie, ruecksprungZiel } from "@/lib/admin-neu/ruecksprung";
import { neuerPfad } from "@/lib/admin-neu/umzug";

describe("Rücksprung in den neuen Admin nach Fremd-Anmeldungen", () => {
  it("merkt sich nur Seiten unter /admin/neu (ohne Anfrageteil)", () => {
    expect(neuPfadAusReferer("https://app.example.de/admin/neu/zahlen/kosten?x=1")).toBe("/admin/neu/zahlen/kosten");
    expect(neuPfadAusReferer("https://app.example.de/admin/neu/kunden/cm1abc/whatsapp")).toBe("/admin/neu/kunden/cm1abc/whatsapp");
    expect(neuPfadAusReferer("https://app.example.de/admin/einstellungen/bank")).toBeNull();
    expect(neuPfadAusReferer("https://app.example.de/admin/neuigkeiten")).toBeNull();
    expect(neuPfadAusReferer(null)).toBeNull();
    expect(neuPfadAusReferer("kein url")).toBeNull();
  });

  it("Cookie setzen, lesen und löschen", () => {
    const gesetzt = neuRuecksprungCookie("/admin/neu/marketing");
    expect(gesetzt).toMatch(/^pg_neu_back=%2Fadmin%2Fneu%2Fmarketing; Path=\/api;.*Max-Age=900$/);
    expect(neuRuecksprungCookie(null)).toMatch(/Max-Age=0$/);
    const header = `a=1; ${gesetzt.split(";")[0]}; b=2`;
    expect(neuRuecksprungAusCookie(header)).toBe("/admin/neu/marketing");
    // Fremde Ziele werden nie übernommen
    expect(neuRuecksprungAusCookie("pg_neu_back=https%3A%2F%2Fboese.de")).toBeNull();
    expect(neuRuecksprungAusCookie("pg_neu_back=%2Fadmin%2Fneu%2F..%2F..%2Fx")).toBeNull();
  });

  it("ohne Cookie bleibt das alte Ziel, mit Cookie die neue Seite samt Anfrage und Anker", () => {
    expect(ruecksprungZiel("/admin/einstellungen/bank?verbunden=1", null)).toBe("/admin/einstellungen/bank?verbunden=1");
    expect(ruecksprungZiel("/admin/einstellungen/bank?verbunden=1", "pg_neu_back=%2Fadmin%2Fneu%2Fzahlen%2Fkosten")).toBe("/admin/neu/zahlen/kosten?verbunden=1");
    expect(ruecksprungZiel("/admin/whatsapp/settings?support=ok#support", "pg_neu_back=%2Fadmin%2Fneu%2Feinstellungen%2Fwhatsapp")).toBe(
      "/admin/neu/einstellungen/whatsapp?support=ok#support",
    );
  });
});

describe("Umzug: WhatsApp-Einstellungen eines Kunden", () => {
  it("führt ?kunde=, ?c= und #kunde- in die Kundenakte, Reiter WhatsApp", () => {
    expect(neuerPfad("/admin/whatsapp/settings?kunde=cm1abc")).toBe("/admin/neu/kunden/cm1abc/whatsapp");
    expect(neuerPfad("/admin/whatsapp/settings?wa=ok&c=cm1abc#kunde-cm1abc")).toBe("/admin/neu/kunden/cm1abc/whatsapp?wa=ok");
    expect(neuerPfad("/admin/whatsapp/settings#kunde-cm1abc")).toBe("/admin/neu/kunden/cm1abc/whatsapp");
  });

  it("ohne Kunde: Einstellungen → WhatsApp", () => {
    expect(neuerPfad("/admin/whatsapp/settings?support=ok#support")).toBe("/admin/neu/einstellungen/whatsapp?support=ok#support");
  });
});
