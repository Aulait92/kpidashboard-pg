import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import {
  LinkedInEinrichten,
  LinkedInEinstellungen,
  LinkedInEntwuerfe,
  LinkedInErgebnisse,
  LinkedInFotos,
  LinkedInGeplant,
  LinkedInHinweise,
  LinkedInKennzahlen,
  LinkedInStatistik,
  LinkedInVerbindung,
  ladeLinkedIn,
  linkedInRhythmus,
} from "@/components/admin/linkedin-bausteine";
import { GenerateButton } from "./forms";

export const metadata = { title: "LinkedIn | Vertrieb" };

// LinkedIn (Ole, 14.11.2026): Entwürfe der KI freigeben, Zielgruppen-Reichweite auswerten.
// Bausteine und Laden gemeinsam mit dem neuen Admin (components/admin/linkedin-bausteine.tsx).
export default async function LinkedInPage({ searchParams }: { searchParams: Promise<{ li?: string }> }) {
  await connection();
  await requireAuth();
  const { li } = await searchParams;
  const d = await ladeLinkedIn();
  const { settings } = d;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">LinkedIn</h1>
        <p className="text-sm text-[color:var(--muted)]">Persönliches Profil · Ziel: Reichweite bei Versicherungsvermittlern, nicht Reichweite insgesamt.</p>
      </div>
      <LinkedInHinweise d={d} li={li} />
      <LinkedInEinrichten d={d} />
      <LinkedInKennzahlen d={d} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Zur Freigabe</h2>
            <p className="text-sm text-[color:var(--muted)]">{linkedInRhythmus(d)}</p>
          </div>
          <GenerateButton disabled={!settings.about.trim()} defaultDays={settings.planDays > 1 ? Math.min(14, settings.planDays) : 1} />
        </div>
        <LinkedInEntwuerfe d={d} />
      </section>

      {d.planned.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Geplant</h2>
          <LinkedInGeplant d={d} />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ergebnisse</h2>
        <p className="text-sm text-[color:var(--muted)]">
          Zielgruppen-Reichweite = Impressionen × Anteil Vermittler unter den Zuschauern (je Post aus dem Post-Export, sonst Profil-Schnitt). Vergleich mit dem Median der 30 Posts davor.
        </p>
        <LinkedInErgebnisse d={d} />
      </section>

      <section className="space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5">
        <h2 className="text-lg font-semibold">Statistik hochladen</h2>
        <LinkedInStatistik d={d} />
      </section>

      <section className="space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5">
        <h2 className="text-lg font-semibold">Fotos von Ihnen</h2>
        <LinkedInFotos d={d} />
      </section>

      <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5" open={!settings.about.trim()}>
        <summary className="cursor-pointer text-lg font-semibold">Einstellungen</summary>
        <div className="mt-4">
          <LinkedInEinstellungen d={d} />
        </div>
      </details>

      <LinkedInVerbindung d={d} />
    </div>
  );
}
