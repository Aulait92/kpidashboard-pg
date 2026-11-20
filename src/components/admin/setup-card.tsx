import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";
import { abhakenFuerKundeAction, adminCheckMetaAction, openSetupAction, restartSetupAction, sendSetupReminderAction } from "@/app/admin/vertrieb/onboarding-actions";
import { MANUAL_FIELDS, vonUnsAbgehakt } from "@/lib/onboarding";
import { REMINDER_DAYS, loadSetupOverview, type MetaCheck } from "@/lib/selbst-einrichtung";
import { consentTextFor } from "@/lib/einwilligung-leadformular-server";
import { loadErstinfo } from "@/lib/erstinformation";
import { vermittlerStatusLabel } from "@/lib/erstinformation-shared";

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
  const [consent, erstinfo] = await Promise.all([consentTextFor(customerId).catch(() => null), loadErstinfo(customerId).catch(() => null)]);
  return (
    <section className="card" data-setup-card>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="font-medium">Selbst-Einrichtung</h2>
          <p className="text-xs text-slate-500">
            {ob.liveAt ? "Live" : `Tag ${days} seit Start der Einrichtung`} · {progress.done} von {progress.total} erledigt · Schritt antippen zum Abhaken
          </p>
        </div>
        <span className={`badge ${progress.open.length ? "bg-sky-50 text-sky-700" : "bg-emerald-100 text-emerald-800"}`}>{progress.percent} %</span>
      </div>
      {notice ? <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm">{NOTICE[notice] ?? notice}</p> : null}
      <ul className="divide-y divide-slate-100 px-2 py-1 text-sm">
        {steps.map((s) => {
          // Abhaken für den Kunden (Ole, 20.11.2026): jeder offene Schritt; erledigte nur, wenn wir sie abgehakt haben
          const vonUns = s.key in MANUAL_FIELDS || (s.key === "app" && !!ob.appSkippedAt) || vonUnsAbgehakt(ob.stepSkips, s.key);
          const klickbar = !s.done || vonUns;
          const inhalt = (
            <>
              {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-slate-300 group-hover:text-emerald-600" />}
              <span className={s.done ? "text-slate-500" : "text-slate-900"}>{s.label}</span>
              <span className="ml-auto flex items-center gap-2">
                {klickbar ? (
                  <span className="hidden text-xs text-slate-500 group-hover:inline group-focus-visible:inline">{s.done ? "Zurücksetzen" : "Abhaken"}</span>
                ) : null}
                {s.done && (vonUnsAbgehakt(ob.stepSkips, s.key) || (s.key === "app" && !!ob.appSkippedAt)) ? (
                  <span className="text-xs text-slate-400 group-hover:hidden">von uns</span>
                ) : null}
                {!s.done ? (
                  <span className={`badge ${s.owner === "kunde" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"}`}>{s.owner === "kunde" ? "Kunde" : "Du"}</span>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={s.key} data-setup-step={s.key}>
              {klickbar ? (
                <form action={abhakenFuerKundeAction}>
                  <input type="hidden" name="customerId" value={customerId} />
                  <input type="hidden" name="step" value={s.key} />
                  <button
                    title={s.done ? "Haken zurücksetzen" : "Für den Kunden als erledigt markieren"}
                    className="group flex min-h-11 w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-slate-50"
                  >
                    {inhalt}
                  </button>
                </form>
              ) : (
                <div className="flex min-h-11 items-center gap-2 px-2 py-2" title="Vom Kunden erledigt">
                  {inhalt}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {consent ? (
        <div className="border-t border-slate-100 px-4 py-3 text-sm" data-admin-einwilligung>
          <p className="font-medium">Einwilligung im Leadformular (Pflicht-Häkchen, eigener Hinweis)</p>
          <p className="mt-1 select-all rounded bg-slate-50 p-2 text-xs">{consent.text}</p>
          {consent.missing.length ? <p className="mt-1 text-xs text-amber-800">Fehlt: {consent.missing.join(", ")} (Impressum prüfen).</p> : null}
          <p className="mt-1 text-xs text-slate-500">Häkchen-Schlüssel „einwilligung_kontakt“, Pflichtfeld, nicht vorausgewählt. Ohne Häkchen schreibt der Assistent nicht per WhatsApp.</p>
        </div>
      ) : null}
      {erstinfo ? (
        <div className="border-t border-slate-100 px-4 py-3 text-sm" data-admin-erstinfo>
          <p className="font-medium">Erstinformation</p>
          <p className="mt-1 text-xs">
            {vermittlerStatusLabel(erstinfo.status)}
            {erstinfo.bestaetigtAt ? "" : " (nicht bestätigt)"} · Registernummer {erstinfo.registerNummer ?? "fehlt"} ·{" "}
            {erstinfo.fileName ? "eigenes PDF" : "PDF aus den Angaben"}
            {erstinfo.fehlt.length ? ` · fehlt: ${erstinfo.fehlt.join(", ")}` : " · vollständig"}
            {erstinfo.token ? (
              <>
                {" · "}
                <a href={`/erstinformation/${erstinfo.token}/pdf`} target="_blank" rel="noreferrer" className="underline">
                  PDF
                </a>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
      <div className="border-t border-slate-100 px-4 py-3 text-sm">
        <p className="font-medium">Meta-Zugriff</p>
        {meta ? (
          <ul className="mt-1 space-y-1 text-xs">
            {[
              ["Werbekonto", meta.adAccount.ok, meta.adAccount.ok ? `${meta.adAccount.name ?? ""} (act_${meta.adAccount.id})` : meta.adAccount.geteilt ? `Freigabe angekommen, automatische Zuweisung fehlgeschlagen: act_${meta.adAccount.id} im Business Manager unserem Systemnutzer zuweisen (Systemnutzer → Assets hinzufügen).` : meta.adAccount.error],
              ["Seite", meta.page.ok, meta.page.ok ? `${meta.page.name ?? ""} (${meta.page.id})` : meta.page.geteilt ? `Freigabe angekommen, automatische Zuweisung fehlgeschlagen: Seite ${meta.page.id} unserem Systemnutzer zuweisen.` : meta.page.error],
              ["Leads", meta.leads.ok, meta.leads.ok ? "Leadformulare lesbar" : meta.leads.error],
            ].map(([l, ok, d]) => (
              <li key={String(l)} className="flex gap-1.5">
                {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />}
                <span>
                  <b>{String(l)}:</b> {String(d ?? "")}
                </span>
              </li>
            ))}
            {meta.dataset ? (
              <li className="flex gap-1.5" data-setup-dataset={meta.dataset.state}>
                {meta.dataset.state === "ok" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                )}
                <span>
                  <b>Datensatz (für CAPI, nicht nötig für den Schritt):</b>{" "}
                  {meta.dataset.state === "ok"
                    ? `${meta.dataset.name ?? ""} (${meta.dataset.id}) freigegeben`
                    : meta.dataset.state === "found_not_shared"
                      ? `${meta.dataset.name ?? ""} (${meta.dataset.id}) gefunden, aber nicht für uns freigegeben. Kunde bitten, ihn unter Partner mit voller Kontrolle freizugeben.`
                      : meta.dataset.state === "none"
                        ? "keiner im Werbekonto. Kunde bitten, im Events Manager einen anzulegen und freizugeben."
                        : meta.dataset.error}
                </span>
              </li>
            ) : null}
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
      <details className="border-t border-slate-100 px-4 py-3 text-sm" data-setup-restart>
        <summary className="cursor-pointer text-slate-600">Einrichtung neu starten</summary>
        <p className="mt-2 text-slate-600">
          Für Paketwechsel (z. B. von Nur Betreuung auf Betreuung + Software): Fragebogen und Einwilligung im Leadformular wieder offen,
          Kalender und WhatsApp bleiben offen, bis sie verbunden sind. Meta-Zugriff, Kampagne und Livegang bleiben erledigt. Leads und
          Daten bleiben unverändert.
        </p>
        <form action={restartSetupAction} className="mt-2 flex flex-wrap items-center gap-3">
          <input type="hidden" name="customerId" value={customerId} />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="confirm" required className="h-4 w-4" /> Ja, neu starten
          </label>
          <button className="btn-ghost">Einrichtung neu starten</button>
        </form>
      </details>
    </section>
  );
}
