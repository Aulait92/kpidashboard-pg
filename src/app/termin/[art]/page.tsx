import { connection } from "next/server";
import { BookingPage, terminMetadata } from "../booking-page";

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
  return <BookingPage slug={(await params).art} sp={await searchParams} />;
}
