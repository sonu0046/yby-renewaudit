export type GateStatus = "PASS" | "BLOCK" | "REJECT";
export type LockStatus = "UNVERIFIED" | "BLOCKED" | "USER_REVIEW" | "CONFIRMED" | "HUMAN_LOCK";

export interface CalculationTerm {
  id: string;
  name: string;
  value: string | number;
  sourceRef: SourceRef;
  lockStatus: LockStatus;
  verifiedAt?: string;
}

export interface SourceRef {
  fileName: string;
  fileSha256: string;
  page?: number;
  line?: number;
  row?: number;
}

export interface AuditPayload {
  contract: { terms: CalculationTerm[] };
  usageRows: Record<string, string | number>[];
  invoiceRows: Record<string, string | number>[];
  mapping: Record<string, string>;
  normalization: NormalizationState;
}

export type WorkerEventType = "START" | "PROGRESS" | "RESULT" | "BLOCKED" | "ERROR";

export interface WorkerRequest {
  type: "PROCESS" | "HASH" | "RESET" | WorkerEventType;
  payload?: AuditPayload | ReconciliationResult | unknown;
  percent?: number;
  message?: string;
}

export interface WorkerProgress {
  type: "PROGRESS";
  percent: number;
}

export interface Finding {
  ruleId: string;
  title: string;
  delta: number;
  formula: string;
  source: SourceRef;
  severity: "INFO" | "WARNING" | "HIGH";
}

export interface EvidenceRecord extends Finding {
  sourceHash: string;
}

export interface GateResult {
  gate: "G1" | "G2" | "G3" | "G4" | "G5";
  status: GateStatus;
  reason?: string;
}

export interface NormalizationState {
  currency?: string;
  billingCycle?: "MONTHLY" | "ANNUAL";
  dateFormat?: "ISO_8601";
}

export interface ReconciliationResult {
  gates: GateResult[];
  findings: Finding[];
  evidence: EvidenceRecord[];
  blocked: boolean;
}

export interface NegotiationItem {
  ruleId: string;
  title: string;
  severity: "INFO" | "WARNING" | "HIGH";
  findingText: string;
  financialImpactFormatted: string;
  numericDelta: number;
  negotiationPosition: string;
  suggestedAsk: string;
  formulaTrail: string;
  sourceFile: string;
  sourceHash: string;
  locationRef: string;
  supportingTerms: string[];
}

export interface NegotiationDraft {
  generatedAt: string;
  overallStatus: "PASS" | "BLOCKED";
  totalOverchargeAmount: number;
  totalShelfwareSeats: number;
  items: NegotiationItem[];
  isHumanLocked: boolean;
}

