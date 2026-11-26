import { describe, expect, it } from "vitest";
import { leadMailInhalt, mailEmpfaenger, mailScope, pushEmpfaenger, pushScope } from "@/lib/lead-benachrichtigung-shared";

const u = (id: string, teamRole: "owner" | "advisor", leadMailScope: string | null = null, leadPushScope: string | null = null) => ({
  id,
  email: `${id}@x.de`,
  teamRole,
  leadMailScope,
  leadPushScope,
});

describe("Benachrichtigung bei neuen Leads", () => {
  it("Standard nach Rolle: Inhaber alle, Berater meine; Konto-Schalter aus = E-Mail aus", () => {
    expect(mailScope(u("k", "owner"))).toBe("alle");
    expect(mailScope(u("l", "advisor"))).toBe("meine");
    expect(mailScope(u("k", "owner"), false)).toBe("aus");
    expect(mailScope(u("k", "owner", "meine"), false)).toBe("meine");
    expect(pushScope(u("k", "owner"))).toBe("alle");
    expect(pushScope(u("l", "advisor"))).toBe("meine");
  });

  it("Berater können nicht „alle“ wählen (sehen fremde Leads nicht)", () => {
    expect(mailScope(u("l", "advisor", "alle"))).toBe("meine");
    expect(pushScope(u("l", "advisor", null, "alle"))).toBe("meine");
  });

  it("E-Mail: Inhaber mit alle bekommt Leads der Beraterin, Berater nur eigene, je Login einmal", () => {
    const team = [u("k", "owner"), u("l", "advisor"), u("t", "advisor")];
    expect(mailEmpfaenger(team, "l").map((x) => x.id)).toEqual(["k", "l"]);
    expect(mailEmpfaenger(team, "k").map((x) => x.id)).toEqual(["k"]);
    // ohne Zuständigen: nur Inhaber (Berater sehen den Lead nicht)
    expect(mailEmpfaenger(team, null).map((x) => x.id)).toEqual(["k"]);
    expect(mailEmpfaenger([u("k", "owner", "meine"), u("l", "advisor", "aus")], "l")).toEqual([]);
    // ohne Team nichts (dort gilt „Neue Leads per E-Mail“ am Konto)
    expect(mailEmpfaenger([u("k", "owner")], null)).toEqual([]);
  });

  it("Push: ohne Zuständigen an alle (wie bisher), sonst Zuständige plus Inhaber mit alle", () => {
    const team = [u("k", "owner"), u("l", "advisor"), u("t", "advisor")];
    expect(pushEmpfaenger(team, null).map((x) => x.id)).toEqual(["k", "l", "t"]);
    expect(pushEmpfaenger(team, "l").map((x) => x.id)).toEqual(["k", "l"]);
    expect(pushEmpfaenger([u("k", "owner", null, "meine"), u("l", "advisor")], "l").map((x) => x.id)).toEqual(["l"]);
  });

  it("Mailtext Sie/Du, ohne Gedankenstriche", () => {
    const sie = leadMailInhalt({ du: false, leadName: "Max", produkt: "Kfz", zustaendig: "Lisa", fuerMich: false, url: "https://a/x" });
    expect(sie.paragraphs[0]).toBe("in Ihrem Team gibt es einen neuen Lead.");
    expect(sie.list).toEqual(["Name: Max", "Produkt: Kfz", "Zuständig: Lisa"]);
    const du = leadMailInhalt({ du: true, leadName: null, produkt: null, zustaendig: null, fuerMich: true, url: "https://a/x" });
    expect(du.subject).toBe("Neuer Lead: ohne Name");
    expect(du.paragraphs[0]).toBe("es gibt einen neuen Lead für dich.");
    expect(du.fuss).toContain("stellst du");
    expect(JSON.stringify([sie, du])).not.toMatch(/[–—]/);
  });
});
