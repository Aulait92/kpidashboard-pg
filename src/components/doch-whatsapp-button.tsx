"use client";

// „Hat doch WhatsApp“ im Hinweis „Kein WhatsApp“ (Ole, 23.11.2026, app/buyer/stammdaten-actions.ts dochWhatsAppAction)

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { dochWhatsAppAction } from "@/app/buyer/stammdaten-actions";

export function DochWhatsAppButton({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await dochWhatsAppAction(leadId);
          toast.show({ message: r.text });
          router.refresh();
        })
      }
      className="inline-flex min-h-10 items-center gap-1.5 font-medium underline underline-offset-2 disabled:opacity-60"
      data-doch-whatsapp
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Hat doch WhatsApp
    </button>
  );
}
