import { publicSalesBookingUrl } from "@/lib/vertrieb/buchung";
import Link from "next/link";
import { approveFollowupAction, planExistingAction, saveFollowupSettingsAction } from "@/app/admin/vertrieb/followup-actions";
import { EinstellungSeite, LISTE, ziel } from "@/components/admin-neu/einstellungen/rahmen";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { followupLine, type FollowupRow } from "@/components/vertrieb/followup-card";
import { StageBadge } from "@/components/vertrieb/ui";
import { prisma } from "@/lib/prisma";
import { shortName } from "@/lib/vertrieb/crm";
import { fmtDate, fmtDateTime, timeKey } from "@/lib/vertrieb/dates";
import { loadFollowupSettings, STATUS_LABEL, type FollowupStatus } from "@/lib/vertrieb/followup";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Später-Follow-ups | performancegrowth Admin" };

// Später-Follow-ups (Demo „e-followups“, heute /admin/vertrieb/follow-ups): Freigabe oben (einzige Hauptaktion),
// darunter die Listen, Einstellungen eingeklappt. Daten, Server Actions und Zeilentexte wie auf der heutigen Seite.

const SOURCE_LABEL: Record<string, string> = { ANTWORT: "Später-Antwort", AUSGANG: "Ausgang „Später wieder“", BESTAND: "Bestand" };

type Item = FollowupRow & { id: string; contact: { id: string; name: string; stage: Parameters<typeof StageBadge>[0]["stage"] }; replyEmailId: string | null };

export default async function Page() {
  await requireAuth();
  const [settings, active, done] = await Promise.all([
    loadFollowupSettings(),
    prisma.salesFollowup.findMany({ where: { activeFor: { not: null } }, include: { contact: { select: { id: true, name: true, stage: true } } }, orderBy: { nextAt: "asc" } }),
    prisma.salesFollowup.findMany({ where: { activeFor: null }, include: { contact: { select: { id: true, name: true, stage: true } } }, orderBy: { updatedAt: "desc" }, take: 30 }),
  ]);
  const mails = await prisma.salesEmail.findMany({ where: { id: { in: active.map((f) => f.replyEmailId).filter((x): x is string => !!x) } }, select: { id: true, eaccount: true } });
  const box = new Map(mails.map((m) => [m.id, m.eaccount]));
  const waiting = active.filter((f) => f.status === "FREIGABE");
  const planned = active.filter((f) => f.status === "GEPLANT" && f.step === 0);
  const running = active.filter((f) => f.status === "GEPLANT" && f.step > 0);
  const autoSync = process.env.INSTANTLY_AUTO_SYNC === "1" && !!process.env.INSTANTLY_API_KEY;
  const kontakt = (id: string) => ziel(`/admin/vertrieb/kontakte/${id}`) + "#follow-up";

  const zeile = (f: Item, aktion?: React.ReactNode) => (
    <li key={f.id} className="px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={kontakt(f.contact.id)} className="font-medium hover:underline">
          {shortName(f.contact.name)}
        </Link>
        <StageBadge stage={f.contact.stage} />
        <span>{f.step === 0 ? `${fmtDate(f.nextAt)}, ${timeKey(f.nextAt)} Uhr` : followupLine(f)}</span>
        {f.timing ? <span className="text-xs text-[color:var(--muted)]">„{f.timing}“</span> : null}
        <span className="text-xs text-[color:var(--muted)]">
          {SOURCE_LABEL[f.source] ?? f.source}
          {f.replyEmailId && box.get(f.replyEmailId) ? ` · ${box.get(f.replyEmailId)}` : ""}
        </span>
        {f.lastError ? (
          <span title={f.lastError}>
            <Badge tone="danger">Fehler</Badge>
          </span>
        ) : null}
        {aktion ? <span className="ml-auto">{aktion}</span> : null}
      </div>
      <details className="mt-1">
        <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs text-[color:var(--muted)]">Vorschau</summary>
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <p className="whitespace-pre-wrap rounded bg-[color:var(--surface-sunken)] p-2 text-xs">{f.body1 ?? "Text wird beim nächsten Lauf erstellt."}</p>
          <p className="whitespace-pre-wrap rounded bg-[color:var(--surface-sunken)] p-2 text-xs">{f.body2 ?? "Text wird beim nächsten Lauf erstellt."}</p>
        </div>
      </details>
    </li>
  );

  const gruppe = (titel: string, items: Item[], leer: string, hinweis?: string) => (
    <Card>
      <CardHeader title={titel} count={items.length} hint={hinweis} />
      {items.length ? <ul className={LISTE}>{items.map((f) => zeile(f))}</ul> : <p className="px-5 py-4 text-sm text-[color:var(--muted)]">{leer}</p>}
    </Card>
  );

  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/follow-ups">
      {waiting.length ? (
        <div data-funktion="followup-actions-approvefollowupaction--liste-wartet-auf-freigabe-einzeln-oder-alle">
          <Card tone="attention">
            <CardHeader
              title="Wartet auf Freigabe"
              count={waiting.length}
              actions={
                <form action={approveFollowupAction}>
                  <Button variant="primary">Alle freigeben</Button>
                </form>
              }
            />
            <p className="px-5 pt-3 text-sm text-[color:var(--muted)]">Vor der Freigabe geht nichts raus. Vergangene Zeitpunkte werden auf die nächsten Werktage verteilt.</p>
            <ul className={LISTE}>
              {waiting.map((f) =>
                zeile(
                  f,
                  <form action={approveFollowupAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <Button>Freigeben</Button>
                  </form>,
                ),
              )}
            </ul>
          </Card>
        </div>
      ) : null}

      <div className="space-y-5" data-funktion="page-group--listen-geplant-laufend-zuletzt-beendet-mit">
        {gruppe("Geplant", planned, "Gerade nichts. Neue „Später“-Antworten aus Instantly landen automatisch hier.", settings.enabled ? undefined : "Automatik aus: es wird nichts gesendet")}
        {gruppe("Laufend", running, "Gerade keine Follow-ups nach Mail 1.")}
        {done.length ? (
          <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]">
            <summary className="flex min-h-12 cursor-pointer items-center px-5 text-[15px] font-semibold">
              Zuletzt beendet oder gestoppt <span className="ml-1.5 font-normal text-[color:var(--muted)]">{done.length}</span>
            </summary>
            <ul className={`${LISTE} border-t border-[color:var(--border)]`}>
              {done.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                  <Link href={kontakt(f.contact.id)} className="font-medium hover:underline">
                    {shortName(f.contact.name)}
                  </Link>
                  <Badge>{STATUS_LABEL[f.status as FollowupStatus] ?? f.status}</Badge>
                  <span className="text-xs text-[color:var(--muted)]">
                    {f.stopReason}
                    {f.mail1SentAt ? ` · Mail 1 ${fmtDate(f.mail1SentAt)}` : ""}
                    {f.mail2SentAt ? ` · Mail 2 ${fmtDate(f.mail2SentAt)}` : ""}
                  </span>
                  <span className="ml-auto text-xs text-[color:var(--muted)]">{f.stoppedAt ? fmtDateTime(f.stoppedAt) : ""}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <details id="einstellungen" className="scroll-mt-20 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]">
        <summary className="flex min-h-12 cursor-pointer items-center px-5 text-[15px] font-semibold">Einstellungen</summary>
        <div className="space-y-4 border-t border-[color:var(--border)] p-5">
          {!autoSync ? (
            <p className="rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Automatischer Versand ist hier nicht eingerichtet (INSTANTLY_AUTO_SYNC, INSTANTLY_API_KEY). Follow-ups gehen nur über „Jetzt senden“ im Kontakt raus.
            </p>
          ) : null}
          <form
            action={saveFollowupSettingsAction}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            key={settings.updatedAt.getTime()}
            data-funktion="followup-actions-savefollowupsettingsaction--einstellungen-automatik-an-hoechstzahl-je-tag"
          >
            <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="h-4 w-4" /> Follow-ups automatisch senden
            </label>
            <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="useAi" defaultChecked={settings.useAi} className="h-4 w-4" /> Texte per KI aus Originalmail und Antwort schreiben
            </label>
            <label className="block text-sm">
              <span className="label">Höchstens je Tag und Postfach</span>
              <input name="perDay" type="number" min={1} max={100} defaultValue={settings.perDay} className="input h-10" />
            </label>
            <label className="block text-sm">
              <span className="label">Buchungslink (leer = ohne)</span>
              <input name="bookingUrl" type="url" defaultValue={settings.bookingUrl ?? ""} placeholder={publicSalesBookingUrl()} className="input h-10" />
              <span className="mt-1 block text-xs text-[color:var(--muted)]">Mit {publicSalesBookingUrl()} bekommt jeder Kontakt seinen persönlichen Link.</span>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="label">Signatur (leer = „Viele Grüße“ und der Name des Postfachs)</span>
              <textarea name="signature" rows={4} defaultValue={settings.signature ?? ""} className="input" />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="label">Unser Angebot in ein bis zwei Sätzen (ohne Gedankenstriche)</span>
              <textarea name="pitch" rows={3} defaultValue={settings.pitch} className="input" />
            </label>
            <div className="sm:col-span-2">
              <Button size="md">Speichern</Button>
            </div>
          </form>
          <form action={planExistingAction} className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border)] pt-4 text-sm text-[color:var(--muted)]" data-funktion="followup-actions-planexistingaction--bestand-jetzt-pruefen-bestehende-spaeter">
            <span className="min-w-0 flex-1">{settings.backfillAt ? `Bestand zuletzt eingeplant am ${fmtDateTime(settings.backfillAt)}.` : "Bestand wird beim nächsten Lauf eingeplant."}</span>
            <Button>Bestand jetzt prüfen</Button>
          </form>
        </div>
      </details>
    </EinstellungSeite>
  );
}
