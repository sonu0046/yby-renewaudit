import type { CalculationTerm, LockStatus } from "../types";

export function confirmTerm(term: CalculationTerm): CalculationTerm {
  return { ...term, lockStatus: "CONFIRMED" };
}

export function lockTerm(term: CalculationTerm): CalculationTerm {
  if (term.lockStatus !== "CONFIRMED") {
    throw new Error("Term must be confirmed before Human Lock.");
  }
  return { ...term, lockStatus: "HUMAN_LOCK", verifiedAt: new Date().toISOString() };
}

export function editTerm(term: CalculationTerm, value: string | number): CalculationTerm {
  return { ...term, value, lockStatus: "BLOCKED", verifiedAt: undefined };
}

export function canCalculate(statuses: LockStatus[]): boolean {
  return statuses.length > 0 && statuses.every((s) => s === "HUMAN_LOCK");
}
