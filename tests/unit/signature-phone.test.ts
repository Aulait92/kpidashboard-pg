import { describe, expect, it } from "vitest";
import { extractSignaturePhone } from "@/lib/vertrieb/signature-phone";

describe("extractSignaturePhone", () => {
  it("findet die beschriftete Nummer in der Signatur", () => {
    const t = "Hallo Herr Kannapinn,\ngerne, rufen Sie mich an.\n\nMit freundlichen Grüßen\nMax Muster\nAgentur Muster\nTel.: 040 / 123 456 78\nFax: 040 / 123 456 79";
    expect(extractSignaturePhone(t)).toBe("040 / 123 456 78");
  });

  it("nimmt Mobil-Nummer, wenn nur die da ist", () => {
    expect(extractSignaturePhone("Grüße\nMax\nMobil: +49 171 1234567")).toBe("+49 171 1234567");
    expect(extractSignaturePhone("Grüße\nMax\nM +49 (0) 171 1234567")).toBe("+49 (0) 171 1234567");
  });

  it("nimmt eine unbeschriftete Nummer auf eigener Zeile", () => {
    expect(extractSignaturePhone("Viele Grüße\nMax Muster\n0171 1234567\nwww.muster.de")).toBe("0171 1234567");
  });

  it("ignoriert Fax, zitierten Verlauf, eigene Nummern, Datum und Servicenummern", () => {
    expect(extractSignaturePhone("Grüße\nFax: 040 1234567")).toBeNull();
    expect(extractSignaturePhone("Ja gerne.\n\nAm 12.11.2026 schrieb Ole:\n> Tel: 0151 99999999")).toBeNull();
    expect(extractSignaturePhone("Grüße\nTel: 0151 99999999", ["+49 151 99999999"])).toBeNull();
    expect(extractSignaturePhone("Termin am 12.11.2026 passt")).toBeNull();
    expect(extractSignaturePhone("Hotline: Tel 0180 5 123456")).toBeNull();
    expect(extractSignaturePhone("PLZ 20095 Hamburg")).toBeNull();
  });

  it("Tel und Fax in einer Zeile: nimmt Tel", () => {
    expect(extractSignaturePhone("Tel. 0421 123456 | Fax 0421 123457")).toBe("0421 123456");
    expect(extractSignaturePhone("T: 0421 123456 F: 0421 123457")).toBe("0421 123456");
  });
});
