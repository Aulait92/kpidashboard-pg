"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ActionSheet } from "@/components/ui/sheet";
import { dragCustomer } from "@/app/admin/vertrieb/actions";
import { CUSTOMER_STAGES } from "@/lib/vertrieb/crm";
import type { SalesCustomerStage as CustomerStage } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

// Kundenakte › Kopf: Status (frühere Kunden-Pipeline: Vertrag, Onboarding, Test, Aktiv, Pausiert, Gekündigt) ändern.
// Dieselbe Server Action wie Drag & Drop im alten Board (app/admin/vertrieb/actions.ts: dragCustomer); die Pfeile
// „eine Stufe vor/zurück“ (moveCustomer) sind hier eine Auswahl aller Stufen in einem Fenster.
export function StatusWahl({ contactId, stage }: { contactId: string; stage: CustomerStage }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const current = CUSTOMER_STAGES.find((s) => s.id === stage);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(true)}
        className={cn("badge inline-flex min-h-7 items-center gap-1 transition hover:opacity-80", current?.color, pending && "opacity-60")}
        aria-label={`Status: ${current?.label ?? stage}. Ändern`}
      >
        {current?.label ?? stage}
        <ChevronDown className="h-3 w-3" />
      </button>
      <ActionSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Status ändern"
        actions={CUSTOMER_STAGES.map((s) => ({
          label: s.label,
          tone: s.id === stage ? "primary" : s.id === "GEKUENDIGT" ? "danger" : undefined,
          onSelect: () => {
            if (s.id === stage) return;
            start(async () => {
              await dragCustomer(contactId, s.id);
              router.refresh();
            });
          },
        }))}
      />
    </>
  );
}
