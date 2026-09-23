import type { Finding, EvidenceRecord } from "../../types";

export function toEvidence(findings: Finding[]): EvidenceRecord[] {
  return findings
    .filter((f) =>
      Boolean(
        f.source.fileSha256 &&
        (f.source.page !== undefined || f.source.line !== undefined || f.source.row !== undefined) &&
        f.formula &&
        f.ruleId
      )
    )
    .map((f) => ({ ...f, sourceHash: f.source.fileSha256 }));
}
