import { CheckCircle2, Circle } from "lucide-react";
import type { ChecklistItem } from "@/lib/onboarding";
import type { ImpressumInfo } from "@/lib/impressum";
import { checklistProgress } from "@/lib/onboarding";
import { adminEndPauseAction, adminPlanPauseAction, goLiveAction, resendWelcomeAction, startOnboardingAction, toggleOnboardingStepAction } from "@/app/admin/vertrieb/onboarding-actions";

const OWNER: Record<ChecklistItem["owner"], { label: string; cls: string }> = {
  kunde: { label: "Kunde", cls: "bg-sky-50 text-sky-700" },
  du: { label: "Du", cls: "bg-amber-50 text-amber-800" },
  auto: { label: "automatisch", cls: "bg-slate-100 text-slate-600" },
};

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

export function OnboardingCard({
  onboarding,
  items,
  customerName,
  loginEmail,
  feedback = [],
  websiteInfo = null,
}: {
  onboarding: { id: string; package: string; startDate: Date | null; liveAt: Date | null; helpCallAt?: Date | null; helpCallUrl?: string | null };
  items: ChecklistItem[];
  customerName: string;
  loginEmail: string | null;
  feedback?: { kind: string; score: number | null; comment: string | null; answeredAt: Date | null }[];
  websiteInfo?: ImpressumInfo | null;
}) {
  const p = checklistProgress(items);
  const open = items.filter((i) => !i.done);
  const waitingCustomer = open.filter((i) => i.owner === "kunde").length;
  const waitingYou = open.filter((i) => i.owner === "du").length;
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="font-medium">Onboarding</h2>
          <p className="text-xs text-slate-500">
            {customerName} · {onboarding.package === "service" ? "Nur Betreuung" : "Betreuung + Software"}
            {onboarding.startDate ? ` · Start ${onboarding.startDate.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}` : ""}
          </p>
        </div>
        <span className={`badge ${onboarding.liveAt ? "bg-emerald-100 text-emerald-800" : "bg-sky-50 text-sky-700"}`}>
          {onboarding.liveAt ? "Live" : `${p.percent} %`}
        </span>
      </div>
      <div className="px-4 pt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${p.percent}%` }} />
        </div>
        {!onboarding.liveAt && (
          <p className="mt-2 text-xs text-slate-500">
            Offen: {waitingCustomer} beim Kunden, {waitingYou} bei dir
          </p>
        )}
      </div>
      <ul className="divide-y divide-slate-100 px-4 py-2 text-sm">
        {items
          .filter((i) => i.key !== "live")
          .map((i) => (
            <li key={i.key} className="flex items-center gap-2 py-2">
              {i.manual ? (
                <form action={toggleOnboardingStepAction}>
                  <input type="hidden" name="id" value={onboarding.id} />
                  <input type="hidden" name="step" value={i.manual} />
                  <button title={i.done ? "Zurücksetzen" : "Als erledigt markieren"} className="flex">
                    {i.done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300 hover:text-emerald-600" />}
                  </button>
                </form>
              ) : i.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-slate-300" />
              )}
              <span className={i.done ? "text-slate-500" : "text-slate-900"}>{i.label}</span>
              <span className="ml-auto flex items-center gap-2">
                {i.at && <span className="text-xs text-slate-400">{fmt(i.at)}</span>}
                {!i.done && <span className={`badge ${OWNER[i.owner].cls}`}>{OWNER[i.owner].label}</span>}
              </span>
            </li>
          ))}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
        <form action={goLiveAction}>
          <input type="hidden" name="id" value={onboarding.id} />
          <button className={onboarding.liveAt ? "btn-ghost" : "btn-primary"}>{onboarding.liveAt ? "Live zurücknehmen" : "Live schalten"}</button>
        </form>
        <form action={resendWelcomeAction}>
          <input type="hidden" name="id" value={onboarding.id} />
          <button className="btn-ghost">Willkommens-Mail erneut senden</button>
        </form>
      </div>
      {onboarding.helpCallAt ? (
        <p className="border-t border-slate-100 px-4 py-3 text-sm">
          🛟 Hilfetermin: <b>{fmt(onboarding.helpCallAt)} Uhr</b>
          {onboarding.helpCallUrl ? (
            <>
              {" · "}
              <a href={onboarding.helpCallUrl} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">Video-Call ↗</a>
            </>
          ) : null}
        </p>
      ) : null}
      <ImpressumBlock info={websiteInfo} />
      {feedback.length > 0 && (
        <ul className="space-y-1 border-t border-slate-100 px-4 py-3 text-sm">
          {feedback.map((f) => (
            <li key={f.kind}>
              <span className="text-slate-500">Feedback {f.kind === "day7" ? "Tag 7" : "Tag 30"}: </span>
              {f.answeredAt ? (
                <>
                  <b className={f.score != null && f.score <= 2 ? "text-rose-700" : f.score != null && f.score >= 4 ? "text-emerald-700" : ""}>{f.score}/5</b>
                  {f.comment ? <span className="text-slate-600">: „{f.comment}“</span> : null}
                </>
              ) : (
                <span className="text-slate-400">verschickt, noch keine Antwort</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {loginEmail && <p className="px-4 pb-3 text-xs text-slate-500">Kunden-Login: {loginEmail}</p>}
    </section>
  );
}

export function StartOnboardingCard({
  offerId,
  offerNumber,
  customers,
}: {
  offerId: string;
  offerNumber: string;
  customers: { id: string; name: string }[];
}) {
  return (
    <section className="card p-4">
      <h2 className="font-medium">Onboarding</h2>
      <p className="mt-1 text-sm text-slate-600">
        Angebot {offerNumber} ist angenommen. Das Onboarding startet automatisch, sobald die Zahlung eingerichtet ist –
        oder hier von Hand (z. B. für Bestandskunden).
      </p>
      <form action={startOnboardingAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="offerId" value={offerId} />
        <select name="customerId" className="input" defaultValue="">
          <option value="">Neues Kundenkonto anlegen</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              Bestehendes Konto: {c.name}
            </option>
          ))}
        </select>
        <button className="btn-primary">Onboarding starten</button>
      </form>
    </section>
  );
}

function ImpressumBlock({ info }: { info: ImpressumInfo | null }) {
  if (!info) {
    return <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">Impressum der Website wird in Kürze automatisch gelesen …</p>;
  }
  const rows: [string, string | null][] = [
    ["Firma", info.companyName],
    ["Inhaber", info.representative],
    ["Anschrift", info.address],
    ["Telefon", info.phone],
    ["E-Mail", info.email],
    ["Vermittlerregister", info.registerNumber],
    ["Status", info.registerType],
    ["Registerstelle", info.chamber],
  ];
  return (
    <div className="border-t border-slate-100 px-4 py-3 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 text-xs">
        <span className="font-medium text-slate-700">Pflichtangaben (aus dem Impressum)</span>
        {info.impressumUrl && <a href={info.impressumUrl} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">Impressum ↗</a>}
        {info.privacyUrl && <a href={info.privacyUrl} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">Datenschutz ↗</a>}
      </div>
      {info.error ? (
        <p className="text-xs text-amber-700">{info.error}</p>
      ) : (
        <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-0.5 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd className={v ? "text-slate-800" : "text-slate-400"}>{v ?? "–"}</dd>
            </div>
          ))}
        </dl>
      )}
      {info.missing.length > 0 && !info.error && <p className="mt-1 text-xs text-amber-700">Fehlt: {info.missing.join(", ")}</p>}
    </div>
  );
}

export function AdminPauseCard({
  customerId,
  contactId,
  pause,
  error,
  today,
}: {
  customerId: string;
  contactId: string;
  pause: { status: string; startsAt: Date; endsAt: Date | null; adsNote: string | null; reason: string | null } | null;
  error?: string | null;
  today: string;
}) {
  const d = (x: Date) => x.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  return (
    <section className="card p-4">
      <h2 className="mb-2 font-medium">Pause / Urlaub</h2>
      {error ? <p className="mb-2 text-sm text-rose-700">{error}</p> : null}
      {pause ? (
        <div className="space-y-2 text-sm">
          <p className={pause.status === "active" ? "text-amber-800" : "text-sky-800"}>
            {pause.status === "active" ? "Pausiert seit " : "Geplant ab "}
            {d(pause.startsAt)}
            {pause.endsAt ? `, Neustart ${d(pause.endsAt)}` : ", offen"}
            {pause.reason ? ` · ${pause.reason}` : ""}
          </p>
          {pause.adsNote ? <p className="text-xs text-slate-500">Anzeigen: {pause.adsNote}</p> : null}
          <form action={adminEndPauseAction}>
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="contactId" value={contactId} />
            <button className="btn-ghost">{pause.status === "active" ? "Jetzt fortsetzen" : "Geplante Pause absagen"}</button>
          </form>
        </div>
      ) : (
        <form action={adminPlanPauseAction} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="contactId" value={contactId} />
          <div>
            <label className="label">Pause ab</label>
            <input type="date" name="from" required min={today} defaultValue={today} className="input" />
          </div>
          <div>
            <label className="label">Neustart am</label>
            <input type="date" name="until" required min={today} className="input" />
          </div>
          <input name="reason" placeholder="Grund (optional)" className="input sm:col-span-2" />
          <button className="btn-ghost sm:col-span-2">Pause eintragen</button>
        </form>
      )}
    </section>
  );
}
