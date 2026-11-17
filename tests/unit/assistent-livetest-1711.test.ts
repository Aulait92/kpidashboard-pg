// Live-Test Ole, 17.11.2026: freie Wunschzeit direkt buchen; Adresse der Einladung in der Buchungsnachricht nennen.
import { describe, expect, it } from "vitest";
import { buchungsText, einladungAnText, terminRegeln, vermittlerName, WUNSCHZEIT_REGEL } from "@/lib/whatsapp/gespraech";

const person = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "herr", fallback: "Ole" });

describe("Live-Test 17.11.2026", () => {
  it("Wunschzeit frei: direkt buchen, keine zweite Zeit; Regel steht im Prompt", () => {
    expect(WUNSCHZEIT_REGEL).toMatch(/buche sie direkt mit book_appointment/);
    expect(WUNSCHZEIT_REGEL).toMatch(/biete keine zweite Zeit an/);
    const r = terminRegeln({ an: "sie", person, videoOnly: true, beispiel: "…", emailBekannt: true });
    expect(r).toContain(WUNSCHZEIT_REGEL);
  });

  it("Buchungsnachricht nennt die Adresse der Einladung, ohne Gedankenstrich", () => {
    const t = buchungsText({ an: "sie", start: new Date("2026-11-18T15:00:00Z"), mode: "video", meetUrl: "https://meet.example/x", person, email: "ole@example.de" });
    expect(t).toContain("Hier ist Ihr Link: https://meet.example/x\nDie Einladung mit Kalendereintrag ist an ole@example.de unterwegs.");
    expect(t).toContain("schreiben Sie mir einfach die richtige");
    expect(t).not.toMatch(/[–—]/);
    expect(einladungAnText("du", "a@b.de")).toContain("schreib mir einfach");
    const ohne = buchungsText({ an: "sie", start: new Date("2026-11-18T15:00:00Z"), mode: "video", meetUrl: "https://meet.example/x", person });
    expect(ohne).not.toContain("Einladung");
  });
});
