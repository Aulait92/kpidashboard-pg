import { beforeEach, describe, expect, it, vi } from "vitest";

// Claude wird simuliert: geprüft wird nur unsere Logik drumherum
// (Anfrage-Aufbau, JSON-Auswertung, Link-Filter, Ablehnung).
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

import { askHilfe, HILFE_PAGES } from "@/lib/hilfe";

const reply = (text: string, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text }] });
const base = { question: "Wie reklamiere ich einen Lead?", history: [], page: "/buyer/leads/abc", role: "owner" as const, whatsapp: true };

describe("KI-Hilfe", () => {
  beforeEach(() => create.mockReset());

  it("liest Antwort und Links aus und behält nur erlaubte Seiten", async () => {
    create.mockResolvedValue(reply(JSON.stringify({ answer: "Lead öffnen → „Mehr“ → „Stornieren“.", links: ["/buyer/leads", "/admin/geheim", "/buyer/konto", "/buyer/zahlen"] })));
    const res = await askHilfe(base);
    expect(res.answer).toContain("Stornieren");
    expect(res.links.map((l) => l.href)).toEqual(["/buyer/leads", "/buyer/konto"]);
    expect(res.links[0].label).toBe(HILFE_PAGES["/buyer/leads"]);
  });

  it("schickt die Anleitung gecacht im System-Prompt und die Rolle mit der Frage", async () => {
    create.mockResolvedValue(reply(JSON.stringify({ answer: "ok", links: [] })));
    await askHilfe({ ...base, role: "advisor", whatsapp: false });
    const req = create.mock.calls[0][0];
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0].text).toContain("<anleitung>");
    expect(req.system[0].text).toContain("Reklamieren");
    const last = req.messages.at(-1).content as string;
    expect(last).toContain("Berater");
    expect(last).toContain("keinen WhatsApp-Assistenten");
    expect(last).toContain("/buyer/leads/abc");
    expect(req.output_config.format.type).toBe("json_schema");
  });

  it("antwortet freundlich bei Ablehnung", async () => {
    create.mockResolvedValue({ stop_reason: "refusal", content: [] });
    const res = await askHilfe(base);
    expect(res.answer).toMatch(/Bedienung der App/);
    expect(res.links).toEqual([]);
  });

  it("fällt bei kaputtem JSON auf den reinen Text zurück", async () => {
    create.mockResolvedValue(reply("Bitte unter „Mehr“ nachsehen."));
    const res = await askHilfe(base);
    expect(res.answer).toBe("Bitte unter „Mehr“ nachsehen.");
    expect(res.links).toEqual([]);
  });

  it("schickt höchstens die letzten 6 Gesprächsschritte mit", async () => {
    create.mockResolvedValue(reply(JSON.stringify({ answer: "ok", links: [] })));
    const history = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: `t${i}` }));
    await askHilfe({ ...base, history });
    expect(create.mock.calls[0][0].messages).toHaveLength(7);
  });

  it("beginnt den mitgeschickten Verlauf immer mit einer Nutzerfrage", async () => {
    create.mockResolvedValue(reply(JSON.stringify({ answer: "ok", links: [] })));
    const history = Array.from({ length: 7 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: `t${i}` }));
    await askHilfe({ ...base, history });
    const msgs = create.mock.calls[0][0].messages;
    expect(msgs[0].role).toBe("user");
    expect(msgs.at(-1).role).toBe("user");
  });

  it("liest die Weitergabe an unser Team aus (ohne Kontaktdaten in der Zusammenfassung)", async () => {
    create.mockResolvedValue(
      reply(JSON.stringify({ answer: "Das klärt unser Team.", links: [], escalate: true, reason: "billing", summary: "Doppelte Abbuchung, Rückfragen an kunde@example.test" })),
    );
    const res = await askHilfe(base);
    expect(res.escalate).toEqual({ reason: "billing", summary: "Doppelte Abbuchung, Rückfragen an [E-Mail]" });
    const schema = create.mock.calls[0][0].output_config.format.schema;
    expect(schema.required).toEqual(expect.arrayContaining(["escalate", "reason", "summary"]));
  });

  it("ohne Weitergabe bleibt escalate leer", async () => {
    create.mockResolvedValue(reply(JSON.stringify({ answer: "ok", links: [], escalate: false, reason: "none", summary: "" })));
    expect((await askHilfe(base)).escalate).toBeNull();
  });
});
