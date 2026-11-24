// AVV und Liste der Unterauftragnehmer zum Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“ (Ole, 24.11.2026):
// Amazon Web Services (Bedrock) steht in Anlage 2 und im PDF, künftige Änderungen „in Textform oder im Kundenbereich“,
// neue Fassung. Und: Die neue Fassung blockiert Bestandskunden nicht (keine erneute Zustimmung, keine Sperre).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AVV, LEGAL_VERSION, SUBPROCESSORS, SUBPROCESSORS_PDF_PFAD } from "@/lib/legal-texts";
import { AVV_POLICEN_VERSION, gesundheitFreigegeben } from "@/lib/policen/regeln";
import { UNTERAUFTRAGNEHMER_PDF_NAME, unterauftragnehmerInhalt, unterauftragnehmerPdf } from "@/lib/unterauftragnehmer-pdf";
import { DATENNUTZUNG_EINTRAG } from "@/lib/datennutzung";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const AWS = "Amazon Web Services EMEA SARL (Bedrock)";

describe("Liste der Unterauftragnehmer", () => {
  it("enthält Amazon Web Services (Bedrock) in der Form der übrigen Einträge", () => {
    const e = SUBPROCESSORS.filter((s) => s.name === AWS);
    expect(e).toHaveLength(1);
    expect(e[0]).toEqual({
      name: AWS,
      purpose: "KI-Dienst für Gesprächszusammenfassungen, Beratungsdokumentation und das Auslesen von Versicherungsunterlagen; keine Nutzung zum Training",
      location: "Region Frankfurt (EU); Konzern USA",
    });
    // Namen sind eindeutig (Tabellen auf /rechtliches/avv und /sicherheit nutzen sie als Schlüssel)
    expect(new Set(SUBPROCESSORS.map((s) => s.name)).size).toBe(SUBPROCESSORS.length);
    for (const s of SUBPROCESSORS) for (const t of [s.name, s.purpose, s.location]) expect(t.trim().length, s.name).toBeGreaterThan(1);
  });

  it("PDF: jeder Dienstleister mit Zweck und Ort, Stand wie auf den Rechtsseiten", async () => {
    const inhalt = unterauftragnehmerInhalt();
    expect(inhalt.titel).toBe("Liste der Unterauftragnehmer");
    expect(inhalt.kopf).toContain(`Stand ${LEGAL_VERSION}`);
    expect(inhalt.bloecke.map((b) => b.ueberschrift)).toEqual(SUBPROCESSORS.map((s) => s.name));
    const aws = inhalt.bloecke.find((b) => b.ueberschrift === AWS)!;
    expect(aws.text).toBe("Zweck: KI-Dienst für Gesprächszusammenfassungen, Beratungsdokumentation und das Auslesen von Versicherungsunterlagen; keine Nutzung zum Training\nOrt: Region Frankfurt (EU); Konzern USA");
    for (const t of [inhalt.titel, ...inhalt.kopf, inhalt.fuss]) expect(hatGedankenstrich(t), t).toBe(false);

    const pdf = await unterauftragnehmerPdf();
    expect(Buffer.from(pdf.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
    expect(UNTERAUFTRAGNEHMER_PDF_NAME).toMatch(/\.pdf$/);
  });

  it("Route und Verlinkung: öffentlich unter /rechtliches, verlinkt auf der Detailseite und in Anlage 2 der AVV-Seite", () => {
    expect(SUBPROCESSORS_PDF_PFAD).toBe("/rechtliches/unterauftragnehmer/pdf");
    expect(statSync(join(process.cwd(), "src/app", SUBPROCESSORS_PDF_PFAD, "route.ts")).isFile()).toBe(true);
    // /rechtliches ist ohne Login erreichbar (src/middleware.ts)
    expect(readFileSync("src/middleware.ts", "utf8")).toContain('"/rechtliches"');
    expect(readFileSync("src/app/buyer/einstellungen/datennutzung/page.tsx", "utf8")).toContain("href={SUBPROCESSORS_PDF_PFAD}");
    expect(readFileSync("src/app/rechtliches/avv/page.tsx", "utf8")).toContain("href={SUBPROCESSORS_PDF_PFAD}");
  });
});

describe("AVV", () => {
  const unterauftrag = AVV.find((s) => s.title === "Unterauftragsverarbeiter")!;

  it("künftige Änderungen: Mitteilung in Textform oder im Kundenbereich, Widerspruch binnen 14 Tagen", () => {
    expect(unterauftrag.items[0]).toBe(
      "Der Auftraggeber genehmigt die in Anlage 2 genannten Unterauftragsverarbeiter. Über beabsichtigte Änderungen informiert der Auftragnehmer in Textform oder im Kundenbereich; der Auftraggeber kann innerhalb von 14 Tagen aus wichtigem datenschutzrechtlichem Grund widersprechen.",
    );
  });

  it("neue Fassung, hochgezählt wie bisher (Datum, am selben Tag „Fassung n“)", () => {
    expect(LEGAL_VERSION).toBe("24.11.2026 (Fassung 2)");
    expect(LEGAL_VERSION).toMatch(/^\d{2}\.\d{2}\.\d{4}( \(Fassung \d+\))?$/);
  });
});

function quelltexte(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "generated") return [];
    return statSync(p).isDirectory() ? quelltexte(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("Die neue AVV-Fassung blockiert Bestandskunden nicht", () => {
  it("LEGAL_VERSION steht nur als „Stand“ auf den Rechtsseiten und im PDF: nirgends gespeichert, nirgends geprüft", () => {
    const nutzer = quelltexte("src")
      .filter((p) => /\bLEGAL_VERSION\b/.test(readFileSync(p, "utf8")))
      .map((p) => p.replace(/\\/g, "/"))
      .sort();
    expect(nutzer).toEqual(["src/app/rechtliches/agb/page.tsx", "src/app/rechtliches/avv/page.tsx", "src/lib/legal-texts.ts", "src/lib/unterauftragnehmer-pdf.ts"]);
    // Kein Feld im Datenmodell, das die Fassung von AGB oder AVV je Kunde oder Angebot festhält (dann gäbe es etwas zu
    // vergleichen). Angebote speichern nur die Adressen (termsUrl, dpaUrl); policenAvvVersion gehört zur Anlage unten.
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).not.toMatch(/\b(legalVersion|agbVersion|termsVersion|dpaVersion|avvVersion|agbStand|avvStand)\b/);
  });

  it("die Zustimmung zur Anlage „Versicherungsunterlagen über WhatsApp“ gilt weiter (eigene Version, unverändert)", () => {
    expect(AVV_POLICEN_VERSION).toBe("b-2026-11-17");
    const bestandskunde = { isTest: false, policenIntern: false, policenAvvZugestimmtAt: new Date("2026-11-19T10:00:00Z"), policenAvvVersion: "b-2026-11-17", policenDatenschutzUrl: "https://app.example/datenschutz/policen?k=abc" };
    expect(gesundheitFreigegeben(bestandskunde, {})).toBe(true);
  });
});

describe("Neuigkeit für die Seite „Neuigkeiten“", () => {
  const dir = readdirSync("prisma/migrations").find((n) => n.endsWith("_neuigkeit_ki_anzeigenlernen"))!;
  const sql = readFileSync(join("prisma/migrations", dir, "migration.sql"), "utf8");
  const [, titel, text] = /VALUES\s*\(\s*'[^']+',\s*'([^']+)',\s*'([^']+)'/.exec(sql) ?? [];

  it("eigene Migration nach den Regeln: neu, software, jetzt veröffentlicht, kein Push, wiederholbar", () => {
    expect(dir).toMatch(/^20261124\d{6}_neuigkeit_ki_anzeigenlernen$/);
    expect(sql).toContain(`INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt")`);
    expect(sql).toContain("'neu', 'software', now(), now(), now())");
    expect(sql).not.toContain("pushedAt");
    expect(sql).toContain(`ON CONFLICT ("id") DO NOTHING;`);
  });

  it("Text: Sie-Form, höchstens drei Sätze, Weg in der App fett, keine Gedankenstriche, nie „Garantie“", () => {
    expect(titel).toBe("KI-Hilfe und gemeinsames Anzeigenlernen");
    expect(text).toContain(`**Einstellungen → ${DATENNUTZUNG_EINTRAG}**`);
    expect(text).toContain("Amazon Web Services EMEA SARL, Rechenzentrum Frankfurt");
    expect(text).toContain("Widerspruch");
    expect(text.replace(/\*\*[^*]+\*\*/g, "x").split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeLessThanOrEqual(3);
    expect(hatGedankenstrich(`${titel} ${text}`)).toBe(false);
    expect(`${titel} ${text}`).not.toMatch(/garantie/i);
    expect(`${titel} ${text}`).not.toMatch(/\b(du|dich|dir|dein\w*)\b/i);
    expect(`${titel} ${text}`).not.toMatch(/bedrock|vorlagenVon/i);
  });

  it("ist die jüngste Migration ihres Tages zusammen mit der Schema-Migration (Reihenfolge: Schema, Trigger, Neuigkeit)", () => {
    const alle = readdirSync("prisma/migrations").filter((n) => /^\d{14}_/.test(n)).sort();
    const meine = alle.filter((n) => /_datennutzung_|_neuigkeit_ki_anzeigenlernen$/.test(n));
    expect(meine.map((n) => n.replace(/^\d{14}_/, ""))).toEqual(["datennutzung_hinweis", "datennutzung_nachweis_nur_anhaengen", "neuigkeit_ki_anzeigenlernen"]);
  });
});
