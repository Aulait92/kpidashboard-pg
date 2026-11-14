import { connection } from "next/server";
import { CheckCircle2, ChevronRight, Circle, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { analyticsScopeEnabled, linkedInAvailable } from "@/lib/linkedin/api";
import { getSettings, hasAnalyticsScope, liftLabel, liftOf, scoreOf } from "@/lib/linkedin/posts";
import { DisconnectButton, DraftCard, GenerateButton, ImportForm, PhotoItem, PhotoUpload, ResultEdit, SettingsForm, UnapproveButton } from "./forms";

export const metadata = { title: "LinkedIn | Vertrieb" };

const DAY = 86_400_000;
const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d) : "–";
const fmtDay = (d: Date | null) => (d ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d) : "–");
const num = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("de-DE"));
const pct = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 100)} %`);

const BANNER: Record<string, { tone: string; text: string }> = {
  connected: { tone: "bg-emerald-50 text-emerald-900 border-emerald-200", text: "LinkedIn ist verbunden." },
  cancelled: { tone: "bg-amber-50 text-amber-900 border-amber-200", text: "Anmeldung bei LinkedIn abgebrochen." },
  denied: { tone: "bg-rose-50 text-rose-900 border-rose-200", text: "LinkedIn hat die Anmeldung abgelehnt. Sind „Share on LinkedIn“ und „Sign In with LinkedIn using OpenID Connect“ in der LinkedIn-App freigeschaltet?" },
  error: { tone: "bg-rose-50 text-rose-900 border-rose-200", text: "Verbinden hat nicht geklappt. Bitte noch einmal versuchen." },
  config: { tone: "bg-amber-50 text-amber-900 border-amber-200", text: "LinkedIn-App fehlt auf dem Server (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET) – siehe docs/linkedin.md." },
};

// LinkedIn (Ole, 14.11.2026): Entwürfe der KI freigeben, Zielgruppen-Reichweite auswerten.
export default async function LinkedInPage({ searchParams }: { searchParams: Promise<{ li?: string }> }) {
  await connection();
  await requireAuth();
  const { li } = await searchParams;
  const now = new Date();
  const [settings, conn, drafts, planned, results, photos] = await Promise.all([
    getSettings(),
    prisma.linkedInConnection.findFirst({ orderBy: { updatedAt: "desc" }, select: { name: true, expiresAt: true, scopes: true, status: true, lastError: true } }),
    prisma.linkedInPost.findMany({
      where: { status: { in: ["entwurf", "fehler"] } },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 30,
      include: { photo: { select: { generated: true } } },
    }),
    prisma.linkedInPost.findMany({ where: { status: { in: ["freigegeben", "sendet"] } }, orderBy: { scheduledAt: "asc" }, take: 30 }),
    prisma.linkedInPost.findMany({
      where: { status: { in: ["veroeffentlicht", "importiert"] }, publishedAt: { gte: new Date(now.getTime() - 120 * DAY) } },
      orderBy: { publishedAt: "desc" },
      take: 150,
    }),
    prisma.linkedInPhoto.findMany({ where: { generated: false }, orderBy: { createdAt: "desc" }, select: { id: true, description: true, _count: { select: { posts: true } } } }),
  ]);
  const connected = !!conn && conn.expiresAt > now && conn.status === "ok";
  const share = settings.accountIcpShare;
  const scored = results.filter((p) => p.impressions != null);
  const best = [...scored].sort((a, b) => scoreOf(b, share)! - scoreOf(a, share)!)[0];
  const last30 = scored.filter((p) => p.publishedAt && p.publishedAt.getTime() > now.getTime() - 30 * DAY);
  const avg30 = last30.length ? Math.round(last30.reduce((s, p) => s + scoreOf(p, share)!, 0) / last30.length) : null;
  const photoOptions = photos.map((f) => ({ id: f.id, description: f.description }));
  const steps = [
    { done: connected, text: "LinkedIn verbinden" },
    { done: !!settings.about.trim(), text: "„Über mich“ ausfüllen (Einstellungen unten)" },
    { done: photos.length > 0, text: "Fotos hochladen (von dir oder Beweis-Screenshots, z. B. WhatsApp eines Kunden; ohne Fotos nimmt die KI KI-Bilder oder Grafiken)" },
    { done: !!settings.lastImportAt || (!!conn && hasAnalyticsScope(conn.scopes)), text: "Statistik hochladen (damit die KI weiß, was in der Zielgruppe ankommt)" },
  ];
  const banner = li ? BANNER[li] : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">LinkedIn</h1>
        <p className="text-sm text-[color:var(--muted)]">Persönliches Profil · Ziel: Reichweite bei Versicherungsvermittlern, nicht Reichweite insgesamt.</p>
      </div>
      {banner ? <p className={`rounded-[var(--radius-md)] border px-4 py-3 text-sm ${banner.tone}`}>{banner.text}</p> : null}
      {conn && !connected ? (
        <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          LinkedIn-Zugang {conn.expiresAt <= now ? "abgelaufen" : "gestört"}{conn.lastError ? `: ${conn.lastError}` : ""}. <a className="font-semibold underline" href="/api/linkedin/connect">Neu verbinden</a>
        </p>
      ) : null}

      {steps.some((s) => !s.done) ? (
        <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5">
          <h2 className="mb-3 font-semibold">Einrichten</h2>
          <ol className="space-y-2 text-sm">
            {steps.map((s) => (
              <li key={s.text} className="flex items-center gap-2">
                {s.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-[color:var(--muted)]" />}
                <span className={s.done ? "text-[color:var(--muted)] line-through" : undefined}>{s.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: "Zu schlagen", v: best ? num(scoreOf(best, share)) : "–", h: "Zielgruppen-Reichweite des besten Posts" },
          { l: "Ø letzte 30 Tage", v: num(avg30), h: `${last30.length} Posts mit Zahlen` },
          { l: "Zielgruppe im Profil", v: pct(share), h: "Anteil Vermittler an allen Zuschauern" },
          { l: "Zur Freigabe", v: String(drafts.length), h: `${planned.length} geplant` },
        ].map((k) => (
          <div key={k.l} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4">
            <div className="text-xs text-[color:var(--muted)]">{k.l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{k.v}</div>
            <div className="mt-0.5 text-xs text-[color:var(--muted)]">{k.h}</div>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Zur Freigabe</h2>
            <p className="text-sm text-[color:var(--muted)]">
              {settings.autoDrafts
                ? `Neue Entwürfe kommen ab ${settings.draftHour}:00 Uhr automatisch, ${settings.planDays > 1 ? `immer ${settings.planDays} Tage im Voraus` : "für den nächsten Tag"} (Push).`
                : "Automatische Entwürfe sind aus."} Freigegebene Posts gehen zur angezeigten Uhrzeit raus.
            </p>
          </div>
          <GenerateButton disabled={!settings.about.trim()} defaultDays={settings.planDays > 1 ? Math.min(14, settings.planDays) : 1} />
        </div>
        {drafts.length ? (
          drafts.map((d) => (
            <DraftCard
              key={d.id}
              id={d.id}
              text={d.text}
              image={d.photoId ?? (d.useGraphic ? "grafik" : "keins")}
              aiPhotoId={d.photo?.generated ? d.photoId : null}
              graphic={d.graphic}
              photos={photoOptions}
              connected={connected}
              slot={fmt(d.scheduledAt)}
              hypothesis={d.hypothesis}
              idea={d.idea}
              error={d.status === "fehler" ? d.lastError : null}
            />
          ))
        ) : (
          <p className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-strong)] px-4 py-6 text-center text-sm text-[color:var(--muted)]">Keine offenen Entwürfe.</p>
        )}
      </section>

      {planned.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Geplant</h2>
          <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white">
            {planned.map((p) => (
              // Per Klick aufklappen: ganzer Text + Bild, das mitgeht (Ole, 14.11.2026)
              <li key={p.id} className="text-sm">
                <details className="group" data-li-planned={p.id}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-[color:var(--surface-sunken)]">
                    <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-90" />
                    <span className="w-32 shrink-0 font-semibold">{fmt(p.scheduledAt)}</span>
                    <span className="min-w-0 flex-1 truncate">{p.text.split("\n")[0]}</span>
                    {p.photoId ? <span className="text-xs text-[color:var(--muted)]">mit Bild</span> : p.useGraphic ? <span className="text-xs text-[color:var(--muted)]">mit Grafik</span> : null}
                  </summary>
                  <div className="flex flex-col gap-4 border-t border-[color:var(--border)] bg-[color:var(--surface-sunken)]/40 px-4 py-4 sm:flex-row">
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-relaxed">{p.text}</p>
                    {p.photoId || (p.useGraphic && p.graphic) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photoId ? `/api/linkedin/foto/${p.photoId}` : `/api/linkedin/grafik/${p.id}`}
                        alt="Bild zum Post"
                        className="h-56 w-56 shrink-0 rounded-[var(--radius-md)] border border-[color:var(--border)] object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="flex items-center justify-end gap-2 px-4 pb-3">
                    {p.status === "freigegeben" ? (
                      <>
                        <span className="text-xs text-[color:var(--muted)]">Zum Ändern zurücknehmen, dann steht er wieder unter „Zur Freigabe“.</span>
                        <UnapproveButton id={p.id} />
                      </>
                    ) : (
                      <span className="text-xs">wird gesendet …</span>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ergebnisse</h2>
        <p className="text-sm text-[color:var(--muted)]">
          Zielgruppen-Reichweite = Impressionen × Anteil Vermittler unter den Zuschauern (je Post aus dem Post-Export, sonst Profil-Schnitt). Vergleich mit dem Median der 30 Posts davor.
        </p>
        {results.length ? (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[color:var(--surface-sunken)] text-left text-xs text-[color:var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Post</th>
                  <th className="px-3 py-2 text-right">Impressionen</th>
                  <th className="px-3 py-2 text-right">Zielgruppe</th>
                  <th className="px-3 py-2 text-right">Zielgruppen-Reichweite</th>
                  <th className="px-3 py-2">Ergebnis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {results.map((p) => (
                  <tr key={p.id} className={best?.id === p.id ? "bg-emerald-50/60" : undefined}>
                    <td className="whitespace-nowrap px-3 py-2 align-top">{fmtDay(p.publishedAt)}</td>
                    <td className="max-w-[320px] px-3 py-2 align-top">
                      <div className="truncate">{p.text ? p.text.split("\n")[0] : <span className="text-[color:var(--muted)]">(älterer Post, Text fehlt)</span>}</div>
                      {p.hypothesis ? <div className="truncate text-xs text-sky-800">Test: {p.hypothesis}</div> : null}
                      <div className="flex flex-wrap items-center gap-3">
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[color:var(--brand)] hover:underline">
                            Öffnen <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                        <ResultEdit id={p.id} imported={p.status === "importiert"} hasText={!!p.text} impressions={p.impressions} icpPercent={p.icpShare != null ? Math.round(p.icpShare * 100) : null} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right align-top tabular-nums">{num(p.impressions)}</td>
                    <td className="px-3 py-2 text-right align-top tabular-nums">{p.icpShare != null ? pct(p.icpShare) : share != null ? <span className="text-[color:var(--muted)]">~{pct(share)}</span> : "–"}</td>
                    <td className="px-3 py-2 text-right align-top font-semibold tabular-nums">{num(scoreOf(p, share))}</td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-xs">{p.impressions != null ? liftLabel(liftOf(p, scored, share)) : "noch keine Zahlen"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[color:var(--muted)]">Noch keine Posts mit Zahlen.</p>
        )}
      </section>

      <section className="space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5">
        <h2 className="text-lg font-semibold">Statistik hochladen</h2>
        <div className="space-y-1 text-sm text-[color:var(--muted)]">
          <p>
            <span className="font-semibold text-[color:var(--foreground)]">Je Post (am besten):</span> Auf LinkedIn den Post öffnen → „Statistik anzeigen“ → „Exportieren“. Enthält Impressionen und die Zuschauer nach Branche und Beruf – daraus berechnet die App den Anteil Vermittler.
          </p>
          <p>
            <span className="font-semibold text-[color:var(--foreground)]">Alle Posts:</span> Profil → „Statistiken“ → „Impressionen“ → „Exportieren“ (z. B. letzte 28 Tage). Liefert Impressionen je Post und den Zielgruppen-Anteil über das ganze Profil.
          </p>
          {conn && hasAnalyticsScope(conn.scopes) ? <p>Impressionen holt die App zusätzlich automatisch über LinkedIn (Statistik-Zugang freigeschaltet).</p> : null}
          {settings.lastImportAt ? <p>Zuletzt hochgeladen: {fmt(settings.lastImportAt)}</p> : null}
        </div>
        <ImportForm />
      </section>

      <section className="space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5">
        <h2 className="text-lg font-semibold">Fotos von dir</h2>
        <p className="text-sm text-[color:var(--muted)]">
          Fotos von dir und Beweis-Screenshots (z. B. WhatsApp eines Kunden mit Ergebnis, Namen geschwärzt). Die KI wählt je Post ein passendes Bild. Passt keins, erzeugt sie ein fotorealistisches KI-Bild oder eine Text-Grafik. Beschreibungen schreibt sie beim Hochladen selbst; bei Bedarf anpassen.
        </p>
        <PhotoUpload />
        {photos.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((f) => (
              <PhotoItem key={f.id} id={f.id} description={f.description} used={f._count.posts} />
            ))}
          </ul>
        ) : null}
      </section>

      <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5" open={!settings.about.trim()}>
        <summary className="cursor-pointer text-lg font-semibold">Einstellungen</summary>
        <div className="mt-4">
          <SettingsForm
            postsPerDay={settings.postsPerDay}
            slots={settings.slots}
            weekdays={settings.weekdays}
            autoDrafts={settings.autoDrafts}
            draftHour={settings.draftHour}
            planDays={settings.planDays}
            about={settings.about}
            icp={settings.icp}
            icpKeywords={settings.icpKeywords}
            trustNotes={settings.trustNotes}
          />
        </div>
      </details>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 text-sm">
        <div>
          <h2 className="text-lg font-semibold">Verbindung</h2>
          {conn ? (
            <p className="text-[color:var(--muted)]">
              {conn.name ?? "Profil"} · gültig bis {fmtDay(conn.expiresAt)} (LinkedIn verlangt alle 60 Tage eine neue Anmeldung; wir erinnern 7 Tage vorher) · Statistik-Zugang:{" "}
              {hasAnalyticsScope(conn.scopes) ? "ja" : analyticsScopeEnabled() ? "angefragt, nicht erteilt" : "nein (Export hochladen)"}
            </p>
          ) : (
            <p className="text-[color:var(--muted)]">{linkedInAvailable() ? "Noch nicht verbunden." : "LinkedIn-App fehlt auf dem Server (siehe docs/linkedin.md)."}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/linkedin/connect" className="inline-flex h-10 items-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 text-sm font-semibold text-white">
            {conn ? "Neu verbinden" : "LinkedIn verbinden"}
          </a>
          {conn ? <DisconnectButton /> : null}
        </div>
      </section>
    </div>
  );
}
