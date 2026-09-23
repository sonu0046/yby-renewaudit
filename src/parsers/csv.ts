import Papa from "papaparse";
import { sha256 } from "../security/hashing/sha256";
import { isAmbiguousDateString, type ParsedCsvDocument, type ParsedCsvRow } from "../api/auditWorkflow";

export function parseCsv(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: false,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error)
    });
  });
}

export async function parseCsvDocument(file: File): Promise<ParsedCsvDocument> {
  let buffer: Uint8Array;
  if (typeof file.arrayBuffer === "function") {
    const ab = await file.arrayBuffer();
    buffer = new Uint8Array(ab);
  } else if (typeof (file as any).text === "function") {
    const text = await (file as any).text();
    buffer = new TextEncoder().encode(text);
  } else {
    buffer = new Uint8Array(
      await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      })
    );
  }
  const hash = await sha256(buffer);

  const rawRows = await parseCsv(file);
  const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];

  let hasAmbiguousDates = false;
  const rows: ParsedCsvRow[] = rawRows.map((row, index) => {
    for (const val of Object.values(row)) {
      if (typeof val === "string" && isAmbiguousDateString(val)) {
        hasAmbiguousDates = true;
      }
    }
    return {
      sourceRow: index + 1,
      values: row
    };
  });

  return {
    fileId: `${file.name}-${Date.now()}`,
    fileName: file.name,
    fileType: "CSV",
    sha256: hash,
    columns,
    rowCount: rows.length,
    rows,
    hasAmbiguousDates
  };
}
