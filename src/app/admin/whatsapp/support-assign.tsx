"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { assignSupportContactAction, type SupportAssignState } from "./actions";

/** Support-Chat von Hand zuordnen (Vertriebskontakt oder Kunde) bzw. Zuordnung lösen. */
export function SupportAssign({ conversationId, manual, linked }: { conversationId: string; manual: boolean; linked: boolean }) {
  const [state, action, pending] = useActionState<SupportAssignState, FormData>(assignSupportContactAction, {});
  return (
    <div className="space-y-2" data-support-assign>
      <form action={action} className="flex gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        <input
          name="q"
          placeholder={linked ? "Andere Zuordnung: Name, Firma, E-Mail" : "Zuordnen: Name, Firma, E-Mail"}
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] px-2.5 py-1.5 text-sm focus:border-[color:var(--brand)] focus:outline-none"
        />
        <button type="submit" disabled={pending} className="rounded-lg border border-[color:var(--border)] px-3 text-sm font-medium hover:bg-[color:var(--surface-sunken)]">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Suchen"}
        </button>
      </form>
      {state.candidates?.length ? (
        <ul className="space-y-1">
          {state.candidates.map((c) => (
            <li key={`${c.type}:${c.id}`}>
              <form action={action}>
                <input type="hidden" name="conversationId" value={conversationId} />
                <input type="hidden" name="pick" value={`${c.type}:${c.id}`} />
                <button type="submit" className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-[color:var(--brand-soft)]">
                  {c.label}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      {state.error ? <p className="text-xs font-medium text-rose-700">{state.error}</p> : null}
      {manual ? (
        <form action={action}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="unlink" value="1" />
          <button type="submit" className="text-xs text-[color:var(--muted)] underline">
            Von Hand gesetzte Zuordnung lösen (wieder automatisch über die Nummer)
          </button>
        </form>
      ) : null}
    </div>
  );
}
