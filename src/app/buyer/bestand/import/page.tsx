import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { lastUndoableImport } from "@/lib/bestand/import";
import { ImportUndoButton } from "@/components/bestand/import-undo";
import { ImportFlow } from "./import-flow";

export const metadata = { title: "Bestandskunden importieren | performancegrowth" };

export default async function ImportPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true } });
  if (ctx.teamRole !== "owner") redirect("/buyer");
  if (!c?.existingCustomersEnabled) redirect("/buyer/bestand");
  const last = await lastUndoableImport(ctx.customerId);
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/buyer/bestand" className="text-sm text-[color:var(--brand)] hover:underline">
        ← Bestand
      </Link>
      <PageHeader title="Bestandskunden importieren" subtitle="Excel oder CSV aus Ihrem Bestandssystem. Erneut hochladen aktualisiert vorhandene Kunden." />
      <ImportFlow />
      {last && last.removable > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] pt-4 text-sm text-[color:var(--muted)]" data-import-last>
          <span className="min-w-0 flex-1">
            Falsch zugeordnet? Der letzte Import hat {last.removable.toLocaleString("de-DE")} Kunden neu angelegt.
          </span>
          <ImportUndoButton
            readOnly={ctx.preview}
            run={{ createdAt: last.createdAt.toISOString(), fileName: last.fileName, created: last.created, updated: last.updated, removable: last.removable }}
          />
        </div>
      ) : null}
    </main>
  );
}
