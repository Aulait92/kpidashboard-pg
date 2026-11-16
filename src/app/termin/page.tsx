import { connection } from "next/server";
import { BookingPage, terminMetadata } from "./booking-page";

// Vertriebs-Buchungsseite (Meta-Leads-Call), eingebettet auf performancegrowth.de/termin (?einbetten=1).
export const metadata = terminMetadata;

export default async function TerminPage({ searchParams }: { searchParams: Promise<{ einbetten?: string; k?: string }> }) {
  await connection();
  return <BookingPage slug={null} sp={await searchParams} />;
}
