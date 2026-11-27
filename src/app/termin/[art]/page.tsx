import { connection } from "next/server";
import { redirect } from "next/navigation";
import { publicSalesBookingUrl } from "@/lib/vertrieb/buchung";
import { BookingPage, terminMetadata } from "../booking-page";

// Alter Link aus Unterlagen und QR-Codes (Ole, 27.11.2026): /termin/erstgespraech war nie ein Termintyp, nur der
// Beispiel-Link der WhatsApp-Vorlage. Weiter zur öffentlichen Buchungsseite (performancegrowth.de/termin).
const WEITERLEITUNG = new Set(["erstgespraech"]);

// Weitere Termintypen, z. B. /termin/entscheidung (Entscheidungs-Call nach dem Angebot).
export const metadata = terminMetadata;

export default async function TerminArtPage({
  params,
  searchParams,
}: {
  params: Promise<{ art: string }>;
  searchParams: Promise<{ einbetten?: string; k?: string }>;
}) {
  await connection();
  const art = (await params).art;
  if (WEITERLEITUNG.has(art.toLowerCase())) redirect(publicSalesBookingUrl());
  return <BookingPage slug={art} sp={await searchParams} />;
}
