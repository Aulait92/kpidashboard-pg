import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { adminCheckMetaAction, openSetupAction, sendSetupReminderAction, toggleOnboardingStepAction } from "@/app/admin/vertrieb/onboarding-actions";
import { REMINDER_DAYS, loadSetupOverview, type MetaCheck } from "@/lib/selbst-einrichtung";

const fmt = (d: Date | string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

const NOTICE: Record<string, string> = {
  erinnert: "Erinnerung an den Kunden gesendet (Mail + Push).",
  "meta-ok": "Meta-Zugriff ist da: Werbekonto, Seite und Leads.",
  "meta-fehlt": "Meta-Zugriff noch unvollständig, siehe unten.",
};

/**
 * Kundenakte: Selbst-Einrichtung je Kunde – alle Schritte mit Status, letzte Meta-Prüfung,
 * Erinnerungen (Tag 1/3/7), „Erinnerung jetzt senden“ und „als erledigt markieren“.
 */
export async function SetupCard({ customerId, notice }: { customerId: string; notice?: string }) {
  const o = await loadSetupOverview(customerId);
  if (!o) {
    // Bestandskunde ohne Onboarding: Einrichtung (Kalender, WhatsApp, App, Provisionen) freischalten
    return (
      <section className="card px-4 py-3 text-sm" data-setup-card>
        <h2 className="font-medium">Selbst-Einrichtung</h2>
        <p className="mt-1 text-slate-600">
          Für diesen Kunden gibt es noch keine Einrichtung (Kunde aus der Zeit vor dem Onboarding). Freischalten zeigt ihm im Kundenbereich
          „Einrichtung“ mit den offenen Schritten: App aufs Handy, Kalender, Provisionen, WhatsApp verbinden, Einwilligung. Ohne Willkommens-Mail
          und ohne Erinnerungen.
        </p>
        <form action={openSetupAction} className="mt-3">
          <input type="hidden" name="customerId" value={customerId} />
          <button className="btn-primary">Einrichtung freischalten</button>
        </form>
      </section>
    );
  }
  const { ob, steps, progress, days } = o;
  const meta = (ob.metaCheck ?? null) as MetaCheck | null;
  const sent = (ob.setupReminders && typeof ob.setupReminders === "object" ? ob.setupReminders : {}) as Record<string, string>;
  const manual: Record<string, string> = { metaAccess: "metaAccess", consent: "consent", testLead: "testLead" };
  return (
    <section className="card" data-setup-card>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="font-medium">Selbst-Einrichtung</h2>
          <p className="text-xs text-slate-500">
            {ob.liveAt ? "Live" : `Tag ${days} seit Start der Einrichtung`} · {progress.done} von {progress.total} erledigt
          </p>
        </div>
        <span className={`badge ${progress.open.length ? "bg-sky-50 text-sky-700" : "bg-emerald-100 text-emerald-800"}`}>{progress.percent} %</span>
      </div>
      {notice ? <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm">{NOTICE[notice] ?? notice}</p> : null}
      <ul className="divide-y divide-slate-100 px-4 py-2 text-sm">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2 py-2">
            {manual[s.key] ? (
              <form action={toggleOnboardingStepAction}>
                <input type="hidden" name="id" value={ob.id} />
                <input type="hidden" name="step" value={manual[s.key]} />
                <button title={s.done ? "Zurücksetzen" : "Als erledigt markieren"} className="flex">
                  {s.done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300 hover:text-emerald-600" />}
                </button>
              </form>
            ) : s.done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-slate-300" />
            )}
            <span className={s.done ? "text-slate-500" : "text-slate-900"}>{s.label}</span>
            {!s.done ? (
              <span className={`badge ml-auto ${s.owner === "kunde" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"}`}>{s.owner === "kunde" ? "Kunde" : "Du"}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-100 px-4 py-3 text-sm">
        <p className="font-medium">Meta-Zugriff</p>
        {meta ? (
          <ul className="mt-1 space-y-1 text-xs">
            {[
              ["Werbekonto", meta.adAccount.ok, meta.adAccount.ok ? `${meta.adAccount.name ?? ""} (act_${meta.adAccount.id})` : meta.adAccount.error],
              ["Seite", meta.page.ok, meta.page.ok ? `${meta.page.name ?? ""} (${meta.page.id})` : meta.page.error],
              ["Leads", meta.leads.ok, meta.leads.ok ? "Leadformulare lesbar" : meta.leads.error],
            ].map(([l, ok, d]) => (
              <li key={String(l)} className="flex gap-1.5">
                {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />}
                <span>
                  <b>{String(l)}:</b> {String(d ?? "")}
                </span>
              </li>
            ))}
            <li className="text-slate-500">
              Zuletzt geprüft {fmt(meta.at)}
              {ob.metaRequestedAt ? ` · Anfrage von uns gesendet ${fmt(ob.metaRequestedAt)}` : ""}
            </li>
          </ul>
        ) : (
          <p className="text-xs text-slate-500">Noch nicht geprüft{ob.customer.metaAdAccountId ? ` (Werbekonto act_${ob.customer.metaAdAccountId})` : ", der Kunde hat noch keine IDs eingetragen"}.</p>
        )}
      </div>
      <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        Erinnerungen:{" "}
        {REMINDER_DAYS.map((d) => (sent[String(d)] ? `Tag ${d} ✓ (${fmt(sent[String(d)])})` : `Tag ${d} –`)).join(" · ")}
        {ob.lastReminderAt ? ` · zuletzt ${fmt(ob.lastReminderAt)}` : ""}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
        <form action={sendSetupReminderAction}>
          <input type="hidden" name="customerId" value={customerId} />
          <button className="btn-primary" disabled={!progress.open.some((s) => s.owner === "kunde")}>
            Erinnerung jetzt senden
          </button>
        </form>
        <form action={adminCheckMetaAction}>
          <input type="hidden" name="customerId" value={customerId} />
          <button className="btn-ghost" disabled={!ob.customer.metaAdAccountId && !ob.customer.metaPageId}>
            Meta-Zugriff jetzt prüfen
          </button>
        </form>
      </div>
    </section>
  );
}
