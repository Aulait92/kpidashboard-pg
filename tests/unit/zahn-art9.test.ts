// Rechtsprüfung Nachtrag 16.11.2026 (Art. 9 DSGVO, EuGH C-184/20, C-21/23): Zahnzusatz fragt nach dem Tarifbaustein,
// speichert Antworten neutral und meldet nichts davon an Meta zurück.
import { describe, expect, it } from "vitest";
import { buildEventsData } from "@/lib/capi/shared";
import { scrubSentryEvent } from "@/lib/sentry-redact";
import { ersteFrageRegel, istZahnLead, neutralZahnAngaben, outreachProdukt, ZAHN_KNOEPFE_V4 } from "@/lib/whatsapp/erstanschreiben";
import { freitextButtonsOf, freitextBodyOf, NAECHSTE_FASSUNG, TEMPLATE_BUTTONS } from "@/lib/whatsapp/templates";

describe("Zahnzusatz: neutrale Frage und Knöpfe", () => {
  it("v5 fragt nach dem Tarifbaustein, Knöpfe ohne eigenen Bedarf und höchstens 20 Zeichen", () => {
    const n = NAECHSTE_FASSUNG.outreach_zahn!;
    expect(n.sie).toContain("Welcher Tarifbaustein ist Ihnen am wichtigsten?");
    expect(n.du).toContain("Welcher Tarifbaustein ist dir am wichtigsten?");
    expect(n.knoepfe).toEqual(["Starker Zahnersatz", "Mit Zahnreinigung", "Beides vergleichen"]);
    for (const k of n.knoepfe!) expect(k.length).toBeLessThanOrEqual(20);
    expect(n.sie).not.toMatch(/brauchen sie|ihre zähne|befund|[–—]/i);
  });

  it("Freitext nutzt sofort die neuen Knöpfe, die freigegebene Vorlage bleibt bis zur Einreichung unverändert", () => {
    expect(freitextButtonsOf("outreach_zahn")).toEqual(["Starker Zahnersatz", "Mit Zahnreinigung", "Beides vergleichen"]);
    expect(TEMPLATE_BUTTONS.outreach_zahn).toEqual([...ZAHN_KNOEPFE_V4]);
    expect(freitextBodyOf("outreach_zahn").sie).toContain("Tarifbaustein");
    expect(freitextButtonsOf("outreach_tkv")).toEqual(TEMPLATE_BUTTONS.outreach_tkv);
  });

  it("Prompt: Frage 1 neutral, alte Knöpfe gelten als dieselbe Antwort, keine Fragen nach Befund oder Bedarf", () => {
    const r = ersteFrageRegel("Zahnzusatzversicherung", "Max Berater");
    expect(r).toContain("Welcher Tarifbaustein ist Ihnen am wichtigsten?");
    expect(r).toContain("„Zahnersatz“, „Prophylaxe“, „Beides“");
    expect(r).toContain("Das klären wir am besten im Gespräch.");
    expect(outreachProdukt("Zahnzusatz")?.frage2).toMatch(/keine Fragen zu Befunden, Behandlungen, Beschwerden/);
    expect(istZahnLead("Zahnzusatzversicherung")).toBe(true);
    expect(istZahnLead("Katzenversicherung")).toBe(false);
  });

  it("Antworten werden neutral als gewünschter Tarifbaustein gespeichert", () => {
    expect(neutralZahnAngaben({ interesse: "Zahnersatz", vorhanden: "gesetzlich" })).toEqual({
      tarifwunsch: "Tarif mit starkem Zahnersatz-Baustein",
      vorhanden: "gesetzlich",
    });
    expect(neutralZahnAngaben({ tarifwunsch: "Prophylaxe" })).toEqual({ tarifwunsch: "Tarif mit Zahnreinigung" });
    expect(neutralZahnAngaben({ tarifwunsch: "Mit Zahnreinigung" })).toEqual({ tarifwunsch: "Tarif mit Zahnreinigung" });
    expect(neutralZahnAngaben({ interesse: "Beides." })).toEqual({ tarifwunsch: "Beides vergleichen" });
    expect(neutralZahnAngaben({ wunsch: "Videocall" })).toEqual({ wunsch: "Videocall" });
    expect(neutralZahnAngaben(undefined)).toBeUndefined();
  });
});

describe("Keine Antworten an Meta (Conversions API)", () => {
  it("Nutzlast enthält nur Stufe, Zeit, Lead-ID und beim Abschluss den Wert", () => {
    const rows = JSON.parse(buildEventsData([{ metaLeadId: "1234567890123456", stage: "abschluss", eventTime: new Date("2026-11-16T10:00:00Z"), value: 300 }])) as Record<string, unknown>[];
    expect(Object.keys(rows[0]).sort()).toEqual(["action_source", "custom_data", "event_name", "event_time", "user_data"]);
    expect(Object.keys(rows[0].user_data as object)).toEqual(["lead_id"]);
    expect(Object.keys(rows[0].custom_data as object).sort()).toEqual(["currency", "event_source", "lead_event_source", "value"]);
    expect(JSON.stringify(rows)).not.toMatch(/zahn|prophylaxe|tarif/i);
  });
});

describe("Sentry ohne Nutzer und IP", () => {
  it("scrubSentryEvent entfernt Nutzer samt IP", () => {
    const e = scrubSentryEvent({ user: { ip_address: "1.2.3.4", id: "u1" }, request: { url: "https://app.performancegrowth.de/buyer?x=1" } });
    expect(e.user).toBeUndefined();
    expect(JSON.stringify(e)).not.toContain("1.2.3.4");
  });
});
