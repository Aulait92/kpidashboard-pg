import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Card, EmptyState } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { supportZugriffeFuer } from "@/lib/support-zugriff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support-Zugriffe | performancegrowth" };

// Protokoll der Support-Zugriffe (Ole, 25.11.2026, lib/support-zugriff.ts). Wer: Vermittler, der nach einer Mitteilung
// nachsehen will, wann und warum unser Support ein Dokument geöffnet hat. Aufgabe: nachlesen, sonst nichts (keine
// Aktion). Erreichbar über Einstellungen → Datenschutz → Support-Zugriffe und den Link in der Mitteilung.
// Inhaber sehen alle Zugriffe, Berater die auf Chats ihrer Leads. Einträge sind unveränderbar.
const zeit = (d: Date) =>
  `${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d)}, ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d)} Uhr`;

export default async function SupportZugriffePage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const eintraege = ctx.preview && !ctx.userId ? [] : await supportZugriffeFuer(ctx);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader back="/buyer/einstellungen" title="Support-Zugriffe" />
      <div className="space-y-3" data-support-zugriffe>
        {eintraege.length ? (
          <>
            <p className="px-1 text-sm text-[color:var(--muted)]">Jeder Zugriff unseres Supports auf ein Dokument in Ihren Chats, mit Grund.</p>
            <Card>
              <ul className="divide-y divide-[color:var(--border)]">
                {eintraege.map((e) => (
                  <li key={e.id} className="px-5 py-3.5" data-support-zugriff-eintrag>
                    <time dateTime={e.createdAt.toISOString()} className="block text-xs font-medium text-[color:var(--muted)]">
                      {zeit(e.createdAt)}
                    </time>
                    <p className="mt-1 break-words text-[15px] leading-relaxed">{e.mitteilung}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        ) : (
          <Card>
            <EmptyState
              icon={ShieldCheck}
              title="Bisher kein Zugriff"
              text="Öffnet unser Support ein Dokument in Ihren Chats, steht es hier mit Grund, und Sie bekommen eine E-Mail."
            />
          </Card>
        )}
      </div>
    </main>
  );
}
