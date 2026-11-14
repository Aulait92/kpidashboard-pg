"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronRight, Mail, Pencil, Plane, UserMinus } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { ActionSheet, Sheet, type SheetAction } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { AbsenceSheet, dayShort, type AbsenceColleague } from "@/components/absence-sheet";
import type { AbsenceView } from "@/lib/absence";
import { removeMemberAction, renameMemberAction, resendInviteAction, toggleReceivesLeadsAction } from "./actions";

export type MemberView = {
  id: string;
  name: string;
  email: string;
  displayName: string | null;
  isMe: boolean;
  owner: boolean;
  receivesLeads: boolean;
  ownCalendar: boolean;
  leads30: number;
  loggedIn: boolean;
  /** Zwei-Faktor-Login aktiv */
  twoFactor?: boolean;
  /** Laufende oder kommende Abwesenheit */
  absence: AbsenceView | null;
};

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

export function MemberRow({ m, readOnly, colleagues, today }: { m: MemberView; readOnly: boolean; colleagues: AbsenceColleague[]; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<"menu" | "rename" | "remove" | "absence" | null>(null);
  const [name, setName] = useState(m.displayName ?? "");

  const run = (fn: () => Promise<void>, message: string) =>
    start(async () => {
      try {
        await fn();
        toast.show({ message });
        router.refresh();
      } catch (err) {
        toast.show({ message: err instanceof Error ? err.message : "Das hat nicht geklappt.", tone: "error" });
      }
    });

  const actions: SheetAction[] = [
    {
      label: m.absence ? "Abwesenheit ändern" : "Abwesenheit eintragen",
      icon: Plane,
      onSelect: () => setTimeout(() => setOpen("absence"), 0),
    },
    { label: "Namen ändern", icon: Pencil, onSelect: () => setTimeout(() => setOpen("rename"), 0) },
    ...(!m.owner && !m.loggedIn
      ? [{ label: "Einladung erneut senden", icon: Mail, onSelect: () => run(() => resendInviteAction(fd({ userId: m.id })), "Einladung gesendet") }]
      : []),
    ...(!m.owner ? [{ label: "Aus dem Team entfernen", icon: UserMinus, tone: "danger" as const, onSelect: () => setTimeout(() => setOpen("remove"), 0) }] : []),
  ];

  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <button type="button" disabled={readOnly} onClick={() => setOpen("menu")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{m.name}</span>
            {m.isMe ? <Badge>Sie</Badge> : null}
            {m.owner ? <Badge tone="success">Inhaber</Badge> : null}
            {!m.owner && !m.loggedIn ? <Badge tone="warning">eingeladen</Badge> : null}
            {m.twoFactor ? <Badge tone="info">2FA</Badge> : null}
            {m.absence ? (
              <Badge tone="info">
                {m.absence.active ? `abwesend bis ${dayShort(m.absence.to)}` : `abwesend ab ${dayShort(m.absence.from)}`}
              </Badge>
            ) : null}
          </div>
          <div className="truncate text-sm text-[color:var(--muted)]">
            {m.leads30} {m.leads30 === 1 ? "Lead" : "Leads"} in 30 Tagen · {m.ownCalendar ? "Kalender verbunden" : m.owner ? "Kalender unter „Mein Kalender“" : "kein Kalender (Termine beim Inhaber)"}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
      </button>
      <label className="flex shrink-0 items-center gap-2 text-sm text-[color:var(--muted)]">
        <button
          type="button"
          role="switch"
          aria-checked={m.receivesLeads}
          aria-label="Bekommt neue Leads"
          disabled={pending || readOnly}
          onClick={() =>
            run(() => toggleReceivesLeadsAction(fd({ userId: m.id })), m.receivesLeads ? `${m.name}: keine neuen Leads` : `${m.name}: bekommt wieder Leads`)
          }
          className={`relative h-7 w-12 rounded-full transition ${m.receivesLeads ? "bg-[color:var(--brand)]" : "bg-slate-300"} disabled:opacity-60`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${m.receivesLeads ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </label>

      {open === "absence" ? (
        <AbsenceSheet
          open
          onClose={() => setOpen(null)}
          person={{ userId: m.id, name: m.name, isMe: m.isMe }}
          current={m.absence}
          colleagues={colleagues}
          today={today}
        />
      ) : null}
      <ActionSheet open={open === "menu"} onClose={() => setOpen(null)} title={m.name} message={m.email} actions={actions} />
      <Sheet open={open === "rename"} onClose={() => setOpen(null)} title="Namen ändern">
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(null);
            run(() => renameMemberAction(fd({ userId: m.id, name })), "Name gespeichert");
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vor- und Nachname"
            className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-base outline-none focus:border-[color:var(--brand)]"
          />
          <Button type="submit" variant="primary" size="md" className="w-full" disabled={!name.trim()}>
            Speichern
          </Button>
        </form>
      </Sheet>
      <Sheet open={open === "remove"} onClose={() => setOpen(null)} title={`${m.name} entfernen?`} message="Offene Leads gehen an Sie zurück.">
        <div className="p-5">
          <Button
            variant="danger"
            size="md"
            className="w-full"
            onClick={() => {
              setOpen(null);
              run(() => removeMemberAction(fd({ userId: m.id })), `${m.name} entfernt`);
            }}
          >
            Entfernen
          </Button>
        </div>
      </Sheet>
    </li>
  );
}
