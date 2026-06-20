"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import {
  StornoDialog,
  type StornogrundOption,
} from "@/components/storno-dialog";

// Storno-Button für die Lead-Detail-Page. Öffnet denselben Dialog wie
// der Storno-Button in der Lead-Tabelle. Wird nur gerendert, solange
// der Lead noch nicht storniert ist — wenn doch, zeigt der Aufrufer
// stattdessen ein "Storniert"-Label an.
export function LeadStornoTrigger({
  leadId,
  leadName,
  leadCreatedAt,
  stornoOptions,
}: {
  leadId: string;
  leadName: string | null;
  leadCreatedAt: Date;
  stornoOptions: StornogrundOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
      >
        <Ban className="h-3.5 w-3.5" />
        Stornieren
      </button>
      {open ? (
        <StornoDialog
          leadId={leadId}
          leadName={leadName}
          leadCreatedAt={leadCreatedAt}
          stornoOptions={stornoOptions}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
