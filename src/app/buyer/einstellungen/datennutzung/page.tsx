import { redirect } from "next/navigation";
import { after } from "next/server";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Card } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { DATENNUTZUNG_EINTRAG, DETAIL_TEXT } from "@/lib/datennutzung";
import { SUBPROCESSORS_PDF_PFAD } from "@/lib/legal-texts";
import { bestaetigtAm, ladeStand, merkeAnzeige } from "@/lib/datennutzung-server";
import { DatennutzungAktionen } from "./aktionen";

export const dynamic = "force-dynamic";
export const metadata = { title: `${DATENNUTZUNG_EINTRAG} | performancegrowth` };

// Detailseite zum Banner „Neu: KI-Hilfe und gemeinsames Anzeigenlernen“ (Ole, 24.11.2026, lib/datennutzung.ts).
// Wer: Inhaber, der genau wissen will, was sich ändert, oder widersprechen will. Aufgabe: lesen und wählen.
// Erreichbar über „Mehr erfahren“ im Banner und dauerhaft über Einstellungen → KI-Hilfe und Anzeigenlernen.
// Eine Hauptaktion: „Verstanden“, solange noch offen; „Widersprechen“ steht als Nebenaktion unten.
export default async function DatennutzungPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole === "advisor") redirect("/buyer");
  const stand = await ladeStand(ctx);
  // Kein Software-Paket (bzw. App-Demo): hier gibt es nichts zu wählen
  if (!stand) redirect("/buyer/einstellungen");
  // Der ganze Text steht auf dieser Seite: Öffnen durch einen Inhaber zählt als Anzeige (Beginn der 14 Tage)
  if (stand.darf && !stand.angezeigtAm) after(() => merkeAnzeige(ctx, "detailseite").catch(() => false));
  const bestaetigt = await bestaetigtAm(ctx.customerId, stand.verstandenAm);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader back="/buyer/einstellungen" title={DETAIL_TEXT.titel} />
      <div className="space-y-5" data-datennutzung-seite>
        <Card>
          <ol className="divide-y divide-[color:var(--border)]">
            {DETAIL_TEXT.punkte.map((p, i) => (
              <li key={p.label} className="flex gap-3 px-5 py-3.5 text-[15px] leading-relaxed" data-datennutzung-punkt={i + 1}>
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-sunken)] text-xs font-semibold text-[color:var(--muted)]" aria-hidden>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p>
                    <b className="font-semibold">{p.label}:</b> {p.text}
                  </p>
                  {p.pdf ? (
                    <a
                      href={SUBPROCESSORS_PDF_PFAD}
                      target="_blank"
                      rel="noopener"
                      className="-mb-1.5 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline"
                      data-datennutzung-pdf
                    >
                      <FileText className="h-4 w-4 shrink-0" /> {p.pdf}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Card>
        <DatennutzungAktionen stand={stand} bestaetigtAm={bestaetigt} />
      </div>
    </main>
  );
}
