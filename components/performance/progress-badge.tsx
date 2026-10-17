import { Badge } from "@/components/ui/badge";
import { PROGRESS_LABELS, type Progress } from "@/lib/performance/goals";

const TONE: Record<Progress, "neutral" | "warning" | "success" | "danger"> = {
  non_iniziato: "neutral",
  in_corso: "warning",
  raggiunto: "success",
  non_raggiunto: "danger",
};

/** Stato dell'obiettivo come etichetta discreta. */
export function ProgressBadge({ progress }: { progress: Progress | null }) {
  if (!progress) return null;
  return <Badge tone={TONE[progress]}>{PROGRESS_LABELS[progress]}</Badge>;
}
