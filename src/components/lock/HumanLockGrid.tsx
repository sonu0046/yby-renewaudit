import { useState } from "react";
import type { CalculationTerm } from "../../types";
import { confirmTerm, lockTerm, editTerm, canCalculate } from "../../state/humanLock";

interface HumanLockGridProps {
  terms: CalculationTerm[];
  onTermsUpdated: (terms: CalculationTerm[]) => void;
}

export function HumanLockGrid({ terms, onTermsUpdated }: HumanLockGridProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  function handleConfirmAndLock(id: string) {
    const updated = terms.map((t) => {
      if (t.id === id) {
        const confirmed = confirmTerm(t);
        return lockTerm(confirmed);
      }
      return t;
    });
    onTermsUpdated(updated);
  }

  function handleStartEdit(term: CalculationTerm) {
    setEditingId(term.id);
    setEditValue(String(term.value));
  }

  function handleSaveEdit(id: string) {
    const updated = terms.map((t) => {
      if (t.id === id) {
        const numericOrStr = !isNaN(Number(editValue)) && editValue.trim() !== "" ? Number(editValue) : editValue;
        return editTerm(t, numericOrStr);
      }
      return t;
    });
    setEditingId(null);
    onTermsUpdated(updated);
  }

  function handleLockAll() {
    const updated = terms.map((t) => {
      const confirmed = confirmTerm(t);
      return lockTerm(confirmed);
    });
    onTermsUpdated(updated);
  }

  function handleUnlockAll() {
    const updated = terms.map((t) => ({ ...t, lockStatus: "BLOCKED" as const }));
    onTermsUpdated(updated);
  }

  const isReady = canCalculate(terms.map((t) => t.lockStatus));

  return (
    <div className="human-lock-section">
      <div className="panel-header" style={{ marginBottom: "16px" }}>
        <div>
          <h3>🔒 Engine-Enforced Human Lock Grid</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "4px" }}>
            Every calculation-relevant term must be human-verified before entering downstream financial rules.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-secondary btn-sm" onClick={handleUnlockAll}>
            🔓 Unlock All
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleLockAll}>
            🔒 Lock All Terms
          </button>
        </div>
      </div>

      {!isReady ? (
        <div className="badge badge-rose" style={{ padding: "14px 18px", borderRadius: "8px", marginBottom: "20px", display: "block" }}>
          ⚠️ <strong>CALCULATION BLOCKED:</strong> All terms must be explicitly confirmed and locked by the user. (G4 GATE BLOCKED)
        </div>
      ) : (
        <div className="badge badge-emerald" style={{ padding: "12px 16px", borderRadius: "8px", marginBottom: "20px", display: "inline-block" }}>
          ✅ <strong>HUMAN LOCK PASSED:</strong> 100% of terms verified. Downstream calculation enabled.
        </div>
      )}

      <div className="table-wrapper">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Term ID</th>
              <th>Field Name</th>
              <th>Extracted Value</th>
              <th>Source File Reference</th>
              <th>Lock State</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((term) => (
              <tr key={term.id}>
                <td><code>{term.id}</code></td>
                <td><strong>{term.name}</strong></td>
                <td>
                  {editingId === term.id ? (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={{
                          background: "rgba(0,0,0,0.5)",
                          border: "1px solid var(--accent-indigo)",
                          color: "white",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          width: "100px"
                        }}
                      />
                      <button className="btn btn-sm btn-primary" onClick={() => handleSaveEdit(term.id)}>Save</button>
                    </div>
                  ) : (
                    <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>
                      {typeof term.value === "number" && term.name.toLowerCase().includes("price") ? `$${term.value.toLocaleString()}` : term.value}
                    </span>
                  )}
                </td>
                <td>
                  <span className="source-tag">{term.sourceRef.fileName}</span>
                  <span style={{ marginLeft: "8px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    (Page {term.sourceRef.page ?? term.sourceRef.row ?? "N/A"})
                  </span>
                </td>
                <td>
                  <span className={`badge ${term.lockStatus === "HUMAN_LOCK" ? "badge-emerald" : "badge-amber"}`}>
                    {term.lockStatus}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {term.lockStatus !== "HUMAN_LOCK" ? (
                      <button className="btn btn-sm btn-primary" onClick={() => handleConfirmAndLock(term.id)}>
                        Confirm & Lock
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-secondary" onClick={() => handleStartEdit(term)}>
                        Edit Term
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
