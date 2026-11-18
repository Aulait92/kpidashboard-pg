// Terminarten (Ole, 18.11.2026): Regeln und Texte ohne DB.
import { describe, expect, it } from "vitest";
import { asTerminFormate, erlaubterModus, nurVideoSatz, terminArtRegel, TERMIN_FORMATE_TEXT } from "@/lib/termin-formate";
import { zugangText, terminArtWort } from "@/lib/showup";
import { customerEventDescription, customerEventSummary } from "@/lib/whatsapp/event-text";
import { buchungsText } from "@/lib/whatsapp/gespraech";

const aus = { telefon: false, vorOrt: false };
const person = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };

describe("Terminarten", () => {
  it("Video immer, Telefon und vor Ort nur freigegeben", () => {
    expect(erlaubterModus("video", aus)).toBe("video");
    expect(erlaubterModus(undefined, aus)).toBe("video");
    expect(erlaubterModus("phone", aus)).toBeNull();
    expect(erlaubterModus("onsite", aus)).toBeNull();
    expect(erlaubterModus("phone", { telefon: true, vorOrt: false })).toBe("phone");
    expect(erlaubterModus("onsite", { telefon: true, vorOrt: false })).toBeNull();
    expect(erlaubterModus("onsite", { telefon: false, vorOrt: true })).toBe("onsite");
  });

  it("Formularwerte: nur true zählt, Standard aus", () => {
    expect(asTerminFormate(null)).toEqual(aus);
    expect(asTerminFormate({ telefon: "on", vorOrt: 1 })).toEqual(aus);
    expect(asTerminFormate({ telefon: true, vorOrt: true })).toEqual({ telefon: true, vorOrt: true });
  });

  it("Prompt-Regel nennt nur Freigegebenes, sonst den Video-Satz", () => {
    expect(terminArtRegel("sie", aus)).toContain("Buche trotzdem per Video.");
    expect(terminArtRegel("sie", aus)).not.toMatch(/darfst du/);
    const beide = terminArtRegel("du", { telefon: true, vorOrt: true });
    expect(beide).toContain("Telefon (modus phone) oder einen Termin vor Ort in der Agentur (modus onsite)");
    expect(beide).toContain(nurVideoSatz("du"));
  });

  it("Texte: Sie und Du, ohne Gedankenstriche", () => {
    expect(nurVideoSatz("sie")).toBe("Der Termin findet per Video statt, das geht ganz einfach am Handy, ohne App.");
    expect(nurVideoSatz("du")).toBe("Der Termin findet per Video statt, das geht ganz einfach an deinem Handy, ohne App.");
    for (const t of [nurVideoSatz("sie"), nurVideoSatz("du"), TERMIN_FORMATE_TEXT]) expect(t).not.toMatch(/[–—]/);
    expect(TERMIN_FORMATE_TEXT).toBe(
      "Ihre Termine finden per Video statt. Das bringt die meisten Termine, weil Ihre Kunden ohne Anfahrt teilnehmen können. Falls ein Kunde ausdrücklich etwas anderes wünscht, darf Ihr Assistent auch anbieten:",
    );
  });

  it("Vor Ort: Adresse in Bestätigung, Erinnerung und Kalendereintrag", () => {
    const ort = "Agentur Kannapinn, Musterstraße 1, 10115 Berlin";
    expect(buchungsText({ an: "du", start: new Date("2026-11-20T10:00:00Z"), mode: "onsite", meetUrl: null, person, ort })).toMatch(/^Dein Termin vor Ort ist gebucht: [^]*\nAdresse: Agentur Kannapinn/);
    expect(zugangText("sie", person, "onsite", null, ort)).toBe(`Adresse: ${ort}`);
    expect(terminArtWort("onsite")).toBe("Termin vor Ort");
    expect(customerEventSummary("onsite", "Herrn Kannapinn")).toBe("Beratung vor Ort mit Herrn Kannapinn");
    const d = customerEventDescription({ hi: "Guten Tag,", mode: "onsite", phone: null, videoUrl: null, manageUrl: "https://x/m", advisorName: "Ole Kannapinn", ort });
    expect(d).toContain(`Der Termin findet vor Ort statt: ${ort}`);
    expect(d).not.toMatch(/ruft|Videocall/);
  });
});
