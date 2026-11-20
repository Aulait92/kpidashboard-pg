import { connection } from "next/server";
import { ExternalLink, Plus } from "lucide-react";
import { deleteIncidentAction, resolveIncidentAction } from "@/app/admin/einstellungen/status/actions";
import { IncidentForm } from "@/app/admin/einstellungen/status/form";
import { EinstellungSeite, LISTE, Zeile } from "@/components/admin-neu/einstellungen/rahmen";
import { Badge, Button, ButtonLink, Card, CardHeader } from "@/components/ui";
import { NEU } from "@/lib/admin-neu/navigation";
import { prisma } from "@/lib/prisma";
import { LEVEL_LABEL, STATUS_COMPONENTS } from "@/lib/status";
import { currentStatus } from "@/lib/status-server";
import { supportConfig } from "@/lib/support";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Status & Support | performancegrowth Admin" };

// Statusseite & Support (Demo „e-status“, heute /admin/einstellungen/status), Unterseite des Systemzustands (dessen Zeilen
// „Statusseite für Kunden“ und „Hintergrund-Jobs“ führen hierher): Zustand jetzt und Support-Kontakt oben,
// Meldungen mit „Behoben“ und „Löschen“, neue Meldung eingeklappt (selten). Daten und Server Actions wie heute.

const TON = { ok: "success", degraded: "warning", down: "danger" } as const;
const LEVEL_TEXT: Record<string, string> = { info: "Hinweis", degraded: "Eingeschränkt", down: "Störung" };
const fmt = (d: Date) => d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

export default async function Page() {
  await connection();
  await requireAuth();
  const now = new Date();
  const [status, incidents, beats] = await Promise.all([
    currentStatus(now),
    prisma.statusIncident.findMany({ orderBy: { startsAt: "desc" }, take: 20 }),
    prisma.systemHeartbeat.findMany(),
  ]);
  const support = supportConfig();
  const bereich = (k: string | null) => STATUS_COMPONENTS.find((c) => c.key === k)?.label ?? "Allgemein";

  return (
    <EinstellungSeite
      pfad="/admin/neu/einstellungen/status"
      zurueck={{ href: `${NEU}/werkzeuge/zustand`, label: "Systemzustand" }}
      aktionen={
        <ButtonLink href="/status" external icon={ExternalLink}>
          Statusseite
        </ButtonLink>
      }
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2" data-funktion="page--zustand-jetzt-und-support-kontakt-anzeige">
        <Card>
          <CardHeader title="Zustand jetzt" />
          <ul className={LISTE}>
            {STATUS_COMPONENTS.map((c) => (
              <Zeile key={c.key} titel={c.label} rechts={<Badge tone={TON[status[c.key]]}>{LEVEL_LABEL[status[c.key]]}</Badge>} className="min-h-11 py-2" />
            ))}
          </ul>
          {beats.length ? (
            <details className="border-t border-[color:var(--border)] px-5 py-2 text-sm text-[color:var(--muted)]">
              <summary className="inline-flex min-h-8 cursor-pointer items-center">Hintergrund-Jobs</summary>
              <p className="pb-1">{beats.map((b) => `${b.key} ${fmt(b.at)}${b.ok ? "" : ` (${b.note ?? "Fehler"})`}`).join(" · ")}</p>
            </details>
          ) : null}
        </Card>
        <Card>
          <CardHeader title="Support-Kontakt im Hilfe-Chat" />
          <ul className={LISTE}>
            <Zeile titel="WhatsApp" rechts={support.whatsapp ? <span className="text-sm">+{support.whatsapp}</span> : <Badge tone="warning">fehlt</Badge>} className="min-h-11 py-2" />
            <Zeile titel="E-Mail" rechts={support.email ? <span className="text-sm">{support.email}</span> : <Badge tone="warning">fehlt</Badge>} className="min-h-11 py-2" />
            <Zeile titel="Antwortzeit" text={support.responseTime} className="min-h-11 py-2" />
          </ul>
          {!support.whatsapp && !support.email ? (
            <p className="border-t border-[color:var(--border)] px-5 py-3 text-sm text-amber-800">Ohne Kontaktweg zeigt der Hilfe-Chat nur „An unser Team weitergeben“ (SUPPORT_WHATSAPP_NUMBER, SUPPORT_EMAIL).</p>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader title="Meldungen" count={incidents.length} />
        <ul className={LISTE} data-funktion="actions-resolveincidentaction--meldung-als-behoben-markieren actions-deleteincidentaction--meldung-loeschen">
          {incidents.map((i) => {
            const aktiv = !i.resolvedAt || i.resolvedAt > now;
            return (
              <Zeile
                key={i.id}
                titel={i.title}
                text={`${LEVEL_TEXT[i.level] ?? i.level} · ${bereich(i.component)} · ${fmt(i.startsAt)}${i.resolvedAt ? ` bis ${fmt(i.resolvedAt)}` : " · läuft"}`}
                rechts={
                  <>
                    {aktiv ? (
                      <form action={resolveIncidentAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <Button>Behoben</Button>
                      </form>
                    ) : null}
                    <form action={deleteIncidentAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <Button variant="ghost">Löschen</Button>
                    </form>
                  </>
                }
              />
            );
          })}
          {incidents.length === 0 ? <li className="px-5 py-4 text-sm text-[color:var(--muted)]">Keine Meldungen. Die Statusseite zeigt „Betriebsbereit“.</li> : null}
        </ul>
        <details className="border-t border-[color:var(--border)]" data-funktion="actions-createincidentaction--statusmeldung-veroeffentlichen-text-stufe">
          <summary className="flex min-h-12 cursor-pointer items-center gap-1.5 px-5 text-sm font-semibold text-[color:var(--brand)]">
            <Plus className="h-4 w-4" /> Meldung veröffentlichen
          </summary>
          <div className="px-5 pb-5">
            <IncidentForm />
          </div>
        </details>
      </Card>
    </EinstellungSeite>
  );
}
