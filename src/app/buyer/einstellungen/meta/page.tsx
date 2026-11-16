import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { loadCapiOverview, type CapiWindow } from "@/lib/capi/server";
import { explainCapiError, GOAL_STAGES, STAGE_EVENT_NAME } from "@/lib/capi/shared";
import { canEditProvision } from "@/lib/provision-server";
import { CapiToggle } from "./capi-toggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rückmeldung an Meta | performancegrowth" };

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
const pct = (n: number) => `${(Math.round(n * 1000) / 10).toLocaleString("de-DE")} %`;
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// Rückmeldung an Meta (Conversions API für CRM, Ole 15.11.2026): Schalter, was gesendet wird, Status und
// je Zeitraum die Anteile der Stufen mit Empfehlung für das Optimierungsziel. Nur der Inhaber schaltet.
export default async function MetaRueckmeldungPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const o = await loadCapiOverview(ctx.customerId);
  if (!o) redirect("/buyer/einstellungen");
  const canEdit = canEditProvision(ctx);

  // Letzte Meta-Prüfung der Einrichtung: Datensatz nicht freigegeben bzw. keiner vorhanden → konkret sagen, was zu tun ist
  const dc = o.datasetCheck;
  const dsTodo = dc && (dc.state === "found_not_shared" || dc.state === "none") && !(o.datasetSource === "admin" && dc.id && dc.id !== o.datasetId) ? dc : null;
  const status = o.isTest
    ? { tone: "neutral" as const, label: "Testkonto", text: "Für Testkonten senden wir nichts an Meta." }
    : !o.enabled
      ? { tone: "neutral" as const, label: "Aus", text: "Die Rückmeldung ist ausgeschaltet. Meta erfährt nichts über Ihre Ergebnisse." }
      : dsTodo
        ? {
            tone: "warning" as const,
            label: dsTodo.state === "none" ? "Datensatz fehlt" : "Freigabe fehlt",
            text:
              dsTodo.state === "none"
                ? "In Ihrem Werbekonto gibt es noch keinen Datensatz (Pixel). Bitte einen anlegen und für uns freigeben, die Anleitung steht unter Einrichtung → Meta freigeben."
                : `Ihr Datensatz${dsTodo.name ? ` „${dsTodo.name}“` : ""} ist noch nicht für uns freigegeben. Bitte im Business Manager unter Partner unserem Business den Datensatz mit voller Kontrolle („Verwalten“) freigeben, die Anleitung steht unter Einrichtung → Meta freigeben.`,
          }
        : !o.datasetId
        ? {
            tone: "warning" as const,
            label: "Wird eingerichtet",
            text: o.datasetError ? explainCapiError(o.datasetError) : "Wir verbinden gerade Ihr Werbekonto mit der Rückmeldung. Sie müssen nichts tun.",
          }
        : { tone: "success" as const, label: "Aktiv", text: "Neue Ergebnisse gehen automatisch etwa alle 15 Minuten an Meta." };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader back="/buyer/einstellungen" title="Rückmeldung an Meta" subtitle="Meta lernt aus Ihren Ergebnissen, welche Leads abschließen." />
      <div className="space-y-5" data-capi-page>
        <Card>
          <CapiToggle on={o.enabled} canEdit={canEdit} />
          {!canEdit ? (
            <p className="px-5 pb-4 text-xs text-[color:var(--muted)]">{ctx.preview ? "Vorschau: nur lesen." : "Nur der Inhaber kann das ändern."}</p>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Was an Meta geht" />
          <div className="space-y-3 px-5 py-4 text-sm">
            <p>Nur für Leads aus Ihren Meta-Formularen, je Lead und Stufe einmal:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>die Lead-ID, die Meta selbst vergeben hat</li>
              <li>die Stufe: Lead, Erreicht, Termin vereinbart oder Abschluss</li>
              <li>der Zeitpunkt</li>
              <li>beim Abschluss der Jahresbeitrag (falls eingetragen)</li>
            </ul>
            <p className="text-[color:var(--muted)]">
              Nicht gesendet werden Name, Telefonnummer, E-Mail, Gesprächsinhalte und welches Produkt abgeschlossen wurde. Leads aus Empfehlungen, Ihrem
              Bestand oder anderen Quellen bleiben außen vor. Meta nimmt nur Ergebnisse der letzten 7 Tage an.
            </p>
            <p>
              Je vollständiger Sie Abschlüsse mit Beitrag eintragen, desto besser lernt Meta, welche Leads abschließen, und desto bessere Leads bekommen Sie.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Status" actions={<Badge tone={status.tone}>{status.label}</Badge>} />
          <div className="space-y-4 px-5 py-4 text-sm">
            <p>{status.text}</p>
            <p className="text-[color:var(--muted)]" data-capi-counts>
              Letzte 7 Tage: {o.counts7d.sent} gesendet{o.counts7d.queued ? `, ${o.counts7d.queued} warten` : ""}
              {o.counts7d.failed ? `, ${o.counts7d.failed} mit Fehler` : ""}
            </p>
            {o.lastSent.length ? (
              <div>
                <h3 className="mb-1 font-medium">Zuletzt gesendet</h3>
                <ul className="divide-y divide-[color:var(--border)]">
                  {o.lastSent.map((e, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                      <span>
                        {STAGE_EVENT_NAME[e.stage]}
                        {e.value ? <span className="text-[color:var(--muted)]"> · {eur(e.value)} Jahresbeitrag</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-[color:var(--muted)]">{fmt(e.eventTime)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {o.lastErrors.length ? (
              <div>
                <h3 className="mb-1 font-medium">Letzte Probleme</h3>
                <ul className="space-y-1">
                  {o.lastErrors.map((e, i) => (
                    <li key={i} className="text-[color:var(--muted)]">
                      {fmt(e.at)} · {STAGE_EVENT_NAME[e.stage]}: {explainCapiError(e.error)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>

        <WindowCard title="Letzte 30 Tage" w={o.windows.d30} />
        <WindowCard title="Letzte 90 Tage" w={o.windows.d90} />

        <p className="px-1 text-sm text-[color:var(--muted)]">
          Beiträge tragen Sie beim Abschluss im Kontakt ein, Ihre Sätze stehen unter{" "}
          <Link href="/buyer/provisionen" className="font-medium text-[color:var(--brand)] underline">
            Meine Provisionen
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function WindowCard({ title, w }: { title: string; w: CapiWindow }) {
  const { stats, rec } = w;
  const checks = [rec.checks.volume, rec.checks.coverage, rec.checks.stage];
  return (
    <Card>
      <CardHeader title={title} hint={`${stats.leads} Leads aus Meta-Formularen`} />
      <div className="space-y-4 px-5 py-4 text-sm">
        {stats.leads === 0 ? (
          <p className="text-[color:var(--muted)]">In diesem Zeitraum gab es keine Leads aus Meta-Formularen.</p>
        ) : (
          <>
            <ul className="divide-y divide-[color:var(--border)]">
              <li className="flex justify-between py-1.5">
                <span>Leads</span>
                <span className="tabular-nums">
                  {stats.leads} <span className="text-[color:var(--muted)]">({stats.leadsPerMonth.toLocaleString("de-DE")} im Monat)</span>
                </span>
              </li>
              {GOAL_STAGES.map((s) => (
                <li key={s} className="flex justify-between py-1.5">
                  <span>{STAGE_EVENT_NAME[s]}</span>
                  <span className="tabular-nums">
                    {stats.stages[s].count} <span className="text-[color:var(--muted)]">({pct(stats.stages[s].rate)} innerhalb von 28 Tagen)</span>
                  </span>
                </li>
              ))}
            </ul>
            <div data-capi-recommendation>
              <h3 className="mb-1 font-medium">
                {rec.ready && rec.stage
                  ? `Empfehlung: Optimierung auf „${STAGE_EVENT_NAME[rec.stage]}“`
                  : rec.stage
                    ? `Passende Stufe: „${STAGE_EVENT_NAME[rec.stage]}“, noch nicht alle Punkte erfüllt`
                    : "Noch keine Empfehlung"}
              </h3>
              <ul className="space-y-1">
                {checks.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" />}
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
              {rec.notes.map((n, i) => (
                <p key={i} className="mt-2 text-[color:var(--muted)]">
                  {n}
                </p>
              ))}
              <p className="mt-2 text-[color:var(--muted)]">
                Sind alle Punkte erfüllt, kann Ihre Kampagne auf diese Stufe optimieren („Conversion Leads“): Meta sucht dann gezielt nach Menschen, die diese
                Stufe erreichen. Das stimmen wir vorher mit Ihnen ab.
              </p>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
