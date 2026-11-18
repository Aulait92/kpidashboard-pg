import { redirect } from "next/navigation";
import { Bell, ChevronDown, Hand, Mail, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { NachrichtVorschau } from "@/components/nachricht-vorschau";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { asAnsprache, a } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { advisorDisplayName } from "@/lib/advisor-name";
import { vermittlerName } from "@/lib/whatsapp/gespraech";
import { standardAblauf, type AblaufKanal, type AblaufPhase, type AblaufSchritt } from "@/lib/ablauf";
import { cn } from "@/lib/utils";
import { SoArbeitet } from "@/components/so-arbeitet";
import { ladeSoArbeitet } from "@/lib/so-arbeitet-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ablauf | performancegrowth" };

// Einstellungen → Assistent → Ablauf (Paket P6, Ole 17.11.2026): die Standard-Abfolge als Zeitleiste, mit Beispieltexten
// in Ihrer Ansprache und mit Ihrem Namen (lib/ablauf.ts, dieselben Daten wie „Nächste Nachrichten“ am Kontakt).
// Aufbau in Abschnitten (<section id=…>): oben „so-arbeitet“ (P8: drei Spuren Kunde, Assistent, Sie und Beispielchat,
// components/so-arbeitet.tsx, dieselben Daten wie im Onboarding), darunter „zeitleiste“ (alle Nachrichten im Detail).
// Die E-Mails (M7: Stufe je Vorlage, Kopie, Antwortweg) stehen unter Einstellungen → Assistent → „E-Mails in Ihrem Namen“.

const KANAL: Record<AblaufKanal, { icon: LucideIcon; farbe: string; name: string }> = {
  whatsapp: { icon: MessageCircle, farbe: "bg-emerald-50 text-emerald-700 ring-emerald-200", name: "WhatsApp" },
  email: { icon: Mail, farbe: "bg-blue-50 text-blue-700 ring-blue-200", name: "E-Mail" },
  push: { icon: Bell, farbe: "bg-violet-50 text-violet-700 ring-violet-200", name: "Push an Sie" },
  anruf: { icon: Phone, farbe: "bg-amber-50 text-amber-800 ring-amber-200", name: "Aufgabe für Sie" },
  aktion: { icon: Hand, farbe: "bg-zinc-100 text-zinc-700 ring-zinc-200", name: "Sie" },
};

/** Nächster Montag 10 Uhr (Berlin) als Beispielzeit. */
function beispielMontag(now: Date): Date {
  const d = new Date(now.getTime());
  do d.setUTCDate(d.getUTCDate() + 1);
  while (new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short" }).format(d) !== "Mon");
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
  // 10 Uhr Berlin (Winterzeit 9 Uhr UTC, Sommerzeit 8 Uhr UTC)
  const utc = new Date(`${ymd}T09:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(utc));
  return new Date(utc.getTime() + (10 - h) * 60 * 60 * 1000);
}

export default async function AblaufPage({ searchParams }: { searchParams: Promise<{ produkt?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [customer, agent] = await Promise.all([
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, leadAddress: true } }),
    prisma.agentConfig.findUnique({ where: { customerId: ctx.customerId }, select: { followUpSequencesEnabled: true } }),
  ]);
  const an = asAnsprache(customer?.leadAddress);
  const who = await ansprechpartner({ customerId: ctx.customerId });
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || advisorDisplayName(customer?.name) || a(an, "dein Berater", "Ihr Berater") });
  const montag = beispielMontag(new Date());
  const phasen = standardAblauf({ an, person, beispielTermin: montag, anrufStart: montag });
  const nachfassenAus = agent ? !agent.followUpSequencesEnabled : false;
  // P8: Überblick mit drei Spuren und Beispielchat (dieselben Daten wie im Onboarding)
  const soArbeitet = await ladeSoArbeitet(ctx.customerId, (await searchParams).produkt);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader back="/buyer/einstellungen/assistent" title="Ablauf" subtitle="Wie Ihr Assistent arbeitet und was er wann schickt." />
      <section id="so-arbeitet" className="mb-8" data-ablauf-so-arbeitet>
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">So arbeitet Ihr Assistent</h2>
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5">
          <SoArbeitet d={soArbeitet} chat="zu" produktHref={(p) => `/buyer/einstellungen/assistent/ablauf?produkt=${encodeURIComponent(p)}#so-arbeitet`} />
        </div>
      </section>
      <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Alle Nachrichten im Detail</h2>
      <p className="mb-3 px-1 text-sm text-[color:var(--muted)]">Tippen Sie auf einen Schritt für den Text.</p>
      <section id="zeitleiste" className="space-y-5" data-ablauf-zeitleiste>
        {phasen.map((p, i) => (
          <Phase key={p.key} p={p} nr={i + 1} aus={nachfassenAus && !!p.nachfassen} />
        ))}
      </section>
      <p className="mt-6 px-1 text-sm text-[color:var(--muted)]">
        Am Kontakt sehen Sie unter <b className="font-semibold text-[color:var(--foreground)]">Nächste Nachrichten</b>, was als Nächstes geplant ist, und können es pausieren, verschieben oder überspringen.
      </p>
    </main>
  );
}

function Phase({ p, nr, aus }: { p: AblaufPhase; nr: number; aus: boolean }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]" data-ablauf-phase={p.key}>
      <div className="flex items-start gap-3 border-b border-[color:var(--border)] px-5 py-3.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)] text-xs font-bold text-white">{nr}</span>
        <div className="min-w-0">
          <h2 className="font-semibold">{p.titel}</h2>
          <p className="text-xs text-[color:var(--muted)]">{p.bezug}</p>
          {aus ? <p className="mt-1 text-xs font-medium text-amber-800">Automatisches Nachfassen ist für Ihr Konto aus, Nachfragen kommen dann als Aufgabe.</p> : null}
        </div>
      </div>
      <Schritte schritte={p.schritte} />
      {p.sonst?.map((z) => (
        <details key={z.key} className="group border-t border-[color:var(--border)]" data-ablauf-zweig={z.key}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 text-sm font-semibold text-[color:var(--muted)] hover:text-[color:var(--foreground)] [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">{z.titel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
          </summary>
          <div className="bg-[color:var(--surface-sunken,#f8fafc)]">
            <Schritte schritte={z.schritte} />
          </div>
        </details>
      ))}
    </div>
  );
}

function Schritte({ schritte }: { schritte: AblaufSchritt[] }) {
  return (
    <ol className="relative py-1">
      {/* Linie der Zeitleiste */}
      <span aria-hidden className="absolute bottom-4 left-[35px] top-4 w-px bg-[color:var(--border)]" />
      {schritte.map((s) => {
        const k = KANAL[s.kanal];
        return (
          <li key={s.key} className="relative" data-ablauf-schritt={s.key}>
            <details className="group">
              <summary className={cn("flex cursor-pointer list-none items-start gap-3 px-5 py-2.5 [&::-webkit-details-marker]:hidden", !s.vorschau && "cursor-default")}>
                <span className={cn("relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset", k.farbe)} title={k.name}>
                  <k.icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-[color:var(--muted)]">{s.wann}</span>
                  <span className="block text-sm font-medium">{s.titel}</span>
                  {s.hinweis ? <span className="block text-xs text-[color:var(--muted)]">{s.hinweis}</span> : null}
                </span>
                {s.vorschau ? <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-[color:var(--border-strong)] transition group-open:rotate-180" /> : null}
              </summary>
              {s.vorschau ? (
                <div className="pb-3 pl-[60px] pr-5">
                  <NachrichtVorschau kanal={s.kanal} text={s.vorschau} />
                </div>
              ) : null}
            </details>
          </li>
        );
      })}
    </ol>
  );
}
