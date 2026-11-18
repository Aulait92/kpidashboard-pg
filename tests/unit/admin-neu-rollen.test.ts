// Admin v2, Paket A2: Punkte von Mein Tag je Rolle (lib/admin-neu/rollen.ts).
import { describe, expect, it } from "vitest";
import { punkteJeRolle, rolleVonPunkt, ROLLEN_REIHE } from "@/lib/admin-neu/rollen";
import type { HeuteArea } from "@/lib/admin-heute";
import { BEREICHE } from "@/lib/admin-neu/navigation";

const p = (key: string, area: HeuteArea) => ({ key, area });

describe("Punkte je Rolle", () => {
  it("ordnet nach Bereich, Geld vor Bereich", () => {
    expect(rolleVonPunkt(p("task:1", "Vertrieb"))).toBe("verkaufen");
    expect(rolleVonPunkt(p("linkedin:failed", "Vertrieb"))).toBe("verkaufen");
    expect(rolleVonPunkt(p("ob:c1", "Kunden"))).toBe("betreuen");
    expect(rolleVonPunkt(p("chats:x", "Chats"))).toBe("betreuen");
    expect(rolleVonPunkt(p("forms", "Leads"))).toBe("liefern");
    expect(rolleVonPunkt(p("storno:l1", "Pay-per-Lead"))).toBe("liefern");
    expect(rolleVonPunkt(p("pay:c1", "Kunden"))).toBe("geld");
    expect(rolleVonPunkt(p("bank:open", "System"))).toBe("geld");
    expect(rolleVonPunkt(p("rechnung:steuernummer", "System"))).toBe("geld");
    expect(rolleVonPunkt(p("hb:meta", "System"))).toBe("werkzeuge");
    expect(rolleVonPunkt(p("leadpreis:konto1", "Leads"))).toBe("liefern");
  });

  it("gruppiert in fester Reihenfolge, behält die Reihenfolge innerhalb, lässt leere Rollen weg", () => {
    const g = punkteJeRolle([p("pay:1", "Kunden"), p("task:1", "Vertrieb"), p("ob:1", "Kunden"), p("task:2", "Vertrieb")]);
    expect(g.map((x) => x.rolle)).toEqual(["verkaufen", "betreuen", "geld"]);
    expect(g[0].punkte.map((x) => x.key)).toEqual(["task:1", "task:2"]);
  });

  it("jede Rolle ist ein Bereich der Navigation", () => {
    for (const r of ROLLEN_REIHE) expect(BEREICHE.some((b) => b.id === r)).toBe(true);
  });
});
