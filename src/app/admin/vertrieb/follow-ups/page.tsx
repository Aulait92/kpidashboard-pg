import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/prisma";
import { approveFollowupAction, planExistingAction, saveFollowupSettingsAction } from "@/app/admin/vertrieb/followup-actions";
import { followupLine, type FollowupRow } from "@/components/vertrieb/followup-card";
import { StageBadge } from "@/components/vertrieb/ui";
import { shortName } from "@/lib/vertrieb/crm";
import { fmtDate, fmtDateTime, timeKey } from "@/lib/vertrieb/dates";
import { loadFollowupSettings, STATUS_LABEL, type FollowupStatus } from "@/lib/vertrieb/followup";

export const metadata = { title: "Später-Follow-ups | performancegrowth Admin" };

const SOURCE_LABEL: Record<string, string> = { ANTWORT: "Später-Antwort", AUSGANG: "Ausgang „Später wieder“", BESTAND: "Bestand" };

// Übersicht der geplanten Später-Follow-ups (Ole, 14.11.2026): Freigabe des Bestands, Einstellungen.
export default async function FollowupsPage() {
  const [settings, active, done] = await Promise.all([
    loadFollowupSettings(),
    prisma.salesFollowup.findMany({
      where: { activeFor: { not: null } },
      include: { contact: { select: { id: true, name: true, stage: true } } },
      orderBy: { nextAt: "asc" },
    }),
    prisma.salesFollowup.findMany({
      where: { activeFor: null },
      include: { contact: { select: { id: true, name: true, stage: true } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);
  const mails = await prisma.salesEmail.findMany({
    where: { id: { in: active.map((f) => f.replyEmailId).filter((x): x is string => !!x) } },
    select: { id: true, eaccount: true },
  });
  const box = new Map(mails.map((m) => [m.id, m.eaccount]));
  const waiting = active.filter((f) => f.status === "FREIGABE");
  const planned = active.filter((f) => f.status === "GEPLANT" && f.step === 0);
  const running = active.filter((f) => f.status === "GEPLANT" && f.step > 0);
  const autoSync = process.env.INSTANTLY_AUTO_SYNC === "1" && !!process.env.INSTANTLY_API_KEY;

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Später-Follow-ups</h1>
        <p className="text-sm text-slate-500">
          Kontakte, die „gerne später“ geschrieben haben: Zum Zeitpunkt geht Mail 1 als Antwort im selben Instantly-Thread raus (gleiches Postfach), nach 5 Werktagen ohne Antwort Mail 2,
          danach die Aufgabe „Wieder melden“. Versand werktags 8 bis 17 Uhr. Jede Antwort, Abmeldung oder die Stufen Termin, Gewonnen, Verloren, Ungültig stoppen sofort.
        </p>
      </div>

      {waiting.length ? (
        <Group
          title="Wartet auf Freigabe"
          hint="Bestehende Kontakte mit Stufe „Später“ bzw. Später-Antwort. Hier geht nichts raus, bevor du freigibst. Vergangene Zeitpunkte werden beim Freigeben über die nächsten Werktage verteilt."
          tone="amber"
          items={waiting}
          box={box}
          action={
            <form action={approveFollowupAction}>
              <button className="btn-primary">Alle {waiting.length} freigeben</button>
            </form>
          }
          rowAction={(f) => (
            <form action={approveFollowupAction}>
              <input type="hidden" name="id" value={f.id} />
              <button className="btn-ghost px-2 py-0.5 text-xs">Freigeben</button>
            </form>
          )}
        />
      ) : null}

      <Group title="Geplant" hint={settings.enabled ? undefined : "Automatik ist aus: es wird nichts gesendet (Einstellungen unten)."} items={planned} box={box} />
      <Group title="Laufend (Mail 1 gesendet)" items={running} box={box} />

      {done.length ? (
        <section className="card">
          <h2 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">Zuletzt beendet oder gestoppt</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {done.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <Link href={`/admin/vertrieb/kontakte/${f.contact.id}#follow-up`} className="font-medium hover:underline">{shortName(f.contact.name)}</Link>
                <span className="badge bg-slate-100 text-slate-600">{STATUS_LABEL[f.status as FollowupStatus] ?? f.status}</span>
                <span className="text-xs text-slate-500">
                  {f.stopReason}
                  {f.mail1SentAt ? ` · Mail 1 ${fmtDate(f.mail1SentAt)}` : ""}
                  {f.mail2SentAt ? ` · Mail 2 ${fmtDate(f.mail2SentAt)}` : ""}
                </span>
                <span className="ml-auto text-xs text-slate-400">{f.stoppedAt ? fmtDateTime(f.stoppedAt) : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card space-y-3 p-5" id="einstellungen">
        <h2 className="font-medium">Einstellungen</h2>
        {!autoSync ? (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Automatischer Versand ist in dieser Umgebung nicht eingerichtet. Follow-ups gehen hier nur über „Jetzt senden“ im Kontakt raus.
            <span className="mt-1 block text-xs text-amber-700">Technisch: INSTANTLY_AUTO_SYNC=1 und INSTANTLY_API_KEY nötig.</span>
          </p>
        ) : null}
        <form action={saveFollowupSettingsAction} className="grid gap-3 sm:grid-cols-2" key={settings.updatedAt.getTime()}>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Follow-ups automatisch senden
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="useAi" defaultChecked={settings.useAi} /> Texte per KI aus Originalmail und Antwort schreiben (sonst feste Vorlage)
          </label>
          <label className="block text-sm">
            <span className="label">Höchstens je Tag und Postfach</span>
            <input name="perDay" type="number" min={1} max={100} defaultValue={settings.perDay} className="input" />
          </label>
          <label className="block text-sm">
            <span className="label">Buchungslink (leer = ohne)</span>
            <input name="bookingUrl" type="url" defaultValue={settings.bookingUrl ?? ""} placeholder="https://calendly.com/…" className="input" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="label">Signatur unter jeder Follow-up-Mail (Name, Funktion, Firma, Telefon, Website). Leer = „Viele Grüße“ und der Name des Postfachs</span>
            <textarea name="signature" rows={5} defaultValue={settings.signature ?? ""} placeholder={"Viele Grüße\nOle Kannapinn\nGeschäftsführer, performancegrowth\nTel. …\nperformancegrowth.de"} className="input" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="label">Unser Angebot in ein bis zwei Sätzen (für KI und Vorlage, ohne Gedankenstriche)</span>
            <textarea name="pitch" rows={3} defaultValue={settings.pitch} className="input" />
          </label>
          <div className="sm:col-span-2">
            <button className="btn-primary">Speichern</button>
          </div>
        </form>
        <form action={planExistingAction} className="border-t border-slate-100 pt-3 text-sm text-slate-600">
          {settings.backfillAt ? `Bestand zuletzt eingeplant am ${fmtDateTime(settings.backfillAt)}. ` : "Bestand wird beim nächsten Cron-Lauf eingeplant. "}
          <button className="btn-ghost ml-1 px-2 py-0.5 text-xs">Bestand jetzt prüfen</button>
          <span className="ml-1 text-xs text-slate-400">(neue Kontakte mit Stufe „Später“ ohne Follow-up, wartet auf Freigabe)</span>
        </form>
      </section>
    </div>
  );
}

type Item = FollowupRow & { contact: { id: string; name: string; stage: Parameters<typeof StageBadge>[0]["stage"] }; replyEmailId: string | null };

function Group({
  title,
  hint,
  tone,
  items,
  box,
  action,
  rowAction,
}: {
  title: string;
  hint?: string;
  tone?: "amber";
  items: Item[];
  box: Map<string, string | null>;
  action?: React.ReactNode;
  rowAction?: (f: Item) => React.ReactNode;
}) {
  return (
    <section className="card">
      <div className={clsx("flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5", tone === "amber" && "bg-amber-50")}>
        <h2 className="text-sm font-semibold">
          {title} <span className="font-normal text-slate-400">({items.length})</span>
        </h2>
        {hint ? <p className="min-w-0 flex-1 text-xs text-slate-500">{hint}</p> : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {items.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {items.map((f) => (
            <li key={f.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/vertrieb/kontakte/${f.contact.id}#follow-up`} className="font-medium hover:underline">{shortName(f.contact.name)}</Link>
                <StageBadge stage={f.contact.stage} />
                <span className="text-slate-700">{f.step === 0 ? `${fmtDate(f.nextAt)}, ${timeKey(f.nextAt)} Uhr` : followupLine(f)}</span>
                {f.timing ? <span className="text-xs text-slate-500">„{f.timing}“</span> : null}
                <span className="text-xs text-slate-400">{SOURCE_LABEL[f.source] ?? f.source}</span>
                {f.replyEmailId && box.get(f.replyEmailId) ? <span className="text-xs text-slate-400">· {box.get(f.replyEmailId)}</span> : null}
                {f.lastError ? <span className="badge bg-rose-50 text-rose-700" title={f.lastError}>Fehler</span> : null}
                {rowAction ? <span className="ml-auto">{rowAction(f)}</span> : null}
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-slate-400">Vorschau</summary>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <p className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-600">{f.body1 ?? "Text wird beim nächsten Lauf erstellt."}</p>
                  <p className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-600">{f.body2 ?? "Text wird beim nächsten Lauf erstellt."}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500">Beide Mails gehen mit der Signatur des Postfachs raus, als Antwort im selben Verlauf.</p>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-slate-500">Keine.</p>
      )}
    </section>
  );
}
