"use client";

import { Trash2 } from "lucide-react";
import { deleteDealAction } from "@/app/admin/crm/actions";

// Delete-Button für den Detail-Page-Header. Confirm() reicht — eine
// volle Modal-Lösung wäre für ein gelegentliches Admin-Tooling
// Overkill, der confirm-Dialog ist platform-nativ und unmissverständlich.
export function DeleteDealButton({
  dealId,
  dealName,
}: {
  dealId: string;
  dealName: string | null;
}) {
  return (
    <form
      action={deleteDealAction}
      onSubmit={(e) => {
        const name = dealName ?? "diesen Deal";
        if (
          !confirm(
            `"${name}" wirklich löschen?\nDer Deal wird in Airtable UND im Dashboard entfernt, inkl. allen Activities.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="dealId" value={dealId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Deal löschen
      </button>
    </form>
  );
}
