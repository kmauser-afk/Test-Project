import type { Priority, Severity } from "@prisma/client";

// Derived field (PMO pattern #3): priority is derived from impact × urgency,
// not stored independently as the source of truth.
export function derivePriority(impact: Severity, urgency: Severity): Priority {
  const score = (s: Severity) => (s === "HIGH" ? 3 : s === "MEDIUM" ? 2 : 1);
  const total = score(impact) + score(urgency);
  if (total >= 6) return "P1";
  if (total === 5) return "P2";
  if (total === 4) return "P3";
  return "P4";
}
