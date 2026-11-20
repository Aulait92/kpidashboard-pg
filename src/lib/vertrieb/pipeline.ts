import { prisma } from "@/lib/prisma";
import { STAGES } from "@/lib/vertrieb/crm";

// Akquise-Pipeline: Anzahl je Stufe und die zuletzt bearbeiteten Kontakte je Spalte („Neu“ ohne Karten, das sind
// Tausende aus der Agenturliste). Gemeinsam für /admin/vertrieb/pipeline und /admin/neu/vertrieb.
// `neuKarten` (neuer Admin, Umbau 19.11.2026): „Neu“ zeigt die Agenturen mit dem höchsten Potenzial statt eines Hinweises.

export const PIPELINE_PRO_SPALTE = 40;

export async function ladePipeline(opts: { neuKarten?: boolean } = {}) {
  const counts = await prisma.salesContact.groupBy({ by: ["stage"], _count: true });
  const lists = await Promise.all(
    STAGES.map((s) =>
      s.id === "NEU" && !opts.neuKarten
        ? Promise.resolve([])
        : prisma.salesContact.findMany({
            where: { stage: s.id },
            orderBy: s.id === "NEU" ? [{ potentialScore: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }] : { updatedAt: "desc" },
            take: PIPELINE_PRO_SPALTE,
            select: {
              id: true, name: true, city: true, stage: true, linkedinStatus: true, lossReason: true, competitor: true,
              tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { title: true, dueAt: true } },
              campaigns: { select: { sentAt: true, replyCount: true } },
            },
          }),
    ),
  );
  return { countOf: (stage: string) => counts.find((c) => c.stage === stage)?._count ?? 0, contacts: lists.flat() };
}
