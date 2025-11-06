import { Badge } from "@/components/ui/badge";

interface ConfidenceBadgeProps {
  score?: number | null;
  className?: string;
}

export default function ConfidenceBadge({ score, className = "" }: ConfidenceBadgeProps) {
  if (score === null || score === undefined) {
    return null;
  }

  let colorClass = "bg-slate-500";
  let label = "Low";

  if (score >= 0.8) {
    colorClass = "bg-green-600";
    label = "High";
  } else if (score >= 0.5) {
    colorClass = "bg-amber-500";
    label = "Medium";
  }

  const percentage = Math.round(score * 100);

  return (
    <Badge
      className={`${colorClass} text-white text-xs ${className}`}
      title={`Confidence: ${percentage}%`}
    >
      {percentage}%
    </Badge>
  );
}

