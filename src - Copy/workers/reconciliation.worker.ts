import { runGates } from "../engines/gates/gates";
import { evaluateRules } from "../engines/rules/rules";
import { toEvidence } from "../evidence/traceability/validate";
import { buildEvidencePack } from "../evidence/pack/build";
import type { AuditPayload, WorkerRequest } from "../types";

function emit(type: WorkerRequest["type"], payload?: unknown, percent?: number, message?: string) {
  self.postMessage({ type, payload, percent, message });
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    const { type, payload } = event.data;
    if (type !== "PROCESS" || !payload) return;

    const auditPayload = payload as AuditPayload;
    emit("START");

    const gates = runGates(auditPayload);
    if (gates.some((gate) => gate.status !== "PASS")) {
      emit("BLOCKED", buildEvidencePack(gates, []));
      return;
    }

    const rows = auditPayload.usageRows;
    const chunkSize = 1000;
    const findings = evaluateRules(auditPayload);

    for (let i = 0; i < rows.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, rows.length);
      const percent = rows.length ? Math.round((end / rows.length) * 100) : 100;
      emit("PROGRESS", undefined, percent);
    }

    const evidence = toEvidence(findings);
    const result = buildEvidencePack(gates, evidence);
    emit(result.blocked ? "BLOCKED" : "RESULT", result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown reconciliation error";
    emit("ERROR", undefined, undefined, message);
  }
};
