"use client";

import { useActionState, useState } from "react";
import { Button, Card } from "@/components/ui";
import { saveSubscriptionAction, type BezugState } from "../../actions";

type Sub = {
  id: string; customerId: string; productKey: string; label: string | null; active: boolean; status: string;
  testQuantity: number | null; testDays: number | null; period: string; goal: number | null; startDate: string;
  price: number; emailSubject: string | null; emailTemplate: string | null; plzRanges: string | null; acceptWeak: boolean; weakThreshold: number | null;
  acceptCivilServants: boolean; onlyWeak: boolean; scoreFloor: number | null; insurerInclude: string[]; insurerExclude: string[];
  excludeRules: string | null; stornoDays: number | null; stornoReasons: string[]; delivery: string; deliveryEmail: string | null;
  webhookUrl: string | null; webhookFormat: string; hasSecret: boolean;
};

const input = "mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--brand)]";
const area = "mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--brand)]";

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-[color:var(--muted)]">
      {label}
      {children}
      {hint ? <span className="mt-1 block font-normal">{hint}</span> : null}
    </label>
  );
}
function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />
      {label}
    </label>
  );
}

export function BezugForm({ sub, customers, products }: { sub: Sub | null; customers: { id: string; name: string }[]; products: string[] }) {
  const [state, action, pending] = useActionState<BezugState, FormData>(saveSubscriptionAction, {});
  const [delivery, setDelivery] = useState(sub?.delivery ?? "app");
  const [period, setPeriod] = useState(sub?.period ?? "week");
  const [status, setStatus] = useState(sub?.status ?? "live");
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={sub?.id ?? ""} />
      <Card>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <F label="Käufer">
            <select name="customerId" defaultValue={sub?.customerId ?? ""} required className={input}>
              <option value="">Bitte wählen</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </F>
          <F label="Produkt (Pool)" hint="Wie im Eingang: ?produkt=…">
            <input name="productKey" list="ppl-products" defaultValue={sub?.productKey ?? ""} required className={input} />
            <datalist id="ppl-products">
              {products.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </F>
          <F label="Bezeichnung (optional)">
            <input name="label" defaultValue={sub?.label ?? ""} className={input} placeholder="z. B. PKV Bayern" />
          </F>
          <div className="flex flex-col justify-end gap-2">
            <Check name="active" label="Aktiv (bekommt Leads)" defaultChecked={sub?.active ?? true} />
          </div>
          <F label="Preis je Lead (netto €)">
            <input name="price" inputMode="decimal" defaultValue={sub?.price ?? ""} required className={input} />
          </F>
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <F label="Kontingent">
            <select name="period" value={period} onChange={(e) => setPeriod(e.target.value)} className={input}>
              <option value="week">Wochenbestellung (Käufer bestellt und zahlt vorab)</option>
              <option value="month">Monatsziel (von Hand)</option>
              <option value="once">Einmaliges Kontingent (von Hand)</option>
            </select>
          </F>
          {period !== "week" ? (
            <F label="Ziel (Leads)">
              <input name="goal" inputMode="numeric" defaultValue={sub?.goal ?? ""} className={input} />
            </F>
          ) : (
            <div />
          )}
          <F label="Start (optional)">
            <input type="date" name="startDate" defaultValue={sub?.startDate ?? ""} className={input} />
          </F>
          <F label="Phase">
            <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
              <option value="live">Live</option>
              <option value="test">Test (Vorrang bis Probemenge)</option>
            </select>
          </F>
          {status === "test" ? (
            <>
              <F label="Probemenge">
                <input name="testQuantity" inputMode="numeric" defaultValue={sub?.testQuantity ?? ""} className={input} />
              </F>
              <F label="verteilt über Tage (leer = sofort)">
                <input name="testDays" inputMode="numeric" defaultValue={sub?.testDays ?? ""} className={input} />
              </F>
            </>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <F label="PLZ-Bereiche" hint="z. B. 80000-85999|70000-72199 · leer = alle">
            <input name="plzRanges" defaultValue={sub?.plzRanges ?? ""} className={input} />
          </F>
          <F label="Mindest-Score (optional)">
            <input name="scoreFloor" inputMode="numeric" defaultValue={sub?.scoreFloor ?? ""} className={input} />
          </F>
          <div className="space-y-2">
            <Check name="acceptWeak" label="Nimmt schwache Leads" defaultChecked={sub?.acceptWeak ?? true} />
            <Check name="acceptCivilServants" label="Nimmt Beamte" defaultChecked={sub?.acceptCivilServants ?? true} />
            <Check name="onlyWeak" label="Nur schwache Leads" defaultChecked={sub?.onlyWeak ?? false} />
          </div>
          <F label="„Schwach“ unter Beitrag (€)" hint="Standard 700 €; Beamte immer schwach">
            <input name="weakThreshold" inputMode="numeric" defaultValue={sub?.weakThreshold ?? ""} className={input} />
          </F>
          <F label="Nur diese Gesellschaften (Komma)">
            <textarea name="insurerInclude" rows={2} defaultValue={sub?.insurerInclude.join(", ") ?? ""} className={area} />
          </F>
          <F label="Ohne diese Gesellschaften (Komma)">
            <textarea name="insurerExclude" rows={2} defaultValue={sub?.insurerExclude.join(", ") ?? ""} className={area} />
          </F>
          <F label="Weitere Ausschlussregeln" hint="feld=Wert1,Wert2|feld2=…">
            <input name="excludeRules" defaultValue={sub?.excludeRules ?? ""} className={input} />
          </F>
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <F label="Storno-Fenster (Tage)" hint="leer = kein Storno">
            <input name="stornoDays" inputMode="numeric" defaultValue={sub?.stornoDays ?? ""} className={input} />
          </F>
          <F label="Erlaubte Stornogründe (je Zeile)" hint="„Sonstiges“ kommt automatisch dazu und wird geprüft">
            <textarea name="stornoReasons" rows={4} defaultValue={sub?.stornoReasons.join("\n") ?? ""} className={area} />
          </F>
          <F label="Lieferung">
            <select name="delivery" value={delivery} onChange={(e) => setDelivery(e.target.value)} className={input}>
              <option value="app">Kundenbereich (Login, Push, E-Mail)</option>
              <option value="email">Nur E-Mail</option>
              <option value="webhook">Webhook (eigene Anbindung)</option>
            </select>
          </F>
          {delivery === "email" ? (
            <>
              <F label="E-Mail-Adresse(n)">
                <input name="deliveryEmail" defaultValue={sub?.deliveryEmail ?? ""} className={input} />
              </F>
              <F label="Betreff (optional)" hint="Standard: Neuer Lead - Performancegrowth">
                <input name="emailSubject" defaultValue={sub?.emailSubject ?? ""} className={input} />
              </F>
              <div className="sm:col-span-2">
                <F
                  label="Vorlage (optional, für Systeme, die die Mail auslesen)"
                  hint="Platzhalter: {anrede} {vorname} {nachname} {name} {strasse} {plz} {ort} {geburtsdatum} {berufsstatus} {email} {telefon} {versicherer} {versicherungsart} {beitrag} {id} sowie jedes Formularfeld als {Feldname}. Zeilen ohne Wert entfallen. Leer = Standard-Mail."
                >
                  <textarea name="emailTemplate" rows={8} defaultValue={sub?.emailTemplate ?? ""} className={`${area} font-mono text-xs`} />
                </F>
              </div>
            </>
          ) : delivery === "webhook" ? (
            <>
              <F label="Webhook-Adresse (https)">
                <input name="webhookUrl" defaultValue={sub?.webhookUrl ?? ""} className={input} />
              </F>
              <F label="Format">
                <select name="webhookFormat" defaultValue={sub?.webhookFormat ?? "standard"} className={input}>
                  <option value="standard">Standard (JSON, Secret im Header)</option>
                  <option value="convexa">Convexa (FirstName, LastName, …; Token in der Adresse)</option>
                </select>
              </F>
              <F label="Secret (Header X-Webhook-Secret)" hint={sub?.hasSecret ? "Gespeichert. Leer lassen = unverändert." : undefined}>
                <input name="webhookSecret" type="password" autoComplete="off" className={input} />
              </F>
            </>
          ) : null}
        </div>
      </Card>
      {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : null}
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Speichern …" : "Speichern"}
      </Button>
    </form>
  );
}
