// Änderungsprotokoll: wichtige Änderungen mit Person und Zeitpunkt festhalten.
// Schlägt das Schreiben fehl, läuft die eigentliche Aktion trotzdem weiter.
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

export type AuditActor = { id?: string | null; email?: string | null; role?: string | null };

export const AUDIT_LABEL: Record<string, string> = {
  login: "Anmeldung",
  "login.2fa": "Anmeldung mit Zwei-Faktor",
  "2fa.enable": "Zwei-Faktor eingeschaltet",
  "2fa.disable": "Zwei-Faktor ausgeschaltet",
  "user.create": "Login angelegt",
  "user.delete": "Login gelöscht",
  "user.password_reset": "Passwort zurückgesetzt",
  "user.reassign": "Login anderem Kunden zugeordnet",
  "team.invite": "Berater eingeladen",
  "team.remove": "Berater entfernt",
  "team.receives_leads": "Leads an/aus",
  "lead.reassign": "Lead umverteilt",
  "lead.export": "Leads exportiert (CSV)",
  "lead.storno": "Lead storniert",
  "pause.plan": "Pause eingetragen",
  "pause.end": "Pause beendet",
  "offer.accept": "Angebot angenommen",
  "contact.delete": "Vertriebskontakt gelöscht",
  "agent.active": "WhatsApp-Assistent an/aus",
  "leadsource.assign": "Leadformular zugeordnet",
  "leadsource.toggle": "Leadformular pausiert/aktiviert",
  "preview.start": "Kundenansicht geöffnet (Admin)",
};

export async function audit(
  action: string,
  opts: { entity?: string; entityId?: string | null; customerId?: string | null; details?: Record<string, unknown>; actor?: AuditActor } = {},
): Promise<void> {
  try {
    let actor = opts.actor;
    if (!actor) {
      const s = await getCurrentSession().catch(() => null);
      actor = s ? { id: s.userId, email: s.email, role: s.role } : { role: "system" };
    }
    await prisma.auditLog.create({
      data: {
        action,
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? null,
        actorRole: actor.role ?? null,
        entity: opts.entity ?? null,
        entityId: opts.entityId ?? null,
        customerId: opts.customerId ?? null,
        details: (opts.details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    reportError(err, "audit", { action });
  }
}

/** Einträge älter als 1 Jahr löschen (täglich im Cron). */
export async function pruneAudit(now = new Date()) {
  const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const r = await prisma.auditLog.deleteMany({ where: { at: { lt: cutoff } } });
  return r.count;
}
