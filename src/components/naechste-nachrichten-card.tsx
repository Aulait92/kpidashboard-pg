// Kontakt: „Nächste Nachrichten“ (Paket P6, Ole 17.11.2026). Ersetzt die Karte „Automatisches Nachfassen“: oben alles,
// was geplant ist (Erinnerungen, Nachfassen, Anrufplan) mit Aktionen, darunter zugeklappt der bisherige Verlauf.
// Nur sichtbar, wenn etwas geplant ist oder es einen Verlauf gibt. Sprungmarke #nachfassen (Push „Vorab-Check“, „Heute“).

import { loadNachrichtenPlan } from "@/lib/nachrichtenplan-server";
import { istAngebotsAbfolge, istBedenkzeitAbfolge, loadLeadSequences } from "@/lib/lead-sequences";
import { addDaysYmd, berlinYmd } from "@/lib/absence";
import { BEDENKZEIT_MAX_TAGE, BEDENKZEIT_OPTIONEN, bedenkzeitDatum, tagKurz } from "@/lib/bedenkzeit";
import { prisma } from "@/lib/prisma";
import { NaechsteNachrichten, type VerlaufZeile } from "./naechste-nachrichten";

export async function NaechsteNachrichtenCard({ leadId, readOnly }: { leadId: string; readOnly?: boolean }) {
  const [plan, abfolgen, lead] = await Promise.all([
    loadNachrichtenPlan(leadId),
    loadLeadSequences(leadId),
    prisma.lead.findUnique({ where: { id: leadId }, select: { nachrichtenPausiertAt: true } }),
  ]);
  const verlauf: VerlaufZeile[] = abfolgen.flatMap((s) => [
    ...(s.stopReason === "Abgeschlossen" ? [{ at: null, text: `Abfolge „${s.label}“ abgeschlossen` }] : []),
    ...s.entries
      .slice()
      .reverse()
      .map((e) => ({ at: e.at, text: e.text })),
    { at: s.startedAt, text: `Abfolge „${s.label}“ gestartet`, leise: true },
  ]);
  if (!plan.length && !verlauf.length && !lead?.nachrichtenPausiertAt) return null;
  // Bedenkzeit zum Angebot (Paket P5): im Menü „Mehr“, solange nachgefasst wird
  const aktiv = abfolgen.find((s) => s.active);
  const now = new Date();
  const heute = berlinYmd(now);
  const bedenkzeit =
    aktiv && istAngebotsAbfolge(aktiv.kind)
      ? {
          optionen: BEDENKZEIT_OPTIONEN.map((o) => ({ wahl: o.wahl, label: o.label, tag: tagKurz(bedenkzeitDatum(o.wahl, now)) })),
          min: addDaysYmd(heute, 1),
          max: addDaysYmd(heute, BEDENKZEIT_MAX_TAGE),
          bis: istBedenkzeitAbfolge(aktiv.kind) && aktiv.step === 0 && aktiv.next ? tagKurz(new Date(aktiv.next.at)) : null,
        }
      : null;
  return (
    <NaechsteNachrichten
      leadId={leadId}
      eintraege={plan}
      pausiertAt={lead?.nachrichtenPausiertAt?.toISOString() ?? null}
      laeuft={abfolgen.some((s) => s.active)}
      verlauf={verlauf}
      readOnly={!!readOnly}
      jetzt={now.toISOString()}
      bedenkzeit={bedenkzeit}
    />
  );
}
