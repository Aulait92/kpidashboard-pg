"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, ExternalLink, GitMerge, MoreHorizontal, Presentation, ShieldX, ThumbsDown, Trophy, Trash2 } from "lucide-react";
import { MergeSheet, type MergeCandidate } from "@/components/vertrieb/contact-merge";
import { art17LoeschenAction, deleteContact, gewonnenVerlorenAction, setStage } from "@/app/admin/vertrieb/actions";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ActionSheet, Sheet, type SheetAction } from "@/components/ui/sheet";
import { LOSS_REASONS, STAGES } from "@/lib/vertrieb/crm";
import { JaNein } from "@/components/vertrieb/angebot-ablehnen";
import type { SalesStage as Stage } from "@/generated/prisma/enums";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

/** Stufe als antippbarer Chip; „Verloren“ fragt nach dem Grund (und mit offenem Angebot, ob es abgelehnt ist). */
export function StagePicker({
  contactId,
  stage,
  competitor,
  offenesAngebot = null,
}: {
  contactId: string;
  stage: Stage;
  competitor: string | null;
  /** Entwurf oder verschickt, nicht angenommen: „Offenes Angebot auch als abgelehnt markieren?“ (Standard ja) */
  offenesAngebot?: { id: string; number: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<"pick" | "lost" | null>(null);
  const current = STAGES.find((s) => s.id === stage);
  const save = (o: Record<string, string>) =>
    start(async () => {
      await setStage(fd({ contactId, ...o }));
      router.refresh();
    });
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen("pick")}
        className={clsx("badge inline-flex items-center gap-1 transition hover:opacity-80", current?.color, pending && "opacity-60")}
      >
        {current?.label ?? stage}
        <ChevronDown className="h-3 w-3" />
      </button>
      <ActionSheet
        open={open === "pick"}
        onClose={() => setOpen(null)}
        title="Stufe ändern"
        actions={STAGES.map((s) => ({
          label: s.label,
          tone: s.id === stage ? "primary" : s.id === "VERLOREN" ? "danger" : undefined,
          onSelect: () => {
            if (s.id === stage) return;
            if (s.id === "VERLOREN") setTimeout(() => setOpen("lost"), 0);
            else save({ stage: s.id });
          },
        }))}
      />
      <VerlorenSheet
        open={open === "lost"}
        onClose={() => setOpen(null)}
        competitor={competitor}
        offenesAngebot={offenesAngebot}
        onSave={(o) => save({ stage: "VERLOREN", lossReason: o.lossReason, competitor: o.competitor, ...(o.declineOfferId ? { declineOfferId: o.declineOfferId } : {}) })}
      />
    </>
  );
}

/** „Verloren: warum?“ mit Grund, Wettbewerber und (bei offenem Angebot) „auch als abgelehnt markieren?“. */
function VerlorenSheet({
  open,
  onClose,
  competitor,
  offenesAngebot,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  competitor: string | null;
  offenesAngebot: { id: string; number: string } | null;
  onSave: (o: { lossReason: string; competitor: string; declineOfferId: string | null }) => void;
}) {
  const [reason, setReason] = useState("");
  const [comp, setComp] = useState(competitor ?? "");
  const [ablehnen, setAblehnen] = useState(true);
  return (
    <Sheet open={open} onClose={onClose} title="Verloren: warum?">
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onClose();
          onSave({ lossReason: reason || "SONSTIGES", competitor: comp, declineOfferId: offenesAngebot && ablehnen ? offenesAngebot.id : null });
        }}
      >
        <div className="grid grid-cols-1 gap-2">
          {LOSS_REASONS.map((r) => (
            <label key={r.id} className={clsx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", reason === r.id ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-[color:var(--border)]")}>
              <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
              {r.label}
            </label>
          ))}
        </div>
        <input value={comp} onChange={(e) => setComp(e.target.value)} placeholder="Wettbewerber (optional)" className="input" />
        {offenesAngebot ? (
          <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2.5">
            <JaNein name="angebot-ablehnen" label={`Offenes Angebot ${offenesAngebot.number} auch als abgelehnt markieren?`} value={ablehnen} onChange={setAblehnen} />
          </div>
        ) : null}
        <Button type="submit" variant="primary" size="md" className="w-full">
          Als verloren speichern
        </Button>
      </form>
    </Sheet>
  );
}

/**
 * „Gewonnen“ und „Verloren“ direkt in der Kontaktakte (Ole, 22.11.2026), statt über „Stufe ändern“ oder „Eintragen“.
 * Nur solange der Kontakt offen ist (nicht bei Abschluss, Verloren, Ungültig).
 */
export function GewonnenVerlorenKnoepfe({
  contactId,
  stage,
  competitor,
  offenesAngebot = null,
}: {
  contactId: string;
  stage: Stage;
  competitor: string | null;
  offenesAngebot?: { id: string; number: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [lost, setLost] = useState(false);
  if (stage === "GEWONNEN" || stage === "VERLOREN" || stage === "UNGUELTIG") return null;
  const save = (s: "GEWONNEN" | "VERLOREN", o: { lossReason?: string; competitor?: string; declineOfferId?: string | null } = {}) =>
    start(async () => {
      await gewonnenVerlorenAction(contactId, s, o);
      toast.show({ message: s === "GEWONNEN" ? "Als gewonnen gespeichert" : "Als verloren gespeichert" });
      router.refresh();
    });
  return (
    <>
      <Button type="button" variant="secondary" size="md" icon={Trophy} disabled={pending} onClick={() => save("GEWONNEN")} data-gewonnen-knopf>
        Gewonnen
      </Button>
      <Button type="button" variant="secondary" size="md" icon={ThumbsDown} disabled={pending} onClick={() => setLost(true)} data-verloren-knopf>
        Verloren
      </Button>
      <VerlorenSheet open={lost} onClose={() => setLost(false)} competitor={competitor} offenesAngebot={offenesAngebot} onSave={(o) => save("VERLOREN", o)} />
    </>
  );
}

/** Seltene Aktionen eines Kontakts. */
export function ContactMore({
  contactId,
  name,
  url,
  linkedinUrl,
  duplicates = [],
  geloescht = false,
  gesperrt = false,
  praesentationHref,
}: {
  contactId: string;
  name: string;
  url: string | null;
  linkedinUrl: string | null;
  duplicates?: MergeCandidate[];
  /** schon auf Verlangen gelöscht (Art. 17): kein zweites Löschen anbieten */
  geloescht?: boolean;
  /** „nie kontaktieren“ bzw. Datenschutzfall: nur „Auf Verlangen löschen (Art. 17)“, damit der Sperrvermerk bleibt */
  gesperrt?: boolean;
  /** Neuer Admin (Umbau 19.11.2026): „Präsentation öffnen“ oben im Menü statt eigenem Knopf im Kopf der Akte */
  praesentationHref?: string;
}) {
  const [open, setOpen] = useState<"menu" | "delete" | "merge" | "art17" | null>(null);
  const [pending, start] = useTransition();
  const [art17Info, setArt17Info] = useState<string | null>(null);
  const router = useRouter();
  const actions: SheetAction[] = [
    ...(praesentationHref ? [{ label: "Präsentation öffnen", icon: Presentation, href: praesentationHref }] : []),
    ...(url ? [{ label: "Website öffnen", icon: ExternalLink, href: url }] : []),
    ...(linkedinUrl ? [{ label: "LinkedIn-Profil öffnen", icon: ExternalLink, href: linkedinUrl }] : []),
    { label: "Mit anderem Kontakt zusammenführen", icon: GitMerge, onSelect: () => setTimeout(() => setOpen("merge"), 0) },
    // Löschverlangen per Mail oder Telefon (Art. 17, Ole 19.11.2026): gleiche Logik wie bei einer Antwort
    ...(geloescht ? [] : [{ label: "Auf Verlangen löschen (Art. 17)", icon: ShieldX, tone: "danger" as const, onSelect: () => setTimeout(() => setOpen("art17"), 0) }]),
    ...(gesperrt || geloescht ? [] : [{ label: "Kontakt löschen", icon: Trash2, tone: "danger" as const, onSelect: () => setTimeout(() => setOpen("delete"), 0) }]),
  ];
  return (
    <>
      <button type="button" onClick={() => setOpen("menu")} className="btn-ghost" aria-label="Mehr">
        <MoreHorizontal className="h-4 w-4" /> Mehr
      </button>
      <ActionSheet open={open === "menu"} onClose={() => setOpen(null)} title={name} actions={actions} />
      {open === "merge" ? <MergeSheet open onClose={() => setOpen(null)} contactId={contactId} contactName={name} suggestions={duplicates} /> : null}
      <Sheet open={open === "delete"} onClose={() => setOpen(null)} title={`„${name}“ löschen?`} message="Verlauf, Aufgaben und Cold-Mail-Status werden mit gelöscht.">
        <div className="p-5">
          <Button
            variant="danger"
            size="md"
            className="w-full"
            disabled={pending}
            onClick={() => start(() => deleteContact(fd({ contactId })))}
          >
            Endgültig löschen
          </Button>
        </div>
      </Sheet>
      <Sheet
        open={open === "art17"}
        onClose={() => {
          setOpen(null);
          setArt17Info(null);
        }}
        title="Auf Verlangen löschen (Art. 17)?"
        message="Name, Adressen, Verlauf und Mails werden gelöscht, auch in Instantly. Gesperrt bleibt der Kontakt. Kunden und Leads werden nicht gelöscht, dafür gibt es eine Aufgabe."
      >
        <div className="p-5">
          {art17Info ? (
            <p className="text-sm" role="status">{art17Info}</p>
          ) : (
            <Button
              variant="danger"
              size="md"
              className="w-full"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await art17LoeschenAction(contactId).catch(() => ({ ok: false, message: "Löschen fehlgeschlagen." }));
                  setArt17Info(r.message);
                  router.refresh();
                })
              }
            >
              Daten löschen, Sperre behalten
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** Zugeklappter Bereich mit Kurz-Info in der Kopfzeile. */
export function Fold({ title, summary, open = false, children }: { title: string; summary?: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 select-none group-open:border-b group-open:border-slate-100 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">{title}</span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
        </span>
      </summary>
      <div className="p-4">{children}</div>
    </details>
  );
}
