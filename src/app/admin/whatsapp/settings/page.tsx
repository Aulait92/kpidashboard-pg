import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/admin-tabs";
import { SubmitButton } from "@/components/submit-button";
import { getCurrentSession } from "@/lib/auth";
import { getOrCreateBookingSlug, PROVIDER_LABELS } from "@/lib/calendar";
import { appUrl } from "@/lib/whatsapp/event-text";
import { prisma } from "@/lib/prisma";
import {
  PURPOSE_LABELS,
  PURPOSE_PARAMS,
  type NoticePurpose,
} from "@/lib/whatsapp/templates";
import {
  addCustomerAction,
  deleteTemplateAction,
  saveOutreachSettingsAction,
  saveTemplateAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp-Einstellungen | KPI-Dashboard" };

const PURPOSES = Object.keys(PURPOSE_LABELS) as NoticePurpose[];

// Vorschläge für die bei 360dialog/Meta einzureichenden Vorlagentexte.
const SUGGESTED: Record<NoticePurpose, string> = {
  outreach:
    "Hallo {{1}}, danke für deine Anfrage! Ich bin Christine aus dem Beratungsteam. Hast du kurz Zeit für zwei Fragen, damit wir dir ein passendes Angebot machen können?",
  booking_confirmation:
    "Hallo {{1}}, dein Termin ist bestätigt: {{2}} ({{3}}). {{4}} Bis dann!",
  reminder:
    "Hallo {{1}}, kurze Erinnerung an deinen Termin: {{2}} ({{3}}). {{4}} Bis dann!",
};

const input =
  "w-full rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-sm focus:border-[color:var(--brand)] focus:outline-none";

export default async function WhatsAppSettingsPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  // Kunden mit WhatsApp-Konto oder Agent — nur dort ergeben Einstellungen Sinn.
  const customers = await prisma.customer.findMany({
    where: {
      OR: [{ whatsAppAccount: { isNot: null } }, { agentConfig: { isNot: null } }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      whatsAppAccount: { select: { status: true } },
      calendarConnection: {
        select: { status: true, provider: true, accountEmail: true, calendarId: true },
      },
      agentConfig: {
        select: {
          active: true,
          outreachEnabled: true,
          outreachDelayMin: true,
          videoRoomUrl: true,
          advisorEmail: true,
          availabilityIcsUrlEnc: true,
        },
      },
      messageTemplates: {
        orderBy: [{ purpose: "asc" }, { updatedAt: "desc" }],
        select: { id: true, name: true, language: true, purpose: true, status: true, body: true },
      },
    },
  });

  const otherCustomers = await prisma.customer.findMany({
    where: { id: { notIn: customers.map((c) => c.id) } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  // Buchungslinks für Kunden mit verbundenem Kalender.
  const base = appUrl() ?? "";
  const bookingUrls = new Map<string, string>();
  for (const c of customers) {
    if (c.calendarConnection?.status === "connected") {
      bookingUrls.set(c.id, `${base}/book/${await getOrCreateBookingSlug(c.id)}`);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          WhatsApp-Einstellungen
        </h1>
        <Link
          href="/admin/whatsapp"
          className="text-sm font-medium text-[color:var(--brand)] hover:underline"
        >
          ← zur Inbox
        </Link>
      </div>
      <AdminTabs />

      <div className="mt-4 rounded-xl bg-[color:var(--brand-soft)]/50 p-4 text-xs leading-relaxed text-[color:var(--foreground)]">
        <b>So funktioniert&apos;s:</b> Außerhalb des 24-h-Fensters darf WhatsApp nur
        freigegebene Vorlagen senden. Lege die Vorlage zuerst bei 360dialog an
        (gleicher Name, Sprache, Text), warte auf die Freigabe durch Meta und
        trage sie hier ein. Erstanschreiben erst aktivieren, wenn das
        Leadformular eine WhatsApp-Einwilligung enthält.
      </div>

      <form
        action={addCustomerAction}
        className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--border)] bg-white p-3"
      >
        <span className="text-sm font-semibold">Kunde hinzufügen:</span>
        <select
          name="customerId"
          required
          defaultValue=""
          className="min-w-[220px] flex-1 rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-sm"
        >
          <option value="" disabled>
            Kunde wählen …
          </option>
          {otherCustomers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <SubmitButton
          pendingLabel="…"
          className="rounded-lg border border-[color:var(--brand)] px-4 py-1.5 text-sm font-semibold text-[color:var(--brand)]"
        >
          Hinzufügen
        </SubmitButton>
      </form>

      {customers.length === 0 ? (
        <p className="mt-6 text-sm text-[color:var(--muted)]">
          Noch kein Kunde mit WhatsApp-Konto oder Agent.
        </p>
      ) : null}

      <div className="mt-6 space-y-6">
        {customers.map((c) => {
          const usedPurposes = new Set(
            c.messageTemplates.filter((t) => t.status === "approved").map((t) => t.purpose),
          );
          return (
            <section
              key={c.id}
              className="rounded-2xl border border-[color:var(--border)] bg-white p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{c.name}</h2>
                <span className="text-xs text-[color:var(--muted)]">
                  WhatsApp: {c.whatsAppAccount?.status ?? "nicht verbunden"} · Agent:{" "}
                  {c.agentConfig?.active ? "aktiv" : "inaktiv"}
                </span>
              </div>

              <form
                action={saveOutreachSettingsAction}
                className="mt-4 flex flex-wrap items-end gap-4 rounded-xl border border-[color:var(--border)] p-3"
              >
                <input type="hidden" name="customerId" value={c.id} />
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="outreachEnabled"
                    defaultChecked={c.agentConfig?.outreachEnabled ?? false}
                  />
                  Neue Leads automatisch per WhatsApp anschreiben
                </label>
                <label className="text-xs text-[color:var(--muted)]">
                  Wartezeit (Min.) für Selbstbuchung
                  <input
                    name="outreachDelayMin"
                    type="number"
                    min={0}
                    max={1440}
                    defaultValue={c.agentConfig?.outreachDelayMin ?? 10}
                    className={`${input} mt-1 w-24`}
                  />
                </label>
                <label className="min-w-[260px] flex-1 text-xs text-[color:var(--muted)]">
                  Fester Video-Link (z. B. Webex-Raum) – leer = Google Meet / Teams
                  <input
                    name="videoRoomUrl"
                    type="url"
                    placeholder="https://allianz.webex.com/meet/…"
                    defaultValue={c.agentConfig?.videoRoomUrl ?? ""}
                    className={`${input} mt-1`}
                  />
                </label>
                <label className="min-w-[260px] flex-1 text-xs text-[color:var(--muted)]">
                  Berater-E-Mail (bekommt jeden Termin als Einladung, z. B. Allianz-Adresse)
                  <input
                    name="advisorEmail"
                    type="email"
                    placeholder="vorname.nachname@allianz.de"
                    defaultValue={c.agentConfig?.advisorEmail ?? ""}
                    className={`${input} mt-1`}
                  />
                </label>
                <label className="min-w-[260px] flex-1 text-xs text-[color:var(--muted)]">
                  Veröffentlichter Kalender (ICS-Link, nur Frei/Gebucht){" "}
                  {c.agentConfig?.availabilityIcsUrlEnc ? (
                    <span className="font-semibold text-emerald-700">· hinterlegt ✓</span>
                  ) : null}
                  <input
                    name="availabilityIcsUrl"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      c.agentConfig?.availabilityIcsUrlEnc
                        ? "leer lassen = unverändert"
                        : "https://outlook.office365.com/owa/calendar/…/calendar.ics"
                    }
                    className={`${input} mt-1`}
                  />
                  {c.agentConfig?.availabilityIcsUrlEnc ? (
                    <span className="mt-1 flex items-center gap-1.5">
                      <input type="checkbox" name="removeIcs" /> Link entfernen
                    </span>
                  ) : null}
                </label>
                <SubmitButton
                  pendingLabel="Speichert …"
                  className="rounded-lg bg-[color:var(--brand)] px-4 py-1.5 text-sm font-semibold text-white"
                >
                  Speichern
                </SubmitButton>
                {c.agentConfig?.outreachEnabled && !usedPurposes.has("outreach") ? (
                  <span className="text-xs font-medium text-amber-700">
                    ⚠ Aktiv, aber noch keine freigegebene Erstanschreiben-Vorlage
                  </span>
                ) : null}
              </form>

              <div className="mt-4 rounded-xl border border-[color:var(--border)] p-3 text-sm">
                <div className="font-semibold">Buchungskalender</div>
                {c.calendarConnection?.status === "connected" ? (
                  <p className="mt-1 text-xs text-emerald-700">
                    ✓ {PROVIDER_LABELS[c.calendarConnection.provider] ?? "Kalender"} verbunden
                    {c.calendarConnection.accountEmail ? ` (${c.calendarConnection.accountEmail})` : ""}
                    {c.calendarConnection.calendarId !== "primary" ? " · eigener Unterkalender" : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[color:var(--muted)]">Noch nicht verbunden.</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={`/api/microsoft/connect?customerId=${c.id}`}
                    className="rounded-lg border border-[color:var(--brand)] px-3 py-1.5 text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]/40"
                  >
                    {c.calendarConnection?.provider === "microsoft" ? "Outlook neu verbinden" : "Outlook / Microsoft 365 verbinden"}
                  </a>
                  <a
                    href={`/api/google/connect?customerId=${c.id}`}
                    className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[color:var(--brand)]"
                  >
                    {c.calendarConnection?.provider === "google" ? "Google neu verbinden" : "Google-Kalender verbinden"}
                  </a>
                </div>
                {bookingUrls.get(c.id) ? (
                  <div className="mt-2 text-xs">
                    <span className="text-[color:var(--muted)]">Buchungslink: </span>
                    <a
                      href={bookingUrls.get(c.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[color:var(--brand)] hover:underline"
                    >
                      {bookingUrls.get(c.id)}
                    </a>
                  </div>
                ) : null}
              </div>

              <h3 className="mt-5 text-sm font-semibold">Vorlagen</h3>
              {c.messageTemplates.length === 0 ? (
                <p className="mt-1 text-xs text-[color:var(--muted)]">Noch keine Vorlagen.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[color:var(--border)] rounded-xl border border-[color:var(--border)]">
                  {c.messageTemplates.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0 text-xs">
                        <div className="font-semibold">
                          {PURPOSE_LABELS[t.purpose as NoticePurpose] ?? (t.purpose || "–")} ·{" "}
                          <code>{t.name}</code> ({t.language}) ·{" "}
                          <span
                            className={
                              t.status === "approved" ? "text-emerald-700" : "text-amber-700"
                            }
                          >
                            {t.status === "approved" ? "freigegeben" : t.status}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[color:var(--muted)]">
                          {t.body}
                        </p>
                      </div>
                      <form action={deleteTemplateAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <SubmitButton
                          pendingLabel="…"
                          className="text-xs font-medium text-rose-700 hover:underline"
                        >
                          Entfernen
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-[color:var(--brand)]">
                  + Vorlage hinterlegen
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  {PURPOSES.map((p) => (
                    <form
                      key={p}
                      action={saveTemplateAction}
                      className="space-y-2 rounded-xl border border-[color:var(--border)] p-3"
                    >
                      <input type="hidden" name="customerId" value={c.id} />
                      <input type="hidden" name="purpose" value={p} />
                      <div className="text-sm font-semibold">{PURPOSE_LABELS[p]}</div>
                      <div className="text-[11px] text-[color:var(--muted)]">
                        Platzhalter:{" "}
                        {PURPOSE_PARAMS[p].map((x, i) => `{{${i + 1}}} ${x}`).join(", ")}
                      </div>
                      <input
                        name="name"
                        required
                        placeholder="Vorlagenname (wie bei 360dialog)"
                        className={input}
                      />
                      <input name="language" defaultValue="de" className={input} />
                      <textarea
                        name="body"
                        required
                        rows={5}
                        defaultValue={SUGGESTED[p]}
                        className={input}
                      />
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" name="approved" /> von Meta freigegeben
                      </label>
                      <SubmitButton
                        pendingLabel="Speichert …"
                        className="w-full rounded-lg border border-[color:var(--brand)] py-1.5 text-xs font-semibold text-[color:var(--brand)]"
                      >
                        Vorlage speichern
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              </details>
            </section>
          );
        })}
      </div>
    </main>
  );
}
