// A/B-Tests der WhatsApp-Vorlagen (lib/whatsapp/ab-test.ts): Stand je Vorlage, Antwortquote und Terminquote je
// Fassung. Die bessere Fassung wird automatisch Standard (Cron, Audit-Log „whatsapp.ab_promote“); hier nur lesen.
import { abOverview, ALPHA, ANTWORT_STUNDEN, MIN_JE_FASSUNG, MIN_JE_FASSUNG_ERSTANSCHREIBEN, minJeFassung, type AbOverview, type VariantStats } from "@/lib/whatsapp/ab-test";
import { PURPOSE_LABELS, templateTextFor, type TemplateVariant } from "@/lib/whatsapp/templates";
import { NOCH_KEINE_DATEN } from "@/lib/platzhalter";

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10} %` : NOCH_KEINE_DATEN);
const dateDE = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

function statusText(t: AbOverview): string {
  if (t.winner) return `Entschieden${t.decidedAt ? ` am ${dateDE(t.decidedAt)}` : ""}: Fassung ${t.winner.toUpperCase()} ist jetzt Standard für alle neuen Leads.`;
  if (t.decision.reason === "zu_wenig") return `Läuft: Entscheidung ab ${minJeFassung(t.purpose)} Sendungen je Fassung.`;
  return `Läuft: noch kein klarer Unterschied (p = ${t.decision.p.toFixed(3)}, nötig unter ${ALPHA}).`;
}

function Row({ v, s, t }: { v: TemplateVariant; s: VariantStats; t: AbOverview }) {
  const best = t.winner === v;
  return (
    <tr className={best ? "font-semibold text-emerald-800" : undefined}>
      <td className="py-1 pr-3">Fassung {v.toUpperCase()}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{s.sent}</td>
      <td className="py-1 pr-3 text-right tabular-nums">
        {s.replied} ({pct(s.replied, s.sent)})
      </td>
      <td className="py-1 text-right tabular-nums">
        {s.booked ?? 0} ({pct(s.booked ?? 0, s.sent)})
      </td>
    </tr>
  );
}

export async function AbTestCard() {
  const tests = await abOverview().catch(() => []);
  if (!tests.length) return null;
  return (
    <section id="ab-tests" className="mt-4 rounded-xl border border-[color:var(--border)] bg-white p-5 text-sm" data-ab-tests>
      <h2 className="text-base font-semibold">A/B-Tests der Vorlagen</h2>
      <p className="mt-1 text-[color:var(--muted)]">
        Jeder Lead bekommt fest eine der beiden Fassungen. Gezählt werden Vorlagen-Sendungen, die mindestens {ANTWORT_STUNDEN} Stunden alt sind;
        Antwort heißt: der Lead hat innerhalb dieser Zeit geschrieben (ohne Abmeldung und ohne „Kein Bedarf“). Ab {MIN_JE_FASSUNG} Sendungen je
        Fassung (erste Nachricht an neue Leads: ab {MIN_JE_FASSUNG_ERSTANSCHREIBEN}) und einem klaren Unterschied (z-Test, p unter {ALPHA}) wird die bessere Fassung automatisch Standard.
      </p>
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
                  <th className="text-right font-normal">Termine (14 Tage)</th>
                </tr>
              </thead>
              <tbody>
                <Row v="a" s={t.stats.a} t={t} />
                <Row v="b" s={t.stats.b} t={t} />
              </tbody>
            </table>
            <details className="mt-2">
              <summary className="cursor-pointer text-[color:var(--brand)]">Texte ansehen</summary>
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
