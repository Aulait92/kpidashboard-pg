import { describe, expect, it } from "vitest";
import { maskEmails, pplSlackFailureText, pplSlackText, sendSlackTest, targetDomain } from "@/lib/ppl/slack";

const base = {
  product: "PKV-Tarifoptimierung",
  firstName: "Erika",
  plz: "36251",
  ort: "Bad Hersfeld",
  customer: "Beispiel GmbH",
  bezug: "Beispiel (Callcenter)",
  adminUrl: "https://app.example.com/admin/ppl?ansicht=geliefert&q=cm1",
};
const okDelivery = {
  label: "E-Mail (maschinenlesbar)",
  ok: true,
  targets: [
    { target: "service@example.com", ok: true },
    { target: "kontakt@example.org", ok: true },
    { target: "geheim123@hook.example.net", ok: true },
  ],
};

describe("Slack je PPL-Lead", () => {
  it("geliefert: Produkt, Bezieher, Vorname und PLZ/Ort, Lieferweg mit Status und Link, keine vollen Kontaktdaten", () => {
    const t = pplSlackText({ ...base, status: "delivered", delivery: okDelivery });
    expect(t).toContain("PPL-Lead geliefert: PKV-Tarifoptimierung");
    expect(t).toContain("Bezieher: Beispiel GmbH (Bezug: Beispiel (Callcenter))");
    expect(t).toContain("Lead: Erika, 36251 Bad Hersfeld");
    expect(t).toContain("Lieferweg: E-Mail (maschinenlesbar) an 3 Adressen (example.com, example.org, hook.example.net): zugestellt");
    expect(t).toContain("<https://app.example.com/admin/ppl?ansicht=geliefert&q=cm1|Im Admin öffnen>");
    // kein Nachname, keine Telefonnummer, keine E-Mail, keine Hook-Adresse
    expect(t).not.toMatch(/Mustermann|\+49|@|geheim123/);
  });

  it("Dublette, geparkt und ungültig mit Grund", () => {
    expect(pplSlackText({ ...base, status: "duplicate", reason: "schon am 12.11.2026 (Zahnzusatz)" })).toContain("Status: Dublette, schon am 12.11.2026 (Zahnzusatz)");
    expect(pplSlackText({ ...base, status: "parked", reason: "alle Kontingente voll" })).toContain("Status: geparkt, alle Kontingente voll");
    expect(pplSlackText({ ...base, status: "invalid", reason: "keine Telefonnummer und keine E-Mail", firstName: null, plz: null, ort: null })).toContain("Lead: ohne Angaben");
    expect(pplSlackText({ ...base, status: "delivered", wasParked: true })).toContain("geliefert (war geparkt)");
  });

  it("geparkt: nennt die Verfallsfrist (48 h ab Eingang)", () => {
    const text = pplSlackText({ ...base, status: "parked", reason: "alle Kontingente voll", createdAt: new Date("2026-11-20T13:05:00Z") });
    expect(text).toContain("Frist: wird am 22.11. um 14:05 Uhr verworfen, wenn kein Bezug frei wird");
    expect(pplSlackText({ ...base, status: "duplicate", createdAt: new Date("2026-11-20T13:05:00Z") })).not.toContain("Frist");
  });
  it("Auslieferungsfehler: eigene Warnung, Adressen nur als Domain", () => {
    const failed = {
      label: "E-Mail (maschinenlesbar)",
      ok: false,
      error: "geheim123@hook.example.net: rejected",
      targets: [
        { target: "service@example.com", ok: true },
        { target: "geheim123@hook.example.net", ok: false, error: "Mailbox geheim123@hook.example.net rejected" },
      ],
    };
    const main = pplSlackText({ ...base, status: "delivered", delivery: failed });
    expect(main).toContain("FEHLER: hook.example.net: Mailbox …@hook.example.net rejected");
    const warn = pplSlackFailureText({ ...base, status: "delivered", delivery: failed });
    expect(warn).toContain("Lead nicht zugestellt: PKV-Tarifoptimierung");
    expect(warn).toContain("bitte von Hand nachliefern");
    expect(warn).not.toContain("geheim123");
  });

  it("zugestellt mit Hinweis (Pivacom ohne Versand-Postfach): ACHTUNG, Adresse nur als Domain", () => {
    const t = pplSlackText({
      ...base,
      status: "delivered",
      delivery: { label: "E-Mail (Vorlage)", ok: true, hinweis: "leads@pivacom.com: Versand-Postfach nicht verbunden, über Resend gesendet", targets: [{ target: "leads@pivacom.com", ok: true }] },
    });
    expect(t).toContain("zugestellt, ACHTUNG: …@pivacom.com: Versand-Postfach nicht verbunden");
  });

  it("Hilfen", () => {
    expect(targetDomain("A@Example.COM")).toBe("example.com");
    expect(targetDomain("hooks.example.com")).toBe("hooks.example.com");
    expect(maskEmails("an x@y.de und z@w.org")).toBe("an …@y.de und …@w.org");
  });
});

describe("Slack testen (Admin-Knopf)", () => {
  it("nicht eingerichtet, gesendet, Fehler mit Status", async () => {
    expect(await sendSlackTest(null)).toEqual({ state: "nicht eingerichtet" });
    const real = globalThis.fetch;
    const bodies: string[] = [];
    try {
      globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return new Response("ok", { status: 200 });
      }) as typeof fetch;
      expect(await sendSlackTest("https://hooks.slack.example/x")).toMatchObject({ state: "gesendet", status: 200 });
      expect(JSON.parse(bodies[0]).text).toBe("Test: PPL-Benachrichtigung aktiv");
      globalThis.fetch = (async () => new Response("invalid_token", { status: 403 })) as typeof fetch;
      expect(await sendSlackTest("https://hooks.slack.example/x")).toEqual({ state: "fehler", status: 403, error: "invalid_token" });
    } finally {
      globalThis.fetch = real;
    }
  });
});
