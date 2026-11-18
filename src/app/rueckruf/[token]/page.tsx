import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Phone } from "lucide-react";
import { notFound } from "next/navigation";
import { advisorInitials } from "@/components/empfehlung/advisor-header";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import { rueckrufAuswahl } from "@/lib/angebot-senden-server";
import { fensterAusKey, rueckrufTexte, tagTitel, waehleFenster } from "@/lib/rueckruf";
import { rueckrufAction } from "./actions";

// „Rückruf wünschen“ aus der Nachfass-Mail zum Angebot (P3 minimal, Ausbau P5, Ole 17.11.2026). Wer: der Lead, meist am
// Handy. Aufgabe: mit einem Tipp sagen, wann ein Anruf passt. Gleiche Optik wie die Buchungsseite (/book): Karte, Kopf mit
// Initialen, Auswahl als Kacheln, ein Hauptknopf. Das erste Fenster ist vorausgewählt, die Notiz ist freiwillig.
// Der Wunsch geht erst per Knopf raus (POST; Mailprogramme öffnen Links vorab), dann Aufgabe, Push, Pause, Bestätigung.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rückruf wünschen", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Search = { danke?: string; wa?: string; fehler?: string };

export default async function RueckrufPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Search> }) {
  const { token } = await params;
  const sp = await searchParams;
  const now = new Date();
  const r = await rueckrufAuswahl(token, now);
  if (!r) notFound();
  const t = rueckrufTexte(r.an, r.person);

  const kopf = (
    <div className="flex items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-sm font-bold text-[color:var(--brand-dark)]">
        {advisorInitials(r.vermittler)}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-[color:var(--muted)]">{t.kopf}</div>
        <div className="text-lg font-semibold leading-tight tracking-tight">{r.vermittler}</div>
      </div>
    </div>
  );

  // ── Bestätigung ───────────────────────────────────────────────────────
  if (sp.danke) {
    const f = sp.danke === "bald" ? null : (waehleFenster(sp.danke, now, r.lt) ?? fensterAusKey(sp.danke, r.lt));
    return (
      <Shell customerId={r.customerId}>
        <div data-rueckruf-danke>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">{t.danke}</h1>
          <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4">
            <div className="text-sm text-[color:var(--muted)]">{t.anrufVon}</div>
            <div className="mt-1 text-lg font-semibold" data-rueckruf-wann>
              {f ? `${tagTitel(f.tag, now)}, ${f.zeit}` : "So bald wie möglich"}
            </div>
          </div>
          {sp.wa ? <p className="mt-4 text-sm leading-relaxed text-[color:var(--muted)]">{t.perWhatsApp}</p> : null}
          <Link href={`/rueckruf/${token}`} className="mt-2 block py-2.5 text-center text-sm text-[color:var(--muted)] underline">
            {t.aendern}
          </Link>
        </div>
      </Shell>
    );
  }

  // ── Auswahl ───────────────────────────────────────────────────────────
  const fehler = sp.fehler === "fenster" ? t.fehlerFenster : sp.fehler === "limit" ? t.fehlerLimit : null;
  const erstes = r.tage[0]?.fenster[0]?.key ?? null;
  return (
    <Shell customerId={r.customerId}>
      {kopf}
      {fehler ? <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{fehler}</div> : null}
      <form action={rueckrufAction.bind(null, token)} className="mt-6 space-y-6" data-rueckruf>
        <section>
          <h1 className="text-base font-semibold">{r.tage.length ? t.titel : t.ohneFenster}</h1>
          {r.tage.length ? <p className="mt-1 text-sm text-[color:var(--muted)]">{t.text}</p> : null}
          <div className="mt-4 space-y-4">
            {r.tage.map((day) => (
              <div key={day.tag}>
                <div className="mb-1.5 text-xs font-medium text-[color:var(--muted)]">{day.titel}</div>
                <div className={day.fenster.length > 2 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
                  {day.fenster.map((f) => (
                    <label
                      key={f.key}
                      className="cursor-pointer rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-1 py-2.5 text-center transition hover:border-[color:var(--brand)] has-checked:border-[color:var(--brand)] has-checked:bg-[color:var(--brand)] has-checked:text-white"
                      data-fenster={f.key}
                    >
                      <input type="radio" name="fenster" value={f.key} defaultChecked={f.key === erstes} required className="sr-only" />
                      <span className="block text-sm font-semibold">{f.label}</span>
                      <span className="mt-0.5 block text-xs tabular-nums opacity-80">{f.zeit}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{t.notiz}</span>
          <textarea
            name="notiz"
            rows={2}
            maxLength={200}
            placeholder={t.notizHinweis}
            className="w-full resize-none rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2.5 text-base transition focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/15"
          />
        </label>
        <SubmitButton pendingLabel="Wird gesendet …" className={buttonClass("primary", "md", "h-12 w-full text-base")}>
          <Phone className="h-4 w-4" /> {r.tage.length ? t.knopf : t.knopfOhneFenster}
        </SubmitButton>
      </form>
    </Shell>
  );
}

function Shell({ children, customerId }: { children: React.ReactNode; customerId?: string | null }) {
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">{children}</div>
      </main>
      <LeadLegalFooter customerId={customerId} />
    </>
  );
}
