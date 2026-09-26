import { useState } from "react";
import { validateStep2File, type Step2ValidationResult, type ParsedPdfDocument, type ParsedCsvDocument } from "../../api/auditWorkflow";
import { parsePdfDocument } from "../../parsers/pdf";
import { parseCsvDocument } from "../../parsers/csv";
import type { FileIntakeItem } from "../../parsers/extractor";

interface FileDropzoneProps {
  onFilesUpdated: (files: FileIntakeItem[]) => void;
  items: FileIntakeItem[];
}

export function FileDropzone({ onFilesUpdated, items }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [validations, setValidations] = useState<Record<string, Step2ValidationResult>>({});

  async function processFiles(fileList: FileList | File[]) {
    setParsingError(null);
    const newItems: FileIntakeItem[] = [...items];
    const newValidations: Record<string, Step2ValidationResult> = { ...validations };

    for (const file of Array.from(fileList)) {
      // Duplicate check
      if (newItems.some((item) => item.name === file.name && item.size === file.size)) {
        continue;
      }

      // Step 2.2 File Validation
      const validation = await validateStep2File(file);
      newValidations[file.name] = validation;

      if (!validation.valid) {
        setParsingError(`Validation Error (${file.name}): ${validation.errorMessage}`);
        continue;
      }

      try {
        let parsedText: string | undefined;
        let parsedRows: Record<string, unknown>[] | undefined;

        if (validation.fileType === "PDF") {
          const pdfDoc: ParsedPdfDocument = await parsePdfDocument(file);
          if (pdfDoc.isEmptyText) {
            setParsingError(`Scanned PDF Reject (${file.name}): Image-only or scanned PDF has no extractable text. (G1/R6 Blocked)`);
            continue;
          }
          parsedText = pdfDoc.pages.map((p) => `[Page ${p.pageNumber}] ${p.text}`).join("\n");
        } else if (validation.fileType === "CSV") {
          const csvDoc: ParsedCsvDocument = await parseCsvDocument(file);
          if (csvDoc.hasAmbiguousDates) {
            setParsingError(`Ambiguous Date Warning (${file.name}): Date strings contain ambiguous slash/dash formats. (G3 Date Safety)`);
          }
          parsedRows = csvDoc.rows.map((r) => r.values);
        }

        newItems.push({
          id: `${file.name}-${Date.now()}`,
          file,
          name: file.name,
          size: file.size,
          type: validation.fileType,
          sha256: validation.sha256,
          parsedText,
          parsedRows
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to read file";
        setParsingError(`Parsing Error (${file.name}): ${msg}`);
      }
    }

    setValidations(newValidations);
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
        <div className="dropzone-icon">📄</div>
        <h3>Drag & Drop Audit Files (PDF or CSV)</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "8px 0" }}>
          Upload Contract/Renewal PDF or Usage/Invoice CSV
        </p>
        <label className="btn btn-primary" style={{ marginTop: "12px", cursor: "pointer" }}>
          <span>Browse Local Files</span>
          <input
            type="file"
            multiple
            accept=".pdf,.csv"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
        </label>
        <div style={{ marginTop: "12px", fontSize: "0.75rem", color: "var(--accent-emerald)", fontWeight: 600 }}>
          🔒 100% Client-Side Local Parsing • Native SHA-256 Hashed • Zero Backend Binary Submission
        </div>
      </div>

      {parsingError && (
        <div className="badge badge-rose" style={{ padding: "14px 18px", marginTop: "16px", borderRadius: "8px", display: "block" }}>
          ⚠️ {parsingError}
        </div>
      )}

      {items.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: "24px" }}>
          <h4 style={{ marginBottom: "12px", color: "var(--text-primary)" }}>Uploaded Local Audit Files ({items.length})</h4>
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
                  <td><span className="badge badge-indigo">{item.type}</span></td>
                  <td>{(item.size / 1024).toFixed(1)} KB</td>
                  <td>
                    <span className="source-tag" title={item.sha256}>
                      {item.sha256.substring(0, 16)}...
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-emerald">
                      {item.parsedRows ? `${item.parsedRows.length} Rows Parsed` : item.parsedText ? "Text Parsed" : "PARSED"}
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
