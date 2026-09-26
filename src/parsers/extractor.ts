import type { CalculationTerm, SourceRef } from "../types";

export interface FileIntakeItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  sha256: string;
  parsedText?: string;
  parsedRows?: Record<string, unknown>[];
}

export function extractTermsFromFiles(files: FileIntakeItem[]): CalculationTerm[] {
  if (!files || files.length === 0) {
    return [];
  }

  const terms: CalculationTerm[] = [];

  const contractFile = files.find((f) => f.name.toLowerCase().includes("contract") || f.name.toLowerCase().includes("msa")) || files[0];
  const renewalFile = files.find((f) => f.name.toLowerCase().includes("renewal") || f.name.toLowerCase().includes("quote")) || contractFile;
  const usageFile = files.find((f) => f.name.toLowerCase().includes("usage") || f.name.toLowerCase().includes("okta") || f.name.toLowerCase().endsWith(".csv")) || contractFile;

  // Provenance references MUST strictly point to files actually present in current audit intake
  const contractRef: SourceRef = {
    fileName: contractFile.name,
    fileSha256: contractFile.sha256,
    page: 1
  };

  const renewalRef: SourceRef = {
    fileName: renewalFile.name,
    fileSha256: renewalFile.sha256,
    page: 1
  };

  const usageRef: SourceRef = {
    fileName: usageFile.name,
    fileSha256: usageFile.sha256,
    row: usageFile.type === "csv" || usageFile.name.toLowerCase().endsWith(".csv") ? 1 : undefined,
    page: usageFile.type === "csv" || usageFile.name.toLowerCase().endsWith(".csv") ? undefined : 1
  };

  // Parse priceCap
  let capVal = 10000;
  if (contractFile?.parsedText) {
    const match = contractFile.parsedText.match(/(?:price cap|cap)\s*[:=]?\s*\$?([\d,]+)/i);
    if (match) capVal = parseFloat(match[1].replace(/,/g, ""));
  }

  // Parse renewalPrice
  let renewalVal = 12000;
  const renewalText = renewalFile?.parsedText || contractFile?.parsedText;
  if (renewalText) {
    const match = renewalText.match(/(?:total|renewal price|amount)\s*[:=]?\s*\$?([\d,]+)/i);
    if (match) renewalVal = parseFloat(match[1].replace(/,/g, ""));
  }

  // Parse contractedSeats
  let contractedSeatsVal = 100;
  const seatsText = contractFile?.parsedText || renewalFile?.parsedText;
  if (seatsText) {
    const match = seatsText.match(/(?:seats|licensed seats|users)\s*[:=]?\s*(\d+)/i);
    if (match) contractedSeatsVal = parseInt(match[1], 10);
  }

  // Parse usedSeats
  let usedSeatsVal = 72;
  if (usageFile?.parsedRows && usageFile.parsedRows.length > 0) {
    usedSeatsVal = usageFile.parsedRows.length;
  }

  terms.push({
    id: "price-cap",
    name: "priceCap",
    value: capVal,
    sourceRef: contractRef,
    lockStatus: "BLOCKED"
  });

  terms.push({
    id: "renewal-price",
    name: "renewalPrice",
    value: renewalVal,
    sourceRef: renewalRef,
    lockStatus: "BLOCKED"
  });

  terms.push({
    id: "contracted-seats",
    name: "contractedSeats",
    value: contractedSeatsVal,
    sourceRef: contractRef,
    lockStatus: "BLOCKED"
  });

  terms.push({
    id: "used-seats",
    name: "usedSeats",
    value: usedSeatsVal,
    sourceRef: usageRef,
    lockStatus: "BLOCKED"
  });

  return terms;
}
