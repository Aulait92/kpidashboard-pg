import { describe, expect, it } from "vitest";
import { mailAllowed } from "@/lib/mail-guard";

describe("Mail-Sperre (MAIL_NUR_AN)", () => {
  const list = ["@performancegrowth.de", "ole.kannapinn*@gmail.com"];
  it("lässt ohne Liste alles durch", () => {
    expect(mailAllowed("kunde@allianz.de", null)).toBe(true);
  });
  it("erlaubt Domain und Muster, sperrt den Rest", () => {
    expect(mailAllowed("ole.kannapinn@performancegrowth.de", list)).toBe(true);
    expect(mailAllowed("Ole <ole.kannapinn+test@gmail.com>", list)).toBe(true);
    expect(mailAllowed("anid.schwarzkopf@allianz.de", list)).toBe(false);
    expect(mailAllowed("x@performancegrowth.de.evil.com", list)).toBe(false);
    expect(mailAllowed("oleXkannapinn@gmail.com", list)).toBe(false);
  });
});
