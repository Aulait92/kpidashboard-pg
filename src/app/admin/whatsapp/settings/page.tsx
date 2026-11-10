import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { getCurrentSession } from "@/lib/auth";
import { getOrCreateBookingSlug, PROVIDER_LABELS } from "@/lib/calendar";
import { appUrl } from "@/lib/whatsapp/event-text";
import { hasDemoData } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import {
  PURPOSE_LABELS,
  PURPOSE_PARAMS,
  SUGGESTED_TEMPLATE_TEXT,
  type NoticePurpose,
} from "@/lib/whatsapp/templates";
import {
  addCustomerAction,
  connectWhatsAppAction,
  removeDemoAction,
  seedDemoAction,
  deleteTemplateAction,
} from "./actions";
import { AgentSettings, TemplateApproved, TemplateEditor } from "./controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp-Einstellungen | KPI-Dashboard" };

const PURPOSES = Object.keys(PURPOSE_LABELS) as NoticePurpose[];

// Vorschläge für die bei 360dialog/Meta einzureichenden Vorlagentexte.
const SUGGESTED = SUGGESTED_TEMPLATE_TEXT;

const input =
  "w-full rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-sm focus:border-[color:var(--brand)] focus:outline-none";

const WA_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Nummer verbunden ✓ Webhook ist gesetzt. Schreib der Nummer kurz eine Testnachricht." },
  nokey: { ok: false, text: "Bitte den API-Key aus 360dialog eintragen." },
  noconfig: { ok: false, text: "APP_URL oder WHATSAPP_WEBHOOK_SECRET fehlt in Railway." },
  webhook: { ok: false, text: "360dialog hat den API-Key abgelehnt bzw. der Webhook ließ sich nicht setzen. Key prüfen und erneut speichern." },
};

export default async function WhatsAppSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ wa?: string; c?: string; kunde?: string }>;
}) {
  const sp = await searchParams;
  // kunde = eingebettet in die Kundenakte (nur dieser Kunde, ohne Seitenkopf).
  const only = sp.kunde ?? null;
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  // Kunden mit WhatsApp-Konto oder Agent — nur dort ergeben Einstellungen Sinn.
  const customers = await prisma.customer.findMany({
    where: only
      ? { id: only, OR: [{ whatsAppAccount: { isNot: null } }, { agentConfig: { isNot: null } }] }
      : {
          OR: [{ whatsAppAccount: { isNot: null } }, { agentConfig: { isNot: null } }],
        },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      whatsAppAccount: {
        select: { status: true, phoneNumber: true, phoneNumberId: true, apiKeyEnc: true },
      },
      calendarConnection: {
        select: { status: true, provider: true, accountEmail: true, calendarId: true },
      },
      agentConfig: {
        select: {
          active: true,
          outreachEnabled: true,
          outreachDelayMin: true,
          followUpSequencesEnabled: true,
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
    where: { id: only ? { equals: only, notIn: customers.map((c) => c.id) } : { notIn: customers.map((c) => c.id) }, plan: { not: "internal" }, archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const demoTools = process.env.DEMO_TOOLS === "1";
  const demoState = new Map<string, boolean>();
  if (demoTools) {
    for (const c of customers) demoState.set(c.id, await hasDemoData(c.id));
  }
  // Buchungslinks für Kunden mit verbundenem Kalender.
  const base = appUrl() ?? "";
  const bookingUrls = new Map<string, string>();
  for (const c of customers) {
    if (c.calendarConnection?.status === "connected") {
      bookingUrls.set(c.id, `${base}/book/${await getOrCreateBookingSlug(c.id)}`);
    }
  }

  return (
    <main className={only ? "w-full" : "mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6"}>
      {only ? (
        otherCustomers.length ? (
          <form action={addCustomerAction} className="rounded-xl border border-[color:var(--border)] bg-white p-5">
            <input type="hidden" name="customerId" value={only} />
            <p className="text-sm text-[color:var(--muted)]">Für diesen Kunden ist der WhatsApp-Assistent noch nicht eingerichtet.</p>
            <SubmitButton pendingLabel="…" className="mt-3 rounded-lg bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white">
              WhatsApp-Assistent einrichten
            </SubmitButton>
          </form>
        ) : null
      ) : (
        <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          WhatsApp-Einstellungen
        </h1>
        <Link href="/admin/einstellungen" className="text-sm font-medium text-[color:var(--brand)] hover:underline">
          ← Einstellungen
        </Link>
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

        </>
      )}

      {customers.length === 0 && !only ? (
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
              id={`kunde-${c.id}`}
              className={only ? "space-y-4" : "space-y-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5"}
            >
              {only ? null : (
                <h2 className="text-lg font-semibold">
                  <Link href={`/admin/kunden/${c.id}/whatsapp`} className="hover:underline">
                    {c.name}
                  </Link>
                </h2>
              )}

              {demoTools ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span className="font-semibold">Demo-Daten:</span>
                  <span>
                    {demoState.get(c.id)
                      ? "angelegt (45 Beispiel-Leads mit Chats, Terminen, Retainer, Werbebudget)"
                      : "keine"}
                  </span>
                  <form action={seedDemoAction}>
                    <input type="hidden" name="customerId" value={c.id} />
                    <SubmitButton
                      pendingLabel="Legt an …"
                      className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white"
                    >
                      {demoState.get(c.id) ? "Neu anlegen" : "Anlegen"}
                    </SubmitButton>
                  </form>
                  {demoState.get(c.id) ? (
                    <form action={removeDemoAction}>
                      <input type="hidden" name="customerId" value={c.id} />
                      <SubmitButton
                        pendingLabel="Entfernt …"
                        className="rounded-md border border-amber-600 px-2.5 py-1 font-semibold text-amber-800"
                      >
                        Entfernen
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : null}

              {sp.c === c.id && sp.wa && WA_MESSAGES[sp.wa] ? (
                <div
                  className={`mt-3 rounded-lg px-3 py-2 text-sm ring-1 ${
                    WA_MESSAGES[sp.wa].ok
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                      : "bg-red-50 text-red-800 ring-red-200"
                  }`}
                >
                  {WA_MESSAGES[sp.wa].text}
                </div>
              ) : null}

              <details
                open={c.whatsAppAccount?.status !== "connected"}
                className="group rounded-xl border border-[color:var(--border)] bg-white [&>summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-3">
                  <span className="flex-1 font-medium">WhatsApp-Nummer</span>
                  {c.whatsAppAccount?.status === "connected" ? (
                    <span className="text-sm text-emerald-700">
                      ✓ verbunden{c.whatsAppAccount.phoneNumber ? ` · +${c.whatsAppAccount.phoneNumber}` : ""}
                      {c.whatsAppAccount.phoneNumberId ? "" : " · wartet auf erste Nachricht"}
                    </span>
                  ) : (
                    <span className="text-sm text-[color:var(--muted)]">nicht verbunden</span>
                  )}
                  <span className="text-sm text-[color:var(--brand)] group-open:hidden">ändern</span>
                </summary>
              <form
                action={connectWhatsAppAction}
                className="flex flex-wrap items-end gap-4 border-t border-[color:var(--border)] p-4"
              >
                <input type="hidden" name="customerId" value={c.id} />
                <label className="min-w-[200px] flex-1 text-xs text-[color:var(--muted)]">
                  Nummer (international)
                  <input
                    name="phoneNumber"
                    inputMode="tel"
                    placeholder="49 171 1234567"
                    defaultValue={c.whatsAppAccount?.phoneNumber ?? ""}
                    className={`${input} mt-1`}
                  />
                </label>
                <label className="min-w-[260px] flex-[2] text-xs text-[color:var(--muted)]">
                  API-Key aus 360dialog{" "}
                  {c.whatsAppAccount?.apiKeyEnc ? (
                    <span className="font-semibold text-emerald-700">· hinterlegt ✓</span>
                  ) : null}
                  <input
                    name="apiKey"
                    type="password"
                    autoComplete="off"
                    placeholder={c.whatsAppAccount?.apiKeyEnc ? "leer lassen = unverändert" : "API-Key einfügen"}
                    className={`${input} mt-1`}
                  />
                </label>
                <SubmitButton
                  pendingLabel="Verbindet …"
                  className="rounded-lg bg-[color:var(--brand)] px-4 py-1.5 text-sm font-semibold text-white"
                >
                  {c.whatsAppAccount?.status === "connected" ? "Neu verbinden" : "Verbinden"}
                </SubmitButton>
              </form>
              </details>

              <AgentSettings
                customerId={c.id}
                active={c.agentConfig?.active ?? false}
                outreachEnabled={c.agentConfig?.outreachEnabled ?? false}
                delayMin={c.agentConfig?.outreachDelayMin ?? 0}
                videoRoomUrl={c.agentConfig?.videoRoomUrl ?? ""}
                advisorEmail={c.agentConfig?.advisorEmail ?? ""}
                hasIcs={!!c.agentConfig?.availabilityIcsUrlEnc}
                outreachTemplateReady={usedPurposes.has("outreach")}
                sequencesEnabled={c.agentConfig?.followUpSequencesEnabled ?? false}
                sequenceTemplatesMissing={(["followup", "followup_offer", "followup_noshow", "followup_last"] as const).filter((x) => !usedPurposes.has(x)).map((x) => PURPOSE_LABELS[x])}
              />

              <div className="rounded-xl border border-[color:var(--border)] bg-white p-4 text-sm">
                <div className="font-medium">Buchungskalender</div>
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

              <div className="rounded-xl border border-[color:var(--border)] bg-white">
                <div className="flex items-center gap-2 px-4 py-3">
                  <span className="flex-1 font-medium">Vorlagen</span>
                  <span
                    title="Außerhalb des 24-Stunden-Fensters darf WhatsApp nur freigegebene Vorlagen senden. Vorlage bei 360dialog mit gleichem Namen und Text anlegen, auf Freigabe durch Meta warten, dann hier als freigegeben markieren."
                    className="cursor-help text-xs text-[color:var(--muted)]"
                  >
                    Wie funktioniert das? ⓘ
                  </span>
                </div>
                {c.messageTemplates.length === 0 ? (
                  <p className="border-t border-[color:var(--border)] px-4 py-3 text-sm text-[color:var(--muted)]">Noch keine Vorlagen.</p>
                ) : (
                  <ul className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
                    {c.messageTemplates.map((t) => (
                      <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1 text-sm">
                          <div className="font-medium">
                            {PURPOSE_LABELS[t.purpose as NoticePurpose] ?? (t.purpose || "–")}{" "}
                            <span className="text-xs font-normal text-[color:var(--muted)]">{t.name}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--muted)]">{t.body}</p>
                        </div>
                        <TemplateApproved id={t.id} approved={t.status === "approved"} />
                        <form action={deleteTemplateAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <SubmitButton pendingLabel="…" className="pt-1.5 text-xs font-medium text-rose-700 hover:underline">
                            Entfernen
                          </SubmitButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <details className="border-t border-[color:var(--border)]">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[color:var(--brand)]">+ Vorlage hinzufügen</summary>
                  <div className="px-4 pb-4">
                    <TemplateEditor
                      customerId={c.id}
                      sender={c.name.replace(/^Allianz\s+/i, "")}
                      purposes={PURPOSES.filter((p) => !usedPurposes.has(p)).concat(PURPOSES.filter((p) => usedPurposes.has(p))).map((p) => ({
                        key: p,
                        label: PURPOSE_LABELS[p],
                        params: PURPOSE_PARAMS[p],
                        suggested: SUGGESTED[p].replace("[Berater]", c.name.replace(/^Allianz\s+/i, "")),
                      }))}
                    />
                  </div>
                </details>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
