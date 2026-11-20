import { describe, expect, it } from "vitest";
import { alteAdresseWeiche, pushAdresse } from "@/lib/admin-neu/push-ziel";

// Seit dem Admin-Umbau 20.11.2026 gibt es nur noch den neuen Admin: Pushes zeigen direkt auf die neue Seite,
// alte Adressen (auch bereits verschickte Pushes mit ?von=push) leiten dauerhaft weiter.
describe("Push-Ziele und alte Admin-Adressen", () => {
  it("Push: alte Admin-Adressen gleich auf die neue Seite, Anfrage und Anker bleiben", () => {
    expect(pushAdresse("/admin/marketing/linkedin")).toBe("/admin/neu/marketing");
    expect(pushAdresse("/admin/monatsberichte?monat=2026-10")).toBe("/admin/neu/kunden/berichte?monat=2026-10");
    expect(pushAdresse("/admin/nutzung#hilfe-team")).toBe("/admin/neu/zahlen/qualitaet#hilfe-team");
    expect(pushAdresse("/admin")).toBe("/admin/neu");
    expect(pushAdresse("/admin/heute")).toBe("/admin/neu");
    expect(pushAdresse("/admin/kunden/cm1abc/abrechnung")).toBe("/admin/neu/kunden/cm1abc/abrechnung");
    expect(pushAdresse("/admin/whatsapp?c=conv1")).toBe("/admin/neu/leads/chats?c=conv1");
  });

  it("Push: neue Adressen, fremde Adressen und Unbekanntes bleiben unverändert", () => {
    expect(pushAdresse("/admin/neu/kunden")).toBe("/admin/neu/kunden");
    expect(pushAdresse("/admin/gibt-es-nicht")).toBe("/admin/gibt-es-nicht");
    expect(pushAdresse("/")).toBe("/");
    expect(pushAdresse("/buyer/leads")).toBe("/buyer/leads");
    expect(pushAdresse(undefined)).toBeUndefined();
  });

  it("Weiche: nur alte Admin-Adressen mit Gegenstück, Push-Marke fällt weg", () => {
    expect(alteAdresseWeiche({ pathname: "/admin/neu/marketing", search: "" })).toBeNull();
    expect(alteAdresseWeiche({ pathname: "/buyer", search: "" })).toBeNull();
    expect(alteAdresseWeiche({ pathname: "/admin/gibt-es-nicht", search: "?von=push" })).toBeNull();
    // Export- und Hilfsrouten der früheren Oberfläche bleiben erreichbar
    expect(alteAdresseWeiche({ pathname: "/admin/leads/export", search: "?von=2026-10-01" })).toBeNull();
    expect(alteAdresseWeiche({ pathname: "/admin/whatsapp/support-verbinden", search: "" })).toBeNull();
    expect(alteAdresseWeiche({ pathname: "/admin/marketing/linkedin", search: "?von=push" })).toBe("/admin/neu/marketing");
    expect(alteAdresseWeiche({ pathname: "/admin/ppl", search: "?ansicht=storno&von=push" })).toBe("/admin/neu/leads/ppl?ansicht=storno");
    expect(alteAdresseWeiche({ pathname: "/admin/einstellungen/bank", search: "" })).toBe("/admin/neu/zahlen/kosten/konten");
    expect(alteAdresseWeiche({ pathname: "/admin/vertrieb/kontakte/cm2xyz", search: "" })).toBe("/admin/neu/vertrieb/kontakte/cm2xyz");
    expect(alteAdresseWeiche({ pathname: "/admin/vertrieb/kontakte/neu", search: "" })).toBe("/admin/neu/vertrieb/kontakte/neu");
    expect(alteAdresseWeiche({ pathname: "/admin/buyers", search: "" })).toBe("/admin/neu/kunden");
    expect(alteAdresseWeiche({ pathname: "/admin/heute", search: "" })).toBe("/admin/neu");
    expect(alteAdresseWeiche({ pathname: "/admin", search: "" })).toBe("/admin/neu");
  });
});
