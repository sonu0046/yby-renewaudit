import type { AuditPayload, Finding } from "../../types";

function num(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric value: ${String(v)}`);
  return n;
}

export function evaluateRules(payload: AuditPayload): Finding[] {
  const findings: Finding[] = [];
  const terms = new Map(payload.contract.terms.map((t) => [t.name, t]));

  const cap = terms.get("priceCap");
  const renewal = terms.get("renewalPrice");
  if (cap && renewal) {
    const capValue = num(cap.value);
    const renewalValue = num(renewal.value);
    const delta = renewalValue - capValue;
    if (delta > 0) {
      findings.push({
        ruleId: "R1",
        title: "Price Cap Violation",
        delta,
        formula: `${renewalValue} - ${capValue} = ${delta}`,
        source: renewal.sourceRef,
        severity: "HIGH"
      });
    }
  }

  const seats = terms.get("contractedSeats");
  const used = terms.get("usedSeats");
  if (seats && used) {
    const variance = num(seats.value) - num(used.value);
    if (variance > 0) {
      findings.push({
        ruleId: "R2",
        title: "Unused / Shelf-ware Seat Variance",
        delta: variance,
        formula: `${num(seats.value)} - ${num(used.value)} = ${variance}`,
        source: used.sourceRef,
        severity: "WARNING"
      });
    }
  }

  return findings;
}
