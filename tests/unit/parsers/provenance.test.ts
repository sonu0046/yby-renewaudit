import { describe, expect, it } from "vitest";
import { extractTermsFromFiles, type FileIntakeItem } from "../../../src/parsers/extractor";

describe("Step 2 Term Provenance & Source Reference Strict Isolation Suite", () => {
  it("1. Single File Upload: All extracted terms derive sourceRef EXCLUSIVELY from the single uploaded contract file", () => {
    const singleUploadedFile: FileIntakeItem = {
      id: "file-clean-1",
      file: new File(["Contract price cap: $10,000 contracted seats: 100"], "YBY_RenewAudit_Sample_Contract_Clean.pdf", { type: "application/pdf" }),
      name: "YBY_RenewAudit_Sample_Contract_Clean.pdf",
      size: 2048,
      type: "pdf",
      sha256: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
      parsedText: "Contract price cap: $10,000 contracted seats: 100 renewal price: $12,000"
    };

    const terms = extractTermsFromFiles([singleUploadedFile]);

    expect(terms.length).toBe(4);

    // Assert EVERY term sourceRef is bound to the single uploaded file
    for (const term of terms) {
      expect(term.sourceRef.fileName).toBe("YBY_RenewAudit_Sample_Contract_Clean.pdf");
      expect(term.sourceRef.fileSha256).toBe("a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0");
    }
  });

  it("2. Strict Anti-Leakage Assertion: Unuploaded file names (e.g. renewal_quote_2026.pdf, okta_usage_report.csv) NEVER appear", () => {
    const uploadedFile: FileIntakeItem = {
      id: "file-clean-2",
      file: new File(["MSA Contract"], "YBY_RenewAudit_Sample_Contract_Clean.pdf", { type: "application/pdf" }),
      name: "YBY_RenewAudit_Sample_Contract_Clean.pdf",
      size: 1024,
      type: "pdf",
      sha256: "9999888877776666555544443333222211110000aaaaabbbbbcccccdddddeeee"
    };

    const terms = extractTermsFromFiles([uploadedFile]);
    const fileNamesInTerms = terms.map((t) => t.sourceRef.fileName);

    expect(fileNamesInTerms).not.toContain("renewal_quote_2026.pdf");
    expect(fileNamesInTerms).not.toContain("okta_usage_report.csv");
    expect(fileNamesInTerms).not.toContain("contract_msa.pdf");
  });

  it("3. Empty Intake Protection: Returns empty array when zero files uploaded", () => {
    const terms = extractTermsFromFiles([]);
    expect(terms).toEqual([]);
  });

  it("4. Multi-File Provenance Mapping: Correctly maps contract terms to contract PDF and usage terms to usage CSV", () => {
    const files: FileIntakeItem[] = [
      {
        id: "f1",
        file: new File(["Contract price cap: $15000"], "Vendor_Contract_2026.pdf", { type: "application/pdf" }),
        name: "Vendor_Contract_2026.pdf",
        size: 4096,
        type: "pdf",
        sha256: "hash_contract_123",
        parsedText: "Contract price cap: $15,000 contracted seats: 50"
      },
      {
        id: "f2",
        file: new File(["user_id,seats\n1,1\n2,1"], "Actual_Usage_Log.csv", { type: "text/csv" }),
        name: "Actual_Usage_Log.csv",
        size: 512,
        type: "csv",
        sha256: "hash_usage_456",
        parsedRows: [{ id: "1", seats: 1 }, { id: "2", seats: 1 }]
      }
    ];

    const terms = extractTermsFromFiles(files);
    const priceCapTerm = terms.find((t) => t.name === "priceCap");
    const usedSeatsTerm = terms.find((t) => t.name === "usedSeats");

    expect(priceCapTerm?.sourceRef.fileName).toBe("Vendor_Contract_2026.pdf");
    expect(priceCapTerm?.sourceRef.fileSha256).toBe("hash_contract_123");

    expect(usedSeatsTerm?.sourceRef.fileName).toBe("Actual_Usage_Log.csv");
    expect(usedSeatsTerm?.sourceRef.fileSha256).toBe("hash_usage_456");
  });
});
