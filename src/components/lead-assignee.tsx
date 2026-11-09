"use client";

import { useState, useTransition } from "react";
import { UserRound } from "lucide-react";
import { reassignLeadAction } from "@/app/buyer/team/actions";
import { useToast } from "@/components/ui/toast";

/** Zuständigkeit eines Leads (nur Inhaber mit Team). */
export function LeadAssignee({
  leadId,
  current,
  members,
  readOnly,
}: {
  leadId: string;
  current: string | null;
  members: { id: string; name: string }[];
  readOnly: boolean;
}) {
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3">
      <UserRound className="h-4 w-4 text-[color:var(--muted)]" />
      <span className="text-sm font-medium">Zuständig</span>
      <select
        value={value}
        disabled={readOnly || pending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          start(async () => {
            const res = await reassignLeadAction(leadId, next || null);
            if (!res.ok) {
              setValue(prev);
              toast.show({ message: res.error ?? "Das hat nicht geklappt.", tone: "error" });
            } else {
              toast.show({ message: next ? `Lead an ${members.find((m) => m.id === next)?.name} übergeben` : "Zuständigkeit entfernt" });
            }
          });
        }}
        className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2.5 text-sm outline-none focus:border-[color:var(--brand)]"
      >
        <option value="">Niemand (nur Inhaber)</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
