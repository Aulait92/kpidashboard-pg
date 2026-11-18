import type { LucideIcon } from "lucide-react";
import { Compass, Euro, Send, SlidersHorizontal, Sun, TrendingUp, Users, Wrench } from "lucide-react";
import type { BereichId } from "@/lib/admin-neu/navigation";

/** Symbol je Bereich (navigation.ts bleibt reine Daten), wie in der Demo v2 (docs/ux/admin-v2/demo.html). */
export const BEREICH_SYMBOL: Record<BereichId, LucideIcon> = {
  "mein-tag": Sun,
  verkaufen: TrendingUp,
  betreuen: Users,
  liefern: Send,
  geld: Euro,
  werkzeuge: Wrench,
  einstellungen: SlidersHorizontal,
  "was-wo-ist": Compass,
};
