import type { ValidationSeverity } from "../types/asset";

export const VALIDATION_STATUS: Record<
  ValidationSeverity,
  { label: string; color: string; symbol: string; description: string }
> = {
  good: {
    label: "Checked",
    color: "#4ade80",
    symbol: "✓",
    description: "No flags in the checks performed; suitability still depends on the target use.",
  },
  warning: {
    label: "Review",
    color: "#fbbf24",
    symbol: "△",
    description: "Review against the intended material, shape and performance budget.",
  },
  bad: {
    label: "Needs attention",
    color: "#f87171",
    symbol: "!",
    description:
      "A resource, geometry or material-binding problem was detected. Inspect it before use.",
  },
  unknown: {
    label: "Incomplete",
    color: "#9ca8bb",
    symbol: "?",
    description: "Some checks could not be completed. Unknown does not mean passed.",
  },
};

export function worstSeverity(severities: ValidationSeverity[]): ValidationSeverity {
  if (severities.includes("bad")) return "bad";
  if (severities.includes("warning")) return "warning";
  if (severities.includes("unknown") || severities.length === 0) return "unknown";
  return "good";
}
