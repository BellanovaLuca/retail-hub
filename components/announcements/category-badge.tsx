import { Badge } from "@/components/ui/badge";
import { categoryLabels, type Category } from "@/lib/announcements/model";

/** Etichetta discreta; "urgente" in rosso scuro (§9). */
export function CategoryBadge({ category }: { category: Category }) {
  return (
    <Badge tone={category === "urgente" ? "danger" : "neutral"}>{categoryLabels[category]}</Badge>
  );
}
