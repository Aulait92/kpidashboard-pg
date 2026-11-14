"use client";

// Einwilligung je Bestandskunde (Ole, 14.11.2026): Stand je Kanal setzen (ja, nein, unbekannt, mit Datum)
// und Einwilligung einholen. Die Bitte um Einwilligung ist selbst Werbung: per E-Mail nur, wenn dieser Kunde
// per E-Mail angeschrieben werden darf; sonst Link kopieren und im persönlichen Kontakt weitergeben.

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { requestConsentAction, setConsentAction, type ConsentLinkState, type SettingsState } from "@/app/buyer/bestand/actions";

type Value = "ja" | "nein" | null;
const sel = "mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm";
const LABEL: Record<string, string> = { ja: "ja", nein: "nein", unbekannt: "unbekannt" };

export function ConsentBadges({ email, whatsapp, emailOptOut, uwg }: { email: Value; whatsapp: Value; emailOptOut: boolean; uwg: boolean }) {
  const chip = (label: string, tone: "ok" | "mid" | "no") => (
    <span
      className={`rounded-full px-1.5 py-px text-[11px] font-medium ${tone === "ok" ? "bg-emerald-50 text-emerald-800" : tone === "mid" ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-500"}`}
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

export function ConsentRowAction({
  existingCustomerId,
  name,
  email,
  whatsapp,
  mailAllowed,
  readOnly,
}: {
  existingCustomerId: string;
  name: string;
  email: Value;
  whatsapp: Value;
  mailAllowed: boolean;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saved, save, saving] = useActionState<SettingsState, FormData>(setConsentAction, {});
  const [link, setLink] = useState<ConsentLinkState | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const ask = (byMail: boolean) => start(async () => setLink(await requestConsentAction(existingCustomerId, byMail)));
  return (
    <>
      <span title="Einwilligung" className="inline-flex">
        <Button icon={ShieldCheck} className="h-9 w-9 px-0" aria-label={`Einwilligung von ${name}`} disabled={readOnly} onClick={() => setOpen(true)} data-consent-open />
      </span>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Einwilligung: ${name}`}>
        <div className="space-y-5 px-5 py-4 text-sm" data-consent-sheet>
          <form action={save} className="space-y-3">
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
            {saved.error ? <p className="text-rose-700">{saved.error}</p> : null}
            {saved.ok ? <p className="text-emerald-700">{saved.message}</p> : null}
            <Button type="submit" variant="primary" size="md" disabled={saving}>
              Speichern
            </Button>
          </form>
          <div className="border-t border-[color:var(--border)] pt-4">
            <p className="font-medium">Einwilligung einholen</p>
            <p className="mt-1 text-[color:var(--muted)]">
              Der Kunde legt selbst fest, ob Sie ihn per E-Mail bzw. WhatsApp informieren dürfen (E-Mail mit Bestätigungslink). Am besten nach dem Termin, dem
              Abschluss oder im Jahresgespräch weitergeben.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="md" icon={Copy} onClick={() => ask(false)} disabled={pending}>
                Link erstellen
              </Button>
              <span title={mailAllowed ? "Per E-Mail senden" : "Nur, wenn dieser Kunde per E-Mail angeschrieben werden darf"} className="inline-flex">
                <Button size="md" icon={Mail} onClick={() => ask(true)} disabled={pending || !mailAllowed} data-consent-mail>
                  Per E-Mail senden
                </Button>
              </span>
            </div>
            {link?.error ? <p className="mt-2 text-rose-700">{link.error}</p> : null}
            {link?.ok && link.mailed ? <p className="mt-2 text-emerald-700">Die Anfrage ist per E-Mail unterwegs.</p> : null}
            {link?.ok && !link.mailed && link.text ? (
              <div className="mt-3 space-y-2" data-consent-link>
                <textarea readOnly value={link.text} rows={4} className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm" />
                <Button
                  size="md"
                  icon={copied ? Check : Copy}
                  onClick={async () => {
                    await navigator.clipboard?.writeText(link.text!).catch(() => {});
                    setCopied(true);
                  }}
                >
                  {copied ? "Kopiert" : "Text kopieren"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </Sheet>
    </>
  );
}
