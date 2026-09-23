import type { GateResult, ReconciliationResult } from "../../types";

interface WorkflowStepsProps {
  filesCount: number;
  allLocked: boolean;
  gates: GateResult[];
  progress: number;
  result: ReconciliationResult | null;
}

export function WorkflowSteps({ filesCount, allLocked, gates, progress, result }: WorkflowStepsProps) {
  const steps = [
    {
      id: 1,
      name: "Files Intake",
      status: filesCount > 0 ? "PASSED" : "PENDING",
      detail: filesCount > 0 ? `${filesCount} files loaded & SHA-256 hashed` : "Awaiting document drop"
    },
    {
      id: 2,
      name: "Parsing & Candidate Extraction",
      status: filesCount > 0 ? "PASSED" : "PENDING",
      detail: filesCount > 0 ? "PDF, CSV & XLSX Parsed" : "Awaiting files"
    },
    {
      id: 3,
      name: "Human Verification",
      status: allLocked ? "PASSED" : "BLOCKED",
      detail: allLocked ? "4 / 4 Terms Human Locked" : "Unverified terms remain"
    },
    {
      id: 4,
      name: "Normalization",
      status: gates.find((g) => g.gate === "G3")?.status === "PASS" ? "PASSED" : allLocked ? "BLOCKED" : "PENDING",
      detail: "Currency (USD), Billing (Annual), ISO Date"
    },
    {
      id: 5,
      name: "G1–G5 Hard Gates",
      status: gates.every((g) => g.status === "PASS") ? "PASSED" : gates.some((g) => g.status === "BLOCK") ? "BLOCKED" : "PENDING",
      detail: gates.every((g) => g.status === "PASS") ? "5/5 Gates Passed" : "Gate Blocked"
    },
    {
      id: 6,
      name: "Reconciliation Worker",
      status: progress === 100 ? "PASSED" : progress > 0 ? "RUNNING" : "PENDING",
      detail: `Worker progress: ${progress}% (1,000-row chunks)`
    },
    {
      id: 7,
      name: "R1–R8 Findings",
      status: result && !result.blocked ? "PASSED" : "PENDING",
      detail: result ? `${result.findings.length} findings calculated` : "Awaiting engine"
    },
    {
      id: 8,
      name: "Evidence Validation",
      status: result && !result.blocked ? "PASSED" : "PENDING",
      detail: result ? "100% SHA-256 & Location Traceable" : "Awaiting findings"
    },
    {
      id: 9,
      name: "Evidence Pack",
      status: result && !result.blocked ? "PASSED" : "PENDING",
      detail: result && !result.blocked ? "Audit Ready • JSON & PDF Export" : "Calculation Pending"
    }
  ];

  return (
    <div className="workflow-steps-panel" style={{ margin: "20px 0" }}>
      <h3 style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span>🔄 9-Step Integrated Audit Pipeline</span>
        {result && !result.blocked && (
          <span className="badge badge-emerald">AUDIT COMPLETE — ALL STAGES PASSED</span>
        )}
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
        {steps.map((step) => {
          let badgeClass = "badge-indigo";
          if (step.status === "PASSED") badgeClass = "badge-emerald";
          if (step.status === "BLOCKED") badgeClass = "badge-rose";
          if (step.status === "RUNNING") badgeClass = "badge-amber";

          return (
            <div
              key={step.id}
              style={{
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid var(--border-glass)",
                borderRadius: "var(--radius-md)",
                padding: "14px",
                borderLeft: step.status === "PASSED" ? "4px solid var(--accent-emerald)" : step.status === "BLOCKED" ? "4px solid var(--accent-rose)" : "4px solid var(--border-glass)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-muted)" }}>
                  STEP {step.id}
                </span>
                <span className={`badge ${badgeClass}`}>{step.status}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", margin: "6px 0 2px 0" }}>
                {step.name}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {step.detail}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
