"use client";

// Einladung von 360dialog (Ole, 15.11.2026): Der Schritt „E-Mail öffnen, Passwort festlegen“ wurde übersehen,
// weil der blaue Weiter-Knopf ins Auge fiel. Jetzt steht die E-Mail als Schritt 1 im Mittelpunkt (an wen,
// Absender, Betreff, Knopfname, Postfach öffnen) und „Weiter“ wird erst nach dem Häkchen aktiv.

import { useActionState, useState } from "react";
import { inviteOtherEmailAction, type WaInviteState } from "./actions";
import { ArrowRight, CheckCircle2, ListChecks, Mail } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { GuideStepItem } from "@/components/whatsapp-guide";
import { cn } from "@/lib/utils";
import { CONNECT_PATHS, stepsAfterInvite, type ConnectPath } from "@/lib/whatsapp/connect-guide";

const PATH_SHORT: Record<ConnectPath, string> = {
  neu: "Neue Nummer oder Festnetz",
  business: "WhatsApp Business App",
  privat: "Private Nummer",
};

/** Webmail-Link passend zur Adresse (nur bekannte Anbieter). */
export function webmailLink(email: string): { label: string; href: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return { label: "Gmail öffnen", href: "https://mail.google.com/mail/u/0/#search/from%3A360dialog.com" };
  if (["outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de"].includes(domain)) return { label: "Outlook öffnen", href: "https://outlook.live.com/mail/0/" };
  if (["web.de"].includes(domain)) return { label: "WEB.DE öffnen", href: "https://web.de/" };
  if (["gmx.de", "gmx.net", "gmx.at"].includes(domain)) return { label: "GMX öffnen", href: "https://www.gmx.net/" };
  if (["t-online.de"].includes(domain)) return { label: "T-Online öffnen", href: "https://email.t-online.de/" };
  return null;
}

export function WaInvited({ email, readOnly, path: initialPath = null }: { email: string; readOnly: boolean; path?: ConnectPath | null }) {
  const [done, setDone] = useState(false);
  const [path, setPath] = useState<ConnectPath>(initialPath ?? "neu");
  const steps = stepsAfterInvite(path);
  const toggle = (v: boolean) => setDone(v);
  const webmail = webmailLink(email);
  return (
    <div className="space-y-4 text-[15px]" data-wa-invited>
      <p className="font-medium">Ihr Konto bei 360dialog ist angelegt. Noch zwei Schritte:</p>

      <div className={`rounded-[var(--radius-md)] border-2 px-4 py-4 ${done ? "border-[color:var(--border)]" : "border-amber-300 bg-amber-50"}`} data-wa-invite-mail>
        <p className="flex items-center gap-2 font-semibold">
          {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Mail className="h-5 w-5 text-amber-700" />}
          Schritt 1: E-Mail von 360dialog öffnen
        </p>
        <div className="mt-2 space-y-1.5 pl-7">
          <p>
            Wir haben gerade eine E-Mail an <b className="break-all">{email}</b> geschickt.
          </p>
          <p className="text-sm text-[color:var(--muted)]">
            Absender „360Dialog“, Betreff „Join … on the 360Dialog Hub“ (auf Englisch). Keine E-Mail? Bitte auch im Spam-Ordner nachsehen.
          </p>
          <p>
            Klicken Sie dort auf <b>„Join 360Dialog Hub“</b> und legen Sie ein Passwort fest. Weitere Angaben bei 360dialog sind nicht nötig.
          </p>
          {webmail && !done ? (
            <a href={webmail.href} target="_blank" rel="noopener noreferrer" className={`${buttonClass("secondary", "md")} mt-1`}>
              <Mail className="h-4 w-4" /> {webmail.label}
            </a>
          ) : null}
          {!done ? (
            // Ole, 20.11.2026: „Passwort-Mail kommt nicht an“. Das Konto ist angelegt, also hilft „Forgot password?“ auf
            // der Anmeldeseite von 360dialog: Sie schickt eine neue Mail an dieselbe Adresse.
            <details className="mt-1 text-sm" data-wa-keine-mail>
              <summary className="cursor-pointer font-medium text-[color:var(--brand)]">Keine E-Mail bekommen?</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[color:var(--muted)]" data-wa-keine-mail-wege>
                <li>Spam-Ordner und, bei Firmen-Postfächern, die Quarantäne prüfen. Notfalls die IT bitten, no-reply@360dialog.com zuzulassen.</li>
                <li>
                  Oder neue E-Mail anfordern: Anmeldeseite öffnen, dort auf <b>„Forgot password?“</b> tippen und <b className="break-all">{email}</b> eintragen. Mit dem neuen Passwort direkt anmelden.
                </li>
              </ol>
              {!readOnly ? (
                <a href="/buyer/whatsapp-verbinden?weiter=1" className={`${buttonClass("secondary", "md")} mt-2`} data-wa-passwort-vergessen>
                  Anmeldeseite öffnen <ArrowRight className="h-4 w-4" />
                </a>
              ) : null}
              {!readOnly ? <AndereEmail /> : null}
            </details>
          ) : null}
          <label className="mt-2 flex cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" className="h-5 w-5" checked={done} disabled={readOnly} onChange={(e) => toggle(e.target.checked)} data-wa-invite-done />
            Erledigt, ich habe mein Passwort festgelegt
          </label>
        </div>
      </div>

      <div className={`rounded-[var(--radius-md)] border px-4 py-4 ${done ? "border-[color:var(--accent,#2563eb)]" : "border-[color:var(--border)] opacity-70"}`}>
        <p className="font-semibold">Schritt 2: WhatsApp-Nummer verbinden</p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">Sie melden sich mit dem neuen Passwort bei 360dialog an („Log in“, nicht mit Facebook oder Google). Zur Sicherheit kommt dabei eine zweite E-Mail mit einem Code („Verify it&apos;s you“): Code eintragen, „Continue“ tippen. Danach verbinden Sie Ihre Nummer im Fenster von Meta.</p>
        {done && !readOnly ? (
          <a href="/buyer/whatsapp-verbinden?weiter=1" className={`${buttonClass("primary", "md")} mt-3`} data-wa-weiter>
            Weiter: WhatsApp verbinden <ArrowRight className="h-4 w-4" />
          </a>
        ) : (
          <span className={`${buttonClass("secondary", "md")} mt-3 cursor-not-allowed opacity-60`} aria-disabled="true">
            Erst Schritt 1 erledigen
          </span>
        )}
      </div>

      {/* Ole, 15.11.2026: Anleitung auch in der Einladungsansicht, ab der Anmeldung bei 360dialog */}
      <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3" data-wa-invited-steps>
        <summary className="flex cursor-pointer items-center gap-2 text-[15px] font-medium text-[color:var(--brand)]">
          <ListChecks className="h-4 w-4" /> So geht es bei 360dialog und Meta weiter (mit Bildern)
        </summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Welche Nummer verbinden Sie?">
            {CONNECT_PATHS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={path === p}
                data-weg={p}
                onClick={() => setPath(p)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]",
                  path === p ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-[color:var(--border)] hover:border-[color:var(--brand)]",
                )}
              >
                {PATH_SHORT[p]}
              </button>
            ))}
          </div>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <GuideStepItem key={s.title} step={s} n={i + 1} />
            ))}
          </ol>
        </div>
      </details>

      <p className="text-sm text-[color:var(--muted)]">Bitte nicht selbst ein neues Konto bei 360dialog registrieren, Ihr Konto ist schon da.</p>
    </div>
  );
}

/** Einladung an eine andere Adresse (Ole, 20.11.2026), z. B. wenn das Firmen-Postfach die Mail von 360dialog filtert. */
function AndereEmail() {
  const [state, action, pending] = useActionState<WaInviteState, FormData>(inviteOtherEmailAction, {});
  if (state.ok)
    return (
      <p className="mt-3 font-medium text-emerald-700" role="status" data-wa-andere-email-ok>
        {state.vorhanden
          ? `${state.email} hat schon ein Konto bei 360dialog. Melden Sie sich damit und Ihrem bisherigen Passwort an.`
          : `Neue Einladung an ${state.email} geschickt. Bitte dort öffnen und das Passwort festlegen.`}
      </p>
    );
  return (
    <form action={action} className="mt-3 border-t border-[color:var(--border)] pt-3" data-wa-andere-email>
      <label htmlFor="wa-andere-email" className="block font-medium text-[color:var(--foreground)]">
        Oder an eine andere E-Mail schicken
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input id="wa-andere-email" name="email" type="email" required autoComplete="email" placeholder="z. B. Ihre private Adresse" className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2 text-[15px]" />
        <button className={buttonClass("secondary", "md")} disabled={pending}>
          {pending ? "Wird geschickt …" : "Einladung schicken"}
        </button>
      </div>
      {state.error ? (
        <p className="mt-1 text-rose-700" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
