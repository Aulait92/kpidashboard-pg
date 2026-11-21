import { getAppUrl } from "@/lib/email";
import { listPageForms, metaDiagnostics, type MetaForm } from "@/lib/meta-leads";
import { prisma } from "@/lib/prisma";

/** Wert im Feld „Kunde“ beim Zuordnen: Formular gehört dem Vertrieb (Oles eigene Vermittler-Leads, Ole 18.11.2026). */
export const VERTRIEB_ZIEL = "__vertrieb__";

// Daten des Lead-Eingangs (Meta-Verbindung, Zuordnungen, Posteingang ohne Zuordnung, Formulare einer Seite):
// gemeinsam für /admin/lead-eingang und den neuen Admin (/admin/neu/leads).
export async function loadLeadEingang(page?: string) {
  const [diag, sources, customers, products, unassigned, vertriebForms] = await Promise.all([
    metaDiagnostics(),
    prisma.leadSource.findMany({ include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.customer.findMany({ where: { plan: { not: "internal" }, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.unassignedLead.groupBy({ by: ["formId"], where: { resolvedAt: null }, _count: { _all: true }, _max: { createdAt: true } }),
    // Formulare des Vertriebs (Oles eigene Vermittler-Leads)
    prisma.vertriebLeadForm.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  // Nur aktive Produkte (Ole, 21.11.2026: Liste bereinigt). Alte Leadquellen nicht mehr mischen, sonst tauchen
  // ausgeblendete Produkte und Tippvarianten wieder auf. Freie Eingabe bleibt möglich.
  const productOptions = products.map((p) => p.name).sort((a, b) => a.localeCompare(b, "de"));

  let forms: MetaForm[] = [];
  let formsError: string | null = null;
  if (page) {
    try {
      forms = await listPageForms(page);
    } catch (err) {
      formsError = err instanceof Error ? err.message : String(err);
    }
  }

  let base = "";
  try {
    base = getAppUrl();
  } catch {
    base = "";
  }
  const metaReady = diag.tokenSet && diag.appSecretSet && diag.verifyTokenSet && !diag.missing.includes("leads_retrieval");

  return { diag, sources, customers, productOptions, unassigned, forms, formsError, base, metaReady, vertriebForms };
}
