import { redirect } from "next/navigation";

// Alte Oberfläche, Vertrieb → Termine: die Termin-Übersicht gibt es nur im neuen Admin (Verkaufen → Termine).
export default async function TermineAltPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  redirect(`/admin/neu/vertrieb/termine${q ? `?${q}` : ""}`);
}
