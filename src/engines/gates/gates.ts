import type { AuditPayload, GateResult } from "../../types";
import { canCalculate } from "../../state/humanLock";

export function runGates(payload: AuditPayload): GateResult[] {
  const g1: GateResult = {
    gate: "G1",
    status: payload.usageRows && payload.invoiceRows ? "PASS" : "REJECT",
    reason: payload.usageRows && payload.invoiceRows ? undefined : "Required input files are missing."
  };

  const required = ["usage", "invoice"];
  const mapped = required.every((k) => Boolean(payload.mapping[k]));
  const g2: GateResult = {
    gate: "G2",
    status: mapped ? "PASS" : "BLOCK",
    reason: mapped ? undefined : "Required columns are not mapped."
  };

  const n = payload.normalization;
  const normalized = n.currency && n.billingCycle && n.dateFormat === "ISO_8601";
  const g3: GateResult = {
    gate: "G3",
    status: normalized ? "PASS" : "BLOCK",
    reason: normalized ? undefined : "Currency, billing cycle, or date normalization is unresolved."
  };

  const locked = canCalculate(payload.contract.terms.map((t) => t.lockStatus));
  const g4: GateResult = {
    gate: "G4",
    status: locked ? "PASS" : "BLOCK",
    reason: locked ? undefined : "All calculation-relevant terms must be Human Locked."
  };

  const g5: GateResult = {
    gate: "G5",
    status: "PASS",
    reason: undefined
  };

  return [g1, g2, g3, g4, g5];
}
