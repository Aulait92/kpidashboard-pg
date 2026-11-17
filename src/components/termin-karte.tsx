"use client";

// Terminkarte im Kontakt (Ole, 17.11.2026) direkt unter den Aktionen: ein Hauptknopf je nach Zeit
// (lib/termin-karte.ts), höchstens zwei Zweitknöpfe, der Rest unter „Mehr“. Zum Wechsel der Phase
// (10 Minuten vorher, Ende) lädt die Karte die Seite sanft neu.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ClipboardList, MoreHorizontal, Phone, Presentation, Send, Video, CalendarSync, type LucideIcon } from "lucide-react";
import { ButtonLink, buttonClass, Card } from "@/components/ui";
import { ActionMenu } from "@/components/ui/menu";
import { NextStepButton } from "@/components/next-step";
import { RescheduleDialog } from "@/components/reschedule-dialog";
import { oeffneLeadMail } from "@/components/lead-mail";
import { terminArtLabel } from "@/lib/termin-art";
import type { TerminAktion, TerminKartenAktionen } from "@/lib/termin-karte";
import { cn } from "@/lib/utils";

export type TerminKartenDaten = {
  id: string;
  /** „Heute, 10:00“ (auf dem Server formatiert) */
  wann: string;
  mode: string;
  meetUrl: string | null;
  zugesagt: boolean;
  komplettcheck: boolean;
  erschienen: boolean;
  /** Termin hat schon begonnen (für „Läuft“ statt „Gleich“) */
  begonnen: boolean;
};

const LABEL: Record<TerminAktion, string> = {
  vorbereiten: "Vorbereiten",
  videocall: "Videocall starten",
  anrufen: "Anrufen",
  ergebnis: "Ergebnis eintragen",
  angebot: "Angebot senden",
  praesentation: "Präsentation",
  verschieben: "Verschieben",
};
const ICON: Record<TerminAktion, LucideIcon> = {
  vorbereiten: ClipboardList,
  videocall: Video,
  anrufen: Phone,
  ergebnis: Check,
  angebot: Send,
  praesentation: Presentation,
  verschieben: CalendarSync,
};

export function TerminKarte({
  t,
  a,
  leadId,
  name,
  source,
  phone,
  mailReady,
}: {
  t: TerminKartenDaten;
  a: TerminKartenAktionen;
  leadId: string;
  name: string;
  source: string | null;
  phone: string | null;
  /** Postfach verbunden: „Angebot senden“ öffnet die E-Mail mit der Angebotsvorlage */
  mailReady: boolean;
}) {
  const router = useRouter();
  const [verschieben, setVerschieben] = useState(false);
  const wechsel = a.naechsterWechsel ? new Date(a.naechsterWechsel).getTime() : null;

  // Sanft zur nächsten Phase umschalten (nur wenn bald, Timer höchstens 6 Stunden)
  useEffect(() => {
    if (wechsel == null) return;
    const ms = wechsel - Date.now() + 1000;
    if (ms <= 0 || ms > 6 * 60 * 60 * 1000) return;
    const id = window.setTimeout(() => router.refresh(), ms);
    return () => window.clearTimeout(id);
  }, [wechsel, router]);

  const vorbereitung = `/buyer/termine/${t.id}/vorbereitung?von=kontakt`;
  const href: Partial<Record<TerminAktion, string>> = {
    vorbereiten: vorbereitung,
    praesentation: `/buyer/termine/${t.id}/praesentation`,
    ...(t.meetUrl ? { videocall: t.meetUrl } : {}),
    ...(phone ? { anrufen: `tel:+${phone}` } : {}),
    // Ohne verbundenes Postfach: zu den Angeboten in der Terminvorbereitung
    ...(!mailReady ? { angebot: `${vorbereitung}#angebote` } : {}),
  };
  const angebotMail = () => oeffneLeadMail("angebot");

  function knopf(x: TerminAktion, haupt: boolean) {
    const variant = haupt ? "primary" : "secondary";
    const size = haupt ? "md" : "sm";
    const cls = "w-full min-w-0 sm:w-auto [&_svg]:shrink-0";
    const Icon = ICON[x];
    if (x === "ergebnis") {
      return (
        <NextStepButton
          key={x}
          leadId={leadId}
          name={name}
          source={source}
          appointmentId={t.id}
          resultMissing
          className={buttonClass(variant, size, cn(cls, "rounded-[var(--radius-sm)] border-transparent", !haupt && "border-[color:var(--border)]"))}
        />
      );
    }
    if (x === "verschieben") {
      return (
        <button key={x} type="button" onClick={() => setVerschieben(true)} className={buttonClass(variant, size, cls)} data-termin-aktion={x}>
          <Icon className={haupt ? "h-4 w-4" : "h-3.5 w-3.5"} /> {LABEL[x]}
        </button>
      );
    }
    if (x === "angebot" && mailReady) {
      return (
        <button key={x} type="button" onClick={angebotMail} className={buttonClass(variant, size, cls)} data-termin-aktion={x}>
          <Icon className={haupt ? "h-4 w-4" : "h-3.5 w-3.5"} /> {LABEL[x]}
        </button>
      );
    }
    const h = href[x];
    if (!h) return null;
    return (
      <span key={x} className="contents" data-termin-aktion={x}>
        <ButtonLink href={h} variant={variant} size={size} icon={Icon} className={cls} external={x === "videocall"}>
          {LABEL[x]}
        </ButtonLink>
      </span>
    );
  }

  const mehr = a.mehr.filter((x) => x === "verschieben" || x === "angebot" || x === "ergebnis" || !!href[x]);
  const zweit = a.zweit.filter((x) => x === "verschieben" || x === "angebot" || x === "ergebnis" || !!href[x]);
  const status =
    a.phase === "jetzt" ? (t.begonnen ? "Läuft" : "Gleich") : a.phase === "nachher" ? (t.erschienen ? "Erschienen" : "Vorbei") : null;

  return (
    <Card className="mb-5" menus>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center" data-termin-karte={a.phase} data-termin-haupt={a.haupt}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <CalendarClock className="h-5 w-5 shrink-0 text-[color:var(--brand)]" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="whitespace-nowrap font-semibold">{t.wann} Uhr</span>
              {status ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                    a.phase === "jetzt" ? "bg-blue-50 text-blue-700 ring-blue-200" : t.erschienen ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-100 text-zinc-700 ring-zinc-200",
                  )}
                  data-termin-status
                >
                  {status}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[color:var(--muted)]">
              <span>{terminArtLabel(t.mode)}</span>
              {/* Zusage des Leads (Kalenderfrage im Chat bzw. „Ja, passt“), Ole 17.11.2026 */}
              {t.zugesagt ? <span className="font-medium text-emerald-700" data-termin-zugesagt>· zugesagt</span> : null}
              {t.komplettcheck ? <span className="font-medium text-[color:var(--brand-dark)]" data-termin-komplettcheck>· Komplettcheck</span> : null}
            </div>
          </div>
        </div>
        {/* Handy: Hauptknopf über die ganze Breite, darunter Zweitknöpfe und „Mehr“ */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {knopf(a.haupt, true)}
          {zweit.length || mehr.length ? (
            <div className="grid gap-2 sm:flex sm:items-center [&>*]:min-w-0" style={{ gridTemplateColumns: [...zweit.map(() => "minmax(0,1fr)"), ...(mehr.length ? ["auto"] : [])].join(" ") }}>
              {zweit.map((x) => knopf(x, false))}
              {mehr.length ? (
                <ActionMenu
                  label="Mehr"
                  labelClassName="sr-only sm:not-sr-only"
                  icon={MoreHorizontal}
                  items={mehr.map((x) => ({
                    label: LABEL[x],
                    icon: ICON[x],
                    onSelect: () => {
                      if (x === "verschieben") return setVerschieben(true);
                      if (x === "angebot" && mailReady) return angebotMail();
                      const h = href[x];
                      if (!h) return;
                      if (x === "videocall") window.open(h, "_blank", "noreferrer");
                      else window.location.href = h;
                    },
                  }))}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <RescheduleDialog appointmentId={t.id} open={verschieben} onClose={() => setVerschieben(false)} onChanged={() => router.refresh()} />
    </Card>
  );
}
