import { describe, expect, it } from "vitest";
import { buildNegotiationDraft, buildNegotiationItem, sanitizeFileName } from "../../../src/engines/negotiation/builder";
import type { CalculationTerm, EvidenceRecord, ReconciliationResult } from "../../../src/types";

describe("Deterministic Negotiation Engine Suite (G8.7)", () => {
  it("1. Null or empty result yields BLOCKED negotiation draft", () => {
    const draft = buildNegotiationDraft(null, []);
    expect(draft.overallStatus).toBe("BLOCKED");
    expect(draft.totalOverchargeAmount).toBe(0);
    expect(draft.totalShelfwareSeats).toBe(0);
    expect(draft.items).toHaveLength(0);
    expect(draft.isHumanLocked).toBe(false);
  });

  it("2. R1 price cap violation generates deterministic overcharge position & ask", () => {
    const evidence: EvidenceRecord = {
      ruleId: "R1",
      title: "Price Cap Violation",
      delta: 2000,
      formula: "12000 renewal - 10000 cap = 2000 overcharge",
      source: { fileName: "C:\\Users\\HP\\Downloads\\MSA_Contract.pdf", fileSha256: "abc123hash", page: 1, row: 12 },
      severity: "HIGH",
      sourceHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    };

    const item = buildNegotiationItem(evidence, []);
    expect(item.ruleId).toBe("R1");
    expect(item.sourceFile).toBe("MSA_Contract.pdf");
    expect(item.financialImpactFormatted).toContain("+$2,000 Billed Price Overcharge");
    expect(item.suggestedAsk).toContain("Issue an immediate invoice credit or revised billing statement of $2,000");
    expect(item.locationRef).toBe("Page 1 / Row 12");
  });

  it("3. R2 seat variance generates deterministic seat de-escalation ask", () => {
    const evidence: EvidenceRecord = {
      ruleId: "R2",
      title: "Unused / Shelf-ware Seats",
      delta: 28,
      formula: "100 contracted seats - 72 active seats = 28 unused seats",
      source: { fileName: "/var/uploads/usage_report.csv", fileSha256: "def456hash", page: 1, row: 1 },
      severity: "WARNING",
      sourceHash: "f1d2d2f924e986ac86fdf7b36c94bcdf32beec15"
    };

    const item = buildNegotiationItem(evidence, []);
    expect(item.ruleId).toBe("R2");
    expect(item.sourceFile).toBe("usage_report.csv");
    expect(item.negotiationPosition).toContain("Active user telemetry demonstrates");
    expect(item.financialImpactFormatted).toContain("+28 Unutilized / Shelf-ware Seats");
    expect(item.suggestedAsk).toContain("De-escalate the renewal seat tier from contracted quantity down to active usage level (reduction of 28 seats)");

    // PDF contract source should use "Verified audit terms demonstrate"
    const pdfEvidence: EvidenceRecord = {
      ...evidence,
      source: { fileName: "YBY_RenewAudit_Sample_Contract_Clean.pdf", fileSha256: "hash123", page: 2, row: 1 }
    };
    const pdfItem = buildNegotiationItem(pdfEvidence, []);
    expect(pdfItem.negotiationPosition).toContain("Verified audit terms demonstrate");
  });

  it("4. SanitizeFileName strips Windows and Unix disk directory paths", () => {
    expect(sanitizeFileName("C:\\Users\\HP\\OneDrive\\Desktop\\contract.pdf")).toBe("contract.pdf");
    expect(sanitizeFileName("/home/user/documents/usage.csv")).toBe("usage.csv");
    expect(sanitizeFileName("simple_file.pdf")).toBe("simple_file.pdf");
    expect(sanitizeFileName("")).toBe("Unknown_Source");
  });

  it("5. Full ReconciliationResult generates complete negotiation draft with human lock confirmation", () => {
    const result: ReconciliationResult = {
      blocked: false,
      gates: [{ gate: "G1", status: "PASS" }],
      findings: [],
      evidence: [
        {
          ruleId: "R1",
          title: "Price Cap Violation",
          delta: 2000,
          formula: "12000 - 10000 = 2000",
          source: { fileName: "contract.pdf", fileSha256: "hash1" },
          severity: "HIGH",
          sourceHash: "hash1"
        },
        {
          ruleId: "R2",
          title: "Unused Seats",
          delta: 28,
          formula: "100 - 72 = 28",
          source: { fileName: "usage.csv", fileSha256: "hash2" },
          severity: "WARNING",
          sourceHash: "hash2"
        }
      ]
    };

    const terms: CalculationTerm[] = [
      { id: "1", name: "priceCap", value: 10000, sourceRef: { fileName: "c.pdf", fileSha256: "h" }, lockStatus: "HUMAN_LOCK" },
      { id: "2", name: "renewalPrice", value: 12000, sourceRef: { fileName: "c.pdf", fileSha256: "h" }, lockStatus: "HUMAN_LOCK" }
    ];

    const draft = buildNegotiationDraft(result, terms);
    expect(draft.overallStatus).toBe("PASS");
    expect(draft.totalOverchargeAmount).toBe(2000);
    expect(draft.totalShelfwareSeats).toBe(28);
    expect(draft.items).toHaveLength(2);
    expect(draft.isHumanLocked).toBe(true);
    expect(draft.items[0].supportingTerms).toContain("priceCap: 10000");
  });
});
