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
  "login.failed": "Anmeldung fehlgeschlagen",
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
  "vertrieb.neuimport": "Vertrieb neu übernommen (Cold CRM bzw. Testumgebung)",
  "vertrieb.verknuepft": "Vertriebskontakt mit Kundenakte verknüpft",
  "vertrieb.verknuepfung_geloest": "Verknüpfung Vertriebskontakt – Kundenakte gelöst",
  "kpi.kosten": "Laufende Kosten geändert",
  "kpi.einstellungen": "Einstellungen der Zahlen-Seite geändert",
  "login_info.update": "Infokarte der Login-Seite geändert",
  "garantie.fall": "Garantiefall angelegt (automatisch)",
  "garantie.gewaehrt": "Garantie gewährt (Gutschrift)",
  "garantie.abgelehnt": "Garantie abgelehnt",
  "storno.approve": "Storno genehmigt",
  "storno.reject": "Storno abgelehnt",
  "ppl.order": "Leads bestellt",
  "ppl.subscription": "Bezug geändert",
  "bestand.import": "Bestandskunden importiert",
  "bestand.campaign": "Bestandskunden-Kampagne gestartet",
  "bestand.module": "Modul Bestandskunden an/aus",
  "billing.seats": "Logins in der Abrechnung angepasst",
  "billing.bestand": "Bestandskunden-Modul gebucht/abbestellt",
  "billing.interval": "Zahlweise geändert",
  "bestand.request": "Bestandskunden-Modul angefragt",
  "bestand.quota": "Kampagnen-Kontingent geändert",
  "customer.new_ui": "Neue Oberfläche (Vertreter-A) an/aus",
  "customer.provision": "Provisionssätze / Vermittlertyp geändert",
  "admin.new_ui": "Neue Admin-Oberfläche an/aus",
  "lead.erase": "Lead-Daten gelöscht (Datenschutz)",
  "customer.meta_account": "Meta-Werbekonto hinterlegt",
  "customer.erase": "Kundendaten gelöscht (Vertragsende)",
  "pause.plan": "Pause eingetragen",
  "pause.end": "Pause beendet",
  "absence.create": "Abwesenheit eingetragen",
  "absence.change": "Abwesenheit geändert",
  "absence.end": "Abwesenheit beendet",
  "absence.reschedule": "Termine wegen Abwesenheit verschoben",
  "absence.handover": "Termine an Vertretung übergeben",
  "absence.undo_tasks": "Aufgaben-Verschiebung rückgängig gemacht",
  "offer.accept": "Angebot angenommen",
  "contact.delete": "Vertriebskontakt gelöscht",
  "agent.active": "WhatsApp-Assistent an/aus",
  "agent.sequences": "Automatisch nachfassen an/aus",
  "lead.sequence_stop": "Automatisches Nachfassen gestoppt",
  "leadsource.assign": "Leadformular zugeordnet",
  "leadsource.toggle": "Leadformular pausiert/aktiviert",
  "preview.start": "Kundenansicht geöffnet (Admin)",
  "rechner.config": "Rechner-Einstellungen geändert",
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Einträge älter als 1 Jahr löschen, Fehlversuche beim Login nach 30 Tagen (täglich im Cron). */
export async function pruneAudit(now = new Date()) {
  const r = await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { at: { lt: new Date(now.getTime() - 365 * DAY_MS) } },
        { action: "login.failed", at: { lt: new Date(now.getTime() - 30 * DAY_MS) } },
      ],
    },
  });
  return r.count;
}
