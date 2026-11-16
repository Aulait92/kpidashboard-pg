"use client";

// Termin für einen Lead direkt in der App buchen (Ole, 14.11.2026): Fenster statt neuem Tab, gleiche freie
// Zeiten und Buchung wie die Buchungsseite (lib/lead-buchung.ts). Am Handy von unten, fast Vollbild.
// Öffnen von überall: openLeadBooking(leadId, name); <LeadBookingHost /> hängt im Kundenbereich.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Phone, Video } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { emitLeadAction } from "@/components/next-step";
import { bookForLeadAction, leadSlotsAction } from "@/app/buyer/lead-buchung-actions";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "pg:lead-booking";
type Slot = { start: string; end: string };

/** Termin gebucht (z. B. Anrufliste schaltet weiter, Ole 16.11.2026) */
export const LEAD_BOOKED_EVENT = "pg-lead-booked";

export function openLeadBooking(leadId: string, name?: string | null) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { leadId, name: name ?? null } }));
}

const TZ = "Europe/Berlin";
const dayLabel = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(iso));
const timeLabel = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Freie Zeiten wählen und buchen (auch eingebettet im Fenster „Termin“ des Kontakts). */
export function SlotPicker({ leadId, onBooked }: { leadId: string; onBooked: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ loading: boolean; slots: Slot[]; error: string | null; noCalendar: boolean }>({ loading: true, slots: [], error: null, noCalendar: false });
  const [pick, setPick] = useState<string | null>(null);
  const [mode, setMode] = useState<"phone" | "video">("video");
  const [pending, start] = useTransition();

  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    leadSlotsAction(leadId).then((r) => {
      if (!alive) return;
      setState(r.ok ? { loading: false, slots: r.slots, error: null, noCalendar: false } : { loading: false, slots: [], error: r.error, noCalendar: r.reason === "no_calendar" });
    });
    return () => {
      alive = false;
    };
  }, [leadId, reload]);
  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setReload((n) => n + 1);
  };

  const book = () =>
    start(async () => {
      if (!pick) return;
      const r = await bookForLeadAction(leadId, pick, mode);
      if (!r.ok) {
        toast.show({ message: r.error, tone: "error" });
        if (r.taken) {
          setPick(null);
          load();
        }
        return;
      }
      toast.show({ message: `Termin gebucht: ${dayLabel(r.start)}, ${timeLabel(r.start)} Uhr` });
      window.dispatchEvent(new CustomEvent(LEAD_BOOKED_EVENT, { detail: { leadId } }));
      onBooked();
    });

  if (state.loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-[color:var(--muted)]" data-slots-loading>
        <Loader2 className="h-4 w-4 animate-spin" /> Freie Zeiten werden geladen …
      </p>
    );
  }
  if (state.noCalendar) {
    return (
      <div className="space-y-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p>Für Terminbuchungen verbinden Sie Ihren Kalender. Dann sieht der Lead nur Ihre freien Zeiten, und der Termin landet direkt in Ihrem Kalender.</p>
        <a href="/buyer/kalender" className="inline-flex rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 py-2 font-semibold text-white">
          Kalender verbinden
        </a>
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="space-y-2 text-sm">
        <p className="rounded-[var(--radius-sm)] bg-rose-50 px-3 py-2 text-rose-800">{state.error}</p>
        <Button size="sm" onClick={load}>
          Nochmal laden
        </Button>
      </div>
    );
  }
  if (!state.slots.length) return <p className="text-sm text-[color:var(--muted)]">In den nächsten 14 Tagen sind keine freien Zeiten in Ihren Lead-Zeiten. Prüfen Sie „Mein Kalender“ oder tragen Sie den Termin von Hand ein.</p>;

  const days = new Map<string, Slot[]>();
  for (const s of state.slots) days.set(dayLabel(s.start), [...(days.get(dayLabel(s.start)) ?? []), s]);
  return (
    <div className="space-y-3" data-slot-picker>
      <div className="inline-grid grid-flow-col gap-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken,#f1f5f9)] p-1 text-sm" role="radiogroup" aria-label="Art des Termins">
        {(["phone", "video"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn("flex items-center gap-1.5 rounded-[6px] px-3 py-1.5", mode === m ? "bg-white font-semibold shadow-[var(--shadow-sm)]" : "text-[color:var(--muted)]")}
          >
            {m === "phone" ? <Phone className="h-4 w-4" /> : <Video className="h-4 w-4" />} {m === "phone" ? "Telefon" : "Video"}
          </button>
        ))}
      </div>
      <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
        {[...days.entries()].map(([label, list]) => (
          <div key={label}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{label}</p>
            <div className="flex flex-wrap gap-2">
              {list.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => setPick(s.start)}
                  className={cn(
                    "rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm",
                    pick === s.start ? "border-[color:var(--brand)] bg-[color:var(--brand)] font-semibold text-white" : "border-[color:var(--border)] bg-white hover:border-[color:var(--brand)]",
                  )}
                  data-slot
                >
                  {timeLabel(s.start)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button variant="primary" size="md" icon={pending ? Loader2 : CalendarPlus} className="w-full" disabled={!pick || pending} onClick={book} data-slot-book>
        {pending ? "Wird gebucht …" : pick ? `Termin buchen: ${dayLabel(pick)}, ${timeLabel(pick)} Uhr` : "Bitte eine Zeit wählen"}
      </Button>
      <p className="text-xs text-[color:var(--muted)]">Der Lead bekommt die Einladung per E-Mail (wenn hinterlegt) und eine Bestätigung per WhatsApp.</p>
    </div>
  );
}

/** Buchungsfenster für Heute, Rückrufe und andere Stellen außerhalb des Kontakts. */
export function LeadBookingHost() {
  const router = useRouter();
  const [target, setTarget] = useState<{ leadId: string; name: string | null } | null>(null);
  useEffect(() => {
    const h = (e: Event) => setTarget((e as CustomEvent<{ leadId: string; name: string | null }>).detail);
    window.addEventListener(OPEN_EVENT, h);
    return () => window.removeEventListener(OPEN_EVENT, h);
  }, []);
  if (!target) return null;
  return (
    <Sheet open onClose={() => setTarget(null)} title={target.name ? `Termin mit ${target.name}` : "Termin buchen"}>
      <div className="p-5" data-lead-booking>
        <SlotPicker
          leadId={target.leadId}
          onBooked={() => {
            emitLeadAction(target.leadId);
            setTarget(null);
            router.refresh();
          }}
        />
        <a href={`/buyer/leads/${target.leadId}`} className="mt-3 block text-center text-sm text-[color:var(--muted)] underline">
          Termin von Hand eintragen (im Kontakt)
        </a>
      </div>
    </Sheet>
  );
}
