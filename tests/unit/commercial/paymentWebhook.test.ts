import { describe, expect, it, beforeEach } from "vitest";
import {
  computeWebhookHmac,
  getWebhookSecret,
  PaymentWebhookHandler
} from "../../../src/commercial/server/paymentWebhookHandler";
import { ProductionLicensingService } from "../../../src/licensing/server/licensingService";

describe("G9.2 Payment Webhook & Idempotency Test Suite", () => {
  beforeEach(() => {
    PaymentWebhookHandler.resetIdempotencyStore();
  });

  it("1. Forged Webhook Rejection: Invalid HMAC signature returns HTTP 401 response", async () => {
    const payload = {
      eventId: "evt_forged_101",
      eventType: "payment.captured" as const,
      paymentId: "pay_forged_101",
      amountINR: 4999,
      customerEmail: "attacker@domain.com",
      planType: "PROFESSIONAL_MONTHLY" as const,
      signature: "INVALID_FORGED_SIGNATURE_HASH"
    };

    const res = await PaymentWebhookHandler.handleWebhook(payload);
    expect(res.success).toBe(false);
    expect(res.message).toContain("HTTP 401 Unauthorized");
  });

  it("2. Valid Webhook Signature provisions cryptographically random non-sequential key", async () => {
    const eventId = "evt_valid_202";
    const paymentId = "pay_valid_202";
    const planType = "PROFESSIONAL_MONTHLY" as const;
    const signature = await computeWebhookHmac(`${eventId}:${paymentId}:${planType}`, getWebhookSecret());

    const payload = {
      eventId,
      eventType: "payment.captured" as const,
      paymentId,
      amountINR: 4999,
      customerEmail: "valid.user@company.com",
      planType,
      signature
    };

    const res = await PaymentWebhookHandler.handleWebhook(payload);
    expect(res.success).toBe(true);
    expect(res.provisionedKey).toBeDefined();
    expect(res.provisionedKey).toMatch(/^YBY-PRO-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);

    // Verify key is active in Licensing DB
    const valRes = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: res.provisionedKey!,
      deviceHash: "dev_webhook_user"
    });
    expect(valRes.valid).toBe(true);
    expect(valRes.plan).toBe("PROFESSIONAL_MONTHLY");
    expect(valRes.auditsRemaining).toBe(5);
  });

  it("3. Duplicate Webhook Deduplication: Returns existing provisioned key (Idempotent OK)", async () => {
    const eventId = "evt_dup_303";
    const paymentId = "pay_dup_303";
    const planType = "SINGLE_AUDIT" as const;
    const signature = await computeWebhookHmac(`${eventId}:${paymentId}:${planType}`, getWebhookSecret());

    const payload = {
      eventId,
      eventType: "payment.captured" as const,
      paymentId,
      amountINR: 2999,
      customerEmail: "single.buyer@company.com",
      planType,
      signature
    };

    // 1st delivery
    const res1 = await PaymentWebhookHandler.handleWebhook(payload);
    expect(res1.success).toBe(true);
    expect(res1.isDuplicate).toBeUndefined();
    const firstKey = res1.provisionedKey;

    // 2nd delivery (duplicate webhook replay)
    const res2 = await PaymentWebhookHandler.handleWebhook(payload);
    expect(res2.success).toBe(true);
    expect(res2.isDuplicate).toBe(true);
    expect(res2.provisionedKey).toBe(firstKey);
  });

  it("4. Failed Payment Webhook skips key provisioning", async () => {
    const eventId = "evt_failed_404";
    const paymentId = "pay_failed_404";
    const planType = "ANNUAL_PROFESSIONAL" as const;
    const signature = await computeWebhookHmac(`${eventId}:${paymentId}:${planType}`, getWebhookSecret());

    const payload = {
      eventId,
      eventType: "payment.failed" as const,
      paymentId,
      amountINR: 49990,
      customerEmail: "failed.buyer@company.com",
      planType,
      signature
    };

    const res = await PaymentWebhookHandler.handleWebhook(payload);
    expect(res.success).toBe(false);
    expect(res.message).toContain("Payment transaction failed");
  });
});
