import { sha256 } from "../security/hashing/sha256";
import type { AuditPayload, CalculationTerm, SourceRef } from "../types";

export type InputRow = Record<string, string | number>;

export function deriveSourceRef(fileName: string, rowNumber?: number): SourceRef {
  return {
    fileName,
    fileSha256: "0x" + fileName.length.toString(16).padStart(64, "0")
  };
}

export async function hashSourceRef(fileName: string): Promise<string> {
  const text = new TextEncoder().encode(fileName);
  return sha256(text);
}

export function buildAuditPayloadFromRows(rows: InputRow[], fileName: string): AuditPayload {
  const sourceHash = fileName ? createDeterministicHash(fileName) : "0x" + "0".repeat(64);

  const terms: CalculationTerm[] = [
    {
      id: "price-cap",
      name: "priceCap",
      value: Number(rows[0]?.priceCap ?? 0),
      sourceRef: { fileName, fileSha256: sourceHash, row: 1 },
      lockStatus: "UNVERIFIED"
    },
    {
      id: "renewal-price",
      name: "renewalPrice",
      value: Number(rows[0]?.renewalPrice ?? 0),
      sourceRef: { fileName, fileSha256: sourceHash, row: 2 },
      lockStatus: "UNVERIFIED"
    },
    {
      id: "contracted-seats",
      name: "contractedSeats",
      value: Number(rows[0]?.contractedSeats ?? 0),
      sourceRef: { fileName, fileSha256: sourceHash, row: 3 },
      lockStatus: "UNVERIFIED"
    },
    {
      id: "used-seats",
      name: "usedSeats",
      value: Number(rows[0]?.usedSeats ?? 0),
      sourceRef: { fileName, fileSha256: sourceHash, row: 4 },
      lockStatus: "UNVERIFIED"
    }
  ];

  return {
    contract: { terms },
    usageRows: rows.map((row) => ({ ...row })),
    invoiceRows: rows.map((row) => ({ amount: row.renewalPrice ?? 0 })),
    mapping: { usage: "seats", invoice: "amount" },
    normalization: { currency: "USD", billingCycle: "ANNUAL", dateFormat: "ISO_8601" }
  };
}

function createDeterministicHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const out = (hash >>> 0).toString(16).padStart(8, "0");
  return out.repeat(8);
}
