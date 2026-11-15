import { describe, expect, it } from "vitest";
import { BUSINESS_CONFIRM_TEXT, checkBusiness, normalizeVatId, vatIdFormatOk } from "@/lib/unternehmer";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("Unternehmereigenschaft bei der Annahme", () => {
  it("USt-IdNr.: Format, keine Online-Prüfung", () => {
    expect(normalizeVatId("de 295.007-828")).toBe("DE295007828");
    expect(vatIdFormatOk("DE295007828")).toBe(true);
    expect(vatIdFormatOk("DE29500782")).toBe(false);
    expect(vatIdFormatOk("ATU12345678")).toBe(true);
    expect(vatIdFormatOk("US123456789")).toBe(false);
  });
  it("Firma und Bestätigung sind Pflicht, USt-IdNr. freiwillig", () => {
    expect(checkBusiness(null)).toMatchObject({ ok: false });
    expect(checkBusiness({ company: "A", confirmed: true })).toMatchObject({ ok: false, error: expect.stringContaining("Firma") });
    expect(checkBusiness({ company: "Agentur Weber", confirmed: false })).toMatchObject({ ok: false, error: expect.stringContaining("Unternehmer") });
    expect(checkBusiness({ company: "Agentur Weber", vatId: "DE1", confirmed: true })).toMatchObject({ ok: false, error: expect.stringContaining("USt-IdNr.") });
    expect(checkBusiness({ company: "  Agentur   Weber ", vatId: "", confirmed: true })).toEqual({ ok: true, company: "Agentur Weber", vatId: null });
    expect(checkBusiness({ company: "Agentur Weber", vatId: "de295007828", confirmed: true })).toEqual({ ok: true, company: "Agentur Weber", vatId: "DE295007828" });
  });
  it("Bestätigungstext nennt § 14 BGB, ohne Gedankenstriche", () => {
    expect(BUSINESS_CONFIRM_TEXT).toContain("§ 14 BGB");
    expect(hatGedankenstrich(BUSINESS_CONFIRM_TEXT)).toBe(false);
  });
});
