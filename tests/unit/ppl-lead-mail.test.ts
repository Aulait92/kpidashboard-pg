import { describe, expect, it } from "vitest";
import { e164, invalidAddresses, machineMail, parseAddresses } from "@/lib/ppl/lead-mail";
import { testLead } from "@/lib/ppl/test-lead";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const lead = {
  id: "cmlead123",
  date: new Date("2026-11-16T09:30:00.000Z"),
  product: "PKV-Tarifoptimierung",
  name: "Erika Mustermann",
  phone: "4915112345678",
  email: "erika@example.com",
  answers: [
    { label: "Postleitzahl", value: "36251" },
    { label: "Ort", value: "Bad Hersfeld" },
    { label: "Situation", value: "Angestellt – seit 2010" },
    { label: "Monatlicher Beitrag", value: "850" },
    { label: "Aktuelle Versicherung", value: "DKV\nTarif X" },
  ],
  consentText: "Ich willige ein, dass meine Daten an Versicherungsmakler aus dem Partnernetzwerk weitergegeben werden.",
  consentAt: new Date("2026-11-16T09:29:00.000Z"),
};

const lines = (text: string) => Object.fromEntries(text.split("\n").filter((l) => l.includes(": ")).map((l) => [l.slice(0, l.indexOf(": ")), l.slice(l.indexOf(": ") + 2)]));

describe("Lead-Mail „Standard maschinenlesbar“", () => {
  it("Betreff fest, ohne Gedankenstrich", () => {
    const m = machineMail(lead);
    expect(m.subject).toBe("Neuer Lead: PKV-Tarifoptimierung (cmlead123)");
    expect(hatGedankenstrich(m.subject)).toBe(false);
  });

  it("feste Zeilen „Feld: Wert“ in fester Reihenfolge, Antworten, Einwilligung", () => {
    const m = machineMail(lead);
    const rows = m.text.split("\n");
    expect(rows.slice(0, 10)).toEqual([
      "Lead-ID: cmlead123",
      "Datum: 2026-11-16T09:30:00.000Z",
      "Produkt: PKV-Tarifoptimierung",
      "Anrede:",
      "Vorname: Erika",
      "Nachname: Mustermann",
      "Telefon: +4915112345678",
      "E-Mail: erika@example.com",
      "PLZ: 36251",
      "Ort: Bad Hersfeld",
    ]);
    const f = lines(m.text);
    expect(f["Situation"]).toBe("Angestellt, seit 2010");
    expect(f["Monatlicher Beitrag"]).toBe("850");
    expect(f["Aktuelle Versicherung"]).toBe("DKV Tarif X");
    expect(f["Einwilligungstext"]).toContain("Partnernetzwerk");
    expect(f["Einwilligung Zeitpunkt"]).toBe("2026-11-16T09:29:00.000Z");
    // PLZ und Ort nicht doppelt als Antwort
    expect(rows.filter((r) => r.startsWith("Postleitzahl:") || r.startsWith("Ort:")).length).toBe(1);
    expect(hatGedankenstrich(m.text)).toBe(false);
  });

  it("JSON-Block am Ende und Anhang lead.json sind gültiges, gleiches JSON", () => {
    const m = machineMail(lead);
    const last = m.text.split("\n").at(-1)!;
    expect(last.startsWith("JSON: ")).toBe(true);
    const inline = JSON.parse(last.slice(6));
    const file = JSON.parse(m.attachment.content);
    expect(m.attachment.filename).toBe("lead.json");
    expect(inline).toEqual(file);
    expect(inline).toMatchObject({
      lead_id: "cmlead123",
      produkt: "PKV-Tarifoptimierung",
      vorname: "Erika",
      nachname: "Mustermann",
      telefon: "+4915112345678",
      plz: "36251",
      ort: "Bad Hersfeld",
      antworten: { "Monatlicher Beitrag": "850" },
      einwilligung: { zeitpunkt: "2026-11-16T09:29:00.000Z" },
      test: false,
    });
  });

  it("Testdatensatz: [TEST] im Betreff, Name TEST Lead, keine Gedankenstriche", () => {
    const t = testLead("PKV-Tarifoptimierung", new Date("2026-11-16T10:00:00Z"));
    const m = machineMail({ ...t, consentText: null });
    expect(m.subject).toBe("[TEST] Neuer Lead: PKV-Tarifoptimierung (TEST-20261116100000)");
    const f = lines(m.text);
    expect(f["Vorname"]).toBe("TEST");
    expect(f["Nachname"]).toBe("Lead");
    expect(JSON.parse(m.attachment.content).test).toBe(true);
    expect(hatGedankenstrich(m.text)).toBe(false);
  });

  it("Telefon E.164", () => {
    expect(e164("4915112345678")).toBe("+4915112345678");
    expect(e164("+49 151 1234")).toBe("+491511234");
    expect(e164(null)).toBe("");
  });
});

describe("Mehrere Lieferadressen", () => {
  it("Komma, Semikolon, Zeilen; ohne Doppelte; Prüfung", () => {
    const list = parseAddresses("service@example.com, kontakt@example.org;\nabc123@hook.example.net , Service@example.com");
    expect(list).toEqual(["service@example.com", "kontakt@example.org", "abc123@hook.example.net"]);
    expect(invalidAddresses(list)).toEqual([]);
    expect(invalidAddresses(["kein-at.example.com", "a@b"])).toEqual(["kein-at.example.com", "a@b"]);
  });
});
