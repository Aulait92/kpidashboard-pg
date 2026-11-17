// Bausteine der Chat-Ansicht (Ole, 17.11.2026): Verlauf mit drei klar unterscheidbaren Absendern, Tagestrennern
// und dezenten Ereigniszeilen, dazu Avatar und Statuspunkt für die Liste. Ohne Client-Code, für Server-Seiten.
// Genutzt im Kundenbereich (app/buyer/chats) und im Admin-Chat (app/admin/whatsapp/chats-ansicht.tsx).
// Regeln: lib/chat-ansicht.ts.
//   Lead: weiße Blase mit feinem Rand, links
//   Assistent: hellblau (#eef3ff), dunkler Text, rechts
//   Vermittler selbst: kräftiges Blau, weiße Schrift, rechts

import type { LucideIcon } from "lucide-react";
import {
  Bot,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  ClipboardList,
  Clock,
  Mail,
  ShieldAlert,
  Smartphone,
  OctagonX,
  UserRound,
  Info,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  avatarFarbe,
  initialen,
  uhrzeit,
  verlaufAufbauen,
  type Absender,
  type EreignisIcon,
  type EreignisTon,
  type Sicht,
  type VerlaufNachricht,
} from "@/lib/chat-ansicht";

// ─── Liste ─────────────────────────────────────────────────────────────

export function ChatAvatar({ name, size = "md", dot }: { name: string; size?: "sm" | "md"; dot?: boolean }) {
  const f = avatarFarbe(name);
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" ? "h-9 w-9 text-xs" : "h-10 w-10 text-[13px]",
      )}
      style={{ background: f.bg, color: f.fg }}
      aria-hidden
      data-chat-avatar
    >
      {initialen(name)}
      {dot ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-rose-600" /> : null}
    </span>
  );
}

/** Status als Farbpunkt mit Text (statt Badge-Kasten). */
export function StatusPunkt({ farbe, children, className }: { farbe: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-[color:var(--muted)]", className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", farbe)} />
      <span className="truncate">{children}</span>
    </span>
  );
}

// ─── Verlauf ───────────────────────────────────────────────────────────

const EREIGNIS_ICON: Record<EreignisIcon, LucideIcon> = {
  termin: CalendarClock,
  "termin-ok": CalendarCheck,
  "termin-weg": CalendarX,
  liste: ClipboardList,
  person: UserRound,
  schild: ShieldAlert,
  stopp: OctagonX,
  uhr: Clock,
  post: Mail,
};
const EREIGNIS_TON: Record<EreignisTon, string> = {
  gut: "bg-emerald-50 text-emerald-600",
  info: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
  achtung: "bg-amber-50 text-amber-600",
  stopp: "bg-rose-50 text-rose-600",
};

/** Dezente Ereigniszeile in der Mitte: Icon, Text, Uhrzeit. */
export function EreignisZeile({ icon, ton, children, zeit }: { icon: EreignisIcon; ton: EreignisTon; children: React.ReactNode; zeit?: Date }) {
  const Icon = EREIGNIS_ICON[icon];
  return (
    <div className="my-2 flex justify-center px-2" data-chat-ereignis>
      <span className="inline-flex max-w-full items-center gap-2 text-center text-xs text-[color:var(--muted)]">
        <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full", EREIGNIS_TON[ton])}>
          <Icon className="h-3 w-3" />
        </span>
        <span className="min-w-0">
          {children}
          {zeit ? <span className="text-[color:var(--muted)]/80"> · {uhrzeit(zeit)}</span> : null}
        </span>
      </span>
    </div>
  );
}

export type Etikett = { label: string; icon: LucideIcon } | null;

/** Kundenbereich: „Assistent“ bzw. „Sie“, Lead ohne Etikett (Name steht oben). */
export function etikettKunde(m: { sentBy: string | null }, a: Absender): Etikett {
  if (a === "assistent") return { label: "Assistent", icon: Bot };
  if (a === "ich") return m.sentBy === "app" ? { label: "Sie (WhatsApp-App)", icon: Smartphone } : { label: "Sie", icon: UserRound };
  return null;
}

const BLASE: Record<Absender, string> = {
  lead: "rounded-[18px] rounded-bl-[6px] border border-[color:var(--border)] bg-white text-[color:var(--foreground)]",
  assistent: "rounded-[18px] rounded-br-[6px] bg-[#eef3ff] text-[color:var(--foreground)]",
  ich: "rounded-[18px] rounded-br-[6px] bg-[color:var(--brand)] text-white",
};

export function ChatVerlauf<M extends VerlaufNachricht>({
  messages,
  now,
  termine,
  unbekannteZeigen = false,
  sicht = "kunde",
  etikett = etikettKunde,
  text,
  fuss,
}: {
  messages: M[];
  now: number;
  /** Startzeiten je Termin-ID (für „Termin zugesagt · Mi., 18.11. um 16:00“) */
  termine?: Map<string, Date>;
  /** Admin: interne Nachrichten ohne bekannte Art mit ihrem Schlüssel zeigen */
  unbekannteZeigen?: boolean;
  /** Wortlaut der Ereignisse („an Sie“ bzw. „an den Berater“) */
  sicht?: Sicht;
  etikett?: (m: M, a: Absender) => Etikett;
  /** Darstellung des Nachrichtentexts (WhatsApp-Formatierung); Standard: Text wie geschrieben */
  text?: (body: string, a: Absender) => React.ReactNode;
  /** Zusatz neben der Uhrzeit (z. B. Zustellstatus im Admin, „nicht zugestellt“) */
  fuss?: (m: M) => React.ReactNode;
}) {
  const eintraege = verlaufAufbauen(messages, now, { termine, unbekannteZeigen, sicht });
  return (
    <>
      {eintraege.map((e) => {
        if (e.art === "tag") {
          return (
            // Nicht klebend: der Trenner lag beim Scrollen über dem Text der Blasen (UX-Prüfung 17.11.2026)
            <div key={e.key} className="flex justify-center pb-1 pt-3" data-day-separator>
              <span className="rounded-full border border-[color:var(--border)] bg-white/95 px-3 py-0.5 text-xs font-semibold text-[color:var(--muted)] shadow-[var(--shadow-sm)]">
                {e.label}
              </span>
            </div>
          );
        }
        if (e.art === "ereignis") {
          return e.ereignis ? (
            <EreignisZeile key={e.key} icon={e.ereignis.icon} ton={e.ereignis.ton} zeit={e.m.createdAt}>
              {e.ereignis.label}
              {e.ereignis.detail ? ` · ${e.ereignis.detail}` : ""}
            </EreignisZeile>
          ) : (
            <EreignisZeile key={e.key} icon="liste" ton="info" zeit={e.m.createdAt}>
              {e.m.kind}
            </EreignisZeile>
          );
        }
        const { m, absender, wechsel } = e;
        const tag = wechsel ? etikett(m, absender) : null;
        const rechts = absender !== "lead";
        return (
          <div key={e.key} className={cn("flex flex-col", rechts ? "items-end" : "items-start", wechsel ? "mt-3" : "mt-1")} data-chat-nachricht={absender}>
            {tag ? (
              <div className="mb-1 flex items-center gap-1 px-1 text-xs text-[color:var(--muted)]">
                <tag.icon className="h-3.5 w-3.5" />
                {tag.label}
              </div>
            ) : null}
            <div className={cn("max-w-[85%] whitespace-pre-wrap break-words px-[15px] py-[10px] text-[15px] leading-[1.5] sm:max-w-[72%]", BLASE[absender])}>
              {text ? text(m.body ?? "", absender) : m.body}
            </div>
            <div className="mt-1 flex items-center gap-1.5 px-1.5 text-[11px] text-[color:var(--muted)]" data-message-meta>
              <time dateTime={m.createdAt.toISOString()} title={formatDateTime(m.createdAt)}>
                {uhrzeit(m.createdAt)}
              </time>
              {fuss?.(m)}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Kleiner Hinweis neben der Uhrzeit, wenn eine Nachricht nicht ankam. */
export function NichtZugestellt() {
  return (
    <span className="inline-flex items-center gap-0.5 text-rose-700">
      <Info className="h-3 w-3" /> nicht zugestellt
    </span>
  );
}
