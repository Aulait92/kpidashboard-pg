"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { stopLeadSequenceAction } from "@/app/buyer/sequence-actions";

export function LeadSequenceStop({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await stopLeadSequenceAction(leadId);
          if (!res.ok) {
            toast.show({ message: res.error ?? "Das hat nicht geklappt.", tone: "error" });
            return;
          }
          toast.show({ message: "Automatisches Nachfassen gestoppt", tone: "success" });
          router.refresh();
        })
      }
    >
      Automatisches Nachfassen stoppen
    </Button>
  );
}
