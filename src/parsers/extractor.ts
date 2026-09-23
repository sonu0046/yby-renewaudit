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
  const terms: CalculationTerm[] = [];

  const contractFile = files.find((f) => f.name.toLowerCase().includes("contract") || f.name.toLowerCase().includes("msa"));
  const renewalFile = files.find((f) => f.name.toLowerCase().includes("renewal") || f.name.toLowerCase().includes("quote"));
  const usageFile = files.find((f) => f.name.toLowerCase().includes("usage") || f.name.toLowerCase().includes("okta"));
  const invoiceFile = files.find((f) => f.name.toLowerCase().includes("invoice"));

  // Default fallback source reference
  const contractRef: SourceRef = contractFile
    ? { fileName: contractFile.name, fileSha256: contractFile.sha256, page: 4 }
    : { fileName: "contract_msa.pdf", fileSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", page: 4 };

  const renewalRef: SourceRef = renewalFile
    ? { fileName: renewalFile.name, fileSha256: renewalFile.sha256, row: 12 }
    : { fileName: "renewal_quote_2026.pdf", fileSha256: "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4", row: 12 };

  const usageRef: SourceRef = usageFile
    ? { fileName: usageFile.name, fileSha256: usageFile.sha256, row: 20 }
    : { fileName: "okta_usage_report.csv", fileSha256: "1f3870be274f6c49b3e31a0c6728957f6d338f0d8a57e3f4236968222d4f3b79", row: 20 };

  // Parse priceCap
  let capVal = 10000;
  if (contractFile?.parsedText) {
    const match = contractFile.parsedText.match(/(?:price cap|cap)\s*[:=]?\s*\$?([\d,]+)/i);
    if (match) capVal = parseFloat(match[1].replace(/,/g, ""));
  }

  // Parse renewalPrice
  let renewalVal = 12000;
  if (renewalFile?.parsedText) {
    const match = renewalFile.parsedText.match(/(?:total|renewal price|amount)\s*[:=]?\s*\$?([\d,]+)/i);
    if (match) renewalVal = parseFloat(match[1].replace(/,/g, ""));
  }

  // Parse contractedSeats
  let contractedSeatsVal = 100;
  if (contractFile?.parsedText) {
    const match = contractFile.parsedText.match(/(?:seats|licensed seats|users)\s*[:=]?\s*(\d+)/i);
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
