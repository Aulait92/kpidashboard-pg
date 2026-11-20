import { describe, expect, it } from "vitest";
import { pushAdresse, pushWeiche } from "@/lib/admin-neu/push-ziel";

describe("Push-Ziele der Admins in beiden Oberflächen", () => {
  it("markiert nur alte Admin-Adressen, Anfrage und Anker bleiben", () => {
    expect(pushAdresse("/admin/marketing/linkedin")).toBe("/admin/marketing/linkedin?von=push");
    expect(pushAdresse("/admin/monatsberichte?monat=2026-10")).toBe("/admin/monatsberichte?monat=2026-10&von=push");
    expect(pushAdresse("/admin/nutzung#hilfe-team")).toBe("/admin/nutzung?von=push#hilfe-team");
    expect(pushAdresse("/admin")).toBe("/admin?von=push");
    expect(pushAdresse("/admin/neu/kunden")).toBe("/admin/neu/kunden");
    expect(pushAdresse("/admin/neuigkeiten")).toBe("/admin/neuigkeiten?von=push");
    expect(pushAdresse("/")).toBe("/");
    expect(pushAdresse("/buyer/leads")).toBe("/buyer/leads");
    expect(pushAdresse(undefined)).toBeUndefined();
    // doppelt markieren schadet nicht
    expect(pushAdresse("/admin/ppl?von=push")).toBe("/admin/ppl?von=push");
  });

  it("ohne Marke: nichts tun", () => {
    expect(pushWeiche({ pathname: "/admin/marketing/linkedin", search: "", neueOberflaeche: true })).toBeNull();
    expect(pushWeiche({ pathname: "/admin/neu/marketing", search: "?von=push", neueOberflaeche: true })).toBeNull();
  });

  it("alte Oberfläche: alte Adresse ohne Marke", () => {
    expect(pushWeiche({ pathname: "/admin/marketing/linkedin", search: "?von=push", neueOberflaeche: false })).toBe("/admin/marketing/linkedin");
    expect(pushWeiche({ pathname: "/admin/ppl", search: "?ansicht=storno&von=push", neueOberflaeche: false })).toBe("/admin/ppl?ansicht=storno");
  });

  it("neue Oberfläche: fertige neue Seite (LinkedIn, Bank, Monatsberichte, Status, Empfehlungen, Akten)", () => {
    const neu = (url: string) => {
      const [pathname, q = ""] = url.split("?");
      return pushWeiche({ pathname, search: q ? `?${q}` : "", neueOberflaeche: true });
    };
    expect(neu(pushAdresse("/admin/marketing/linkedin"))).toBe("/admin/neu/marketing");
    expect(neu(pushAdresse("/admin/einstellungen/bank"))).toBe("/admin/neu/zahlen/kosten/konten");
    expect(neu(pushAdresse("/admin/monatsberichte?monat=2026-10"))).toBe("/admin/neu/kunden/berichte?monat=2026-10");
    expect(neu(pushAdresse("/admin/einstellungen/status"))).toBe("/admin/neu/einstellungen/status");
    expect(neu(pushAdresse("/admin/marketing/empfehlungen"))).toBe("/admin/neu/marketing/empfehlungen");
    expect(neu(pushAdresse("/admin/kunden/cm1abc/abrechnung"))).toBe("/admin/neu/kunden/cm1abc/abrechnung");
    expect(neu(pushAdresse("/admin/vertrieb/kontakte/cm2xyz"))).toBe("/admin/neu/vertrieb/kontakte/cm2xyz");
    expect(neu(pushAdresse("/admin/ppl?ansicht=hvk"))).toBe("/admin/neu/leads/ppl?ansicht=hvk");
    expect(neu(pushAdresse("/admin/whatsapp?c=conv1"))).toBe("/admin/neu/leads/chats?c=conv1");
    expect(neu(pushAdresse("/admin"))).toBe("/admin/neu");
  });

  it("neue Oberfläche ohne fertige neue Seite: alte Adresse", () => {
    expect(pushWeiche({ pathname: "/admin/gibt-es-nicht", search: "?von=push", neueOberflaeche: true })).toBe("/admin/gibt-es-nicht");
  });
});
