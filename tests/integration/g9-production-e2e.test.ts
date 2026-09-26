import { describe, expect, it } from "vitest";
import { ProductionLicensingService } from "../../src/licensing/server/licensingService";
import { verifyLicenseKeyOnline } from "../../src/licensing/apiClient";
import { checkAuditAccess, getDeviceFingerprintHash } from "../../src/licensing/entitlement";
import { executeLocalReconciliationSync } from "../../src/api/auditWorkflow";
import type { CalculationTerm } from "../../src/types";

describe("G9.0 Production Readiness End-to-End Acceptance Suite", () => {
  it("E2E Acceptance Flow: Payment -> License Provisioning -> Activation -> Gate 0 Audit Execution -> Quota Decrement", async () => {
    // 1. Payment Webhook triggers License Key Provisioning
    const provisionedKey = "YBY-PRO-E2E-PAYMENT-SUCCESS-9999";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: provisionedKey,
      plan: "PROFESSIONAL_MONTHLY",
      status: "ACTIVE",
      auditsAllowed: 5,
      auditsUsed: 0,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    });

    // 2. Customer gets key and generates device fingerprint
    const deviceHash = await getDeviceFingerprintHash("e2e-customer-workstation");

    // 3. Customer enters key in RenewAudit -> API validates key & returns quota
    const initialEntitlement = await verifyLicenseKeyOnline(provisionedKey, deviceHash);
    expect(initialEntitlement.status).toBe("ACTIVE");
    expect(initialEntitlement.plan).toBe("PROFESSIONAL_MONTHLY");
    expect(initialEntitlement.auditsRemaining).toBe(5);

    // 4. Gate 0 Access Check unlocks audit
    const gate0Check = checkAuditAccess(initialEntitlement);
    expect(gate0Check.allowed).toBe(true);

    // 5. Audit execution remains 100% local/client-side (deterministic reconciliation)
    const terms: CalculationTerm[] = [
      { id: "1", name: "priceCap", value: 10000, sourceRef: { fileName: "contract.pdf", fileSha256: "hash1", page: 1 }, lockStatus: "HUMAN_LOCK" },
      { id: "2", name: "renewalPrice", value: 12000, sourceRef: { fileName: "contract.pdf", fileSha256: "hash1", page: 1 }, lockStatus: "HUMAN_LOCK" },
      { id: "3", name: "contractedSeats", value: 100, sourceRef: { fileName: "contract.pdf", fileSha256: "hash1", page: 1 }, lockStatus: "HUMAN_LOCK" },
      { id: "4", name: "usedSeats", value: 80, sourceRef: { fileName: "usage.csv", fileSha256: "hash2", row: 1 }, lockStatus: "HUMAN_LOCK" }
    ];
    const reconciliationResult = executeLocalReconciliationSync(terms, [{ id: "1", seats: 80 }]);
    expect(reconciliationResult.evidence.length).toBeGreaterThan(0);
    expect(reconciliationResult.evidence[0].ruleId).toBe("R1");

    // 6. Quota is consumed on completion and server state is updated
    const consumeRes = ProductionLicensingService.handleConsumeAuditRequest({
      licenseKey: provisionedKey,
      deviceHash
    });
    expect(consumeRes.valid).toBe(true);
    expect(consumeRes.auditsRemaining).toBe(4);

    // 7. Re-verification reflects decremented quota balance
    const updatedEntitlement = await verifyLicenseKeyOnline(provisionedKey, deviceHash);
    expect(updatedEntitlement.auditsRemaining).toBe(4);
  });
});
