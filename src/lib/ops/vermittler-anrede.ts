// Diagnose (nur lesend, Ole 17.11.2026): Kunden ohne Anrede in den Anbieterangaben (Erstinformation.anrede). Ohne
// Anrede nennt der Assistent den Vermittler mit Vor- und Nachnamen statt „Herr/Frau Nachname“
// (lib/vermittler-nennung.ts). Nur Anzahl, Kunden-ID und Kundenname, keine Personendaten von Leads.
//   GET /api/ops/diagnose?q=vermittler-anrede[&alle=1]   (ohne alle=1: nur aktive Konten ohne Testkonten)

import { prisma } from "@/lib/prisma";

export async function vermittlerAnrede(params: URLSearchParams) {
  const alle = params.get("alle") === "1";
  const rows = await prisma.customer.findMany({
    where: { archived: false, ...(alle ? {} : { isTest: false, dormantSince: null }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, erstinformation: { select: { anrede: true, name: true } }, agentConfig: { select: { active: true } } },
  });
  const ohne = rows.filter((c) => !c.erstinformation?.anrede);
  return {
    kunden: rows.length,
    ohneAnrede: ohne.length,
    bewusstKeine: rows.filter((c) => c.erstinformation?.anrede === "keine").length,
    liste: ohne.map((c) => ({ id: c.id, name: c.name, assistentAktiv: !!c.agentConfig?.active, nameInAnbieterangaben: !!c.erstinformation?.name })),
  };
}
