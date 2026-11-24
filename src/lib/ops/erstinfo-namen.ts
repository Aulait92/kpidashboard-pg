// Diagnose (nur lesend, Go-live-Prüfung 19.11.2026, B1): Erstinformationen, deren „Vor- und Nachname“ vermutlich der
// interne Kundenname ist (früher Vorbelegung aus Customer.name) oder ein Firmenwort enthält (GmbH, Agentur, Büro,
// Versicherung …). Nur Zählung und Kunden-IDs mit Grund, keine Klarnamen. Ändert nichts.
//   GET /api/ops/diagnose?q=erstinfo-namen[&alle=1]   (ohne alle=1: nur aktive Konten ohne Testkonten)

import { prisma } from "@/lib/prisma";
import { advisorDisplayName } from "@/lib/advisor-name";
import { wirktWieFirma } from "@/lib/erstinformation-shared";

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export type ErstinfoNameGrund = "gleich_kundenname" | "kundenname_ohne_zusatz" | "firmenwort" | "ein_wort";

/** Gründe, warum ein gespeicherter Name verdächtig ist (rein, testbar). Leer = unauffällig. */
export function erstinfoNameGruende(name: string | null | undefined, kundenname: string | null | undefined, firma?: string | null): ErstinfoNameGrund[] {
  const n = norm(name);
  if (!n) return [];
  const out: ErstinfoNameGrund[] = [];
  if (n === norm(kundenname) || (!!firma && n === norm(firma))) out.push("gleich_kundenname");
  else if (n === norm(advisorDisplayName(kundenname))) out.push("kundenname_ohne_zusatz");
  if (wirktWieFirma(name)) out.push("firmenwort");
  if (!n.includes(" ")) out.push("ein_wort");
  return out;
}

export async function erstinfoNamenDiagnose(params: URLSearchParams) {
  const alle = params.get("alle") === "1";
  const rows = await prisma.erstinformation.findMany({
    where: { name: { not: null }, customer: { archived: false, ...(alle ? {} : { isTest: false, dormantSince: null }) } },
    select: { customerId: true, name: true, firma: true, anrede: true, bestaetigtAt: true, fileName: true, customer: { select: { name: true } } },
  });
  const auffaellig = rows.map((r) => ({ r, gruende: erstinfoNameGruende(r.name, r.customer.name, r.firma) })).filter((x) => x.gruende.length);
  const zaehl = (g: ErstinfoNameGrund) => auffaellig.filter((x) => x.gruende.includes(g)).length;
  return {
    hinweis: "Nur lesend. „kundenname_ohne_zusatz“ kann korrekt sein (Kundenname ist der Personenname), bitte im Admin prüfen.",
    mitName: rows.filter((r) => r.name?.trim()).length,
    auffaellig: auffaellig.length,
    jeGrund: {
      gleich_kundenname: zaehl("gleich_kundenname"),
      kundenname_ohne_zusatz: zaehl("kundenname_ohne_zusatz"),
      firmenwort: zaehl("firmenwort"),
      ein_wort: zaehl("ein_wort"),
    },
    kunden: auffaellig.map(({ r, gruende }) => ({
      customerId: r.customerId,
      gruende,
      bestaetigt: !!r.bestaetigtAt,
      eigenesPdf: !!r.fileName,
      mitAnrede: r.anrede === "Herr" || r.anrede === "Frau",
    })),
  };
}
