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
  conversationId: string;
  bookedVia: "bot" | "booking_page";
}): string {
  const base = appUrl();
  return [
    `Lead: ${d.name}`,
    `Telefon/WhatsApp: ${d.phone}`,
    d.email ? `E-Mail: ${d.email}` : "",
    d.product ? `Produkt: ${d.product}` : "",
    `Art: ${d.mode === "video" ? "Videocall (Video-Link im Termin)" : "Telefonat, bitte den Lead anrufen"}`,
    "",
    "Qualifizierung:",
    d.summary?.trim() || "-",
    "",
    base ? `Chatverlauf: ${base}/admin/whatsapp?c=${d.conversationId}` : "",
    d.bookedVia === "bot"
      ? "Gebucht durch den KI-Assistenten via WhatsApp."
      : "Vom Lead selbst gebucht (Buchungsseite / Meta-Leadformular).",
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");
}

/** Titel der Einladung für den Lead (ohne Interna). */
export function customerEventSummary(mode: "phone" | "video", advisorName: string): string {
  return `${mode === "video" ? "Videoberatung" : "Telefonische Beratung"} mit ${advisorName}`;
}

/** Beschreibung der Einladung für den Lead — freundlich, ohne interne Daten. */
export function customerEventDescription(d: {
  firstName: string;
  mode: "phone" | "video";
  phone: string | null;
  videoUrl: string | null;
  manageUrl: string;
  advisorName: string;
}): string {
  const how =
    d.mode === "video"
      ? d.videoUrl
        ? `Hier der Link zum Videocall:\n${d.videoUrl}`
        : "Den Link zum Videocall bekommst du rechtzeitig vor dem Termin."
      : d.phone
        ? `Wir rufen dich zur vereinbarten Zeit unter +${d.phone} an.`
        : "Wir rufen dich zur vereinbarten Zeit an.";
  return [
    `Hallo ${d.firstName},`,
    "vielen Dank für deine Terminbuchung!",
    how,
    `Falls etwas dazwischenkommt, kannst du den Termin hier verschieben oder absagen:\n${d.manageUrl}`,
    `Bis bald!\n${d.advisorName}`,
  ].join("\n\n");
}
