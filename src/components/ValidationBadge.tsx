import type { ValidationSeverity } from "../types/asset";

interface ValidationBadgeProps {
  severity: ValidationSeverity;
}

const BADGE_CONFIG: Record<ValidationSeverity, { label: string; color: string; bg: string }> = {
  good: { label: "Good", color: "#4ade80", bg: "rgba(74, 222, 128, 0.2)" },
  warning: { label: "Warning", color: "#fbbf24", bg: "rgba(251, 191, 36, 0.2)" },
  bad: { label: "Bad", color: "#f87171", bg: "rgba(248, 113, 113, 0.2)" },
};

export function ValidationBadge({ severity }: ValidationBadgeProps) {
  const config = BADGE_CONFIG[severity];

  return (
    <span
      className={`inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold leading-relaxed whitespace-nowrap ${severity}`}
      style={{ color: config.color, backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  );
}
