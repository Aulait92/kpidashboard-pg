// Gemeinsame Texte für Kalendereinträge (Bot-Buchung + Buchungsseite).

/** Öffentliche App-URL (für Links im Kalendereintrag). */
export function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN)
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return null;
}

export function eventSummary(
  mode: "phone" | "video",
  name: string,
  product: string | null,
): string {
  return `${mode === "video" ? "Video" : "Telefon"}-Beratung: ${name}${product ? ` (${product})` : ""}`;
}

/** Beschreibung des Kalendereintrags: alles, was der Berater vorab braucht. */
export function buildEventDescription(d: {
  name: string;
  phone: string;
  email: string | null;
  product: string | null;
  mode: "phone" | "video";
  summary: string | null;
  conversationId: string | null;
  bookedVia: "bot" | "booking_page" | "advisor" | "mail_strecke";
}): string {
  const base = appUrl();
  return [
    `Lead: ${d.name}`,
    d.phone ? `Telefon/WhatsApp: ${d.phone}` : "Telefon: keine Nummer angegeben",
    d.email ? `E-Mail: ${d.email}` : "",
    d.product ? `Produkt: ${d.product}` : "",
    `Art: ${d.mode === "video" ? "Videocall (Video-Link im Termin)" : "Telefonat, bitte den Lead anrufen"}`,
    "",
    "Qualifizierung:",
    d.summary?.trim() || "-",
    "",
    base && d.conversationId ? `Chatverlauf: ${base}/admin/whatsapp?c=${d.conversationId}` : "",
    d.bookedVia === "bot"
      ? "Gebucht durch den KI-Assistenten via WhatsApp."
      : d.bookedVia === "advisor"
        ? "Vom Berater in der App gebucht."
        : d.bookedVia === "mail_strecke"
          ? "Vom Lead über die E-Mail-Strecke gebucht (Lead ohne WhatsApp)."
        : "Vom Lead selbst gebucht (Buchungsseite / Meta-Leadformular).",
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");
}

/** Titel der Einladung für den Lead (ohne Interna). advisorName im Dativ („mit Herrn Kannapinn“, lib/vermittler-nennung.ts). */
export function customerEventSummary(mode: "phone" | "video", advisorName: string): string {
  return `${mode === "video" ? "Videoberatung" : "Telefonische Beratung"} mit ${advisorName}`;
}

/** Beschreibung der Einladung für den Lead — freundlich, ohne interne Daten. hi = Anrede-Zeile (lib/ansprache.ts). */
export function customerEventDescription(d: {
  hi: string;
  an?: "sie" | "du";
  mode: "phone" | "video";
  phone: string | null;
  videoUrl: string | null;
  manageUrl: string;
  /** Voller Name für den Gruß am Ende */
  advisorName: string;
  /** Vermittler im Text nach der Nennungsregel („Herr Kannapinn ruft Sie an“); ohne: advisorName */
  person?: { nom: string; dat: string };
}): string {
  const du = d.an === "du";
  const wer = d.person?.nom ?? d.advisorName;
  const how =
    d.mode === "video"
      ? d.videoUrl
        ? `Hier der Link zum Videocall:\n${d.videoUrl}`
        : du
          ? "Den Link zum Videocall bekommst du rechtzeitig vor dem Termin."
          : "Den Link zum Videocall bekommen Sie rechtzeitig vor dem Termin."
      : d.phone
        ? `${wer} ruft ${du ? "dich" : "Sie"} zur vereinbarten Zeit unter +${d.phone} an.`
        : `${wer} ruft ${du ? "dich" : "Sie"} zur vereinbarten Zeit an.`;
  return [
    d.hi,
    du ? "vielen Dank für deine Terminbuchung!" : "vielen Dank für Ihre Terminbuchung!",
    how,
    du
      ? `Falls etwas dazwischenkommt, kannst du den Termin hier verschieben oder absagen:\n${d.manageUrl}`
      : `Falls etwas dazwischenkommt, können Sie den Termin hier verschieben oder absagen:\n${d.manageUrl}`,
    `Bis bald!\n${d.advisorName}`,
  ].join("\n\n");
}
