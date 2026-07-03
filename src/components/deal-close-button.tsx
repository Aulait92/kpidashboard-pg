"use client";

import { useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { setDealArchivedAction } from "@/app/admin/crm/actions";

// „Geschlossen"-Toggle im Deal-Detail. Ein geschlossener Deal verschwindet aus
// dem aktiven CRM-Kanban, bleibt aber in allen Sales-Statistiken. Wieder-öffnen
// bringt ihn zurück ins Board.
export function DealCloseButton({
  dealId,
  archived,
}: {
  dealId: string;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await setDealArchivedAction(dealId, !archived);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={
        archived
          ? "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[color:var(--muted)] transition hover:border-[color:var(--brand)] disabled:opacity-60"
          : "inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
      }
    >
      {archived ? (
        <>
          <RotateCcw className="h-3.5 w-3.5" /> Wieder öffnen
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3.5 w-3.5" /> Geschlossen
        </>
      )}
    </button>
  );
}
