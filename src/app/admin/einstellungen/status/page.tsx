import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { LEVEL_LABEL, STATUS_COMPONENTS } from "@/lib/status";
import { currentStatus } from "@/lib/status-server";
import { supportConfig } from "@/lib/support";
import { requireAuth } from "@/lib/vertrieb/auth";
import { deleteIncidentAction, resolveIncidentAction } from "./actions";
import { IncidentForm } from "./form";

export const metadata = { title: "Status & Support | performancegrowth Admin" };

const PILL = { ok: "bg-emerald-50 text-emerald-700", degraded: "bg-amber-50 text-amber-800", down: "bg-rose-50 text-rose-700" } as const;
const LEVEL_TEXT: Record<string, string> = { info: "Hinweis", degraded: "Eingeschränkt", down: "Störung" };
const fmt = (d: Date) => d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

// Öffentliche Statusseite pflegen (Meldungen) und Support-Kontakt prüfen.
export default async function StatusEinstellungenPage() {
  await connection();
  await requireAuth();
  const now = new Date();
  const [status, incidents, beats] = await Promise.all([
    currentStatus(now),
    prisma.statusIncident.findMany({ orderBy: { startsAt: "desc" }, take: 20 }),
    prisma.systemHeartbeat.findMany(),
  ]);
  const support = supportConfig();
  const label = (k: string | null) => STATUS_COMPONENTS.find((c) => c.key === k)?.label ?? "Allgemein";
  const card = "rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/einstellungen" className="text-xs text-[color:var(--brand)] hover:underline">← Einstellungen</Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Status &amp; Support</h1>
          <a href="/status" target="_blank" rel="noopener" className="text-sm font-medium text-[color:var(--brand)] hover:underline">Statusseite öffnen ↗</a>
        </div>
        <p className="text-sm text-[color:var(--muted)]">
          Die Statusseite ist öffentlich. Sie zeigt nur „Betriebsbereit“, „Eingeschränkt“ oder „Störung“ und Ihre Meldungen, keine Fehlertexte.
        </p>
      </div>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Support-Kontakt im Hilfe-Chat</h2>
        <ul className="space-y-1.5 text-sm">
          <li>WhatsApp: {support.whatsapp ? <span className="font-medium">+{support.whatsapp}</span> : <span className="text-amber-700">nicht eingerichtet (Variable SUPPORT_WHATSAPP_NUMBER)</span>}</li>
          <li>E-Mail: {support.email ? <span className="font-medium">{support.email}</span> : <span className="text-amber-700">nicht eingerichtet (Variable SUPPORT_EMAIL)</span>}</li>
          <li className="text-[color:var(--muted)]">Antwortzeit-Hinweis: {support.responseTime}</li>
        </ul>
        {!support.whatsapp && !support.email ? (
          <p className="mt-3 rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Ohne Kontaktweg zeigt der Hilfe-Chat nur „An unser Team weitergeben“. Sie bekommen dann eine Push-Nachricht und melden sich selbst.
          </p>
        ) : null}
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Zustand jetzt</h2>
        <ul className="divide-y divide-[color:var(--border)] text-sm">
          {STATUS_COMPONENTS.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-3 py-2">
              <span>{c.label}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[status[c.key]]}`}>{LEVEL_LABEL[status[c.key]]}</span>
            </li>
          ))}
        </ul>
        {beats.length ? (
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Intern: {beats.map((b) => `${b.key} ${fmt(b.at)}${b.ok ? "" : ` (${b.note ?? "Fehler"})`}`).join(" · ")}
          </p>
        ) : null}
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Neue Meldung</h2>
        <IncidentForm />
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Meldungen</h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">Noch keine Meldungen.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {incidents.map((i) => {
              const active = !i.resolvedAt || i.resolvedAt > now;
              return (
                <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{i.title}</div>
                    <div className="text-sm text-[color:var(--muted)]">
                      {LEVEL_TEXT[i.level] ?? i.level} · {label(i.component)} · {fmt(i.startsAt)}
                      {i.resolvedAt ? ` bis ${fmt(i.resolvedAt)}` : " · läuft"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {active ? (
                      <form action={resolveIncidentAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <button className="rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-emerald-500">Behoben</button>
                      </form>
                    ) : null}
                    <form action={deleteIncidentAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <button className="rounded-[var(--radius-sm)] px-3 py-1.5 text-sm text-[color:var(--muted)] hover:text-rose-600">Löschen</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
