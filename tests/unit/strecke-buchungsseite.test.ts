import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Chat läuft nach einer Buchung über die Buchungsseite von selbst weiter (Ole, 20.11.2026)
describe("Strecke nach Buchung über die Buchungsseite", () => {
  const strecke = readFileSync("src/lib/whatsapp/termin-strecke.ts", "utf8");
  const action = readFileSync("src/app/book/[slug]/actions.ts", "utf8");
  const cron = readFileSync("src/app/api/whatsapp/cron/route.ts", "utf8");
  it("Komplettcheck auf der Seite beantwortet: Chat macht mit dem nächsten Schritt weiter", () => {
    expect(action).toContain("m.weiterNachBuchungsseite(t!.conversationId!, t!.id, now)");
    expect(strecke).toMatch(/if \(stand\.komplettBeantwortet\) \{[\s\S]*?weiterNachKomplettcheck\(k/);
  });
  it("nur mit aktivem Assistenten, ohne Abmeldung, im 24-Std.-Fenster und nie doppelt", () => {
    const f = strecke.slice(strecke.indexOf("export async function weiterNachBuchungsseite"), strecke.indexOf("export async function runBuchungsseiteNachholen"));
    expect(f).toContain("!conv?.botActive || conv.optedOutAt || !conv.windowExpiresAt");
    expect(f).toContain("if (stand.angebotsfragenAt || stand.vertragsfrageAt || stand.policenBitteAt || stand.langAngebotAt) return false;");
    expect(f).toContain("if (stand.komplettFrageAt || stand.tierFrageLetzte) return false;");
  });
  it("Cron holt nach 15 Min. die erste Frage nach, wenn die Strecke nie begonnen hat", () => {
    expect(cron).toContain("m.runBuchungsseiteNachholen(now)");
    expect(strecke).toContain("createdAt: { lte: new Date(now.getTime() - 15 * 60_000)");
  });
});
