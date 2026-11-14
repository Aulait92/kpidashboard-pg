"use client";

// Formulare unter Bestand → Einwilligungen & Versand (Ole, 14.11.2026).

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { bulkConsentAction, legacyConsentAction, saveBestandRechtAction, type SettingsState } from "@/app/buyer/bestand/actions";

const Msg = ({ s }: { s: SettingsState }) => (s.error ? <p className="text-rose-700">{s.error}</p> : s.message ? <p className="text-emerald-700">{s.message}</p> : null);

export function RechtForm({ uwg, uwgAt, imprint, readOnly }: { uwg: boolean; uwgAt: string | null; imprint: string; readOnly: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveBestandRechtAction, {});
  return (
    <form action={action} className="space-y-4 text-sm" data-recht-form>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="uwg" defaultChecked={uwg} className="mt-0.5 h-4 w-4" data-uwg-confirm />
        <span>
          <b>Bestätigung zu § 7 Abs. 3 UWG:</b> Die E-Mail-Adressen meiner Bestandskunden stammen aus Vertragsabschlüssen. Ich habe die Kunden bei der Erhebung
          der Adresse klar darauf hingewiesen, dass sie der Werbung jederzeit widersprechen können, ohne dass dafür andere als die Übermittlungskosten
          entstehen. Den Hinweis mit Abmeldelink enthält jede Kampagnen-Mail automatisch.
          {uwg && uwgAt ? <span className="block text-xs text-[color:var(--muted)]">Bestätigt am {uwgAt}</span> : null}
        </span>
      </label>
      <p className="text-xs text-[color:var(--muted)]">
        Ohne Einwilligung gehen dann nur E-Mails zum selben Bedarf bzw. Vertrag raus (Ablauf oder Wechsel, Vertragscheck im Jahresgespräch). Kein Cross-Selling in
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
