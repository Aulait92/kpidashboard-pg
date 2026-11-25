"use client";

// Einwilligung je Bestandskunde (Ole, 14.11.2026; Paket 3, 20.11.2026): Einwilligung einholen mit einem Tipp
// („Link kopieren“ immer, „Per WhatsApp schicken“ nur im vom Kunden geöffneten 24-h-Fenster, „Per E-Mail fragen“ nur
// mit Werbeerlaubnis per E-Mail). Stand je Kanal und Nachweis zum Widerspruchshinweis hinter „Nachweis bearbeiten“.
// Die Bitte um Einwilligung ist selbst Werbung: per E-Mail nur, wenn dieser Kunde per E-Mail angeschrieben werden darf.

import { useActionState, useState, useTransition } from "react";
import { Check, ChevronDown, Copy, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { consentWhatsAppAction, requestConsentAction, setConsentAction, type SettingsState } from "@/app/buyer/bestand/actions";

type Value = "ja" | "nein" | null;
const sel = "mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm";
const LABEL: Record<string, string> = { ja: "ja", nein: "nein", unbekannt: "unbekannt" };

/** uwg = E-Mail nach § 7 Abs. 3 UWG möglich (Bestätigung des Vermittlers und Nachweis zum Widerspruchshinweis für diesen Kunden). */
export function ConsentBadges({ email, whatsapp, emailOptOut, uwg }: { email: Value; whatsapp: Value; emailOptOut: boolean; uwg: boolean }) {
  const chip = (label: string, tone: "ok" | "mid" | "no") => (
    <span
      className={`rounded-full px-1.5 py-px text-xs font-medium ${tone === "ok" ? "bg-emerald-50 text-emerald-800" : tone === "mid" ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-500"}`}
    >
      {label}
    </span>
  );
  return (
    <span className="inline-flex shrink-0 gap-1" data-consent-badges>
      {whatsapp === "ja" ? chip("WA ✓", "ok") : chip("WA ✗", "no")}
      {emailOptOut ? chip("Mail abgem.", "no") : email === "ja" ? chip("Mail ✓", "ok") : email === "nein" ? chip("Mail ✗", "no") : uwg ? chip("Mail § 7", "mid") : chip("Mail ?", "no")}
    </span>
  );
}

export type ConsentRowProps = {
  existingCustomerId: string;
  name: string;
  email: Value;
  whatsapp: Value;
  /** Nachweis zum Hinweis auf das Widerspruchsrecht bei Erhebung der Adresse */
  hinweis?: Value;
  /** Bitte per E-Mail erlaubt (consentRequestByMailAllowed) */
  mailAllowed: boolean;
  /** Der Kunde hat in den letzten 24 Stunden per WhatsApp geschrieben (offenes Fenster) */
  waWindowOpen?: boolean;
  readOnly: boolean;
  /** label = beschrifteter Knopf „Einwilligung“, icon = Schild, none = nur gesteuert über open/onOpenChange */
  trigger?: "label" | "icon" | "none";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ConsentRowAction({ existingCustomerId, name, email, whatsapp, hinweis = null, mailAllowed, waWindowOpen = false, readOnly, trigger = "icon", open: openProp, onOpenChange }: ConsentRowProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOpenState(v));
  const [saved, save, saving] = useActionState<SettingsState, FormData>(setConsentAction, {});
  const [pending, start] = useTransition();
  const [done, setDone] = useState<null | { kind: "copied" | "mailed" | "whatsapp"; text?: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const copyLink = () =>
    start(async () => {
      setError(null);
      const r = await requestConsentAction(existingCustomerId, false);
      if (!r.ok || !r.text) return setError(r.error ?? "Das hat nicht geklappt.");
      await navigator.clipboard?.writeText(r.text).catch(() => {});
      setDone({ kind: "copied", text: r.text });
    });
  const byMail = () =>
    start(async () => {
      setError(null);
      const r = await requestConsentAction(existingCustomerId, true);
      if (!r.ok) return setError(r.error ?? "Das hat nicht geklappt.");
      setDone({ kind: "mailed" });
    });
  const byWhatsApp = () =>
    start(async () => {
      setError(null);
      const r = await consentWhatsAppAction(existingCustomerId);
      if (!r.ok) return setError(r.error ?? "Das hat nicht geklappt.");
      setDone({ kind: "whatsapp" });
    });
  const status = [whatsapp === "ja" ? "WhatsApp ✓" : null, email === "ja" ? "E-Mail ✓" : null].filter(Boolean).join(" · ");
  return (
    <>
      {trigger === "label" ? (
        <Button icon={ShieldCheck} size="sm" disabled={readOnly} onClick={() => setOpen(true)} data-consent-open aria-label={`Einwilligung von ${name} einholen`}>
          Einwilligung
        </Button>
      ) : trigger === "icon" ? (
        <span title="Einwilligung" className="inline-flex">
          <Button icon={ShieldCheck} className="h-9 w-9 px-0" aria-label={`Einwilligung von ${name}`} disabled={readOnly} onClick={() => setOpen(true)} data-consent-open />
        </span>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={`Einwilligung: ${name}`} message={status ? `Liegt vor: ${status}` : "Ihr Kunde legt selbst fest, ob per E-Mail oder WhatsApp."}>
        <div className="space-y-4 px-5 py-4 text-sm" data-consent-sheet>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button size="md" variant="primary" icon={done?.kind === "copied" ? Check : Copy} onClick={copyLink} disabled={pending || readOnly} data-consent-copy>
              {done?.kind === "copied" ? "Kopiert" : "Link kopieren"}
            </Button>
            {waWindowOpen && mailAllowed ? (
              <Button size="md" icon={MessageCircle} onClick={byWhatsApp} disabled={pending || readOnly || done?.kind === "whatsapp"} data-consent-whatsapp>
                Per WhatsApp schicken
              </Button>
            ) : null}
            {mailAllowed ? (
              <Button size="md" icon={Mail} onClick={byMail} disabled={pending || readOnly || done?.kind === "mailed"} data-consent-mail>
                Per E-Mail fragen
              </Button>
            ) : null}
          </div>
          {!mailAllowed && !done ? <p className="text-[color:var(--muted)]">Den Link geben Sie im Termin oder in Ihrem Chat weiter.</p> : null}
          {error ? <p className="text-rose-700">{error}</p> : null}
          {done?.kind === "mailed" ? <p className="text-emerald-700">Die Anfrage ist per E-Mail unterwegs.</p> : null}
          {done?.kind === "whatsapp" ? <p className="text-emerald-700">Per WhatsApp gesendet.</p> : null}
          {done?.kind === "copied" && done.text ? (
            <textarea readOnly value={done.text} rows={4} className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm" data-consent-link aria-label="Kopierter Text" />
          ) : null}

          <details className="group border-t border-[color:var(--border)] pt-3 [&>summary::-webkit-details-marker]:hidden" data-consent-proof>
            <summary className="inline-flex min-h-10 cursor-pointer items-center gap-1 font-medium text-[color:var(--brand)]">
              Nachweis bearbeiten <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
            </summary>
            <form action={save} className="mt-2 space-y-3">
              <input type="hidden" name="id" value={existingCustomerId} />
              <div className="grid grid-cols-2 gap-3">
                {(["email", "whatsapp"] as const).map((ch) => (
                  <div key={ch}>
                    <label className="block text-xs font-medium text-[color:var(--muted)]">
                      {ch === "email" ? "E-Mail" : "WhatsApp"} (jetzt: {LABEL[(ch === "email" ? email : whatsapp) ?? "unbekannt"]})
                      <select name={ch} defaultValue="keep" className={sel}>
                        <option value="keep">unverändert</option>
                        <option value="ja">ja</option>
                        <option value="nein">nein</option>
                        <option value="unbekannt">unbekannt</option>
                      </select>
                    </label>
                    <label className="mt-2 block text-xs font-medium text-[color:var(--muted)]">
                      Datum (optional)
                      <input type="date" name={`${ch}At`} className={sel} />
                    </label>
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2" data-hinweis-edit>
                <label className="block text-xs font-medium text-[color:var(--muted)]">
                  Bei Erhebung der E-Mail auf das Widerspruchsrecht hingewiesen? (jetzt: {LABEL[hinweis ?? "unbekannt"]})
                  <select name="hinweis" defaultValue="keep" className={sel}>
                    <option value="keep">unverändert</option>
                    <option value="ja">ja</option>
                    <option value="nein">nein</option>
                    <option value="unbekannt">unbekannt</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-[color:var(--muted)]">
                    Wortlaut oder Quelle
                    <input name="hinweisText" maxLength={500} placeholder="z. B. Antrag vom 3.5.2024" className={sel} />
                  </label>
                  <label className="block text-xs font-medium text-[color:var(--muted)]">
                    Datum (optional)
                    <input type="date" name="hinweisAt" className={sel} />
                  </label>
                </div>
                <p className="text-xs text-[color:var(--muted)]">Ohne diesen Nachweis gehen E-Mails an diesen Kunden nur mit Einwilligung raus (§ 7 Abs. 3 UWG).</p>
              </div>
              {saved.error ? <p className="text-rose-700">{saved.error}</p> : null}
              {saved.ok ? <p className="text-emerald-700">{saved.message}</p> : null}
              <Button type="submit" size="md" disabled={saving || readOnly}>
                Speichern
              </Button>
            </form>
          </details>
        </div>
      </Sheet>
    </>
  );
}
