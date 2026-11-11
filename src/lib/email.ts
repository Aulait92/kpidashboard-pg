import { mailClient } from "@/lib/mail-guard";
import { PROVIDER } from "@/lib/legal-texts";

export type SendResult = { ok: true } | { ok: false; error: string };

export function getAppUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  // Fallback: Railway-Default-Variable. Wenn auch die fehlt, bricht das
  // Reset-Senden mit klarer Fehlermeldung ab.
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway.replace(/\/$/, "")}`;
  throw new Error(
    "APP_URL ist nicht gesetzt — wird für Reset-Links in Mails benötigt.",
  );
}

export function buildResetUrl(rawToken: string): string {
  return `${getAppUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  resetUrl: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ?? "performancegrowth <onboarding@resend.dev>";

  if (!apiKey) {
    // In Dev / ohne Resend-Setup: Link in die Server-Logs schreiben damit
    // er nicht verloren geht; UI zeigt "Mail unterwegs" damit Account-
    // Existenz nicht verraten wird.
    console.warn(
      `[email] RESEND_API_KEY fehlt — Reset-URL für ${opts.to}: ${opts.resetUrl}`,
    );
    return { ok: false, error: "Email-Service nicht konfiguriert." };
  }

  const resend = mailClient(apiKey);
  try {
    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: "Passwort zurücksetzen · performancegrowth",
      text: [
        "Hallo,",
        "",
        "klicken Sie auf den folgenden Link, um Ihr Passwort zurückzusetzen:",
        opts.resetUrl,
        "",
        "Der Link ist 1 Stunde gültig.",
        "",
        "Falls Sie diese Anfrage nicht ausgelöst haben, können Sie diese Mail ignorieren.",
        "",
        signatureText(PROVIDER.brand),
      ].join("\n"),
      html: `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0b1220">
          <h1 style="margin:0 0 16px;font-size:18px;font-weight:700">Passwort zurücksetzen</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5">Klicken Sie auf den folgenden Button, um ein neues Passwort festzulegen:</p>
          <p style="margin:24px 0">
            <a href="${opts.resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Neues Passwort festlegen</a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;color:#6b7a96">Oder kopieren Sie diesen Link:</p>
          <p style="margin:0 0 24px;font-size:12px;word-break:break-all;color:#2563eb">${opts.resetUrl}</p>
          <p style="margin:0;font-size:12px;color:#6b7a96">Der Link ist <strong>1 Stunde</strong> gültig. Wenn Sie das nicht angefordert haben, können Sie diese Mail ignorieren.</p>
          ${signatureHtml(PROVIDER.brand)}
        </div>
      `,
    });
    if (error) {
      return { ok: false, error: error.message ?? "Resend hat abgelehnt." };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Send failed",
    };
  }
}

/** Einladung für einen neu angelegten Kunden-Login (Passwort selbst festlegen). */
export async function sendBuyerInviteEmail(opts: {
  to: string;
  customerName: string;
  setPasswordUrl: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ?? "performancegrowth <onboarding@resend.dev>";
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY fehlt — Einladungs-URL für ${opts.to}: ${opts.setPasswordUrl}`,
    );
    return { ok: false, error: "Email-Service nicht konfiguriert." };
  }
  const loginUrl = `${getAppUrl()}/login`;
  const resend = mailClient(apiKey);
  try {
    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: "Dein Zugang zum Kunden-CRM · performancegrowth",
      text: [
        "Hallo,",
        "",
        `für dich (${opts.customerName}) wurde ein Zugang zum Kunden-CRM von performancegrowth angelegt.`,
        "Lege über diesen Link dein Passwort fest:",
        opts.setPasswordUrl,
        "",
        "Der Link ist 7 Tage gültig. Danach kannst du dich jederzeit hier anmelden:",
        loginUrl,
        "",
        `Deine Login-E-Mail: ${opts.to}`,
        "",
        signatureText(),
      ].join("\n"),
      html: `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0b1220">
          <h1 style="margin:0 0 16px;font-size:18px;font-weight:700">Willkommen im Kunden-CRM</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5">Für dich (<strong>${opts.customerName}</strong>) wurde ein Zugang angelegt. Hier siehst du deine Leads, Termine und wen du zurückrufen solltest.</p>
          <p style="margin:24px 0">
            <a href="${opts.setPasswordUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Passwort festlegen</a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;color:#6b7a96">Login-E-Mail: ${opts.to}</p>
          <p style="margin:0;font-size:12px;color:#6b7a96">Der Link ist <strong>7 Tage</strong> gültig. Danach: <a href="${loginUrl}" style="color:#2563eb">${loginUrl}</a> → „Passwort vergessen".</p>
          ${signatureHtml()}
        </div>
      `,
    });
    if (error) {
      return { ok: false, error: error.message ?? "Resend hat abgelehnt." };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Send failed",
    };
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ─── Signatur ──────────────────────────────────────────────────────────
// Einheitlich für alle Mails von performancegrowth: Gruß, Name, darunter die
// Firmenangaben (Pflichtangaben für geschäftliche E-Mails der UG).
const legalLines = () =>
  [
    PROVIDER.name,
    `${PROVIDER.street} · ${PROVIDER.city}`,
    [PROVIDER.phone && `Tel. ${PROVIDER.phone}`, PROVIDER.email, PROVIDER.website].filter(Boolean).join(" · "),
    [`Geschäftsführer: ${PROVIDER.manager}`, PROVIDER.register].filter(Boolean).join(" · "),
  ];

/** Signatur als Text: „Viele Grüße“, Absender (Zeilen), Firmenangaben. */
export function signatureText(personal = `${PROVIDER.manager}\n${PROVIDER.brand}`): string {
  return ["Viele Grüße", personal, "", "--", ...legalLines()].join("\n");
}

/** Signatur als HTML (gleicher Inhalt, Firmenangaben klein und grau). */
export function signatureHtml(personal = `${PROVIDER.manager}\n${PROVIDER.brand}`): string {
  const [first, ...rest] = personal.split("\n");
  return `
          <p style="margin:24px 0 0;font-size:15px;line-height:1.6">Viele Grüße<br><strong>${escapeHtml(first)}</strong>${rest.map((l) => `<br>${escapeHtml(l)}`).join("")}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border-top:1px solid #e3e9f3;padding-top:14px;width:100%">
            <tr><td style="padding-top:14px">
              <div style="font-size:15px;font-weight:700;letter-spacing:-.01em;margin:0 0 6px">performance<span style="color:#2563eb">growth</span></div>
              <div style="font-size:12px;line-height:1.6;color:#66758f">${[
                escapeHtml(PROVIDER.name),
                escapeHtml(`${PROVIDER.street} · ${PROVIDER.city}`),
                [
                  PROVIDER.phone && `Tel. ${escapeHtml(PROVIDER.phone)}`,
                  `<a href="mailto:${PROVIDER.email}" style="color:#66758f">${PROVIDER.email}</a>`,
                  `<a href="https://${PROVIDER.website}" style="color:#2563eb;text-decoration:none">${PROVIDER.website}</a>`,
                ]
                  .filter(Boolean)
                  .join(" · "),
                escapeHtml([`Geschäftsführer: ${PROVIDER.manager}`, PROVIDER.register].filter(Boolean).join(" · ")),
              ].join("<br>")}</div>
            </td></tr>
          </table>`;
}

/** Schickt einem Interessenten den Link zu seinem Angebot. */
export async function sendOfferEmail(opts: {
  to: string;
  /** z. B. „Hallo Herr Weber,“ */
  greeting: string;
  number: string;
  offerUrl: string;
  validUntil: Date;
  replyTo?: string | null;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OFFER_EMAIL_FROM ?? process.env.RESEND_FROM ?? "performancegrowth <onboarding@resend.dev>";
  if (!apiKey) return { ok: false, error: "E-Mail-Versand ist nicht konfiguriert (RESEND_API_KEY fehlt)." };
  const until = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(opts.validUntil);
  const greeting = escapeHtml(opts.greeting);
  try {
    const { error } = await mailClient(apiKey).emails.send({
      from,
      to: opts.to,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      subject: `Ihr Angebot von performancegrowth (${opts.number})`,
      text: [
        opts.greeting,
        "",
        "vielen Dank für das Gespräch. Wie besprochen finden Sie Ihr Angebot hier:",
        opts.offerUrl,
        "",
        `Sie können es dort direkt online annehmen oder als PDF herunterladen. Das Angebot gilt bis ${until}.`,
        "",
        signatureText(),
      ].join("\n"),
      html: `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0b1220">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6">${greeting}</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6">vielen Dank für das Gespräch. Wie besprochen finden Sie Ihr Angebot unter folgendem Link. Sie können es dort direkt online annehmen oder als PDF herunterladen.</p>
          <p style="margin:24px 0"><a href="${opts.offerUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Angebot ansehen</a></p>
          <p style="margin:0 0 16px;font-size:13px;color:#5b5e68">Angebot ${escapeHtml(opts.number)} · gültig bis ${until}</p>
          ${signatureHtml()}
        </div>`,
    });
    if (error) return { ok: false, error: error.message ?? "Resend hat abgelehnt." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Versand fehlgeschlagen" };
  }
}

/** Teilschritte der Einrichtung in der Reihenfolge der Einrichtungsseite. */
export function setupParts(software: boolean, whatsappSelfConnect: boolean): string {
  const parts = ["kurzer Fragebogen", "Freigabe Ihres Meta-Werbekontos"];
  if (software) parts.push("Kalender verbinden");
  if (software && whatsappSelfConnect) parts.push("WhatsApp verbinden");
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} und ${parts[parts.length - 1]}` : parts[0];
}

/** Willkommens-Mail nach Vertragsannahme: Zugang, Einrichtung, Ablauf bis zum Start. */
export async function sendOnboardingWelcomeEmail(opts: {
  to: string;
  /** z. B. „Hallo Herr Weber,“ */
  greeting: string;
  packageType: "software" | "service";
  startDate: Date | null;
  products: string[];
  setPasswordUrl: string | null;
  loginUrl: string;
  setupUrl: string;
  /** Kunde verbindet seine WhatsApp-Nummer selbst (360dialog konfiguriert, Paket mit Software). */
  whatsappSelfConnect?: boolean;
  replyTo?: string | null;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OFFER_EMAIL_FROM ?? process.env.RESEND_FROM ?? "performancegrowth <onboarding@resend.dev>";
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY fehlt — Willkommens-Mail an ${opts.to}, Link: ${opts.setPasswordUrl ?? opts.loginUrl}`);
    return { ok: false, error: "E-Mail-Versand ist nicht konfiguriert (RESEND_API_KEY fehlt)." };
  }
  const start = opts.startDate
    ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(opts.startDate)
    : null;
  const software = opts.packageType === "software";
  const products = opts.products.length ? opts.products.join(", ") : null;
  const accessUrl = opts.setPasswordUrl ?? opts.loginUrl;
  const steps = [
    opts.setPasswordUrl
      ? "Zugang einrichten: Über den Button legen Sie Ihr Passwort fest (Link 7 Tage gültig)."
      : `Einloggen unter ${opts.loginUrl} mit ${opts.to}.`,
    `Einrichtung im Kundenbereich (ca. 5 Minuten): ${setupParts(software, !!opts.whatsappSelfConnect)}. Auf Wunsch machen wir das gemeinsam in einem 15-Minuten-Termin, den Sie direkt in der Einrichtung buchen.`,
    "Den Rest erledigen wir: Kampagne, Werbemittel und Leadformular. Sie bekommen Bescheid, sobald alles startklar ist.",
    start
      ? `Start am ${start}: Die Kampagne geht live${software ? ", der digitale Assistent schreibt neue Leads an und bucht Termine in Ihren Kalender" : ", jeder neue Lead kommt sofort per E-Mail"}.`
      : `Start: Die Kampagne geht live${software ? ", der digitale Assistent schreibt neue Leads an und bucht Termine in Ihren Kalender" : ", jeder neue Lead kommt sofort per E-Mail"}.`,
  ];
  const greeting = escapeHtml(opts.greeting);
  try {
    const { error } = await mailClient(apiKey).emails.send({
      from,
      to: opts.to,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      subject: "Willkommen bei performancegrowth: Ihre nächsten Schritte",
      text: [
        opts.greeting,
        "",
        `vielen Dank für Ihr Vertrauen, wir freuen uns auf die Zusammenarbeit${products ? ` (${products})` : ""}.`,
        "So geht es weiter:",
        "",
        ...steps.map((s, i) => `${i + 1}. ${s}`),
        "",
        opts.setPasswordUrl ? `Passwort festlegen: ${opts.setPasswordUrl}` : `Login: ${opts.loginUrl}`,
        `Einrichtung: ${opts.setupUrl}`,
        "",
        "Bei Fragen antworten Sie einfach auf diese E-Mail.",
        "",
        signatureText(),
      ].join("\n"),
      html: `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0b1220">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6">${greeting}</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6">vielen Dank für Ihr Vertrauen, wir freuen uns auf die Zusammenarbeit${products ? ` (${escapeHtml(products)})` : ""}. So geht es weiter:</p>
          <ol style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.6">
            ${steps.map((s) => `<li style="margin:0 0 8px">${escapeHtml(s)}</li>`).join("")}
          </ol>
          <p style="margin:24px 0"><a href="${accessUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${opts.setPasswordUrl ? "Zugang einrichten" : "Zum Kundenbereich"}</a></p>
          <p style="margin:0 0 4px;font-size:13px;color:#5b5e68">Login-E-Mail: ${escapeHtml(opts.to)}</p>
          ${start ? `<p style="margin:0 0 16px;font-size:13px;color:#5b5e68">Start: ${start}</p>` : ""}
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6">Bei Fragen antworten Sie einfach auf diese E-Mail.</p>
          ${signatureHtml()}
        </div>`,
    });
    if (error) return { ok: false, error: error.message ?? "Resend hat abgelehnt." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Versand fehlgeschlagen" };
  }
}

/**
 * Einfache Kunden-Mail im performancegrowth-Stil (Absender wie Angebote).
 * Absätze werden escaped; `html`-Blöcke (z. B. Smiley-Leiste) gehen roh durch.
 */
export async function sendCustomerMail(opts: {
  to: string | string[];
  subject: string;
  greeting: string;
  paragraphs: string[];
  list?: string[];
  button?: { label: string; url: string };
  html?: string;
  replyTo?: string | null;
  signature?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OFFER_EMAIL_FROM ?? process.env.RESEND_FROM ?? "performancegrowth <onboarding@resend.dev>";
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY fehlt — „${opts.subject}“ an ${[opts.to].flat().join(", ")}${opts.button ? `, Link: ${opts.button.url}` : ""}`);
    return { ok: false, error: "E-Mail-Versand ist nicht konfiguriert (RESEND_API_KEY fehlt)." };
  }
  const signature = opts.signature ?? `${PROVIDER.manager}\n${PROVIDER.brand}`;
  const replyTo = opts.replyTo === undefined ? (process.env.OFFER_REPLY_TO ?? null) : opts.replyTo;
  try {
    const { error } = await mailClient(apiKey).emails.send({
      from,
      to: opts.to,
      ...(replyTo ? { replyTo } : {}),
      subject: opts.subject,
      text: [
        opts.greeting,
        "",
        ...opts.paragraphs.flatMap((p) => [p, ""]),
        ...(opts.list?.length ? [...opts.list.map((l) => `• ${l}`), ""] : []),
        ...(opts.button ? [`${opts.button.label}: ${opts.button.url}`, ""] : []),
        signatureText(signature),
      ].join("\n"),
      html: `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0b1220">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6">${escapeHtml(opts.greeting)}</p>
          ${opts.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${escapeHtml(p)}</p>`).join("")}
          ${opts.list?.length ? `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6">${opts.list.map((l) => `<li style="margin:0 0 6px">${escapeHtml(l)}</li>`).join("")}</ul>` : ""}
          ${opts.html ?? ""}
          ${opts.button ? `<p style="margin:24px 0"><a href="${opts.button.url}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(opts.button.label)}</a></p>` : ""}
          ${signatureHtml(signature)}
        </div>`,
    });
    if (error) return { ok: false, error: error.message ?? "Resend hat abgelehnt." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Versand fehlgeschlagen" };
  }
}

/** Reine Text-Mail ohne HTML (für Empfänger, deren System die Mail ausliest). */
export async function sendPlainMail(opts: { to: string | string[]; subject: string; text: string }): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_EMAIL_FROM ?? process.env.OFFER_EMAIL_FROM ?? process.env.RESEND_FROM ?? "performancegrowth <onboarding@resend.dev>";
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY fehlt — „${opts.subject}“ an ${[opts.to].flat().join(", ")}`);
    return { ok: false, error: "E-Mail-Versand ist nicht konfiguriert (RESEND_API_KEY fehlt)." };
  }
  try {
    const { error } = await mailClient(apiKey).emails.send({ from, to: opts.to, subject: opts.subject, text: opts.text });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
