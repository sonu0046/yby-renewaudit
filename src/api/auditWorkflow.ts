import { sha256 } from "../security/hashing/sha256";
import { runGates } from "../engines/gates/gates";
import { evaluateRules } from "../engines/rules/rules";
import { toEvidence } from "../evidence/traceability/validate";
import { buildEvidencePack } from "../evidence/pack/build";
import { extractTermsFromFiles, type FileIntakeItem } from "../parsers/extractor";
import { canCalculate } from "../state/humanLock";
import { validateGate0Safeguards } from "../licensing/entitlement";
import type { AuditPayload, CalculationTerm, GateStatus, ReconciliationResult } from "../types";

export type WorkflowStepState =
  | "IDLE"
  | "FILE_SELECTED"
  | "VALIDATING"
  | "PARSING"
  | "PARSED"
  | "BLOCKED"
  | "HUMAN_REVIEW_REQUIRED"
  | "HUMAN_LOCK"
  | "NORMALIZATION"
  | "G1_G5"
  | "RECONCILIATION_WORKER"
  | "R1_R8"
  | "EVIDENCE_VALIDATION"
  | "AUDIT_COMPLETE";

export interface Step2ValidationResult {
  valid: boolean;
  fileType: "PDF" | "CSV";
  fileName: string;
  sizeBytes: number;
  sha256: string;
  status: GateStatus;
  reason?: string;
  errorCode?: "UNSUPPORTED_TYPE" | "EMPTY_FILE" | "OVERSIZED_FILE" | "PARSING_FAILED" | "FILE_TOO_LARGE" | "ROW_LIMIT_EXCEEDED";
  errorMessage?: string;
}

export interface ParsedPdfPage {
  pageNumber: number;
  text: string;
}

export interface ParsedPdfDocument {
  fileId: string;
  fileName: string;
  fileType: "PDF";
  sha256: string;
  pages: ParsedPdfPage[];
  isEmptyText?: boolean;
}

export interface ParsedCsvRow {
  sourceRow: number;
  values: Record<string, string | number>;
}

export interface ParsedCsvDocument {
  fileId: string;
  fileName: string;
  fileType: "CSV";
  sha256: string;
  columns: string[];
  rowCount: number;
  rows: ParsedCsvRow[];
  hasAmbiguousDates?: boolean;
}

/**
 * Date Ambiguity Checker according to G8.6 Step 2.5
 * Rejects slash dates (e.g. 01/02/2024) to prevent silent normalization guesses.
 */
export function isAmbiguousDateString(val: string): boolean {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return true;
  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(trimmed)) return true;
  return false;
}

/**
 * Step 2 File Validator
 */
export async function validateStep2File(file: File): Promise<Step2ValidationResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const isPdf = ext === "pdf" || file.type === "application/pdf";
  const isCsv = ext === "csv" || file.type === "text/csv";

  let buffer: Uint8Array;
  if (typeof file.arrayBuffer === "function") {
    const ab = await file.arrayBuffer();
    buffer = new Uint8Array(ab.slice(0));
  } else if (typeof (file as any).text === "function") {
    const text = await (file as any).text();
    buffer = new TextEncoder().encode(text);
  } else {
    buffer = new Uint8Array(
      await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(((reader.result as ArrayBuffer) || new ArrayBuffer(0)).slice(0));
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      })
    );
  }

  const hash = await sha256(buffer);

  if (!isPdf && !isCsv) {
    const msg = `Unsupported file format: .${ext}. Only PDF and CSV audit files are supported in Step 2.`;
    return {
      valid: false,
      fileType: "PDF",
      fileName: file.name,
      sizeBytes: file.size,
      sha256: hash,
      status: "REJECT",
      reason: msg,
      errorCode: "UNSUPPORTED_TYPE",
      errorMessage: msg
    };
  }

  if (file.size === 0) {
    const msg = "File is empty (0 bytes).";
    return {
      valid: false,
      fileType: isPdf ? "PDF" : "CSV",
      fileName: file.name,
      sizeBytes: 0,
      sha256: hash,
      status: "REJECT",
      reason: msg,
      errorCode: "EMPTY_FILE",
      errorMessage: msg
    };
  }

  const safeguard = validateGate0Safeguards(file);
  if (!safeguard.valid) {
    const msg = safeguard.errorMessage || "File exceeds technical safeguard limit.";
    return {
      valid: false,
      fileType: isPdf ? "PDF" : "CSV",
      fileName: file.name,
      sizeBytes: file.size,
      sha256: hash,
      status: "REJECT",
      reason: msg,
      errorCode: safeguard.errorCode || "FILE_TOO_LARGE",
      errorMessage: msg
    };
  }

  return {
    valid: true,
    fileType: isPdf ? "PDF" : "CSV",
    fileName: file.name,
    sizeBytes: file.size,
    sha256: hash,
    status: "PASS"
  };
}

export const validateAuditFile = validateStep2File;

export function executeLocalReconciliationSync(
  terms: CalculationTerm[],
  usageRows: Record<string, string | number>[],
  invoiceRows: Record<string, string | number>[] = [{ amount: 12000 }]
): ReconciliationResult {
  const payload: AuditPayload = {
    contract: { terms },
    usageRows,
    invoiceRows,
    mapping: { usage: "seats", invoice: "amount" },
    normalization: { currency: "USD", billingCycle: "ANNUAL", dateFormat: "ISO_8601" }
  };

  const gates = runGates(payload);
  const blocked = gates.some((g) => g.status !== "PASS");
  if (blocked) {
    return buildEvidencePack(gates, []);
  }

  const findings = evaluateRules(payload);
  const evidence = toEvidence(findings);
  return buildEvidencePack(gates, evidence);
}
