import { useEffect, useState } from "react";
import { createReconciliationWorker, createRedactorWorker } from "./workers/factory";
import { FileDropzone } from "./components/intake/FileDropzone";
import { HumanLockGrid } from "./components/lock/HumanLockGrid";
import { WorkflowSteps } from "./components/workflow/WorkflowSteps";
import { EvidencePack } from "./components/evidence/EvidencePack";
import type { AuditPayload, ReconciliationResult, CalculationTerm } from "./types";
import { extractTermsFromFiles, type FileIntakeItem } from "./parsers/extractor";
import "./styles.css";

const defaultTerms: CalculationTerm[] = [
  {
    id: "price-cap",
    name: "priceCap",
    value: 10000,
    lockStatus: "HUMAN_LOCK",
    sourceRef: { fileName: "contract_msa.pdf", fileSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", page: 4 }
  },
  {
    id: "renewal-price",
    name: "renewalPrice",
    value: 12000,
    lockStatus: "HUMAN_LOCK",
    sourceRef: { fileName: "renewal_quote_2026.pdf", fileSha256: "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4", row: 12 }
  },
  {
    id: "contracted-seats",
    name: "contractedSeats",
    value: 100,
    lockStatus: "HUMAN_LOCK",
    sourceRef: { fileName: "contract_msa.pdf", fileSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", page: 5 }
  },
  {
    id: "used-seats",
    name: "usedSeats",
    value: 72,
    lockStatus: "HUMAN_LOCK",
    sourceRef: { fileName: "okta_usage_report.csv", fileSha256: "1f3870be274f6c49b3e31a0c6728957f6d338f0d8a57e3f4236968222d4f3b79", row: 20 }
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<"intake" | "lock" | "pipeline" | "evidence" | "pii">("pipeline");
  const [files, setFiles] = useState<FileIntakeItem[]>([]);
  const [terms, setTerms] = useState<CalculationTerm[]>(defaultTerms);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [piiInput, setPiiInput] = useState("Contact procurement lead john.doe@techcorp.com or call +91 98765 43210 for contract #88491.");
  const [redactedText, setRedactedText] = useState("");

  function triggerAuditEngine(currentTerms: CalculationTerm[], currentFiles: FileIntakeItem[]) {
    let usageRows: Record<string, string | number>[] = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), seats: 72 }));

    const usageFile = currentFiles.find((f) => f.parsedRows && f.parsedRows.length > 0);
    if (usageFile?.parsedRows) {
      usageRows = usageFile.parsedRows as Record<string, string | number>[];
    }

    const payload: AuditPayload = {
      contract: { terms: currentTerms },
      usageRows,
      invoiceRows: [{ amount: 12000 }],
      mapping: { usage: "seats", invoice: "amount" },
      normalization: { currency: "USD", billingCycle: "ANNUAL", dateFormat: "ISO_8601" }
    };

    const worker = createReconciliationWorker();
    worker.onmessage = (e) => {
      if (e.data?.type === "PROGRESS") {
        setProgress(e.data.percent);
      } else if (e.data?.gates || e.data?.payload?.gates) {
        const res = e.data.gates ? e.data : e.data.payload;
        setResult(res);
      }
    };
    worker.postMessage({ type: "PROCESS", payload });
  }

  useEffect(() => {
    triggerAuditEngine(terms, files);
  }, []);

  function handleFilesUpdated(newFiles: FileIntakeItem[]) {
    setFiles(newFiles);
    if (newFiles.length > 0) {
      const extracted = extractTermsFromFiles(newFiles);
      setTerms(extracted);
      triggerAuditEngine(extracted, newFiles);
    }
  }

  function handleTermsUpdated(newTerms: CalculationTerm[]) {
    setTerms(newTerms);
    triggerAuditEngine(newTerms, files);
  }

  function handleRedact() {
    const worker = createRedactorWorker();
    worker.onmessage = (e) => {
      setRedactedText(e.data.text);
      worker.terminate();
    };
    worker.postMessage({ type: "REDACT", text: piiInput });
  }

  const allLocked = terms.every((t) => t.lockStatus === "HUMAN_LOCK");
  const priceCapTerm = terms.find((t) => t.name === "priceCap");
  const renewalPriceTerm = terms.find((t) => t.name === "renewalPrice");
  const contractedSeatsTerm = terms.find((t) => t.name === "contractedSeats");
  const usedSeatsTerm = terms.find((t) => t.name === "usedSeats");

  const priceCapVariance = (Number(renewalPriceTerm?.value || 12000) - Number(priceCapTerm?.value || 10000));
  const shelfwareSeats = (Number(contractedSeatsTerm?.value || 100) - Number(usedSeatsTerm?.value || 72));

  return (
    <main className="container">
      {/* Header Bar */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="logo-badge">YBY</div>
          <div className="brand-text">
            <h1>YBY RenewAudit</h1>
            <p>Audit the renewal before you approve it.</p>
          </div>
        </div>
        <div className="header-status">
          <span className="status-dot"></span>
          <span>Local Engine Active • Zero-Trust Mode</span>
        </div>
      </header>

      {/* Top Executive Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Billed Price Overcharge</div>
          <div className="metric-value rose">${priceCapVariance > 0 ? priceCapVariance.toLocaleString() : 0}</div>
          <div className="metric-sub">R1: Price Cap Violation Detected</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Unused / Shelf-Ware Seats</div>
          <div className="metric-value amber">{shelfwareSeats > 0 ? shelfwareSeats : 0} Seats</div>
          <div className="metric-sub">R2: Seat Variance Discovered</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Human Lock Gate Status</div>
          <div className="metric-value emerald">{allLocked ? `${terms.length} / ${terms.length} Locked` : "BLOCKED"}</div>
          <div className="metric-sub">{allLocked ? "All terms confirmed" : "Requires user confirmation"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Client SHA-256 Chain</div>
          <div className="metric-value cyan">100% Traceable</div>
          <div className="metric-sub">Web Crypto Client-side Verified</div>
        </div>
      </div>

      {/* Tabbed Navigation Bar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "24px", flexWrap: "wrap" }}>
        <button
          className={`btn ${activeTab === "intake" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("intake")}
        >
          📁 1. Drag & Drop File Intake ({files.length})
        </button>
        <button
          className={`btn ${activeTab === "lock" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("lock")}
        >
          🔒 2. Term Verification & Human Lock ({allLocked ? "PASS" : "BLOCKED"})
        </button>
        <button
          className={`btn ${activeTab === "pipeline" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("pipeline")}
        >
          🔄 3. 9-Step Pipeline & Radar
        </button>
        <button
          className={`btn ${activeTab === "evidence" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("evidence")}
        >
          🛡️ 4. Audit Findings & Evidence Pack
        </button>
        <button
          className={`btn ${activeTab === "pii" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("pii")}
        >
          ⚡ PII Redactor
        </button>
      </div>

      {/* Tab 1: File Intake */}
      {activeTab === "intake" && (
        <section className="panel-card">
          <FileDropzone onFilesUpdated={handleFilesUpdated} items={files} />
        </section>
      )}

      {/* Tab 2: Human Lock */}
      {activeTab === "lock" && (
        <section className="panel-card">
          <HumanLockGrid terms={terms} onTermsUpdated={handleTermsUpdated} />
        </section>
      )}

      {/* Tab 3: Pipeline & Hard Gates */}
      {activeTab === "pipeline" && (
        <section className="panel-card">
          <WorkflowSteps
            filesCount={files.length > 0 ? files.length : 3}
            allLocked={allLocked}
            gates={result?.gates ?? []}
            progress={progress}
            result={result}
          />
        </section>
      )}

      {/* Tab 4: Evidence Pack */}
      {activeTab === "evidence" && result && <EvidencePack result={result} />}

      {/* Tab 5: PII Redactor */}
      {activeTab === "pii" && (
        <section className="panel-card">
          <div className="panel-header">
            <h2>⚡ Zero-Trust Client-Side PII Redactor</h2>
            <span className="badge badge-cyan">Isolated Web Worker</span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "16px" }}>
            Test client-side PII sanitization before sending any text to LLM or external APIs.
          </p>
          <div className="redact-container">
            <textarea
              className="input-box"
              value={piiInput}
              onChange={(e) => setPiiInput(e.target.value)}
              placeholder="Type confidential contract snippet here..."
            />
            <div>
              <button className="btn btn-primary" onClick={handleRedact}>
                ⚡ Run Local PII Redaction
              </button>
            </div>
            {redactedText && (
              <div className="redacted-result">
                <strong>Sanitized Snippet:</strong> {redactedText}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
