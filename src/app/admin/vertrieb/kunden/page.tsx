import { redirect } from "next/navigation";

// Kunden haben jetzt einen eigenen Bereich im Hauptmenü.
export default function Page() {
  redirect("/admin/kunden/pipeline");
}
