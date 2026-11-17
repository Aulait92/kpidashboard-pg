import { describe, expect, it } from "vitest";
import { nummerMail } from "@/lib/mail/nummer-mail";

const kontakt = { fullName: "Max Muster", firstName: "Max", lastName: "Muster", salutation: "herr" } as never;

describe("nummerMail", () => {
  it("Sie-Form mit Terminlink, ohne Gedankenstriche", () => {
    const m = nummerMail({ an: "sie", kontakt, source: "bu", advisor: "Anna Berater", link: "https://x.test/book/anna", signatur: "Anna Berater" });
    expect(m.text).toContain("Ihrer richtigen Telefonnummer");
    expect(m.text).toContain("https://x.test/book/anna");
    expect(m.subject).toMatch(/Telefonnummer/);
    expect(m.text + m.subject).not.toMatch(/[–—]/);
  });
  it("Du-Form ohne Link", () => {
    const m = nummerMail({ an: "du", kontakt, source: null, advisor: "Anna", link: null });
    expect(m.text).toContain("deiner richtigen Telefonnummer");
    expect(m.text).not.toContain("Termin, der");
    expect(m.text).not.toMatch(/\{\w+\}/);
  });
});
