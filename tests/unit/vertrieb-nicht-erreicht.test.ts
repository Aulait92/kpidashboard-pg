import { describe, expect, it } from "vitest";
import { istWarm, nichtErreichtMail, nichtErreichtStopp, NE_TEMPLATE_BODY, NE_TEMPLATE_EXAMPLES, NE_TEMPLATE_NAME } from "@/lib/vertrieb/nicht-erreicht";
import { SUPPORT_TEMPLATES } from "@/lib/vertrieb/termin-whatsapp";
import { metaTemplateProblems } from "@/lib/whatsapp/template-plan";

const now = new Date("2026-11-23T10:00:00Z");
const kalt = { inbound: false, termin: false, angebot: false, antwort: false, whatsappErlaubt: false, source: null };

describe("Nicht erreicht im Vertrieb", () => {
  it("nur warme Kontakte", () => {
    expect(istWarm(kalt)).toBe(false);
    expect(istWarm({ ...kalt, source: "COLD_CALL" })).toBe(false);
    expect(istWarm({ ...kalt, inbound: true })).toBe(true);
    expect(istWarm({ ...kalt, source: "META_ADS" })).toBe(true);
    expect(istWarm({ ...kalt, antwort: true })).toBe(true);
    expect(istWarm({ ...kalt, whatsappErlaubt: true })).toBe(true);
  });

  it("Stopp: gesperrt, kalt, höchstens einmal je 7 Tage", () => {
    expect(nichtErreichtStopp({ gesperrt: true, warm: true, letzteNachricht: null }, now)).toBe("gesperrt");
    expect(nichtErreichtStopp({ gesperrt: false, warm: false, letzteNachricht: null }, now)).toBe("Kaltkontakt");
    expect(nichtErreichtStopp({ gesperrt: false, warm: true, letzteNachricht: new Date("2026-11-20T10:00:00Z") }, now)).toBe("schon gesendet");
    expect(nichtErreichtStopp({ gesperrt: false, warm: true, letzteNachricht: new Date("2026-11-15T10:00:00Z") }, now)).toBeNull();
    expect(nichtErreichtStopp({ gesperrt: false, warm: true, letzteNachricht: null }, now)).toBeNull();
  });

  it("Mail mit und ohne Buchungslink, ohne Gedankenstriche", () => {
    const m = nichtErreichtMail({ buchungslink: "https://app.example/termin/x" });
    expect(m.button?.url).toBe("https://app.example/termin/x");
    expect(nichtErreichtMail({ buchungslink: null }).button).toBeNull();
    for (const t of [m.subject, ...m.paragraphs, NE_TEMPLATE_BODY]) expect(t).not.toMatch(/[–—]/);
  });

  it("WhatsApp-Vorlage wird mit der Support-Nummer eingereicht und erfüllt Metas Regeln", () => {
    expect(SUPPORT_TEMPLATES.map((t) => t.name)).toContain(NE_TEMPLATE_NAME);
    expect(metaTemplateProblems(NE_TEMPLATE_BODY, NE_TEMPLATE_EXAMPLES)).toEqual([]);
    expect(NE_TEMPLATE_BODY).not.toMatch(/\b(du|dein|dich|dir)\b/i);
  });
});
