// Mail-Fenster am Kontakt (27.11.2026): Das Öffnen-Ereignis gilt nur für den gemeinten Kontakt. Sind zwei Kontakte
// gleichzeitig geladen (Heute mit Kontakt rechts, darüber ein zweiter als Fenster), öffnete sonst auch das Mail-Fenster
// des anderen Kontakts (Gefahr: Mail an den falschen Empfänger). Beim Wechsel des Kontakts setzt key={lead.id} alle
// Eingaben zurück (components/lead-detail-body.tsx).
import { describe, expect, it } from "vitest";
import { mailEreignisFuer } from "@/components/lead-mail";

describe("Mail-Fenster nur für den gemeinten Kontakt", () => {
  it("öffnet nur beim passenden Kontakt", () => {
    expect(mailEreignisFuer({ leadId: "a" }, "a")).toBe(true);
    expect(mailEreignisFuer({ leadId: "a" }, "b")).toBe(false);
  });
  it("ohne Angabe (ältere Aufrufer) wie bisher", () => {
    expect(mailEreignisFuer(undefined, "b")).toBe(true);
    expect(mailEreignisFuer({}, "b")).toBe(true);
  });
});
