import { useState } from "react";
import { sha256 } from "../../security/hashing/sha256";
import { extractPdfText } from "../../parsers/pdf";
import { parseCsv } from "../../parsers/csv";
import { parseXlsx } from "../../parsers/xlsx";
import type { FileIntakeItem } from "../../parsers/extractor";

interface FileDropzoneProps {
  onFilesUpdated: (files: FileIntakeItem[]) => void;
  items: FileIntakeItem[];
}

export function FileDropzone({ onFilesUpdated, items }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [parsingError, setParsingError] = useState<string | null>(null);

  async function processFiles(fileList: FileList | File[]) {
    setParsingError(null);
    const newItems: FileIntakeItem[] = [...items];

    for (const file of Array.from(fileList)) {
      // Duplicate check
      if (newItems.some((item) => item.name === file.name && item.size === file.size)) {
        continue;
      }

      // Format validation
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "csv", "xlsx", "xls"].includes(ext || "")) {
        setParsingError(`Unsupported file format: .${ext}. Only PDF, CSV, and XLSX files are accepted.`);
        continue;
      }

      try {
        const buffer = await file.arrayBuffer();
        const hash = await sha256(buffer);

        let parsedText: string | undefined;
        let parsedRows: Record<string, unknown>[] | undefined;

        if (ext === "pdf") {
          parsedText = await extractPdfText(file);
        } else if (ext === "csv") {
          parsedRows = await parseCsv(file);
        } else if (ext === "xlsx" || ext === "xls") {
          parsedRows = await parseXlsx(file);
        }

        newItems.push({
          id: `${file.name}-${Date.now()}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type || ext || "unknown",
          sha256: hash,
          parsedText,
          parsedRows
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to read file";
        setParsingError(`File parsing error for ${file.name}: ${msg}`);
      }
    }

    onFilesUpdated(newItems);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  }

  function removeItem(id: string) {
    const updated = items.filter((item) => item.id !== id);
    onFilesUpdated(updated);
  }

  return (
    <div className="dropzone-section">
      <div
        className={`dropzone-box ${isDragging ? "dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="dropzone-icon">📁</div>
        <h3>Drag & Drop Audit Files Here</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "8px 0" }}>
          Upload Contract PDF, Renewal Quote PDF, Usage CSV, or Invoice XLSX
        </p>
        <label className="btn btn-primary" style={{ marginTop: "12px", cursor: "pointer" }}>
          <span>Browse Local Files</span>
          <input
            type="file"
            multiple
            accept=".pdf,.csv,.xlsx,.xls"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
        </label>
        <div style={{ marginTop: "12px", fontSize: "0.75rem", color: "var(--accent-emerald)", fontWeight: 600 }}>
          🔒 100% Client-Side Processing • Native SHA-256 Hashed • Zero Server Binary Persistence
        </div>
      </div>

      {parsingError && (
        <div className="badge badge-rose" style={{ padding: "12px 16px", marginTop: "16px", borderRadius: "8px" }}>
          ⚠️ {parsingError}
        </div>
      )}

      {items.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: "24px" }}>
          <h4 style={{ marginBottom: "12px", color: "var(--text-primary)" }}>Loaded Audit Files ({items.length})</h4>
          <table className="custom-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>SHA-256 Client Hash</th>
                <th>Parsing Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td><span className="badge badge-indigo">{item.name.split(".").pop()?.toUpperCase()}</span></td>
                  <td>{(item.size / 1024).toFixed(1)} KB</td>
                  <td>
                    <span className="source-tag" title={item.sha256}>
                      {item.sha256.substring(0, 16)}...
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-emerald">
                      {item.parsedRows ? `${item.parsedRows.length} Rows` : item.parsedText ? "Text Parsed" : "Ready"}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => removeItem(item.id)}>
                      🗑️ Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
