import type { Metadata } from "next";
import { CheckCircle2, FileText } from "lucide-react";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { AdvisorHeader } from "@/components/empfehlung/advisor-header";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import { bdPdfInhalt, bdSeitenText, bdTag, bdUhr } from "@/lib/beratungsdoku";
import { bdSeite } from "@/lib/beratungsdoku-server";
import { bestaetigenAction } from "./actions";

// Beratungsdokumentation für den Kunden des Vermittlers (Paket B, Ole 18.11.2026): Link aus der E-Mail, ohne Login,
// nicht indexiert. Aufruf zeigt nur an; „Erhalt bestätigen“ speichert per POST (Server-Aktion) mit Zeitstempel, ein
// zweiter Klick ändert nichts. Eine Hauptaktion, Handy zuerst. Texte in der Ansprache des Vermittlers.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Beratungsdokumentation", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function DokumentationSeite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ f?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const s = await bdSeite(token).catch(() => ({ zustand: "ungueltig" as const }));
  if (s.zustand === "ungueltig") {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Link nicht gültig</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Dieser Link ist nicht (mehr) gültig. Antworten Sie einfach auf die E-Mail.</p>
      </Shell>
    );
  }
  const T = bdSeitenText(s.an);
  if (s.zustand === "abgelaufen" || s.zustand === "ersetzt") {
    return (
      <Shell advisor={s.berater} customerId={s.customerId}>
        <h1 className="text-xl font-bold">{T.titel}</h1>
        <p className="mt-2 text-[15px] text-[color:var(--muted)]" data-bd-seite={s.zustand}>
          {s.zustand === "ersetzt" ? T.ersetzt : T.abgelaufen}
        </p>
      </Shell>
    );
  }
  const p = bdPdfInhalt({ ...s.kopf, an: s.an, inhalt: s.inhalt, now: s.gesendetAt });
  const aktion = bestaetigenAction.bind(null, token);
  return (
    <Shell advisor={s.berater} customerId={s.customerId}>
      <h1 className="text-2xl font-bold tracking-tight">{T.titel}</h1>
      <p className="mt-1 text-sm text-[color:var(--muted)]">{p.kopf.slice(1).join(" · ")}</p>
      {s.zustand === "bestaetigt" && s.bestaetigtAt ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200" data-bd-seite="bestaetigt">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {T.danke}: {bdTag(s.bestaetigtAt)} um {bdUhr(s.bestaetigtAt)} Uhr.
        </p>
      ) : null}
      {sp.f === "busy" ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
          {T.busy}
        </p>
      ) : null}
      <div className="mt-5 space-y-4 text-[15px]">
        {p.bloecke.map((b) => (
          <section key={b.ueberschrift}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]">{b.ueberschrift}</h2>
            <p className="mt-1 whitespace-pre-line">{b.text}</p>
          </section>
        ))}
      </div>
      <p className="mt-5 whitespace-pre-line text-xs text-[color:var(--muted)]">{p.fuss}</p>
      {s.zustand === "offen" ? (
        <form action={aktion} className="mt-6 border-t border-[color:var(--border)] pt-5" data-bd-seite="offen">
          <p className="mb-3 text-sm text-[color:var(--muted)]">{T.bitte}</p>
          <SubmitButton pendingLabel="Einen Moment …" className={buttonClass("primary", "md", "h-12 w-full text-[15px]")}>
            {T.knopf}
          </SubmitButton>
        </form>
      ) : null}
      <div className="mt-4 flex flex-col gap-1 text-sm">
        <a href={`/dokumentation/${encodeURIComponent(token)}/pdf`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1.5 font-medium text-[color:var(--brand)]">
          <FileText className="h-4 w-4" /> {T.pdf}
        </a>
        <p className="text-[color:var(--muted)]">{T.fehler}</p>
      </div>
    </Shell>
  );
}

function Shell({ children, advisor, customerId }: { children: React.ReactNode; advisor?: string; customerId?: string | null }) {
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
        {advisor ? <AdvisorHeader name={advisor} /> : null}
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">{children}</div>
      </main>
      <LeadLegalFooter customerId={customerId} />
    </>
  );
}
