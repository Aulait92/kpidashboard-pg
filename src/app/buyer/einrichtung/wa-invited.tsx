"use client";

// Einladung von 360dialog (Ole, 15.11.2026): Der Schritt „E-Mail öffnen, Passwort festlegen“ wurde übersehen,
// weil der blaue Weiter-Knopf ins Auge fiel. Jetzt steht die E-Mail als Schritt 1 im Mittelpunkt (an wen,
// Absender, Betreff, Knopfname, Postfach öffnen) und „Weiter“ wird erst nach dem Häkchen aktiv.

import { useState } from "react";
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
