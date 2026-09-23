import type { EvidenceRecord, GateResult, ReconciliationResult } from "../../types";

export function buildEvidencePack(
  gates: GateResult[],
  evidence: EvidenceRecord[]
): ReconciliationResult {
  const blocked = gates.some((g) => g.status !== "PASS");
  return { gates, findings: evidence, evidence, blocked };
}
