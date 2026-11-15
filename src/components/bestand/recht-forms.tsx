"use client";

// Formulare unter Bestand → Einwilligungen & Versand (Ole, 14.11.2026).

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { bulkConsentAction, bulkHinweisAction, legacyConsentAction, saveBestandRechtAction, type SettingsState } from "@/app/buyer/bestand/actions";

const Msg = ({ s }: { s: SettingsState }) => (s.error ? <p className="text-rose-700">{s.error}</p> : s.message ? <p className="text-emerald-700">{s.message}</p> : null);

export function RechtForm({ uwg, uwgAt, imprint, readOnly }: { uwg: boolean; uwgAt: string | null; imprint: string; readOnly: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveBestandRechtAction, {});
  return (
    <form action={action} className="space-y-4 text-sm" data-recht-form>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="uwg" defaultChecked={uwg} className="mt-0.5 h-4 w-4" data-uwg-confirm />
        <span>
          <b>Bestätigung zu § 7 Abs. 3 UWG:</b> Die E-Mail-Adressen meiner Bestandskunden habe ich im Zusammenhang mit dem Abschluss ihrer Verträge erhalten.
          Ich bewerbe per E-Mail ohne Einwilligung nur eigene, ähnliche Leistungen zum selben Bedarf. Den Hinweis auf das Widerspruchsrecht mit Abmeldelink
          enthält jede Kampagnen-Mail automatisch.
          {uwg && uwgAt ? <span className="block text-xs text-[color:var(--muted)]">Bestätigt am {uwgAt}</span> : null}
        </span>
      </label>
      <p className="text-xs text-[color:var(--muted)]">
        Zusätzlich braucht jeder Kunde einen Nachweis, dass er schon bei der Erhebung der Adresse auf sein Widerspruchsrecht hingewiesen wurde (beim Import,
        unten für alle oder je Kunde). Ohne Einwilligung gehen dann nur E-Mails zum selben Bedarf bzw. Vertrag raus (Ablauf oder Wechsel, Vertragscheck im Jahresgespräch). Kein Cross-Selling in
        andere Sparten, kein Geburtstag mit Angebot, keine Empfehlungs- oder Bewertungsbitte. WhatsApp nie ohne Einwilligung.
      </p>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Pflichtangaben unter jeder E-Mail (Impressum: Name bzw. Firma, Anschrift, Kontakt, Vermittlerregister)
        <textarea name="imprint" defaultValue={imprint} rows={6} maxLength={2000} className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--foreground)]" />
      </label>
      <Msg s={state} />
      <Button type="submit" variant="primary" size="md" disabled={readOnly || pending}>
        Speichern
      </Button>
    </form>
  );
}

export function LegacyForm({ count, date, readOnly }: { count: number; date: string | null; readOnly: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(legacyConsentAction, {});
  return (
    <form action={action} className="space-y-3 text-sm" data-legacy-form>
      <p>
        Bis zum 14.11.2026 haben Sie beim Import pauschal bestätigt: „Für diese Kunden liegt die Einwilligung zur Kontaktaufnahme per WhatsApp/E-Mail vor (laut
        Versicherer)“. Für <b>{count.toLocaleString("de-DE")} Kunden</b> gilt diese Bestätigung deshalb als Einwilligung für WhatsApp und E-Mail
        {date ? ` (Import am ${date})` : ""}. Bitte prüfen Sie, ob das zutrifft. Die rechtliche Bewertung liegt bei Ihnen.
      </p>
      <fieldset className="space-y-1.5">
        <label className="flex items-start gap-2">
          <input type="radio" name="choice" value="ok" defaultChecked className="mt-0.5" />
          <span>Passt so: Die Einwilligungen liegen laut Versicherer vor.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="choice" value="reset_whatsapp" className="mt-0.5" />
          <span>Nur WhatsApp auf „unbekannt“ setzen (E-Mail bleibt)</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="choice" value="reset_all" className="mt-0.5" />
          <span>WhatsApp und E-Mail auf „unbekannt“ setzen</span>
        </label>
      </fieldset>
      <label className="flex items-start gap-2 text-xs text-[color:var(--muted)]">
        <input type="checkbox" name="confirm" className="mt-0.5" />
        <span>Beim Zurücksetzen: Ich weiß, dass diese Kunden dann nur noch mit neuer Einwilligung (bzw. per E-Mail nach § 7 Abs. 3 UWG) angeschrieben werden.</span>
      </label>
      <Msg s={state} />
      <Button type="submit" variant="primary" size="md" disabled={readOnly || pending}>
        Übernehmen
      </Button>
    </form>
  );
}

export function BulkForm({ unknownEmail, unknownWhatsapp, readOnly }: { unknownEmail: number; unknownWhatsapp: number; readOnly: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(bulkConsentAction, {});
  return (
    <form action={action} className="space-y-3 text-sm" data-bulk-form>
      <fieldset className="space-y-1.5">
        <label className="flex items-start gap-2">
          <input type="radio" name="channel" value="email" className="mt-0.5" />
          <span>E-Mail ({unknownEmail.toLocaleString("de-DE")} Kunden mit unbekannter Einwilligung)</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="channel" value="whatsapp" className="mt-0.5" />
          <span>WhatsApp ({unknownWhatsapp.toLocaleString("de-DE")} Kunden mit Mobilnummer und unbekannter Einwilligung)</span>
        </label>
      </fieldset>
      <label className="flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
        <input type="checkbox" name="confirm" className="mt-0.5" data-bulk-confirm />
        <span>
          Ich bestätige ausdrücklich, dass für <b>alle</b> diese Kunden eine Einwilligung in Werbung über diesen Kanal vorliegt (z. B. laut Versicherer) und ich sie
          auf Anfrage nachweisen kann. Ein „nein“ wird nicht überschrieben, Abmeldungen bleiben bestehen.
        </span>
      </label>
      <Msg s={state} />
      <Button type="submit" size="md" disabled={readOnly || pending}>
        Alle haben eingewilligt
      </Button>
    </form>
  );
}

/** Nachweis zum Widerspruchshinweis für alle bisherigen Kunden ohne Angabe (Wortlaut Pflicht, ausdrücklich bestätigt). */
export function HinweisBulkForm({ missing, readOnly }: { missing: number; readOnly: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(bulkHinweisAction, {});
  return (
    <form action={action} className="space-y-3 text-sm" data-hinweis-form>
      <p>
        Für <b>{missing.toLocaleString("de-DE")} Kunden</b> mit E-Mail-Adresse fehlt der Nachweis, dass sie bei der Erhebung der Adresse auf ihr Widerspruchsrecht
        hingewiesen wurden. Ohne diesen Nachweis greift § 7 Abs. 3 UWG nicht: E-Mails an sie gehen nur mit Einwilligung raus.
      </p>
      <input type="hidden" name="hinweis_bulk" value="on" />
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Wortlaut oder Quelle des Hinweises (Pflicht, wird protokolliert)
        <textarea
          name="hinweis_text"
          rows={2}
          maxLength={500}
          placeholder="z. B. Antragsformulare seit 2021, Abschnitt Datenschutz: „Sie können der Verwendung Ihrer E-Mail-Adresse für Werbung jederzeit widersprechen.“"
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--foreground)]"
        />
      </label>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Hinweis gegeben seit (optional)
        <input type="date" name="hinweis_date" className="mt-1 h-10 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm text-[color:var(--foreground)]" />
      </label>
      <label className="flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
        <input type="checkbox" name="hinweis_confirm" className="mt-0.5" data-hinweis-confirm />
        <span>
          Ich bestätige ausdrücklich, dass <b>alle</b> diese Kunden bei der Erhebung ihrer E-Mail-Adresse so auf ihr Widerspruchsrecht hingewiesen wurden und ich
          das auf Anfrage nachweisen kann. Trifft das nur auf einen Teil zu, tragen Sie den Nachweis bitte je Kunde ein oder beim nächsten Import als Spalte.
        </span>
      </label>
      <Msg s={state} />
      <Button type="submit" size="md" disabled={readOnly || pending || missing === 0}>
        Nachweis speichern
      </Button>
    </form>
  );
}
