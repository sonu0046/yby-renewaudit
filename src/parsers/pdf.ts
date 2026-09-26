import "./pdfPolyfills";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { sha256 } from "../security/hashing/sha256";
import type { ParsedPdfDocument, ParsedPdfPage } from "../api/auditWorkflow";

if (pdfjsLib.GlobalWorkerOptions) {
  if (typeof window !== "undefined" && window.location && window.location.protocol.startsWith("http")) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  }
}

async function getFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  let buffer: ArrayBuffer = new ArrayBuffer(0);
  if (typeof file.arrayBuffer === "function") {
    try {
      const ab = await file.arrayBuffer();
      if (ab && ab.byteLength > 0) {
        buffer = ab.slice(0);
      }
    } catch {}
  }
  if ((!buffer || buffer.byteLength === 0) && typeof (file as any).text === "function") {
    try {
      const txt = await (file as any).text();
      if (txt && txt.length > 0) {
        buffer = new TextEncoder().encode(txt).buffer.slice(0) as ArrayBuffer;
      }
    } catch {}
  }
  if (!buffer || buffer.byteLength === 0) {
    try {
      buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(((reader.result as ArrayBuffer) || new ArrayBuffer(0)).slice(0));
        reader.onerror = () => resolve(new ArrayBuffer(0));
        reader.readAsArrayBuffer(file);
      });
    } catch {}
  }
  return buffer;
}

export async function extractPdfText(file: File): Promise<string> {
  const buffer = await getFileArrayBuffer(file);
  const typedArray = new Uint8Array(buffer.slice(0));
  const doc = await pdfjsLib.getDocument({ data: typedArray, useSystemFonts: true } as any).promise;
  const pages: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      try {
        const content = await page.getTextContent();
        pages.push(content.items.map((item: any) => ("str" in item ? item.str : "")).join(" "));
      } finally {
        page.cleanup();
      }
    }
    return pages.join("\n");
  } finally {
    await doc.destroy().catch(() => {});
  }
}

export async function parsePdfDocument(file: File): Promise<ParsedPdfDocument> {
  const buffer = await getFileArrayBuffer(file);

  // Clone buffer slice to prevent ArrayBuffer detachment when transferred to workers
  const hash = await sha256(buffer.slice(0));

  let doc: pdfjsLib.PDFDocumentProxy | undefined;
  try {
    const typedArray = new Uint8Array(buffer.slice(0));
    doc = await pdfjsLib.getDocument({ data: typedArray, useSystemFonts: true } as any).promise;
    const pages: ParsedPdfPage[] = [];
    let totalText = "";

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      try {
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
        pages.push({ pageNumber: i, text });
        totalText += text.trim();
      } finally {
        page.cleanup();
      }
    }

    const isEmptyText = totalText.trim().length === 0;

    return {
      fileId: `${file.name}-${Date.now()}`,
      fileName: file.name,
      fileType: "PDF",
      sha256: hash,
      pages,
      isEmptyText
    };
  } catch (err) {
    console.warn(`PDF.js parsing failed for ${file.name}, attempting fallback text extraction:`, err);
    
    // Fallback: Attempt plain text stream & string extraction before marking isEmptyText
    const fallbackBuffer = buffer.slice(0);
    const rawText = new TextDecoder("latin1").decode(new Uint8Array(fallbackBuffer));
    const textMatches: string[] = [];
    
    // 1. Literal parentheses string objects (e.g. (SERVICE AGREEMENT...))
    const parenRegex = /\(([^()]{3,})\)/g;
    let match: RegExpExecArray | null;
    while ((match = parenRegex.exec(rawText)) !== null) {
      const s = match[1].replace(/\\[nrtbf]/g, " ").trim();
      if (s.length > 2 && /[a-zA-Z0-9]/.test(s)) {
        textMatches.push(s);
      }
    }

    // 2. Uncompressed stream / text block matching
    if (textMatches.length === 0) {
      const textBlockRegex = /BT[\s\S]*?ET/g;
      while ((match = textBlockRegex.exec(rawText)) !== null) {
        const block = match[0];
        const innerMatch = /\(([^()]+)\)/.exec(block);
        if (innerMatch && innerMatch[1].trim()) {
          textMatches.push(innerMatch[1].trim());
        }
      }
    }

    const fallbackText = textMatches.join(" ");
    const isEmptyText = fallbackText.trim().length === 0;

    return {
      fileId: `${file.name}-${Date.now()}`,
      fileName: file.name,
      fileType: "PDF",
      sha256: hash,
      pages: isEmptyText ? [] : [{ pageNumber: 1, text: fallbackText }],
      isEmptyText
    };
  } finally {
    if (doc) {
      await doc.destroy().catch(() => {});
    }
  }
}
