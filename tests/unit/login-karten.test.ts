import { describe, expect, it } from "vitest";
import { ADMIN_START, immerNeuStart, neuStartFuer } from "@/lib/admin-neu/schalter";
import { ADVISOR_BLOCKED_TARGET, cardClickHref, loginTarget, nextCardCounter, parseCardCounter, pickCard, safeInternalPath } from "@/lib/login-karten";

describe("Login-Karten: Rotation", () => {
  it("Zähler: +1 je Aufruf, ohne/kaputtes Cookie zufällig", () => {
    expect(nextCardCounter("4", () => 0.9)).toBe(5);
    expect(nextCardCounter(undefined, () => 0.5)).toBe(500);
    expect(nextCardCounter("abc", () => 0)).toBe(0);
    expect(nextCardCounter("-3", () => 0.002)).toBe(2);
    expect(nextCardCounter("999999", () => 0)).toBe(0);
    expect(parseCardCounter("12345678")).toBeNull();
    expect(parseCardCounter("7")).toBe(7);
  });

  it("reihum durch die aktiven Karten", () => {
    const cards = ["sparte", "bestand"];
    expect([0, 1, 2, 3].map((n) => pickCard(cards, n))).toEqual(["sparte", "bestand", "sparte", "bestand"]);
    expect(pickCard(["eine"], 41)).toBe("eine");
    expect(pickCard([], 3)).toBeNull();
  });

  it("Link der Karte geht über die Klick-Zählung", () => {
    expect(cardClickHref("login-karte-sparte")).toBe("/api/login-info/klick?id=login-karte-sparte");
  });
});

describe("Login-Karten: Ziel nach der Anmeldung", () => {
  it("nur interne Pfade, keine offenen Weiterleitungen", () => {
    expect(safeInternalPath("/buyer/konto#produkte")).toBe("/buyer/konto#produkte");
    expect(safeInternalPath("/buyer/leads?q=a b")).toBeNull();
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "buyer", "/\tevil", "", null, 5]) {
      expect(safeInternalPath(bad)).toBeNull();
    }
  });

  it("Inhaber: direkt zur verlinkten Seite", () => {
    expect(loginTarget({ role: "BUYER", teamRole: "owner" }, "/buyer/bestand")).toBe("/buyer/bestand");
    expect(loginTarget({ role: "BUYER", teamRole: "owner" }, "/buyer/konto#produkte")).toBe("/buyer/konto#produkte");
  });

  it("Berater: Seiten nur für Inhaber → Startseite mit Hinweis, andere Seiten direkt", () => {
    expect(loginTarget({ role: "BUYER", teamRole: "advisor" }, "/buyer/konto#produkte")).toBe(ADVISOR_BLOCKED_TARGET);
    expect(loginTarget({ role: "BUYER", teamRole: "advisor" }, "/buyer/empfehlen")).toBe(ADVISOR_BLOCKED_TARGET);
    expect(loginTarget({ role: "BUYER", teamRole: "advisor" }, "/buyer/bestand")).toBe(ADVISOR_BLOCKED_TARGET);
    expect(loginTarget({ role: "BUYER", teamRole: "advisor" }, "/buyer/kontakte")).toBe("/buyer/kontakte");
  });

  it("Kunden nie in den Admin-Bereich, Admins ohne Vorschau nicht in den Kundenbereich", () => {
    expect(loginTarget({ role: "BUYER", teamRole: "owner" }, "/admin/zahlen")).toBe("/buyer");
    expect(loginTarget({ role: "BUYER", teamRole: "owner" }, "/buyerx")).toBe("/buyer");
    expect(loginTarget({ role: "ADMIN" }, "/buyer/bestand")).toBe("/admin/neu");
    expect(loginTarget({ role: "ADMIN", preview: true }, "/buyer/bestand")).toBe("/buyer/bestand");
    expect(loginTarget({ role: "ADMIN" }, "/admin/kunden")).toBe("/admin/kunden");
  });

  it("ohne Ziel bzw. bei ungültigem Ziel: Startseite der Rolle", () => {
    expect(loginTarget({ role: "ADMIN" }, "")).toBe("/admin/neu");
    expect(loginTarget({ role: "BUYER", teamRole: "owner" }, "//evil.example")).toBe("/buyer");
    expect(loginTarget({ role: "ADMIN" }, "/login")).toBe("/admin/neu");
    expect(loginTarget({ role: "ADMIN" }, "/api/auth/logout")).toBe("/admin/neu");
  });

  it("Admins: alte Startadressen (/admin, /admin/heute) führen nach der Anmeldung immer auf den neuen Admin", () => {
    expect(loginTarget({ role: "ADMIN" }, "/admin")).toBe("/admin/neu");
    expect(loginTarget({ role: "ADMIN" }, "/admin/")).toBe("/admin/neu");
    expect(loginTarget({ role: "ADMIN" }, "/admin/heute")).toBe("/admin/neu");
    expect(loginTarget({ role: "ADMIN" }, "/admin/heute/aufgaben")).toBe("/admin/heute/aufgaben");
    expect(loginTarget({ role: "ADMIN" }, "/admin/neu/kunden")).toBe("/admin/neu/kunden");
  });
});

describe("Admin-Start ohne Schalter", () => {
  it("/admin führt immer auf den neuen Admin, /admin/heute nur mit Schalter", () => {
    expect(immerNeuStart("/admin")).toBe(true);
    expect(immerNeuStart("/admin/")).toBe(true);
    expect(immerNeuStart("/admin/heute")).toBe(false);
    expect(immerNeuStart("/admin/neu")).toBe(false);
    expect(neuStartFuer("/admin/heute")).toBe(true);
    expect(ADMIN_START).toBe("/admin/neu");
  });
});
