import { describe, expect, it } from "vitest";
import { runGates } from "../../../src/engines/gates/gates";
import type { AuditPayload } from "../../../src/types";

const base = (): AuditPayload => ({
  contract: { terms: [{
    id: "x", name: "priceCap", value: 100,
    lockStatus: "HUMAN_LOCK",
    sourceRef: { fileName: "c.pdf", fileSha256: "abc", page: 1 }
  }]},
  usageRows: [{}],
  invoiceRows: [{}],
  mapping: { usage: "usage", invoice: "invoice" },
  normalization: { currency: "USD", billingCycle: "ANNUAL", dateFormat: "ISO_8601" }
});

describe("G1-G5", () => {
  it("blocks G2 when mapping is missing", () => {
    const p = base(); p.mapping = {};
    expect(runGates(p).find(g => g.gate === "G2")?.status).toBe("BLOCK");
  });
  it("blocks G3 on ambiguous normalization", () => {
    const p = base(); p.normalization = {};
    expect(runGates(p).find(g => g.gate === "G3")?.status).toBe("BLOCK");
  });
  it("blocks G4 without Human Lock", () => {
    const p = base(); p.contract.terms[0].lockStatus = "UNVERIFIED";
    expect(runGates(p).find(g => g.gate === "G4")?.status).toBe("BLOCK");
  });
});