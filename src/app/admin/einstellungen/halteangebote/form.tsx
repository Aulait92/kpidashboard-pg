"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import type { HalteSettings } from "@/lib/halteangebote";
import { saveHalteAction, type HalteFormState } from "./actions";

function Num({ name, label, value, suffix, step = "1" }: { name: keyof HalteSettings; label: string; value: number; suffix: string; step?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input name={name} type="number" step={step} defaultValue={value} className="input h-9 w-24 text-right" />
        <span className="w-14 text-[color:var(--muted)]">{suffix}</span>
      </span>
    </label>
  );
}

function Block({ name, checked, title, text, children }: { name: keyof HalteSettings; checked: boolean; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-3 px-5 py-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 h-4 w-4 shrink-0" />
        <span>
          <span className="block font-medium">{title}</span>
          <span className="block text-sm text-[color:var(--muted)]">{text}</span>
        </span>
      </label>
      {children ? <div className="space-y-2 pl-7">{children}</div> : null}
    </div>
  );
}

export function HalteForm({ s }: { s: HalteSettings }) {
  const [state, action, pending] = useActionState<HalteFormState, FormData>(saveHalteAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        <Block name="rabattOn" checked={s.rabattOn} title="Zu teuer: Nachlass mit Mindestlaufzeit" text="Stripe-Gutschein am Abo (nur monatliche Zahlung), Bindung im Konto, Bestätigung per E-Mail. Sonst Aufgabe „von Hand“.">
          <Num name="rabattPercent" label="Nachlass auf die Monatsgebühr" value={s.rabattPercent} suffix="%" />
          <Num name="rabattMonths" label="für Monatsrechnungen" value={s.rabattMonths} suffix="Monate" />
          <Num name="rabattCommitMonths" label="danach Mindestlaufzeit" value={s.rabattCommitMonths} suffix="Monate" />
        </Block>
        <Block name="paketOn" checked={s.paketOn} title="Zu teuer: kleineres Paket" text="Sprung zu „Werbebudget ändern“: niedrigere Preisstufe ab dem nächsten Abrechnungsmonat (vorhandene Selbstbedienung)." />
        <Block name="neustartOn" checked={s.neustartOn} title="Zu wenige Leads: Kampagnen-Neustart durch uns" text="Aufgabe „Kampagne neu starten“ (neue Werbemittel, Zielgruppen). Betreuung kostenlos über einen Stripe-Gutschein nur auf die Betreuungs-Position.">
          <Num name="neustartFreeMonths" label="Betreuung kostenlos (0 = ohne)" value={s.neustartFreeMonths} suffix="Monate" />
        </Block>
        <Block name="neuausrichtungOn" checked={s.neuausrichtungOn} title="Leads passen nicht: kostenlose Neuausrichtung" text="Aufgabe mit dem Wunsch des Kunden (Sparte, Region, Formularfragen)." />
        <Block name="gutschriftOn" checked={s.gutschriftOn} title="… dazu Gutschrift prüfen" text="Zweite Aufgabe mit allen Leads mit falschen Daten bzw. Reklamation. Keine automatische Geldbewegung, die Gutschrift setzt ihr nach Prüfung.">
          <Num name="gutschriftDays" label="Leads der letzten" value={s.gutschriftDays} suffix="Tage" />
        </Block>
        <Block name="produktwechselOn" checked={s.produktwechselOn} title="Zu wenige Abschlüsse: kostenloser Spartenwechsel" text="Vorschlag = Sparte mit der besten Abschlussquote über alle Kunden (12 Monate), besser als die eigene. Kein Coaching. Umstellung als Aufgabe.">
          <Num name="produktwechselMinLeads" label="Mindestens Leads je Sparte" value={s.produktwechselMinLeads} suffix="Leads" />
        </Block>
        <Block name="pauseOn" checked={s.pauseOn} title="Keine Zeit: Pause ohne Kosten" text="Vorhandene Pause, dazu ruht die ganze Abrechnung (Stripe pause_collection). Ohne Rabatt-Berechtigung: normale Pause mit Software-Gebühr.">
          <Num name="pauseMaxMonths" label="höchstens" value={s.pauseMaxMonths} suffix="Monate" />
        </Block>
        <Block name="einrichtungOn" checked={s.einrichtungOn} title="App passt nicht: Einrichtung per Bildschirmfreigabe" text="Termin im Teamkalender (Hilfetermin). Ohne freien Termin: Aufgabe „anrufen und Termin vereinbaren“.">
          <Num name="einrichtungMinutes" label="Dauer" value={s.einrichtungMinutes} suffix="Minuten" step="15" />
        </Block>
        <Block name="nurBestandOn" checked={s.nurBestandOn} title="Höre auf / wechsle: Paket „Nur Bestand“" text="Bestandskunden-Modul ohne Leads und Betreuung, mit Daten und demselben Kontingent (Standard 149 €); Empfehlungen optional + 59 €. Aufgabe „Stripe umstellen“ zum nächstmöglichen Termin, dazu Hinweis „Kollegen empfehlen“.">
          <Num name="nurBestandPrice" label="Preis netto im Monat" value={s.nurBestandPrice} suffix="€" step="0.01" />
        </Block>
        <Block name="rueckkehrOn" checked={s.rueckkehrOn} title="Alle Gründe: Rückkehrangebot nach Vertragsende" text="Einmal je Kunde eine E-Mail an ruhende Konten: Konto reaktivieren ohne neue Einrichtungsgebühr.">
          <Num name="rueckkehrDays" label="Tage nach Vertragsende" value={s.rueckkehrDays} suffix="Tage" />
        </Block>
      </div>
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <h2 className="font-medium">Regeln für Rabatte</h2>
        <p className="text-sm text-[color:var(--muted)]">Gilt für Nachlass, kostenlosen Betreuungsmonat, Gutschrift-Prüfung und Pause ohne Kosten. Nie bei jährlicher Vorauszahlung.</p>
        <Num name="minTenureMonths" label="Erst ab Kundendauer" value={s.minTenureMonths} suffix="Monate" />
        <Num name="cooldownMonths" label="Höchstens ein Rabatt in" value={s.cooldownMonths} suffix="Monaten" />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary h-10 text-sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Speichern
        </button>
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-emerald-700">Gespeichert.</span> : null}
      </div>
    </form>
  );
}
