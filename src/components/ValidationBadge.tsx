import type { ValidationSeverity } from "../types/asset";
import { VALIDATION_STATUS } from "../lib/validationStatus";

export function ValidationBadge({ severity }: { severity: ValidationSeverity }) {
  const status = VALIDATION_STATUS[severity];
  return (
    <span
      className={`validation-badge ${severity}`}
      title={status.description}
      style={{ color: status.color, backgroundColor: `${status.color}20` }}
    >
      {status.label}
    </span>
  );
}
