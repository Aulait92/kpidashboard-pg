import { redirect } from "next/navigation";
import { NEU } from "@/lib/admin-neu/navigation";

// Werkzeuge ist seit dem UX-Umbau (20.11.2026) die Gruppe „Technik“ der Einstellungen. Die Adresse bleibt für alte
// Lesezeichen und Links; Systemzustand (/werkzeuge/zustand) und Meta-Gebühren (/werkzeuge/meta-gebuehren) bleiben, wo sie sind.
export default function WerkzeugePage() {
  redirect(`${NEU}/einstellungen#technik`);
}
