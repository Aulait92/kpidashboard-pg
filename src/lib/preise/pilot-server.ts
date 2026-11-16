// Beiträge rechnen (Pilot): Schalter je Gesellschaft und Sparte laden und speichern (PreisPilot, eine Zeile).
// Standard aus: ohne Zeile oder bei einem Fehler ist nichts an. Reine Funktionen: lib/preise/pilot.ts.

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { cleanPilot, PILOT_SCHLUESSEL } from "@/lib/preise/pilot";

/** Eingeschaltete Schlüssel „<gesellschaft>/<sparte>“; bei Fehlern leer (aus). */
export async function ladePreisPilot(): Promise<string[]> {
  const row = await prisma.preisPilot.findUnique({ where: { id: "default" } }).catch(() => null);
  return cleanPilot(row?.aktiv);
}

/** Einen Schalter setzen (Admin); Änderung im Änderungsprotokoll. */
export async function preisPilotSetzen(schluessel: string, an: boolean, actor?: AuditActor): Promise<{ ok: true; aktiv: string[] } | { ok: false; error: string }> {
  if (!PILOT_SCHLUESSEL.includes(schluessel)) return { ok: false, error: "Unbekannte Sparte." };
  const vorher = await ladePreisPilot();
  const aktiv = cleanPilot(an ? [...vorher, schluessel] : vorher.filter((k) => k !== schluessel));
  await prisma.preisPilot.upsert({ where: { id: "default" }, create: { id: "default", aktiv }, update: { aktiv } });
  await audit("preise.pilot", { entity: "PreisPilot", entityId: schluessel, actor, details: { schluessel, an } });
  return { ok: true, aktiv };
}
