// Widerspruch gegen Amazon Web Services (Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“, Ole 24.11.2026): Für den
// Kunden laufen KI für Gesprächszusammenfassungen, KI-Vorschläge der Beratungsdokumentation und das Auslesen von
// Unterlagen nicht mehr. Dieser Wächter hält fest, dass es zum Dienst nur die bekannten Wege gibt und dass jeder davon
// vor dem Aufruf den Widerspruch prüft (auch Hintergrundläufe und Cron). Kommt ein neuer Aufrufer dazu, schlägt der
// Test an: dann dort ebenfalls lib/datennutzung-sperre.ts prüfen und die Liste hier ergänzen.
// Die Laufzeitprüfung (kein Aufruf des Dienstes) steht in tests/integration/datennutzung.test.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function dateien(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "generated" || n === "node_modules") return [];
    return statSync(p).isDirectory() ? dateien(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
/** Quelltext ohne Kommentarzeilen. */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
const ALLE = dateien("src").map((p) => p.replace(/\\/g, "/"));
const mit = (re: RegExp) => ALLE.filter((p) => re.test(code(p))).sort();
/** Rumpf einer Funktion ab ihrer Deklaration bis zur nächsten „export“-Deklaration. */
function rumpf(datei: string, name: string): string {
  const src = code(datei);
  const von = src.search(new RegExp(`export (async )?function ${name}\\b`));
  expect(von, `${name} in ${datei}`).toBeGreaterThanOrEqual(0);
  const rest = src.slice(von + 10);
  const bis = rest.search(/\nexport /);
  return bis < 0 ? rest : rest.slice(0, bis);
}
const vor = (text: string, zuerst: string, danach: string) => {
  const a = text.indexOf(zuerst);
  const b = text.indexOf(danach);
  expect(a, `„${zuerst}“ fehlt`).toBeGreaterThanOrEqual(0);
  expect(b, `„${danach}“ fehlt`).toBeGreaterThanOrEqual(0);
  expect(a, `„${zuerst}“ muss vor „${danach}“ stehen`).toBeLessThan(b);
};

describe("Wege zu Amazon Web Services (Bedrock)", () => {
  it("das Bedrock-SDK steht nur in lib/ki-eu.ts, der Client wird nur an drei Stellen geholt", () => {
    expect(mit(/@anthropic-ai\/bedrock-sdk/)).toEqual(["src/lib/ki-eu.ts"]);
    expect(mit(/\bbedrockClient\(/)).toEqual([
      "src/lib/ki-eu.ts", // Definition und Diagnose ohne Kundendaten (kiEuStatus)
      "src/lib/mail/beratung-ki.ts", // „Mit KI formulieren“
      "src/lib/mail/gruende-ki.ts", // „Gründe vorschlagen“
      "src/lib/policen/auslesen/anbieter/bedrock-eu.ts", // Auslesen von Unterlagen
    ]);
  });

  it("„Mit KI formulieren“ und „Gründe vorschlagen“: nur über lib/zusammenfassung-server.ts, dort zuerst der Widerspruch", () => {
    const server = "src/lib/zusammenfassung-server.ts";
    expect(mit(/\bkiZusammenfassung\(/)).toEqual(["src/lib/mail/beratung-ki.ts", server]);
    expect(mit(/\bgruendeVorschlagen\(/)).toEqual(["src/lib/mail/gruende-ki.ts", server]);
    vor(rumpf(server, "zusammenfassungKi"), "kiAusFuer(t, ctx)", "kiZusammenfassung(");
    vor(rumpf(server, "gruendeVorschlag"), "kiAusFuer(t, ctx)", "gruendeVorschlagen(");
    // Der Zeitpunkt des Widerspruchs kommt mit dem Termin aus derselben Abfrage
    expect(code(server)).toContain("awsWiderspruchAt: true");
    // Aufrufer dieser zwei Funktionen: die Server Actions der beiden Blätter (Zusammenfassung, Beratungsdokumentation)
    expect(mit(/\bzusammenfassungKi\(/)).toEqual(["src/app/buyer/angebot-actions.ts", server]);
    expect(mit(/\bgruendeVorschlag\(/)).toEqual(["src/app/buyer/beratungsdoku-actions.ts", server]);
  });

  it("Auslesen von Unterlagen: ein einziger Aufruf beim Anbieter, davor die Sperre mit dem Widerspruch (jeder Anbieter)", () => {
    const server = "src/lib/policen/auslesen/server.ts";
    expect(mit(/\bwaehleAnbieter\(/)).toEqual(["src/lib/policen/auslesen/anbieter/index.ts", server]);
    expect(mit(/\.liesAus\(/)).toEqual([server]);
    const lies = rumpf(server, "liesUnterlageAus");
    vor(lies, "sperreFuer(doc.customerId, doc.leadId)", "waehleAnbieter()");
    vor(lies, "waehleAnbieter()", "anbieter.liesAus(");
    expect(rumpf(server, "sperreFuer")).toContain(`if (await awsWiderspruchAm(customerId)) return "widerspruch";`);
    // Wer auslesen lässt: Eingang per WhatsApp (Hintergrund), Vergleichsblatt und Sparten-Wahl. Kein Cron liest aus.
    expect(mit(/\bliesUnterlageAus\(/)).toEqual([server]);
    expect(mit(/\bnachEingang\(/)).toEqual(["src/app/buyer/termine/[id]/vorbereitung/vertraege/actions.ts", server, "src/lib/whatsapp/gateway.ts"]);
    expect(code("src/app/api/whatsapp/cron/route.ts")).not.toMatch(/nachEingang|liesUnterlageAus|waehleSparte/);
    // Kein Satz „damit Ihr Vergleich schon fertig ist“ an den Lead, wenn für das Konto nicht ausgelesen wird
    vor(rumpf("src/lib/policen/flow/server.ts", "kiSatzAktiv"), "awsWiderspruchAm(o.customerId)", "return auslesenSpartenDesLeads(");
  });
});

describe("Banner nur auf „Heute“ (Usability-Check 25.11.2026)", () => {
  it("nur die Seite „Heute“ bindet es ein, unter der Überschrift; das Layout lässt die anderen Hinweise zurücktreten", () => {
    const layout = code("src/app/buyer/layout.tsx");
    expect(layout).not.toContain("<DatennutzungBanner");
    expect(layout).toContain("hinweisOffen={datennutzungBanner}");
    expect(layout).toContain("!datennutzungBanner && darfAnalyseFragen(");
    // Bestellkonto und „Nur Leads“ haben ihren eigenen Rahmen und kommen vorher zurück
    vor(layout, "istReinesBestellkonto(ctx.customerId)", "ladeDatennutzung(ctx)");
    vor(layout, "istNurLeadsKonto(ctx.customerId)", "ladeDatennutzung(ctx)");
    // Eingebunden nur auf „Heute“ (alle drei Fassungen: erster Tag, neue und alte Oberfläche)
    expect(mit(/<DatennutzungHeute\b/)).toEqual(["src/app/buyer/page.tsx"]);
    expect(mit(/<DatennutzungBanner\b/)).toEqual(["src/components/datennutzung-heute.tsx"]);
    const heute = code("src/app/buyer/page.tsx");
    expect(heute.match(/<DatennutzungHeute ctx=\{ctx\} \/>/g)?.length).toBe(3);
  });
});
