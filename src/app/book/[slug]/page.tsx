import { redirect } from "next/navigation";
import Link from "next/link";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { a, asAnsprache, type Ansprache } from "@/lib/ansprache";
import { CheckCircle2, Clock, Mail, Phone, Video } from "lucide-react";
import { loadTerminFormate } from "@/lib/termin-formate-server";
import { TERMIN_FORMATE_STANDARD } from "@/lib/termin-formate";
import { kontaktWege, vermittlerKontakt, type VermittlerKontakt } from "@/lib/buchung-ohne-kalender";
import { buttonClass } from "@/components/ui";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AddToCalendar } from "@/components/add-to-calendar";
import { PhoneField } from "@/components/phone-field";
import { SubmitButton } from "@/components/submit-button";
import { bookingDurationMin, suggestSlots, type Slot } from "@/lib/calendar";
import { bookPublicAction, komplettcheckBuchungAction } from "./actions";
import { Gezeigt } from "./gezeigt";
import { randomUUID } from "node:crypto";
import { variante, type Variante } from "@/lib/experimente";
import { nowMs } from "@/lib/now";
import { erinnerungOptin } from "@/lib/policen/regeln";

// Öffentliche Buchungsseite je Kunde — z. B. als „Custom"-Scheduling-Link im
// Meta-Leadformular. Zeigt echte freie Zeiten aus dem Google-Kalender.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Termin buchen",
  robots: { index: false, follow: false },
};

const TZ = "Europe/Berlin";
const PRIVACY_URL =
  process.env.BOOKING_PRIVACY_URL ?? "https://performancegrowth.de/datenschutz";

// Fehlertexte je Ansprache des Beraters (Ole, 14.11.2026: Standard Sie)
function errorsFor(an: Ansprache): Record<string, string> {
  return {
    slot: a(an, "Bitte wähle eine Uhrzeit aus.", "Bitte wählen Sie eine Uhrzeit aus."),
    name: a(an, "Bitte gib deinen Namen an.", "Bitte geben Sie Ihren Namen an."),
    phone: a(an, "Bitte gib eine gültige Telefonnummer an.", "Bitte geben Sie eine gültige Telefonnummer an."),
    email: a(an, "Bitte gib eine gültige E-Mail-Adresse an.", "Bitte geben Sie eine gültige E-Mail-Adresse an."),
    consent: a(an, "Bitte bestätige die Datenschutzhinweise.", "Bitte bestätigen Sie die Datenschutzhinweise."),
    taken: a(an, "Diese Uhrzeit ist leider gerade vergeben worden. Bitte wähle eine andere.", "Diese Uhrzeit ist leider gerade vergeben worden. Bitte wählen Sie eine andere."),
    busy: a(an, "Gerade gehen sehr viele Buchungen ein. Bitte versuche es in ein paar Minuten erneut.", "Gerade gehen sehr viele Buchungen ein. Bitte versuchen Sie es in ein paar Minuten erneut."),
    unavailable: "Die Online-Buchung ist aktuell nicht verfügbar.",
    invalid: "Die Buchung konnte nicht verarbeitet werden.",
    error: a(an, "Etwas ist schiefgelaufen. Bitte versuche es erneut.", "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut."),
  };
}

function fmt(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts }).format(d);
}

function groupByDay(slots: Slot[]): { label: string; slots: Slot[] }[] {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const label = fmt(new Date(s.start), {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    map.set(label, [...(map.get(label) ?? []), s]);
  }
  return [...map.entries()].map(([label, slots]) => ({ label, slots }));
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; a?: string; dup?: string; err?: string; lead?: string; t?: string; kc?: string }>;
};

export default async function BookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const conn = await prisma.calendarConnection.findUnique({
    where: { bookingSlug: slug },
    select: {
      customerId: true,
      status: true,
      customer: { select: { name: true, leadAddress: true, onboarding: { select: { websiteInfo: true } } } },
    },
  });
  // Früherer Kurzname (Link geändert, Ole 17.11.2026): auf den aktuellen weiterleiten, Parameter bleiben
  if (!conn) {
    const { aktuellerSlugFuer } = await import("@/lib/calendar/buchungslink");
    const neu = await aktuellerSlugFuer(slug);
    if (neu) {
      const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
      const { bookingPageUrl } = await import("@/lib/public-url");
      const ziel = bookingPageUrl(neu) ?? `/book/${neu}`;
      redirect(q ? `${ziel}?${q}` : ziel);
    }
  }
  // Datenschutzhinweis des Beraters (verantwortlich für die Termindaten),
  // sonst der allgemeine Link.
  const customerPrivacy = (conn?.customer.onboarding?.websiteInfo as { privacyUrl?: string | null } | null)?.privacyUrl;
  const privacyUrl = customerPrivacy && /^https?:\/\//.test(customerPrivacy) ? customerPrivacy : PRIVACY_URL;

  // Berater bucht für einen Lead (Rückrufliste): Kontaktdaten vorbelegen —
  // nur für den eingeloggten Kunden selbst, keine Daten in der URL.
  let prefill: { name: string; email: string; phone: string } | null = null;
  if (sp.lead && conn) {
    const session = await getCurrentSession();
    // Kunde selbst oder Admin (z. B. in „Als Kunde ansehen").
    if (
      session &&
      (session.role === "ADMIN" || (session.role === "BUYER" && session.customerId === conn.customerId))
    ) {
      const l = await prisma.lead.findFirst({
        where: { id: sp.lead, customerId: conn.customerId },
        select: { name: true, email: true, phone: true },
      });
      if (l) prefill = { name: l.name ?? "", email: l.email ?? "", phone: l.phone ?? "" };
    }
  }

  // Lead-Kontext aus der Mail-Strecke („Andere Zeit“, lib/mail-strecke): Name und E-Mail vorbelegt, Telefon freiwillig
  let streckeT: string | null = null;
  if (sp.t && conn) {
    const { pruefeStreckenToken } = await import("@/lib/mail-strecke/token");
    const sid = pruefeStreckenToken(sp.t);
    const s = sid ? await prisma.leadMailStrecke.findUnique({ where: { id: sid }, select: { customerId: true, lead: { select: { name: true, email: true, phone: true, erasedAt: true } } } }) : null;
    if (s && s.customerId === conn.customerId && !s.lead.erasedAt) {
      streckeT = sp.t;
      prefill = { name: s.lead.name ?? "", email: s.lead.email ?? "", phone: s.lead.phone ?? "" };
    }
  }

  if (!conn) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Online-Buchung nicht verfügbar</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Dieser Buchungslink ist ungültig oder derzeit deaktiviert.
        </p>
      </Shell>
    );
  }
  // Kalender getrennt (Usability-Check 18.11.2026): wie auf /termin ein Weg zum Termin statt einer Sackgasse
  if (conn.status !== "connected") {
    const an0 = asAnsprache(conn.customer.leadAddress);
    return (
      <Shell customerId={conn.customerId}>
        <h1 className="text-xl font-bold">Online-Buchung gerade nicht verfügbar</h1>
        <OhneKalender an={an0} kontakt={await vermittlerKontakt(conn.customerId)} />
      </Shell>
    );
  }

  const advisor = conn.customer.name;
  const an = asAnsprache(conn.customer.leadAddress);

  // ── Bestätigung ───────────────────────────────────────────────────────
  if (sp.ok && sp.a) {
    const appt = await prisma.appointment.findFirst({
      where: { id: sp.a, customerId: conn.customerId },
      select: { id: true, leadId: true, conversationId: true, status: true, startsAt: true, mode: true, meetUrl: true, manageToken: true, komplettcheck: true },
    });
    if (appt) {
      // Komplettcheck direkt nach der Buchung (Ole, 19.11.2026): wer über die Seite bucht, wurde bisher nicht gefragt.
      // Nur einmal, nur solange offen, nicht für den Vermittler selbst (Rückrufliste).
      const kcOffen = appt.komplettcheck === null && appt.status === "booked" && appt.startsAt.getTime() > nowMs() && !!appt.manageToken && !sp.lead;
      let kcFrage: string | null = null;
      if (kcOffen) {
        const { komplettcheckFrage, istFamilie, formularAus, vermittlerName } = await import("@/lib/whatsapp/gespraech");
        const { ansprechpartner } = await import("@/lib/lead-anrede");
        const lead = appt.leadId ? await prisma.lead.findUnique({ where: { id: appt.leadId }, select: { formData: true, name: true, needData: true } }) : null;
        const who = await ansprechpartner({ customerId: conn.customerId, leadId: appt.leadId, phone: null, name: lead?.name ?? null });
        const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || advisor });
        const v = await variante("komplettcheck_text", appt.leadId ?? appt.conversationId ?? appt.id);
        kcFrage = komplettcheckFrage(an, person, istFamilie(formularAus(lead?.formData), lead?.needData), v).replace(/^Danke! /, "");
      }
      return (
        <Shell customerId={conn?.customerId}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            {sp.dup ? a(an, "Du hast bereits einen Termin", "Sie haben bereits einen Termin") : a(an, "Dein Termin ist gebucht!", "Ihr Termin ist gebucht!")}
          </h1>
          <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4">
            <div className="text-sm text-[color:var(--muted)]">
              {appt.mode === "video" ? "Videocall" : "Telefonat"} mit {advisor}
            </div>
            <div className="mt-1 text-lg font-semibold">
              {fmt(appt.startsAt, {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              Uhr
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[color:var(--muted)]">
            {appt.mode === "video"
              ? a(an, "Die Bestätigung mit dem Link zum Videocall bekommst du per WhatsApp und E-Mail.", "Die Bestätigung mit dem Link zum Videocall bekommen Sie per WhatsApp und E-Mail.")
              : a(an, "Wir rufen dich zur vereinbarten Zeit an. Die Bestätigung bekommst du per WhatsApp und E-Mail.", "Wir rufen Sie zur vereinbarten Zeit an. Die Bestätigung bekommen Sie per WhatsApp und E-Mail.")}
          </p>
          {kcFrage ? (
            <form action={komplettcheckBuchungAction.bind(null, slug)} className="mt-5 rounded-xl bg-[color:var(--brand-soft)] p-4" data-komplettcheck>
              <input type="hidden" name="token" value={appt.manageToken ?? ""} />
              <p className="text-[15px] font-semibold leading-snug">{kcFrage}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button name="ja" value="1" className={buttonClass("primary", "md", "h-12 w-full text-base")} data-ja>
                  Ja, gern
                </button>
                <button name="ja" value="0" className={buttonClass("secondary", "md", "h-12 w-full text-base")} data-nein>
                  Nein, danke
                </button>
              </div>
            </form>
          ) : sp.kc === "1" ? (
            <p className="mt-4 text-sm font-medium text-emerald-700" data-komplettcheck-ja>
              {a(an, "Super, im Termin wird auch kurz geschaut, wo du vielleicht doppelt zahlst und sparen kannst.", "Super, im Termin wird auch kurz geschaut, wo Sie vielleicht doppelt zahlen und sparen können.")}
            </p>
          ) : null}
          {appt.mode === "video" && appt.meetUrl ? (
            <a href={appt.meetUrl} className={buttonClass(kcFrage ? "secondary" : "primary", "md", "mt-4 w-full")}>
              <Video className="h-4 w-4" /> Link zum Videocall
            </a>
          ) : null}
          {appt.manageToken ? <AddToCalendar token={appt.manageToken} /> : null}
          {appt.manageToken ? (
            <Link
              href={`/book/manage/${appt.manageToken}`}
              className="mt-1 block py-2.5 text-center text-sm text-[color:var(--muted)] underline"
            >
              Termin verschieben oder absagen
            </Link>
          ) : null}
        </Shell>
      );
    }
  }

  // ── Buchungsformular ──────────────────────────────────────────────────
  let slots: Slot[] = [];
  // Termindauer aus „Mein Kalender“ (15/30/45/60 Min.)
  const durationMin = await bookingDurationMin(conn.customerId).catch(() => 30);
  // Video immer zuerst, empfohlen und vorgewählt (Ole, 20.11.2026); Telefon nur, wenn der Vermittler es freigegeben hat
  const telefonErlaubt = (await loadTerminFormate(conn.customerId).catch(() => TERMIN_FORMATE_STANDARD)).telefon;
  try {
    slots = await suggestSlots(
      conn.customerId,
      durationMin,
      24,
      // Leads buchen nur zu den Lead-Zeiten des Vertreters (Mein Kalender).
      "lead",
      14,
    );
  } catch (err) {
    console.error("[booking page] slots", err);
  }
  const days = groupByDay(slots);
  const action = bookPublicAction.bind(null, slug);
  // Splittest buchungsseite_kompakt (lib/experimente.ts): je Aufruf eine zufällige ID, kein Cookie und kein Bezug zur
  // Person; gezählt wird erst, wenn die Seite im Browser angezeigt wurde (Gezeigt). Nicht bei Buchung durch den Vermittler.
  const aufruf = prefill && !streckeT ? null : randomUUID();
  const v: Variante = aufruf ? await variante("buchungsseite_kompakt", aufruf, { merken: false }) : "a";
  const kompakt = v === "b";
  const nah = kompakt ? days.slice(0, NAH_TAGE) : days;
  const spaeter = kompakt ? days.slice(NAH_TAGE) : [];
  // Häkchen Erinnerung zur Terminvorbereitung (Policen, Rechtsprüfung A8): nur wenn der Lead selbst bucht. Nicht bei
  // Buchung durch den Vermittler (dessen Haken wäre keine Einwilligung des Leads) und nicht aus der Mail-Strecke (Telefon
  // dort nur für einen Anruf). Splittest buchung_erinnerung (lib/experimente.ts): eigene zufällige ID je Aufruf,
  // Zuteilung erst bei der Buchung (actions.ts).
  const erinnerungAufruf = prefill ? null : randomUUID();
  const erinnerungFassung: Variante = erinnerungAufruf ? await variante("buchung_erinnerung", erinnerungAufruf, { merken: false }) : "a";
  // Zeitstempel für die Bot-Falle (echte Menschen brauchen > 3 s).
  const renderedAt = nowMs();
  const ERRORS = errorsFor(an);
  const error = sp.err ? (ERRORS[sp.err] ?? ERRORS.error) : null;

  return (
    <Shell customerId={conn?.customerId}>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-sm font-bold text-[color:var(--brand-dark)]">
          {advisor
            .replace(/^Allianz\s+/i, "")
            .split(/\s+/)
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="text-xs text-[color:var(--muted)]">Kostenloses Beratungsgespräch</div>
          {/* Gleicher Name wie in der Bestätigung und auf „Termin verwalten“ (16.11.2026); nur die Initialen ohne „Allianz“ */}
          <h1 className="text-lg font-semibold leading-tight tracking-tight">{advisor}</h1>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
        <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-sunken)] px-2.5 py-1">
          <Clock className="h-3.5 w-3.5" /> {durationMin} Minuten
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-sunken)] px-2.5 py-1">
          <Video className="h-3.5 w-3.5" /> {telefonErlaubt ? <>Video oder <Phone className="h-3.5 w-3.5" /> Telefon</> : "Per Video, ohne App"}
        </span>
        {kompakt ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800" data-kostenlos>
            <CheckCircle2 className="h-3.5 w-3.5" /> Kostenlos und unverbindlich
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </div>
      ) : null}

      {days.length === 0 ? (
        <div className="mt-6 rounded-xl bg-[color:var(--background)] p-4">
          <p className="text-sm font-medium">Gerade sind keine Zeiten online frei.</p>
          <OhneKalender an={an} kontakt={await vermittlerKontakt(conn.customerId)} />
        </div>
      ) : (
        <form action={action} className="mt-6 space-y-6" data-fassung={aufruf ? v : undefined}>
          {aufruf ? <input type="hidden" name="xv" value={aufruf} /> : null}
          {aufruf ? <Gezeigt aufruf={aufruf} /> : null}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <StepNo n={1} /> {a(an, "Wähle eine Uhrzeit", "Wählen Sie eine Uhrzeit")}
            </h2>
            <Tage days={nah} />
            {spaeter.length ? (
              <details className="group mt-4" data-weitere-tage>
                <summary className="cursor-pointer list-none rounded-[var(--radius-sm)] border border-dashed border-[color:var(--border)] py-2.5 text-center text-sm font-medium text-[color:var(--brand-dark)] group-open:hidden">
                  Weitere Tage anzeigen
                </summary>
                <div className="mt-1">
                  <Tage days={spaeter} />
                </div>
              </details>
            ) : null}
          </section>

          {telefonErlaubt ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <StepNo n={2} /> {a(an, "Wie möchtest du sprechen?", "Wie möchten Sie sprechen?")}
              </h2>
              <div className="grid grid-cols-2 gap-2" data-gespraechsart>
                {[
                  { v: "video", label: "Videocall", Icon: Video, empfohlen: true },
                  { v: "phone", label: "Telefon", Icon: Phone, empfohlen: false },
                ].map((o) => (
                  <label
                    key={o.v}
                    className="relative flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white py-3 text-sm font-semibold transition hover:border-[color:var(--brand)] has-checked:border-[color:var(--brand)] has-checked:bg-[color:var(--brand-soft)] has-checked:text-[color:var(--brand-dark)]"
                  >
                    {o.empfohlen ? (
                      <span className="absolute -top-2 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white" data-empfohlen>
                        Empfohlen
                      </span>
                    ) : null}
                    <o.Icon className="h-4 w-4" />
                    <input type="radio" name="mode" value={o.v} defaultChecked={o.empfohlen} className="sr-only" />
                    {o.label}
                  </label>
                ))}
              </div>
            </section>
          ) : (
            <input type="hidden" name="mode" value="video" />
          )}

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <StepNo n={telefonErlaubt ? 3 : 2} /> {a(an, "Deine Kontaktdaten", "Ihre Kontaktdaten")}
            </h2>
            <Field name="name" label="Vor- und Nachname" autoComplete="name" defaultValue={prefill?.name} />
            <Field
              name="email"
              label="E-Mail-Adresse"
              type="email"
              autoComplete="email"
              defaultValue={prefill?.email}
            />
            <PhoneField
              name="phone"
              label={streckeT ? "Telefonnummer (freiwillig, nur für einen Anruf)" : "Handynummer (für WhatsApp/Anruf)"}
              required={!streckeT}
              defaultInternational={prefill?.phone}
            />
            {streckeT ? <input type="hidden" name="t" value={streckeT} /> : null}
            {/* Bot-Falle: für Menschen unsichtbar. Bewusst ein Name, den
                Autofill/Passwortmanager nicht zuordnen (früher „website" →
                wurde von Passwortmanagern befüllt und blockierte echte Leads). */}
            <input
              type="text"
              name="zq_hp_field"
              tabIndex={-1}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />
            <input type="hidden" name="rendered_at" value={String(renderedAt)} />
            {kompakt ? <input type="hidden" name="datenschutz" value="hinweis" /> : (
            <label className="flex items-start gap-2 text-xs leading-relaxed text-[color:var(--muted)]">
              <input type="checkbox" name="consent" required className="mt-0.5" />
              <span>
                Ich bin einverstanden, dass meine Angaben zur Terminvereinbarung
                und Beratung verarbeitet werden. Hinweise in der{" "}
                <a
                  href={privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Datenschutzerklärung
                </a>
                .
              </span>
            </label>
            )}
            {/* Opt-in für Erinnerungen zur Terminvorbereitung (lib/policen, Rechtsprüfung A8), nicht vorausgewählt */}
            {erinnerungAufruf ? (
              <label className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-[color:var(--muted)]">
                <input type="hidden" name="xe" value={erinnerungAufruf} />
                <input type="hidden" name="erinnerung_fassung" value={erinnerungFassung} />
                <input type="checkbox" name="erinnerung" className="mt-0.5" data-erinnerung-optin data-fassung={erinnerungFassung} />
                <span>{erinnerungOptin(erinnerungFassung, an).text}</span>
              </label>
            ) : null}
          </section>

          <SubmitButton
            pendingLabel="Wird gebucht …"
            className={buttonClass("primary", "md", "h-12 w-full text-base")}
          >
            {kompakt ? "Kostenlos Termin buchen" : "Termin verbindlich buchen"}
          </SubmitButton>
          {kompakt ? (
            <p className="-mt-3 text-center text-xs leading-relaxed text-[color:var(--muted)]" data-datenschutz-hinweis>
              {a(an, "Deine Angaben nutzen wir nur für den Termin und die Beratung.", "Ihre Angaben nutzen wir nur für den Termin und die Beratung.")}{" "}
              <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Datenschutz
              </a>
            </p>
          ) : null}
        </form>
      )}
    </Shell>
  );
}

/** Fassung b der Buchungsseite: so viele Tage sofort sichtbar, der Rest hinter „Weitere Tage anzeigen“. */
const NAH_TAGE = 3;

/** Freie Zeiten je Tag als Auswahl (eine Gruppe „start“ über alle Tage). */
function Tage({ days }: { days: { label: string; slots: Slot[] }[] }) {
  return (
    <div className="space-y-4">
      {days.map((day) => (
        <div key={day.label}>
          <div className="mb-1.5 text-xs font-medium text-[color:var(--muted)]">{day.label}</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {day.slots.map((s) => (
              <label
                key={s.start}
                className="cursor-pointer rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white py-2.5 text-center text-sm font-semibold tabular-nums transition hover:border-[color:var(--brand)] has-checked:border-[color:var(--brand)] has-checked:bg-[color:var(--brand)] has-checked:text-white"
              >
                <input type="radio" name="start" value={s.start} required className="sr-only" />
                {fmt(new Date(s.start), { hour: "2-digit", minute: "2-digit" })}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Ohne Kalender bzw. ohne freie Zeiten: Rückruf per E-Mail anfragen oder anrufen (lib/buchung-ohne-kalender.ts). */
function OhneKalender({ an, kontakt }: { an: Ansprache; kontakt: VermittlerKontakt }) {
  const { text, wege } = kontaktWege(kontakt, an);
  return (
    <div data-ohne-kalender>
      <p className="mt-2 text-sm text-[color:var(--muted)]">{text}</p>
      {wege.length ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {wege.map((w, i) => (
            <a key={w.art} href={w.href} className={buttonClass(i === 0 ? "primary" : "secondary", "md", "h-11 w-full sm:w-auto")} data-kontakt-weg={w.art}>
              {w.art === "anrufen" ? <Phone className="h-4 w-4" /> : <Mail className="h-4 w-4" />} {w.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Shell({ children, customerId }: { children: React.ReactNode; customerId?: string | null }) {
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">
          {children}
        </div>
      </main>
      <LeadLegalFooter customerId={customerId} />
    </>
  );
}

function Field({
  name,
  label,
  type = "text",
  autoComplete,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2.5 text-base transition focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/15"
      />
    </label>
  );
}

function StepNo({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--foreground)] text-[11px] font-bold text-white">
      {n}
    </span>
  );
}
