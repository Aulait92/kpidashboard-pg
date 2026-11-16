import { EmbedHeight } from "@/components/termin/embed-height";

/** Rahmen der Vertriebs-Buchungsseiten (/termin): eigenständig mit Marke, eingebettet ohne Kopf und Fuß. */
export function TerminShell({ embed, booked = false, children }: { embed: boolean; booked?: boolean; children: React.ReactNode }) {
  const card = (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] sm:p-7">{children}</div>
  );
  if (embed) {
    return (
      <>
        <style>{"html,body{background:transparent!important}"}</style>
        <EmbedHeight booked={booked}>
          <main className="mx-auto w-full max-w-xl p-px">{card}</main>
        </EmbedHeight>
      </>
    );
  }
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
      <a href="https://performancegrowth.de" className="mb-4 inline-block text-lg font-bold tracking-tight text-[color:var(--foreground)]">
        performance<span className="text-[color:var(--brand)]">growth</span>
      </a>
      {card}
    </main>
  );
}

export const isEmbed = (sp: { einbetten?: string | string[] }) => sp.einbetten === "1";
export const embedQuery = (embed: boolean) => (embed ? "?einbetten=1" : "");
