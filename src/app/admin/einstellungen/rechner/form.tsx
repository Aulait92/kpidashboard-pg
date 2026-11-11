"use client";

import { startTransition, useActionState, useState } from "react";
import { saveRechnerAction, type RechnerFormState } from "./actions";
import type { CplData, RechnerConfig, RechnerProduct } from "@/lib/rechner";

// Formular: Zahlen als Text (Komma erlaubt), Prozentfelder in % – beim
// Speichern in Anteile umgerechnet und auf dem Server geprüft.
type Row = Record<keyof RechnerProduct, string | boolean>;

const PCT: (keyof RechnerProduct)[] = ["vertreterRate", "vertreterTrail", "maklerRate", "maklerTrail", "customerRate", "terminRate"];
const fmt = (n: number) => String(Math.round(n * 10000) / 10000).replace(".", ",");

function toRow(p: RechnerProduct): Row {
  const r = {} as Row;
  for (const [k, v] of Object.entries(p) as [keyof RechnerProduct, unknown][]) {
    if (typeof v === "boolean") r[k] = v;
    else if (typeof v === "number") r[k] = PCT.includes(k) ? fmt(v * 100) : fmt(v);
    else r[k] = v == null ? "" : String(v);
  }
  return r;
}

function fromRow(r: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "boolean") out[k] = v;
    else if (PCT.includes(k as keyof RechnerProduct)) {
      const n = Number(String(v).replace(",", "."));
      out[k] = String(v).trim() === "" || !Number.isFinite(n) ? v : n / 100;
    } else out[k] = k === "provisionKey" && v === "" ? null : v;
  }
  return out;
}

const NEW_PRODUCT: RechnerProduct = {
  key: "", name: "", active: false, maklerOnly: false, match: "", provisionKey: null, kind: "percent",
  vertreterRate: 0.5, vertreterTrail: 0, maklerRate: 0, maklerTrail: 0.225, months: 10,
  cpl: 10, cplNote: "Annahme", cplOverride: false, cplMakler: null, cplMaklerNote: "", customerRate: 0.1, contractsPerCustomer: 1, terminRate: 0, premium: 500, minLeads30: null,
};

export function RechnerForm({ config, dataInfo }: { config: RechnerConfig; dataInfo: Record<string, CplData> }) {
  const [rows, setRows] = useState<Row[]>(() => config.products.map(toRow));
  const [texts, setTexts] = useState({ headline: config.headline, intro: config.intro, footer: config.footer, contactUrl: config.contactUrl, contactLabel: config.contactLabel, termsUrl: config.termsUrl });
  const [g, setG] = useState(config.guarantees);
  const [state, action, pending] = useActionState<RechnerFormState, FormData>(saveRechnerAction, {});

  const payload = JSON.stringify({ ...texts, products: rows.map(fromRow), guarantees: g });
  const upd = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <form
      // Kein <form action>: React setzt das Formular danach zurück und die
      // Schalter zeigen den alten Stand, obwohl der Zustand stimmt.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-5"
    >
      <input type="hidden" name="config" value={payload} />

      <section className={card}>
        <h2 className="text-base font-semibold">Produkte</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">Aktive Produkte erscheinen im Rechner. Quoten und Kosten sind Startwerte, die Besucher ändern können.</p>
        <div className="space-y-3">
          {rows.map((r, i) => {
            const data = dataInfo[String(r.key)];
            const own = r.provisionKey === "" || r.provisionKey == null;
            return (
              <details key={i} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3" open={i === 0}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{String(r.name) || "Neues Produkt"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.active ? "aktiv" : "aus"}</span>
                  {r.maklerOnly ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">nur Makler</span> : null}
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <F label="Name"><input className={inp} value={String(r.name)} onChange={(e) => upd(i, { name: e.target.value })} /></F>
                  <F label="Schlüssel (für Links)"><input className={inp} value={String(r.key)} onChange={(e) => upd(i, { key: e.target.value })} placeholder="z. B. tkv" /></F>
                  <Check label="Aktiv" checked={!!r.active} onChange={(v) => upd(i, { active: v })} />
                  <Check label="Nur für Makler" checked={!!r.maklerOnly} onChange={(v) => upd(i, { maklerOnly: v })} />
                  <F label="Provision wie „Meine Provisionen“">
                    <select className={inp} value={String(r.provisionKey ?? "")} onChange={(e) => upd(i, { provisionKey: e.target.value })}>
                      <option value="tkv">TKV</option>
                      <option value="privatschutz">Privatschutz</option>
                      <option value="pkv">PKV (Monatsbeiträge)</option>
                      <option value="">Eigene Werte</option>
                    </select>
                  </F>
                  {own ? (
                    <F label="Art">
                      <select className={inp} value={String(r.kind)} onChange={(e) => upd(i, { kind: e.target.value })}>
                        <option value="percent">% vom Jahresbeitrag</option>
                        <option value="monthly">Monatsbeiträge</option>
                      </select>
                    </F>
                  ) : <span />}
                  {own && r.kind === "percent" ? (
                    <>
                      <F label="Vertreter: Abschluss %"><input className={inp} value={String(r.vertreterRate)} onChange={(e) => upd(i, { vertreterRate: e.target.value })} /></F>
                      <F label="Vertreter: Bestand % p. a."><input className={inp} value={String(r.vertreterTrail)} onChange={(e) => upd(i, { vertreterTrail: e.target.value })} /></F>
                      <F label="Makler: Abschluss %"><input className={inp} value={String(r.maklerRate)} onChange={(e) => upd(i, { maklerRate: e.target.value })} /></F>
                      <F label="Makler: Bestand % p. a."><input className={inp} value={String(r.maklerTrail)} onChange={(e) => upd(i, { maklerTrail: e.target.value })} /></F>
                    </>
                  ) : null}
                  {own && r.kind === "monthly" ? (
                    <F label="Monatsbeiträge"><input className={inp} value={String(r.months)} onChange={(e) => upd(i, { months: e.target.value })} /></F>
                  ) : null}
                  <F label={r.kind === "monthly" || r.provisionKey === "pkv" ? "Ø Monatsbeitrag €" : "Ø Jahresbeitrag €"}><input className={inp} value={String(r.premium)} onChange={(e) => upd(i, { premium: e.target.value })} /></F>
                  <F label="Leads, die Kunde werden %"><input className={inp} value={String(r.customerRate)} onChange={(e) => upd(i, { customerRate: e.target.value })} /></F>
                  <F label="Verträge pro Kunde"><input className={inp} value={String(r.contractsPerCustomer)} onChange={(e) => upd(i, { contractsPerCustomer: e.target.value })} /></F>
                  <F label="Leads mit Termin % (nur Info, 0 = aus)"><input className={inp} value={String(r.terminRate)} onChange={(e) => upd(i, { terminRate: e.target.value })} /></F>
                  <F label="Kosten pro Lead € (Erfahrungswert mit Puffer)"><input className={inp} value={String(r.cpl)} onChange={(e) => upd(i, { cpl: e.target.value })} /></F>
                  <F label="Hinweis zu den Kosten"><input className={inp} value={String(r.cplNote)} onChange={(e) => upd(i, { cplNote: e.target.value })} placeholder="z. B. real zuletzt ca. 2 €" /></F>
                  <F label="Kosten pro Lead € im Makler-Modus (leer = wie oben)"><input className={inp} value={String(r.cplMakler)} onChange={(e) => upd(i, { cplMakler: e.target.value })} placeholder="z. B. 4" /></F>
                  <F label="Hinweis zum Makler-Wert"><input className={inp} value={String(r.cplMaklerNote)} onChange={(e) => upd(i, { cplMaklerNote: e.target.value })} placeholder="z. B. reales Ergebnis" /></F>
                  <F label="Text in Lead-Quelle/Kampagne (für echte Daten)"><input className={inp} value={String(r.match)} onChange={(e) => upd(i, { match: e.target.value })} /></F>
                  <Check label="Immer Erfahrungswert (echte Daten ignorieren)" checked={!!r.cplOverride} onChange={(v) => upd(i, { cplOverride: v })} />
                  <F label="Lead-Garantie: Mindest-Leads in 30 Tagen (leer = keine)"><input className={inp} value={String(r.minLeads30 ?? "")} onChange={(e) => upd(i, { minLeads30: e.target.value })} /></F>
                  <p className="text-xs text-[color:var(--muted)] sm:col-span-2">
                    Echte Daten (180 Tage): {data ? `${data.cpl.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} pro Lead aus ${data.leads.toLocaleString("de-DE")} Leads` : "zu wenig Daten (mind. 200 Leads mit Kosten)"}
                  </p>
                  <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} className="justify-self-start text-sm text-rose-600 hover:underline">Produkt entfernen</button>
                </div>
              </details>
            );
          })}
        </div>
        <button type="button" onClick={() => setRows((rs) => [...rs, toRow(NEW_PRODUCT)])} className="mt-3 text-sm font-medium text-[color:var(--brand)]">+ Produkt</button>
      </section>

      <section className={card}>
        <h2 className="text-base font-semibold">Garantien</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">Eingeschaltete Garantien erscheinen im Rechner als Kasten „Ihre Sicherheit“. Texte bitte vorher rechtlich prüfen lassen.</p>
        {(["leads", "breakEven", "productSwap"] as const).map((k) => (
          <div key={k} className="mb-4 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
            <Check label={`${g[k].title} anzeigen`} checked={g[k].enabled} onChange={(v) => setG({ ...g, [k]: { ...g[k], enabled: v } })} />
            <div className="mt-2 grid gap-2">
              <F label="Titel"><input className={inp} value={g[k].title} onChange={(e) => setG({ ...g, [k]: { ...g[k], title: e.target.value } })} /></F>
              <F label="Text"><textarea className={`${inp} h-auto py-2`} rows={3} value={g[k].text} onChange={(e) => setG({ ...g, [k]: { ...g[k], text: e.target.value } })} /></F>
              {k === "leads" ? (
                <F label="Gilt ab Werbebudget € pro Tag (Mindest-Leads je Produkt oben)">
                  <input className={inp} value={String(g.leads.minBudgetPerDay)} onChange={(e) => setG({ ...g, leads: { ...g.leads, minBudgetPerDay: Number(e.target.value.replace(",", ".")) || 0 } })} />
                </F>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <section className={card}>
        <h2 className="mb-3 text-base font-semibold">Texte und Kontakt</h2>
        <div className="grid gap-3">
          <F label="Überschrift"><input className={inp} value={texts.headline} onChange={(e) => setTexts({ ...texts, headline: e.target.value })} /></F>
          <F label="Einleitung"><textarea className={`${inp} h-auto py-2`} rows={2} value={texts.intro} onChange={(e) => setTexts({ ...texts, intro: e.target.value })} /></F>
          <F label="Kleingedrucktes"><textarea className={`${inp} h-auto py-2`} rows={2} value={texts.footer} onChange={(e) => setTexts({ ...texts, footer: e.target.value })} /></F>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Kontakt-Knopf"><input className={inp} value={texts.contactLabel} onChange={(e) => setTexts({ ...texts, contactLabel: e.target.value })} /></F>
            <F label="Kontakt-Link (https://, mailto: oder tel:)"><input className={inp} value={texts.contactUrl} onChange={(e) => setTexts({ ...texts, contactUrl: e.target.value })} /></F>
          </div>
          <F label="AGB-Link unter den Garantien (/rechtliches/agb oder https://)"><input className={inp} value={texts.termsUrl} onChange={(e) => setTexts({ ...texts, termsUrl: e.target.value })} /></F>
        </div>
      </section>

      {state.errors?.length ? (
        <ul className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : null}
      {state.ok ? <p className="text-sm font-medium text-emerald-700">Gespeichert. Der Rechner zeigt die neuen Werte.</p> : null}
      <button disabled={pending} className="h-10 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 font-semibold text-white hover:bg-[color:var(--brand-dark)] disabled:opacity-60">
        {pending ? "Speichere …" : "Speichern"}
      </button>
    </form>
  );
}

const card = "rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5";
const inp = "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm outline-none focus:border-[color:var(--brand)]";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
