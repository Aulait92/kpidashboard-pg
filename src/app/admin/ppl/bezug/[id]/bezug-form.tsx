"use client";

import { useActionState, useState } from "react";
import { Button, Card } from "@/components/ui";
import { saveSubscriptionAction, type BezugState } from "../../actions";

type Sub = {
  id: string; customerId: string; productKey: string; label: string | null; active: boolean; status: string;
  testQuantity: number | null; testDays: number | null; period: string; goal: number | null; startDate: string;
  price: number; emailSubject: string | null; emailTemplate: string | null; plzRanges: string | null; acceptWeak: boolean; weakThreshold: number | null;
  acceptCivilServants: boolean; onlyWeak: boolean; scoreFloor: number | null; insurerInclude: string[]; insurerExclude: string[];
  excludeRules: string | null; stornoDays: number | null; stornoReasons: string[]; stornoAutoApprove: boolean; delivery: string; deliveryEmail: string | null;
  webhookUrl: string | null; webhookFormat: string; hasSecret: boolean; emailFormat: string; consentText: string | null; slackNotify: boolean;
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

/** Karte; im neuen Admin (`einklappen`) mit Titel zum Aufklappen, damit Seltenes nicht die Seite füllt. */
function Abschnitt({ titel, einklappen, children }: { titel: string; einklappen?: boolean; children: React.ReactNode }) {
  if (!einklappen) return <Card>{children}</Card>;
  return (
    <Card>
      <details className="group [&>summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-12 cursor-pointer items-center px-5 text-[15px] font-semibold group-open:border-b group-open:border-[color:var(--border)]">
          <span className="flex-1">{titel}</span>
          <span className="text-xs font-normal text-[color:var(--muted)] group-open:hidden">anzeigen</span>
        </summary>
        {children}
      </details>
    </Card>
  );
}

export function BezugForm({
  sub,
  customers,
  products,
  zurueck,
  einklappen,
}: {
  sub: Sub | null;
  customers: { id: string; name: string }[];
  products: string[];
  /** Neuer Admin: nach dem Speichern dorthin statt /admin/ppl */
  zurueck?: string;
  /** Neuer Admin: Filter sowie Storno und Lieferung eingeklappt */
  einklappen?: boolean;
}) {
  const [state, action, pending] = useActionState<BezugState, FormData>(saveSubscriptionAction, {});
  const [delivery, setDelivery] = useState(sub?.delivery ?? "app");
  const [period, setPeriod] = useState(sub?.period ?? "week");
  const [status, setStatus] = useState(sub?.status ?? "live");
  const [mailKind, setMailKind] = useState(sub?.emailFormat === "maschinenlesbar" ? "maschinenlesbar" : sub?.emailTemplate ? "vorlage" : "standard");
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={sub?.id ?? ""} />
      {zurueck ? <input type="hidden" name="zurueck" value={zurueck} /> : null}
      <Card>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
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
            <Check name="slackNotify" label="Slack-Nachricht je Lead" defaultChecked={sub?.slackNotify ?? true} />
          </div>
          <F label="Preis je Lead (netto €)">
            <input name="price" inputMode="decimal" defaultValue={sub?.price ?? ""} required className={input} />
          </F>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
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

      <Abschnitt titel="Filter (PLZ, Score, Gesellschaften)" einklappen={einklappen}>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
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
      </Abschnitt>

      <Abschnitt titel="Storno und Lieferweg" einklappen={einklappen}>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <F label="Storno-Fenster (Tage)" hint="leer = kein Storno">
            <input name="stornoDays" inputMode="numeric" defaultValue={sub?.stornoDays ?? ""} className={input} />
          </F>
          <F label="Erlaubte Stornogründe (je Zeile)" hint="„Sonstiges“ kommt automatisch dazu">
            <textarea name="stornoReasons" rows={4} defaultValue={sub?.stornoReasons.join("\n") ?? ""} className={area} />
          </F>
          <div className="sm:col-span-2">
            <Check name="stornoAutoApprove" label="Reklamationen immer automatisch anerkennen" defaultChecked={sub?.stornoAutoApprove ?? false} />
            <p className="mt-1 pl-6 text-xs text-[color:var(--muted)]">
              Aus: Erlaubte Gründe werden sofort anerkannt, „Sonstiges“ und eine Stornoquote über 20 % (30 Tage) landen bei Ihnen zur Prüfung.
              An: Jede Reklamation im Storno-Fenster wird sofort anerkannt und gutgeschrieben.
            </p>
          </div>
          <F label="Lieferung">
            <select name="delivery" value={delivery} onChange={(e) => setDelivery(e.target.value)} className={input}>
              <option value="app">Kundenbereich (Login, Push, E-Mail)</option>
              <option value="app_pdf">Kundenbereich + PDF per Mail</option>
              <option value="email">Nur E-Mail</option>
              <option value="webhook">Webhook (eigene Anbindung)</option>
            </select>
          </F>
          {delivery === "email" ? (
            <>
              <F label="E-Mail-Adresse(n)" hint="Mehrere mit Komma trennen, jede Adresse bekommt eine eigene Mail.">
                <input name="deliveryEmail" defaultValue={sub?.deliveryEmail ?? ""} className={input} />
              </F>
              <F label="Mail-Vorlage">
                <select name="emailKind" value={mailKind} onChange={(e) => setMailKind(e.target.value)} className={input}>
                  <option value="standard">Standard (lesbar)</option>
                  <option value="maschinenlesbar">Standard maschinenlesbar (Make, Zapier, CRM)</option>
                  <option value="vorlage">Eigene Vorlage</option>
                </select>
              </F>
              {mailKind === "maschinenlesbar" ? (
                <div className="sm:col-span-2">
                  <F
                    label="Einwilligungstext des Funnels (optional)"
                    hint="Betreff „Neuer Lead: Produkt (Lead-ID)“, feste Zeilen „Feld: Wert“, JSON am Ende und als lead.json. Dieser Wortlaut steht in jeder Mail."
                  >
                    <textarea name="consentText" rows={3} defaultValue={sub?.consentText ?? ""} className={area} />
                  </F>
                </div>
              ) : mailKind === "vorlage" ? (
                <>
                  <F label="Betreff (optional)" hint="Standard: Neuer Lead - Performancegrowth">
                    <input name="emailSubject" defaultValue={sub?.emailSubject ?? ""} className={input} />
                  </F>
                  <div className="sm:col-span-2">
                    <F
                      label="Vorlage (für Systeme, die die Mail auslesen)"
                      hint="Platzhalter: {anrede} {vorname} {nachname} {name} {strasse} {plz} {ort} {geburtsdatum} {berufsstatus} {email} {telefon} {versicherer} {versicherungsart} {beitrag} {id} sowie jedes Formularfeld als {Feldname}. Zeilen ohne Wert entfallen."
                    >
                      <textarea name="emailTemplate" rows={8} defaultValue={sub?.emailTemplate ?? ""} className={`${area} font-mono text-xs`} />
                    </F>
                  </div>
                </>
              ) : null}
            </>
          ) : delivery === "app_pdf" ? (
            <>
              <F label="E-Mail-Adresse(n) für das PDF" hint="Lead im Kundenbereich, dazu je Adresse eine Mail mit dem Lead als PDF.">
                <input name="deliveryEmail" defaultValue={sub?.deliveryEmail ?? ""} className={input} />
              </F>
              <F label="Einwilligungstext des Funnels (optional)" hint="Steht wörtlich im PDF.">
                <textarea name="consentText" rows={2} defaultValue={sub?.consentText ?? ""} className={area} />
              </F>
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
      </Abschnitt>
      {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : null}
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Speichern …" : "Speichern"}
      </Button>
    </form>
  );
}
