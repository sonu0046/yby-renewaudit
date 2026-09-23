import { describe, expect, it } from "vitest";
import { sha256 } from "../../src/security/hashing/sha256";
import { redactPII } from "../../src/security/pii/redact";
import { confirmTerm, editTerm, lockTerm, canCalculate } from "../../src/state/humanLock";
import { runGates } from "../../src/engines/gates/gates";
import { evaluateRules } from "../../src/engines/rules/rules";
import { toEvidence } from "../../src/evidence/traceability/validate";
import { buildEvidencePack } from "../../src/evidence/pack/build";
import { extractTermsFromFiles, type FileIntakeItem } from "../../src/parsers/extractor";
import type { AuditPayload, CalculationTerm } from "../../src/types";

describe("G8.6 End-to-End Integrated Audit Workflow Suite", () => {
  it("A & B: Generates client-side SHA-256 hash natively without backend", async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode("Sample contract binary buffer content");
    const hash = await sha256(data);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("C: Extractor generates terms from intake items in BLOCKED initial state", () => {
    const intakeItems: FileIntakeItem[] = [
      {
        id: "1",
        file: new File(["Contract content price cap: $10000"], "contract_msa.pdf", { type: "application/pdf" }),
        name: "contract_msa.pdf",
        size: 1024,
        type: "pdf",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        parsedText: "Contract price cap: $10,000 contracted seats: 100"
      },
      {
        id: "2",
        file: new File(["Renewal total price: $12000"], "renewal_quote.pdf", { type: "application/pdf" }),
        name: "renewal_quote.pdf",
        size: 512,
        type: "pdf",
        sha256: "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
        parsedText: "Renewal price: $12,000"
      }
    ];

    const terms = extractTermsFromFiles(intakeItems);
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.every((t) => t.lockStatus === "BLOCKED")).toBe(true);
  });

  it("D: Enforces Human Lock confirmation & lock invalidation on value edit", () => {
    let term: CalculationTerm = {
      id: "term-1",
      name: "priceCap",
      value: 10000,
      lockStatus: "BLOCKED",
      sourceRef: { fileName: "contract.pdf", fileSha256: "abc", page: 1 }
    };

    expect(canCalculate([term.lockStatus])).toBe(false);

    // Confirm and Lock
    term = lockTerm(confirmTerm(term));
    expect(term.lockStatus).toBe("HUMAN_LOCK");
    expect(canCalculate([term.lockStatus])).toBe(true);

    // Value edit invalidates lock back to BLOCKED
    term = editTerm(term, 9500);
    expect(term.lockStatus).toBe("BLOCKED");
    expect(canCalculate([term.lockStatus])).toBe(false);
  });

  it("E & F: Executes integrated G1-G5 gates and R1-R8 rules engine", () => {
    const lockedTerms: CalculationTerm[] = [
      { id: "1", name: "priceCap", value: 10000, lockStatus: "HUMAN_LOCK", sourceRef: { fileName: "c.pdf", fileSha256: "hash1", page: 1 } },
      { id: "2", name: "renewalPrice", value: 12000, lockStatus: "HUMAN_LOCK", sourceRef: { fileName: "r.csv", fileSha256: "hash2", row: 2 } },
      { id: "3", name: "contractedSeats", value: 100, lockStatus: "HUMAN_LOCK", sourceRef: { fileName: "c.pdf", fileSha256: "hash1", page: 2 } },
      { id: "4", name: "usedSeats", value: 72, lockStatus: "HUMAN_LOCK", sourceRef: { fileName: "u.csv", fileSha256: "hash3", row: 10 } }
    ];

    const payload: AuditPayload = {
      contract: { terms: lockedTerms },
      usageRows: [{ id: "1" }],
      invoiceRows: [{ amount: 12000 }],
      mapping: { usage: "seats", invoice: "amount" },
      normalization: { currency: "USD", billingCycle: "ANNUAL", dateFormat: "ISO_8601" }
    };

    const gates = runGates(payload);
    expect(gates.every((g) => g.status === "PASS")).toBe(true);

    const findings = evaluateRules(payload);
    expect(findings).toHaveLength(2);

    const r1 = findings.find((f) => f.ruleId === "R1");
    expect(r1?.delta).toBe(2000);

    const r2 = findings.find((f) => f.ruleId === "R2");
    expect(r2?.delta).toBe(28);
  });

  it("G: Enforces No-Trace No-Finding evidence validation rule", () => {
    const validFinding = {
      ruleId: "R1",
      title: "Price Cap Violation",
      delta: 2000,
      formula: "12000 - 10000 = 2000",
      source: { fileName: "r.pdf", fileSha256: "valid-hash-123", page: 4 },
      severity: "HIGH" as const
    };

    const invalidFinding = {
      ruleId: "R2",
      title: "Untraceable Finding",
      delta: 10,
      formula: "10 - 0 = 10",
      source: { fileName: "bad.pdf", fileSha256: "" },
      severity: "WARNING" as const
    };

    const evidence = toEvidence([validFinding, invalidFinding]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].ruleId).toBe("R1");

    const pack = buildEvidencePack(
      [{ gate: "G1", status: "PASS" }, { gate: "G2", status: "PASS" }, { gate: "G3", status: "PASS" }, { gate: "G4", status: "PASS" }, { gate: "G5", status: "PASS" }],
      evidence
    );
    expect(pack.blocked).toBe(false);
    expect(pack.evidence).toHaveLength(1);
  });

  it("H: Preserves local PII isolation without DOM or network dependencies", () => {
    const sensitive = "Contact CEO bhimrao@example.com at +91 98765 43210 regarding contract MSA #99482.";
    const redacted = redactPII(sensitive);
    expect(redacted).not.toContain("bhimrao@example.com");
    expect(redacted).not.toContain("98765 43210");
    expect(redacted).toContain("[REDACTED]");
  });
});
