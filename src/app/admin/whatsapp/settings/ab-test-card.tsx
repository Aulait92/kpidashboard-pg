// A/B-Tests der WhatsApp-Vorlagen (lib/whatsapp/ab-test.ts): Stand je Vorlage, Antwortquote und Terminquote je
// Fassung. Die bessere Fassung wird automatisch Standard (Cron, Audit-Log „whatsapp.ab_promote“); hier nur lesen.
import { abOverview, ALPHA, ANTWORT_STUNDEN, MIN_JE_FASSUNG, MIN_JE_FASSUNG_ERSTANSCHREIBEN, MIN_TREFFER, minJeFassung, type AbOverview, type VariantStats } from "@/lib/whatsapp/ab-test";
import { PURPOSE_LABELS, templateTextFor, type TemplateVariant } from "@/lib/whatsapp/templates";
import { VORLAGEN_HYPOTHESE } from "@/lib/ab-hypothesen";

// Ohne Sendungen nur die Zahl (kein „noch keine Daten“, das bricht auf dem Handy in drei Zeilen um)
const mitQuote = (n: number, d: number) => (d ? `${n} (${Math.round((n / d) * 1000) / 10} %)` : String(n));
const dateDE = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

function statusText(t: AbOverview): string {
  if (t.winner) return `Entschieden${t.decidedAt ? ` am ${dateDE(t.decidedAt)}` : ""}: Fassung ${t.winner.toUpperCase()} ist jetzt Standard für alle neuen Leads.`;
  if (t.decision.reason === "zu_wenig") return `Läuft · entschieden ab ${minJeFassung(t.purpose)} Sendungen und ${MIN_TREFFER} Antworten je Fassung`;
  return `Läuft: noch kein klarer Unterschied (p = ${t.decision.p.toFixed(3)}, nötig unter ${ALPHA}).`;
}

function Row({ v, s, t }: { v: TemplateVariant; s: VariantStats; t: AbOverview }) {
  const best = t.winner === v;
  return (
    <tr className={best ? "font-semibold text-emerald-800" : undefined}>
      <td className="py-1 pr-3">{v.toUpperCase()}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{s.sent}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{mitQuote(s.replied, s.sent)}</td>
      <td className="py-1 text-right tabular-nums">{mitQuote(s.booked ?? 0, s.sent)}</td>
    </tr>
  );
}

export async function AbTestCard() {
  const tests = await abOverview().catch(() => []);
  if (!tests.length) return null;
  return (
    <section id="ab-tests" className="mt-4 rounded-xl border border-[color:var(--border)] bg-white p-5 text-sm" data-ab-tests>
      <h2 className="text-base font-semibold">A/B-Tests der Vorlagen</h2>
      <p className="mt-1 text-[color:var(--muted)]">Jeder Lead bekommt fest Fassung A oder B, die bessere wird automatisch Standard.</p>
      <details className="mt-1 text-[color:var(--muted)]">
        <summary className="cursor-pointer text-[color:var(--brand)]">So wird gezählt</summary>
        <p className="mt-1">
          Gezählt werden Vorlagen-Sendungen, die mindestens {ANTWORT_STUNDEN} Stunden alt sind; Antwort heißt: der Lead hat innerhalb dieser Zeit
          geschrieben (ohne Abmeldung und ohne „Kein Bedarf“). Ab {MIN_JE_FASSUNG} Sendungen (erste Nachricht an neue Leads: {MIN_JE_FASSUNG_ERSTANSCHREIBEN}) und {MIN_TREFFER} Antworten je Fassung und einem statistisch
          signifikanten Unterschied (z-Test, p unter {ALPHA}, wegen laufender Auswertung strenger als üblich) wird die bessere Fassung Standard.
        </p>
      </details>
      <ul className="mt-3 space-y-4">
        {tests.map((t) => (
          <li key={t.purpose} className="rounded-lg border border-[color:var(--border)] p-3">
            <div className="font-medium">{PURPOSE_LABELS[t.purpose]}</div>
            <p className="mt-0.5 text-[color:var(--muted)]">{statusText(t)}</p>
            <table className="mt-2 w-full max-w-xl">
              <thead className="text-xs text-[color:var(--muted)]">
                <tr>
                  <th className="pr-3 text-left font-normal">Fassung</th>
                  <th className="pr-3 text-right font-normal">Gesendet</th>
                  <th className="pr-3 text-right font-normal">Antworten</th>
                  <th className="text-right font-normal">Termine</th>
                </tr>
              </thead>
              <tbody>
                <Row v="a" s={t.stats.a} t={t} />
                <Row v="b" s={t.stats.b} t={t} />
              </tbody>
            </table>
            <details className="mt-2">
              <summary className="cursor-pointer text-[color:var(--brand)]">Hypothese und Texte</summary>
              {/* Hypothese hinter dem Aufklapper (SUS-Prüfung Liefern 20.11.2026): bei sechs Erstanschreiben stand derselbe Absatz sechsmal offen */}
              {VORLAGEN_HYPOTHESE[t.purpose] && <p className="mt-1">Hypothese: {VORLAGEN_HYPOTHESE[t.purpose]}</p>}
              {(["a", "b"] as const).map((v) => (
                <p key={v} className="mt-1 text-[color:var(--muted)]">
                  <span className="font-medium text-[color:var(--fg,inherit)]">{v.toUpperCase()}:</span> {templateTextFor(t.purpose, "sie", v)}
                </p>
              ))}
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
