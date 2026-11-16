import { Clock, Video, Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { listActiveProducts } from "@/lib/product-catalog";
import type { Slot } from "@/lib/calendar";
import { TerminShell } from "@/components/termin/termin-shell";
import { TerminForm, type TerminDay } from "@/components/termin/termin-form";
import { availableSlots, bookingReady, loadBookingType, TERMIN_CONSENT_TEXT, verifyContactToken } from "@/lib/vertrieb/buchung";
import { nowMs } from "@/lib/now";
import { bookTerminAction } from "./actions";

const TZ = "Europe/Berlin";
const PRIVACY_URL = process.env.BOOKING_PRIVACY_URL ?? "https://performancegrowth.de/datenschutz";
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...o }).format(d);

/** Freie Zeiten je Berliner Kalendertag (für die Tagesleiste). */
export function slotsToDays(slots: Slot[]): TerminDay[] {
  const map = new Map<string, TerminDay>();
  for (const s of slots) {
    const d = new Date(s.start);
    const ymd = fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" });
    if (!map.has(ymd)) {
      map.set(ymd, {
        ymd,
        weekday: fmt(d, { weekday: "short" }).replace(".", ""),
        date: fmt(d, { day: "numeric", month: "numeric" }),
        long: fmt(d, { weekday: "long", day: "numeric", month: "long" }),
        slots: [],
      });
    }
    map.get(ymd)!.slots.push({ start: s.start, time: fmt(d, { hour: "2-digit", minute: "2-digit" }) });
  }
  return [...map.values()];
}

export const terminMetadata = { title: "Termin buchen · performancegrowth", robots: { index: false, follow: false } };

/** Buchungsseite eines Termintyps (Standard: Meta-Leads-Call unter /termin). */
export async function BookingPage({ slug, sp }: { slug: string | null; sp: { einbetten?: string; k?: string } }) {
  const embed = sp.einbetten === "1";
  const type = await loadBookingType(slug);
  if (!type || !(await bookingReady(type))) {
    return (
      <TerminShell embed={embed}>
        <h1 className="text-xl font-semibold">Online-Buchung gerade nicht verfügbar</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Schreiben Sie uns gern, wir melden uns mit einem Terminvorschlag.</p>
        <a href="mailto:ole.kannapinn@performancegrowth.de" className="mt-4 inline-flex h-11 items-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 font-semibold text-white">
          E-Mail schreiben
        </a>
      </TerminShell>
    );
  }
  // Persönlicher Link (signiert): bekannte Angaben vorausfüllen
  const contactId = verifyContactToken(sp.k);
  const contact = contactId
    ? await prisma.salesContact.findUnique({ where: { id: contactId }, select: { name: true, email: true, phone: true, firstName: true, lastName: true } })
    : null;
  const prefill = contact
    ? {
        name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
        email: contact.email,
        phone: contact.phone?.replace(/\D/g, "").replace(/^0049/, "49").replace(/^0(?=[1-9])/, "49") ?? "",
        company: contact.name,
      }
    : undefined;

  let slots: Slot[] = [];
  try {
    slots = await availableSlots(type);
  } catch (err) {
    console.error("[termin] slots", err);
  }
  const days = slotsToDays(slots);
  const interests = [...(await listActiveProducts()).map((p) => p.label), "Mehrere Sparten", "Noch offen"];

  return (
    <TerminShell embed={embed}>
      <h1 className="text-xl font-semibold leading-tight tracking-tight">{type.title}</h1>
      {type.subtitle ? <p className="mt-1.5 text-sm text-[color:var(--muted)]">{type.subtitle}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
        <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-sunken)] px-2.5 py-1">
          <Clock className="h-3.5 w-3.5" /> {type.durationMin} Minuten
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-sunken)] px-2.5 py-1">
          {type.mode === "video" ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />} {type.mode === "video" ? "Videocall" : "Telefonat"}
        </span>
      </div>
      <div className="mt-6">
        {days.length === 0 ? (
          <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-4 text-sm">
            <p>Gerade sind keine Zeiten online frei. Schreiben Sie uns, wir finden einen Termin.</p>
            <a href="mailto:ole.kannapinn@performancegrowth.de" className="mt-2 inline-block font-semibold text-[color:var(--brand)] underline">
              E-Mail schreiben
            </a>
          </div>
        ) : (
          <TerminForm
            action={bookTerminAction}
            days={days}
            fields
            prefill={prefill}
            interests={interests}
            consentText={TERMIN_CONSENT_TEXT}
            privacyUrl={PRIVACY_URL}
            submitLabel="Termin buchen"
            hidden={{
              art: type.slug,
              rendered_at: String(nowMs()),
              ...(embed ? { einbetten: "1" } : {}),
              ...(contactId ? { k: sp.k ?? "" } : {}),
            }}
          />
        )}
      </div>
    </TerminShell>
  );
}
