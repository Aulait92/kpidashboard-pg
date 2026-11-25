import { connection } from "next/server";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Aufmerksamkeit } from "@/components/admin-neu/ui/aufmerksamkeit";
import { punkteDerRolle } from "@/lib/admin-neu/rollen-server";
import type { HeuteItem } from "@/lib/admin-heute";
import { KundenNachKanal } from "@/components/admin-neu/zahlen/kunden-nach-kanal";
import { GeldUebersicht } from "@/components/admin-neu/zahlen/uebersicht";
import { loadBwa, type BwaData } from "@/lib/bwa";
import { ladeOffenePosten } from "@/lib/mahnwesen-server";
import { loadProdukte } from "@/lib/produkte";
import { requireAuth } from "@/lib/vertrieb/auth";
import { loadVertriebZahlen } from "@/lib/vertrieb-zahlen";
import { loadZahlen } from "@/lib/zahlen";
import { parseSicht } from "@/lib/zahlen-sicht";

export const metadata = { title: "Geld | performancegrowth Admin" };

// Geld › Übersicht (Umbau 19.11.2026): oben „Braucht Aufmerksamkeit“, dann 4 Kennzahlen und 4 zugeklappte Abschnitte
// (components/admin-neu/zahlen/uebersicht.tsx). Gleiche Daten und Server Actions wie /admin/zahlen; ?zeitraum=,
// ?vzeitraum=, ?bwa=, ?sicht= wie dort. Kündigung & Rückkehr und die Investoren-Auswertung sind Detailseiten.

/** Betriebsergebnis eines Monats aus der BWA (null, wenn der Monat fehlt oder unvollständig ist). */
function ergebnisIm(bwa: BwaData, m: string): { monat: string; wert: number } | null {
  const i = bwa.bwa.months.indexOf(m);
  const v = bwa.bwa.rows.find((r) => r.key === "r:ergebnis")?.values[i];
  if (i < 0 || v == null || bwa.bwa.incomplete.includes(m)) return null;
  return { monat: m, wert: v };
}

/** Punkt „Ergebnis Vormonat fehlt“ für „Braucht Aufmerksamkeit“. */
function ergebnisFehltPunkt(monat: string): HeuteItem {
  const [j, m] = monat.split("-").map(Number);
  const label = j && m ? new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(j, m - 1, 1))) : monat;
  return {
    key: `geld:ergebnis-fehlt:${monat}`,
    area: "System",
    tone: "warn",
    icon: "euro",
    title: `Ergebnis ${label} fehlt`,
    detail: "Kosten vervollständigen, dann steht das Ergebnis in der Übersicht.",
    action: { label: "Kosten ergänzen", href: "/admin/neu/zahlen/kosten" },
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ zeitraum?: string; vzeitraum?: string; bwa?: string; sicht?: string }> }) {
  await connection();
  const session = await requireAuth();
  const { zeitraum, vzeitraum, bwa: bwaParam, sicht } = await searchParams;
  const [data, produkte, vertrieb, bwa, punkte, op] = await Promise.all([
    loadZahlen(new Date(), parseSicht(sicht)),
    loadProdukte(zeitraum),
    loadVertriebZahlen(vzeitraum),
    loadBwa(bwaParam),
    punkteDerRolle(session.userId, "geld"),
    ladeOffenePosten(),
  ]);
  // Im Januar liegt der Vormonat nicht in der Jahres-BWA: dann die letzten 12 Monate nachladen
  const ergebnis = bwa.bwa.months.includes(data.lastComplete) ? ergebnisIm(bwa, data.lastComplete) : ergebnisIm(await loadBwa("12m"), data.lastComplete);
  // Kein „Alles erledigt“ über „Ergebnis Vormonat: fehlt“ (Usability-Check 25.11.2026): der fehlende Abschluss ist ein Punkt
  const allePunkte = punkte && !ergebnis ? [...punkte, ergebnisFehltPunkt(data.lastComplete)] : punkte;

  return (
    <Seite titel="Geld" reiter="geld" breit>
      <div className="space-y-4">
        <Aufmerksamkeit punkte={allePunkte} />
        <GeldUebersicht
          data={data}
          produkte={produkte}
          vertrieb={vertrieb}
          bwa={bwa}
          ergebnis={ergebnis}
          offen={{ summe: op.summe, anzahl: op.posten.length, ueberfaellig: op.posten.filter((p) => p.tage > 0).length }}
          kanal={<KundenNachKanal />}
        />
      </div>
    </Seite>
  );
}
