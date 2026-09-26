import type { PlanType } from "../../licensing/types";

const PLAN_TAGS: Record<PlanType, string> = {
  FREE_FIRST_AUDIT: "FREE",
  SINGLE_AUDIT: "SINGLE",
  PROFESSIONAL_MONTHLY: "PRO",
  ANNUAL_PROFESSIONAL: "ANNUAL"
};

/**
 * Generates non-sequential, cryptographically random license keys.
 * High-entropy generation using Web Crypto / Node crypto.
 */
export function generateCryptographicLicenseKey(plan: PlanType): string {
  const tag = PLAN_TAGS[plan] || "KEY";
  const bytes = new Uint8Array(6);

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback
    const nodeCrypto = require("crypto");
    const buf = nodeCrypto.randomBytes(6);
    bytes.set(buf);
  }

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");

  const p1 = hex.substring(0, 4);
  const p2 = hex.substring(4, 8);
  const p3 = hex.substring(8, 12);

  return `YBY-${tag}-${p1}-${p2}-${p3}`;
}
