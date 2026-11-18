// Kontakt: „Nächste Nachrichten“ (Paket P6, Ole 17.11.2026). Ersetzt die Karte „Automatisches Nachfassen“: oben alles,
// was geplant ist (Erinnerungen, Nachfassen, Anrufplan) mit Aktionen, darunter zugeklappt der bisherige Verlauf.
// Nur sichtbar, wenn etwas geplant ist oder es einen Verlauf gibt. Sprungmarke #nachfassen (Push „Vorab-Check“, „Heute“).

import { loadNachrichtenPlan } from "@/lib/nachrichtenplan-server";
import { loadLeadSequences } from "@/lib/lead-sequences";
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
  return (
    <NaechsteNachrichten
      leadId={leadId}
      eintraege={plan}
      pausiertAt={lead?.nachrichtenPausiertAt?.toISOString() ?? null}
      laeuft={abfolgen.some((s) => s.active)}
      verlauf={verlauf}
      readOnly={!!readOnly}
      jetzt={new Date().toISOString()}
    />
  );
}
