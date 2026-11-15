import { redirect } from "next/navigation";

// /demo auf der App-Adresse: zur Live-Demo der Beratungspräsentation (auf der Buchungsadresse schreibt die Middleware um).
export default function DemoPage() {
  redirect("/demo/beratung");
}
