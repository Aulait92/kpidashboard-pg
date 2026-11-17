// Diagnose q=admin-nutzung[&tage=N] (Ole, 18.11.2026, nur lesend; Auftrag docs/ux/admin-neu/nutzungs-audit-2026-11-17.md):
// Wie oft nutzen die Admins welche Funktionen? Zwei Quellen, nur Zahlen, keine Namen, E-Mails oder IDs von Personen:
//   1. Änderungsprotokoll (AuditLog) mit actorRole = ADMIN je Aktion: Anzahl, letzter Zeitpunkt, Anzahl Admins.
//      Automatische Läufe (actorRole = system) getrennt, damit sie die Admin-Zahlen nicht aufblähen.
//   2. Klickmessung im Admin (AdminUsageEvent, lib/admin-nutzung.ts): je Funktions-ID (data-funktion) und je Seite
//      (Pfad mit :id), getrennt nach alter und neuer Oberfläche.
// Zeitraum: tage (Standard 30, höchstens 120). Dazu je Quelle, seit wann es Daten gibt. Sortiert nach Anzahl.

import { AUDIT_LABEL } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const minute = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16) + "Z" : null);

export function tageAus(params: URLSearchParams): number {
  const n = Number.parseInt(params.get("tage") ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(120, n);
}

type AuditZeile = { action: string; anzahl: number; letzte: Date | null; admins: number };
type KlickZeile = { art: string; schluessel: string; anzahl: number; alt: number; neu: number; letzte: Date | null; admins: number };

export async function adminNutzung(params: URLSearchParams) {
  const tage = tageAus(params);
  const seit = new Date(Date.now() - tage * DAY_MS);

  const [admin, system, klicks, beginnAudit, beginnAuditAdmin, beginnKlicks, adminsAktiv] = await Promise.all([
    prisma.$queryRaw<AuditZeile[]>`
      SELECT "action", COUNT(*)::int AS anzahl, MAX("at") AS letzte, COUNT(DISTINCT "actorId")::int AS admins
      FROM "AuditLog" WHERE "actorRole" = 'ADMIN' AND "at" >= ${seit}
      GROUP BY "action" ORDER BY anzahl DESC, "action" ASC`,
    prisma.$queryRaw<AuditZeile[]>`
      SELECT "action", COUNT(*)::int AS anzahl, MAX("at") AS letzte, 0::int AS admins
      FROM "AuditLog" WHERE "actorRole" = 'system' AND "at" >= ${seit}
      GROUP BY "action" ORDER BY anzahl DESC, "action" ASC`,
    prisma.$queryRaw<KlickZeile[]>`
      SELECT "art", "schluessel", COUNT(*)::int AS anzahl,
             COUNT(*) FILTER (WHERE "oberflaeche" = 'alt')::int AS alt,
             COUNT(*) FILTER (WHERE "oberflaeche" = 'neu')::int AS neu,
             MAX("at") AS letzte, COUNT(DISTINCT "adminUserId")::int AS admins
      FROM "AdminUsageEvent" WHERE "at" >= ${seit}
      GROUP BY "art", "schluessel" ORDER BY anzahl DESC, "schluessel" ASC`,
    prisma.auditLog.aggregate({ _min: { at: true } }),
    prisma.auditLog.aggregate({ where: { actorRole: "ADMIN" }, _min: { at: true } }),
    prisma.adminUsageEvent.aggregate({ _min: { at: true } }),
    prisma.adminUsageEvent.findMany({ where: { at: { gte: seit } }, distinct: ["adminUserId"], select: { adminUserId: true } }),
  ]);

  const aktion = (r: AuditZeile, mitAdmins: boolean) => ({
    aktion: r.action,
    text: AUDIT_LABEL[r.action] ?? null,
    anzahl: r.anzahl,
    letzte: minute(r.letzte),
    ...(mitAdmins ? { admins: r.admins } : {}),
  });
  const klick = (r: KlickZeile) => ({ anzahl: r.anzahl, alt: r.alt, neu: r.neu, letzte: minute(r.letzte), admins: r.admins });
  const funktionen = klicks.filter((r) => r.art === "funktion").map((r) => ({ id: r.schluessel, ...klick(r) }));
  const inGruppe = klicks.filter((r) => r.art === "gruppe").map((r) => ({ id: r.schluessel, ...klick(r) }));
  const seiten = klicks.filter((r) => r.art === "seite").map((r) => ({ pfad: r.schluessel, ...klick(r) }));
  const summe = (xs: { anzahl: number }[]) => xs.reduce((s, x) => s + x.anzahl, 0);

  return {
    tage,
    seit: minute(seit),
    datenSeit: {
      aenderungsprotokoll: minute(beginnAudit._min.at),
      aenderungsprotokollAdmin: minute(beginnAuditAdmin._min.at),
      klickmessung: minute(beginnKlicks._min.at),
    },
    summen: {
      adminAktionen: summe(admin),
      systemAktionen: summe(system),
      seitenaufrufe: summe(seiten),
      funktionsKlicks: summe(funktionen),
      gruppenKlicks: summe(inGruppe),
      verschiedeneFunktionen: new Set([...funktionen, ...inGruppe].map((f) => f.id)).size,
      verschiedeneSeiten: seiten.length,
      adminsMitKlicks: adminsAktiv.length,
    },
    hinweis:
      "admins = Anzahl verschiedener Admins (nur Zahl). funktion = Klick auf ein Element mit genau einer Funktions-ID; inGruppe = Klick in einem Element mit mehreren IDs (je ID gezählt, welche genau ist offen). System-Aktionen laufen automatisch und zählen nicht als Admin-Nutzung.",
    aktionenAdmin: admin.map((r) => aktion(r, true)),
    aktionenSystem: system.map((r) => aktion(r, false)),
    seiten,
    funktionen,
    inGruppe,
  };
}
