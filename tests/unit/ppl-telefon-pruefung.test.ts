import { describe, expect, it } from "vitest";
import { pruefeTelefon } from "@/lib/ppl/telefon-pruefung";

describe("Pay-per-Lead: Formatprüfung der Telefonnummer", () => {
  it("lässt echte deutsche Mobil- und Festnetznummern durch", () => {
    for (const n of ["+49 172 6332605", "+49 1515 3781542", "015173920481", "4915173920481", "+49 2822 80415", "+49 89 802394", "030 25 37 62 10", "0049 711 2050"]) {
      expect(pruefeTelefon(n), n).toMatchObject({ ok: true });
    }
  });

  it("schließt falsche Nummern aus", () => {
    expect(pruefeTelefon("+49 491 5257616788")).toMatchObject({ ok: false }); // zu lang (Storno Lead 3016)
    expect(pruefeTelefon("+4930123")).toMatchObject({ ok: false }); // zu kurz
    expect(pruefeTelefon("0151 11111111")).toMatchObject({ ok: false, grund: "Fantasienummer (gleiche Ziffern)" });
    expect(pruefeTelefon("0170 1234567")).toMatchObject({ ok: false, grund: "Fantasienummer (Ziffernreihe)" });
    expect(pruefeTelefon("+43 664 1234567")).toMatchObject({ ok: false, grund: "keine deutsche Telefonnummer" });
    expect(pruefeTelefon("0800 1234567")).toMatchObject({ ok: false });
    expect(pruefeTelefon("0900 5123456")).toMatchObject({ ok: false });
    expect(pruefeTelefon("abc")).toMatchObject({ ok: false });
    expect(pruefeTelefon("")).toMatchObject({ ok: false, grund: "keine Telefonnummer" });
  });
});
