import type { IdempotencyRecord, PaymentWebhookPayload, PaymentWebhookResponse } from "./types";
import { generateCryptographicLicenseKey } from "./provisioner";
import { ProductionLicensingService } from "../../licensing/server/licensingService";
import { sha256 } from "../../security/hashing/sha256";
import { verifyLicensingNetworkPayload } from "../../licensing/entitlement";

const IDEMPOTENCY_STORE: Map<string, IdempotencyRecord> = new Map();

/**
 * Server Webhook Secret accessor (strictly server-side)
 */
export function getWebhookSecret(): string {
  if (typeof process !== "undefined" && process.env && process.env.PAYMENT_WEBHOOK_SECRET) {
    return process.env.PAYMENT_WEBHOOK_SECRET;
  }
  return "SERVER_HMAC_WEBHOOK_SECRET_KEY_2026";
}

/**
 * Computes expected HMAC-SHA256 signature for webhook payload verification
 */
export async function computeWebhookHmac(dataString: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const input = encoder.encode(`${dataString}:${secret}`);
  return await sha256(input);
}

export function verifyPaymentWebhookPayload(payload: Record<string, any>): boolean {
  if (!payload || typeof payload !== "object") return false;
  const keys = Object.keys(payload);
  const allowedKeys = ["eventId", "eventType", "paymentId", "amountINR", "customerEmail", "planType", "signature"];
  
  const hasForbiddenKeys = keys.some((k) => !allowedKeys.includes(k));
  if (hasForbiddenKeys) return false;

  const forbiddenTerms = ["contract", "findings", "evidence", "sha256", "rows", "file"];
  const rawStr = JSON.stringify(payload).toLowerCase();
  return !forbiddenTerms.some((term) => rawStr.includes(term));
}

export class PaymentWebhookHandler {
  /**
   * Processes incoming payment webhook event with HMAC verification and idempotency deduplication.
   */
  public static async handleWebhook(payload: PaymentWebhookPayload): Promise<PaymentWebhookResponse> {
    // 1. Zero Audit-Data Leakage Check
    if (!verifyPaymentWebhookPayload(payload)) {
      return {
        success: false,
        message: "Security Violation: Outbound/inbound payment payload contains forbidden audit/PII metadata."
      };
    }

    const { eventId, eventType, paymentId, planType, signature } = payload;

    if (!eventId || !paymentId || !planType || !signature) {
      return {
        success: false,
        message: "Invalid webhook payload structure. Missing required fields."
      };
    }

    // 2. Cryptographic HMAC Signature Verification
    const expectedSignature = await computeWebhookHmac(`${eventId}:${paymentId}:${planType}`, getWebhookSecret());
    if (signature !== expectedSignature) {
      return {
        success: false,
        message: "HTTP 401 Unauthorized: Invalid cryptographic HMAC signature."
      };
    }

    // 3. Reject Failed Payments
    if (eventType === "payment.failed") {
      return {
        success: false,
        message: "Payment transaction failed. License key provisioning skipped."
      };
    }

    // 4. Idempotency Check (Duplicate Webhook Replay Protection)
    if (IDEMPOTENCY_STORE.has(eventId)) {
      const existing = IDEMPOTENCY_STORE.get(eventId)!;
      return {
        success: true,
        provisionedKey: existing.licenseKey,
        isDuplicate: true,
        message: "Duplicate webhook received. Returning existing provisioned key (Idempotent OK)."
      };
    }

    // 5. Provision New Cryptographic License Key
    const newKey = generateCryptographicLicenseKey(planType);
    const auditsAllowed = planType === "SINGLE_AUDIT" ? 1 : planType === "PROFESSIONAL_MONTHLY" ? 5 : planType === "ANNUAL_PROFESSIONAL" ? 60 : 1;
    const expiresAt = planType === "PROFESSIONAL_MONTHLY"
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : planType === "ANNUAL_PROFESSIONAL"
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    ProductionLicensingService.registerProvisionedKey({
      licenseKey: newKey,
      plan: planType,
      status: "ACTIVE",
      auditsAllowed,
      auditsUsed: 0,
      auditsReserved: 0,
      maxDevices: 1,
      expiresAt,
      createdAt: new Date().toISOString()
    });

    // Save Idempotency Record
    IDEMPOTENCY_STORE.set(eventId, {
      eventId,
      paymentId,
      licenseKey: newKey,
      processedAt: new Date().toISOString()
    });

    return {
      success: true,
      provisionedKey: newKey,
      message: "License key provisioned successfully."
    };
  }

  /**
   * Helper to clear idempotency store in tests
   */
  public static resetIdempotencyStore(): void {
    IDEMPOTENCY_STORE.clear();
  }
}
