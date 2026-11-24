"use client";

// „Ihre erste Woche“ auf der Angebotsseite (Ole, 20.11.2026; nur Pay-per-Lead + Software mit Lead-Produkt):
// Anzahl wählen, jede Woche wiederholen, Registernummer. Verbindlich prüft und rechnet der Server (lib/offers.ts).

import type { Dispatch, SetStateAction } from "react";
import { Minus, Plus } from "lucide-react";
import { ERSTE_WOCHE_MIN, ERSTE_WOCHE_MAX, ersteWocheBetrag } from "@/lib/ppl/erste-woche-shared";
import { bruttoJeLead } from "@/lib/ppl/steuer";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const field =
  "mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

export type ErsteWocheProps = {
  name: string;
  productKey: string;
  price: number;
  quantity: number;
  /** Software im Monat netto (eigene Rechnung) */
  softwareMonatlich: number;
  /** Vorschlag aus Erstinformation bzw. Kundenkonto */
  registerVorschlag: string | null;
  /** „Nur Leads“ (24.11.2026): „Ihre erste Bestellung“, ohne Software, Wiederholung standardmäßig aus */
  nurLeads?: boolean;
};

/** Gewählte Anzahl und Wiederholung liegen im Annahmeformular (für „Das vereinbaren Sie mit dem Klick“). */
export type ErsteWocheWahlState = { qty: number; setQty: Dispatch<SetStateAction<number>>; autoRenew: boolean; setAutoRenew: (v: boolean) => void };

export function ErsteWocheFelder({ qty, setQty, autoRenew, setAutoRenew, ...p }: ErsteWocheProps & ErsteWocheWahlState) {
  const betrag = ersteWocheBetrag(p, qty);
  const frei = betrag.steuer === "steuerfrei_4_11";
  const step = qty >= 50 ? 10 : 5;
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 text-sm sm:p-5" data-erste-woche>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-base font-semibold">{p.nurLeads ? "Ihre erste Bestellung" : "Ihre erste Woche"}</div>
        <div className="text-[color:var(--muted)]">
          {p.name} · {eur(bruttoJeLead(p.price, betrag.steuer))} je Lead
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white">
          <button type="button" aria-label="Weniger" onClick={() => setQty((q) => Math.max(ERSTE_WOCHE_MIN, q - step))} className="flex h-11 w-11 items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
            <Minus className="h-4 w-4" />
          </button>
          <input
            name="ersteWocheMenge"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(Math.min(ERSTE_WOCHE_MAX, Number(e.target.value.replace(/\D/g, "")) || 0))}
            onBlur={() => setQty((q) => Math.max(ERSTE_WOCHE_MIN, q))}
            className="h-11 w-16 border-x border-[color:var(--border)] text-center text-base font-semibold tabular-nums outline-none"
            aria-label={p.nurLeads ? "Anzahl Leads in der ersten Bestellung" : "Anzahl Leads in der ersten Woche"}
          />
          <button type="button" aria-label="Mehr" onClick={() => setQty((q) => Math.min(ERSTE_WOCHE_MAX, q + step))} className="flex h-11 w-11 items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums" data-erste-woche-summe>
            {eur(betrag.brutto)}
          </div>
          <div className="text-[color:var(--muted)]">{frei ? "umsatzsteuerfrei nach § 4 Nr. 11 UStG" : "inkl. 19 % USt."}</div>
        </div>
        {p.nurLeads ? null : (
        <div className="text-[color:var(--muted)] sm:ml-auto sm:text-right">
          dazu Software {eur(p.softwareMonatlich)} netto im Monat
          <span className="block text-xs">eigene Rechnung</span>
        </div>
        )}
      </div>
      {qty < ERSTE_WOCHE_MIN ? <p className="mt-2 text-rose-700">Bitte mindestens {ERSTE_WOCHE_MIN} Leads wählen.</p> : null}
      <label className="mt-3 flex min-h-10 items-center gap-2">
        <input type="checkbox" name="ersteWocheWiederholen" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} className="h-5 w-5 accent-[color:var(--brand)]" />
        Jede Woche wiederholen (in der App jederzeit änderbar)
      </label>
      <div className="mt-3">
        <label htmlFor="registerNr" className="font-medium">
          Ihre Registernummer (Vermittlerregister)
        </label>
        <input
          id="registerNr"
          name="registerNr"
          required
          defaultValue={p.registerVorschlag ?? ""}
          placeholder="D-XXXX-XXXXX-XX"
          autoCapitalize="characters"
          pattern="\s*[Dd][\s\-]?([A-Za-z0-9]{4}[\s\-]?[A-Za-z0-9]{5}[\s\-]?[A-Za-z0-9]{2}|[A-Za-z][\s\-]?[0-9]{3}[\s\-]?[A-Za-z0-9]{4}[\s\-]?[0-9]{2})\s*"
          title="Registernummer aus dem Vermittlerregister, z. B. D-XXXX-XXXXX-XX"
          className={field}
        />
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          {frei
            ? "Leads an geprüfte Versicherungsvermittler sind umsatzsteuerfrei. Wir prüfen Ihre Nummer kurz, dann starten Abbuchung und Lieferung."
            : "Wir prüfen Ihre Nummer kurz, dann starten Abbuchung und Lieferung."}
        </p>
      </div>
    </div>
  );
}
