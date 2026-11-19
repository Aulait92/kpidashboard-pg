import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { WhatsAppGuide } from "@/components/whatsapp-guide";
import { IntroVideo } from "@/components/intro-video";
import { VIDEOS } from "@/lib/intro-videos";
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
    where: "Ihr E-Mail-Postfach",
    tone: "border-t-amber-500",
    title: "Join [Ihr Firmenname] on the 360Dialog Hub",
    lines: ["Von: 360Dialog <no-reply@360dialog.com>", "Knopf antippen und Passwort festlegen."],
    action: "Join 360Dialog Hub",
  },
  {
    where: "Bei uns: Einrichtung",
    tone: "border-t-blue-600",
    title: "Schritt 1 erledigt",
    lines: ["☑ Erledigt, ich habe mein Passwort festgelegt"],
    action: "Weiter: WhatsApp verbinden",
  },
  {
    where: "360dialog (unser WhatsApp-Anbieter)",
    tone: "border-t-teal-600",
    title: "Log in, dann „Verify it's you“",
    lines: ["E-Mail und neues Passwort eintragen.", "Code aus der zweiten E-Mail eintragen."],
    action: "Log in · Continue",
  },
  {
    where: "360dialog (unser WhatsApp-Anbieter)",
    tone: "border-t-teal-600",
    title: "Enter phone number",
    lines: ["Land von USA (+1) auf Deutschland (+49) umstellen", "Nummer ohne 0: 151 23456789"],
    action: "Next",
  },
  {
    where: "360dialog (unser WhatsApp-Anbieter)",
    tone: "border-t-teal-600",
    title: "Is +49 151 23456789 already on WhatsApp?",
    lines: ["Neue Nummer: „No, It's not connected“", "Business App: „Yes, Business app“"],
    action: "Auswahl antippen",
  },
  {
    where: "360dialog (unser WhatsApp-Anbieter)",
    tone: "border-t-teal-600",
    title: "Verify your phone number",
    lines: ["◉ Text message (SMS)   ○ Voice call", "Code: 4 8 1 9 0 2"],
    action: "Verify",
  },
  {
    where: "360dialog (unser WhatsApp-Anbieter)",
    tone: "border-t-teal-600",
    title: "Meta Business Signup",
    lines: ["Pop-ups im Browser erlauben.", "Knopf unten rechts."],
    action: "Embedded Signup",
  },
  {
    where: "Fenster von Meta (Facebook)",
    tone: "border-t-indigo-600",
    title: "Seamlessly connect your account to 360Dialog",
    lines: ["Facebook Login for Business"],
    action: "Continue",
  },
  {
    where: "Fenster von Meta (Facebook)",
    tone: "border-t-indigo-600",
    title: "Add your WhatsApp phone number",
    lines: ["Ihre Nummer ist schon ausgewählt."],
    action: "Next",
  },
  {
    where: "Fenster von Meta (Facebook)",
    tone: "border-t-indigo-600",
    title: "Select the business assets",
    lines: ["Business portfolio: Ihr eigenes Portfolio", "WhatsApp account: Create a WhatsApp account"],
    action: "Next",
  },
  {
    where: "Fenster von Meta (Facebook)",
    tone: "border-t-indigo-600",
    title: "Enter business information",
    lines: ["Name wie im Impressum, Land Germany", "Time zone: Europe/Berlin"],
    action: "Next",
  },
  {
    where: "Fenster von Meta (Facebook)",
    tone: "border-t-indigo-600",
    title: "Review what you'll share with 360dialog",
    lines: ["Unternehmen, WhatsApp-Konto, Nachrichtenkonto", "Überall Ihr eigener Firmenname"],
    action: "Confirm",
  },
  {
    where: "Fenster von Meta (Facebook)",
    tone: "border-t-indigo-600",
    title: "Your account is connected to 360Dialog",
    lines: ["☐ Instruct Meta to automatically identify order and lead events", "☐ Share Cloud API events", "Beide Häkchen entfernen."],
    action: "Finish",
  },
  {
    where: "Bei uns: Einrichtung",
    tone: "border-t-emerald-600",
    title: "Fast geschafft",
    lines: ["Ihre Nummer wird bei WhatsApp noch eingerichtet.", "Nach wenigen Minuten steht hier „Verbunden“."],
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
      <PageHeader back="/buyer/einrichtung" title="WhatsApp verbinden" subtitle="Schritt für Schritt. Einmalig, etwa 10 Minuten." />
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
          showVideo={false}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">{VIDEOS.whatsapp.title}</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">Der ganze Ablauf einmal vorgemacht, funktioniert auch ohne Ton.</p>
        <IntroVideo kind="whatsapp" />
      </section>

      {/* Nachschlagen statt Lesepflicht: die 15 Bildschirme zugeklappt (UX-Runde 19.11.2026, am Handy war die Seite 9 Bildschirme lang) */}
      <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]" data-wa-bildschirme>
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex-1 text-[15px] font-semibold tracking-tight">So sieht es aus: alle {SCREENS.length} Bildschirme</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5">
        <p className="mb-4 text-sm text-[color:var(--muted)]">
          Die Kästen zeigen den Ablauf mit einer neuen Nummer vereinfacht. Texte und Aussehen bei 360dialog und Meta können etwas abweichen, die
          Reihenfolge stimmt. Mit einer Nummer aus der WhatsApp Business App wählen Sie bei der Frage „Yes, Business app“ und scannen später einen
          QR-Code in der App, statt einen Code per SMS einzugeben.
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
        </div>
      </details>

      <p className="mt-8 text-sm">
        <Link href="/buyer/einrichtung#whatsapp" className="inline-flex min-h-11 items-center font-medium text-[color:var(--brand)] underline">
          Zurück zur Einrichtung
        </Link>
      </p>
    </main>
  );
}
