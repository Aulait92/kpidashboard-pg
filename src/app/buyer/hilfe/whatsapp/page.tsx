import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { WhatsAppGuide } from "@/components/whatsapp-guide";
import { getBuyerContext } from "@/lib/buyer-context";
import { parseConnectPath } from "@/lib/whatsapp/connect-guide";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp verbinden | performancegrowth" };

// Ausführliche Anleitung zum Verbinden der WhatsApp-Nummer, mit schematischen
// Bildschirmen. Die Kästen zeigen den Ablauf, nicht das echte Aussehen.
const SCREENS: { where: string; tone: string; title: string; lines: string[]; action: string }[] = [
  {
    where: "Bei uns: Einrichtung",
    tone: "border-t-blue-600",
    title: "WhatsApp verbinden",
    lines: ["Sie wählen, welche Nummer Ihr Assistent nutzt.", "Dann tippen Sie auf den Knopf."],
    action: "Jetzt WhatsApp verbinden",
  },
  {
    where: "360dialog (unser WhatsApp-Anbieter)",
    tone: "border-t-teal-600",
    title: "Konto anlegen",
    lines: ["E-Mail: ihre@agentur.de", "Passwort: ••••••••", "☑ Nutzungsbedingungen akzeptiert"],
    action: "Weiter",
  },
  {
    where: "Fenster von Meta (Facebook)",
    tone: "border-t-indigo-600",
    title: "Mit Facebook fortfahren",
    lines: ["360dialog möchte ein WhatsApp-Konto für Sie einrichten."],
    action: "Weiter",
  },
  {
    where: "Fenster von Meta (Facebook)",
    tone: "border-t-indigo-600",
    title: "Unternehmensportfolio auswählen",
    lines: ["◉ Ihr Unternehmensportfolio", "○ Neues Portfolio erstellen"],
    action: "Weiter",
  },
  {
    where: "Fenster von Meta (Facebook)",
    tone: "border-t-indigo-600",
    title: "WhatsApp-Profil",
    lines: ["Anzeigename: Max Mustermann Versicherungsmakler", "Kategorie: Finanzdienstleistungen"],
    action: "Weiter",
  },
  {
    where: "Fenster von Meta (Facebook)",
    tone: "border-t-indigo-600",
    title: "Nummer bestätigen",
    lines: ["Nummer: +49 30 1234567", "○ Code per SMS   ◉ Code per Anruf", "Code: 4 8 1 9 0 2"],
    action: "Bestätigen",
  },
  {
    where: "Bei uns: Einrichtung",
    tone: "border-t-emerald-600",
    title: "Verbunden: +49 30 1234567",
    lines: ["Ihr Assistent schreibt neue Leads ab dem Start über diese Nummer an."],
    action: "Fertig",
  },
];

export default async function WhatsAppHelpPage({ searchParams }: { searchParams: Promise<{ weg?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { weg } = await searchParams;
  const owner = ctx.teamRole === "owner";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="WhatsApp verbinden" subtitle="Schritt für Schritt. Einmalig, etwa 10 Minuten." />
      {!owner ? (
        <p className="mb-5 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Das Verbinden macht der Inhaber des Kontos. Diese Anleitung können Sie trotzdem lesen.
        </p>
      ) : null}

      <section className="mb-8 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <WhatsAppGuide
          initialPath={parseConnectPath(weg)}
          readOnly={ctx.preview || !owner}
          helpHref="/buyer/einrichtung?schritt=metaAccess#hilfetermin"
          showMoreLink={false}
        />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">So sieht es aus</h2>
        <p className="mb-4 text-sm text-[color:var(--muted)]">
          Die Kästen zeigen den Ablauf vereinfacht. Texte und Aussehen bei 360dialog und Meta können etwas abweichen, die Reihenfolge stimmt. Mit einer Nummer
          aus der WhatsApp Business App kommt nach dem Portfolio die Frage, ob die Nummer schon in WhatsApp läuft. Danach scannen Sie einen QR-Code in der App,
          statt einen Code per SMS einzugeben.
        </p>
        <ol className="grid gap-4 sm:grid-cols-2">
          {SCREENS.map((s, i) => (
            <li key={s.title} className="min-w-0">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-[color:var(--muted)]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--surface-sunken,#f1f5f9)] tabular-nums text-[color:var(--foreground)]">
                  {i + 1}
                </span>
                {s.where}
              </div>
              <div className={`overflow-hidden rounded-[var(--radius-md)] border border-t-4 border-[color:var(--border)] bg-[color:var(--surface)] ${s.tone}`}>
                <div className="space-y-1.5 p-4 text-sm">
                  <p className="font-semibold">{s.title}</p>
                  {s.lines.map((l) => (
                    <p key={l} className="break-words text-[color:var(--muted)]">
                      {l}
                    </p>
                  ))}
                  <span className="mt-2 inline-block rounded-md bg-[color:var(--surface-sunken,#f1f5f9)] px-3 py-1.5 text-xs font-semibold">{s.action}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-8 text-sm">
        <Link href="/buyer/einrichtung#whatsapp" className="font-medium text-[color:var(--brand)] underline">
          Zurück zur Einrichtung
        </Link>
      </p>
    </main>
  );
}
