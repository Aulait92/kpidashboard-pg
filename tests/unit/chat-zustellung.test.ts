// „Nicht zugestellt, erneut gesendet“ (Ole, 25.11.2026, lib/chat-zustellung.ts): Fall 24.11., Erstinformation 18:43
// nicht zugestellt, 18:45 erneut.
import { describe, expect, it } from "vitest";
import { erneutGesendet, istErstinfoNachricht } from "@/lib/chat-zustellung";
import { ERSTINFO_KOPF } from "@/lib/whatsapp/ki-hinweis";

const t = (hhmm: string) => new Date(`2026-11-24T${hhmm}:00+01:00`);
const doc = (id: string, at: string, status: string) => ({ id, direction: "outbound", kind: "document", body: "Unsere Erstinformation …\nErstinformation_X.pdf", status, purpose: null, createdAt: t(at) });

describe("erneutGesendet", () => {
  it("Erstinformation 18:43 nicht zugestellt, 18:45 erneut: nur die erste ist markiert", () => {
    const s = erneutGesendet([doc("b", "18:45", "delivered"), doc("a", "18:43", "failed")]);
    expect([...s]).toEqual(["a"]);
  });
  it("ohne späteren Versand bleibt „nicht zugestellt“ (rot)", () => {
    expect(erneutGesendet([doc("a", "18:43", "failed")]).size).toBe(0);
  });
  it("späterer Versuch ebenfalls fehlgeschlagen: keine Markierung", () => {
    expect(erneutGesendet([doc("a", "18:43", "failed"), doc("b", "18:45", "failed")]).size).toBe(0);
  });
  it("Erstanschreiben mit PDF im Kopf nicht zugestellt, danach das PDF als Dokument: erneut gesendet", () => {
    const kopf = { id: "k", direction: "outbound", kind: "template", body: `${ERSTINFO_KOPF}\nGuten Tag`, status: "failed", purpose: "outreach_kfz", createdAt: t("18:43") };
    expect(istErstinfoNachricht(kopf)).toBe(true);
    expect([...erneutGesendet([kopf, doc("b", "18:45", "sent")])]).toEqual(["k"]);
  });
  it("gleicher Zweck (Erstanschreiben nach „Hat doch WhatsApp“): erneut gesendet; anderer Text: nicht", () => {
    const a = { id: "a", direction: "outbound", kind: "template", body: "Hallo", status: "failed", purpose: "outreach", createdAt: t("18:43") };
    const b = { id: "b", direction: "outbound", kind: "template", body: "Hallo", status: "sent", purpose: "outreach_tkv", createdAt: t("18:50") };
    const c = { id: "c", direction: "outbound", kind: "text", body: "Antwort", status: "sent", purpose: null, createdAt: t("18:51") };
    expect([...erneutGesendet([a, b, c])]).toEqual(["a"]);
    expect(erneutGesendet([a, c]).size).toBe(0);
  });
});
