import { describe, expect, it } from "vitest";
import { importDelivery } from "@/lib/ppl/import-airtable";

const d = (method: string, o: { receiver?: string; webhookUrl?: string; hasLogin?: boolean } = {}) =>
  importDelivery({ method, receiver: o.receiver ?? "", webhookUrl: o.webhookUrl ?? "", hasLogin: o.hasLogin ?? false });

describe("Airtable-Import: Lieferweg aus „Liefermethode“", () => {
  it("PDF mit Login und Empfänger → Kundenbereich + PDF per Mail", () => {
    expect(d("PDF", { receiver: "makler@example.com", hasLogin: true })).toBe("app_pdf");
    expect(d("pdf", { receiver: "makler@example.com", hasLogin: true })).toBe("app_pdf");
  });
  it("PDF ohne Login: wie bisher E-Mail, wenn ein Empfänger da ist", () => {
    expect(d("PDF", { receiver: "makler@example.com" })).toBe("email");
    expect(d("PDF")).toBe("app");
  });
  it("PDF mit Login, aber ohne Empfänger → Kundenbereich", () => {
    expect(d("PDF", { hasLogin: true })).toBe("app");
  });
  it("übrige Methoden unverändert", () => {
    expect(d("Webhook", { webhookUrl: "https://x.example", hasLogin: true })).toBe("webhook");
    expect(d("Webhook")).toBe("app");
    expect(d("E-Mail", { receiver: "a@example.com", hasLogin: true })).toBe("email");
    expect(d("", { hasLogin: true, receiver: "a@example.com" })).toBe("app");
    expect(d("Excel", { receiver: "a@example.com" })).toBe("email");
  });
});
