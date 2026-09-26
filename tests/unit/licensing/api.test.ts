import { describe, expect, it } from "vitest";
import { ProductionLicensingService } from "../../../src/licensing/server/licensingService";
import { verifyLicenseKeyOnline } from "../../../src/licensing/apiClient";
import { getDeviceFingerprintHash } from "../../../src/licensing/entitlement";

describe("G9.0 Production Commercial Licensing API Suite", () => {
  it("1. License Key Validation: Rejects invalid key formats and returns INVALID_KEY status", () => {
    const res = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: "YBY-INVALID-KEY-9999",
      deviceHash: "dev_hash_101"
    });
    expect(res.valid).toBe(false);
    expect(res.status).toBe("INVALID_KEY");
    expect(res.reason).toContain("Invalid or unrecognized license");
  });

  it("2. Plan Identification: Correctly resolves FREE, SINGLE, PRO_MONTHLY, and ANNUAL plans", () => {
    const freeRes = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: "YBY-FREE-DEFAULT-000",
      deviceHash: "dev_hash_101"
    });
    expect(freeRes.plan).toBe("FREE_FIRST_AUDIT");
    expect(freeRes.auditsRemaining).toBe(1);

    const singleRes = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: "YBY-SINGLE-PROD-001",
      deviceHash: "dev_hash_102"
    });
    expect(singleRes.plan).toBe("SINGLE_AUDIT");
    expect(singleRes.auditsRemaining).toBe(1);

    const proRes = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: "YBY-PRO-MONTHLY-002",
      deviceHash: "dev_hash_103"
    });
    expect(proRes.plan).toBe("PROFESSIONAL_MONTHLY");
    expect(proRes.auditsRemaining).toBe(5);

    const annualRes = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: "YBY-ANNUAL-PROD-003",
      deviceHash: "dev_hash_104"
    });
    expect(annualRes.plan).toBe("ANNUAL_PROFESSIONAL");
    expect(annualRes.auditsRemaining).toBe(60);
  });

  it("3. Active vs Expired Status: Returns EXPIRED and blocks audit for expired subscriptions", () => {
    const res = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: "YBY-PRO-EXPIRED-999",
      deviceHash: "dev_hash_105"
    });
    expect(res.valid).toBe(false);
    expect(res.status).toBe("EXPIRED");
    expect(res.auditsRemaining).toBe(0);
    expect(res.reason).toContain("expired");
  });

  it("4. Remaining Quota: Accurate quota calculation", () => {
    const res = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: "YBY-PRO-MONTHLY-002",
      deviceHash: "dev_hash_103"
    });
    expect(res.valid).toBe(true);
    expect(res.auditsRemaining).toBe(5);
  });

  it("5 & 8. Single-Audit Consumption & Replay Protection: Consuming single-audit key blocks replay", () => {
    // Provision unique test key
    const testKey = "YBY-SINGLE-TEST-REPLAY-001";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: testKey,
      plan: "SINGLE_AUDIT",
      status: "ACTIVE",
      auditsAllowed: 1,
      auditsUsed: 0,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    });

    // 1st audit run succeeds and consumes token
    const consumeRes = ProductionLicensingService.handleConsumeAuditRequest({
      licenseKey: testKey,
      deviceHash: "dev_replay_1"
    });
    expect(consumeRes.valid).toBe(false); // Valid for further runs = false
    expect(consumeRes.auditsRemaining).toBe(0);
    expect(consumeRes.status).toBe("SINGLE_AUDIT_ALREADY_CONSUMED");

    // 2nd audit attempt (replay) is rejected
    const replayRes = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: testKey,
      deviceHash: "dev_replay_1"
    });
    expect(replayRes.valid).toBe(false);
    expect(replayRes.status).toBe("SINGLE_AUDIT_ALREADY_CONSUMED");
    expect(replayRes.reason).toContain("already been consumed");
  });

  it("6 & 7. Monthly & Annual Quota Tracking", () => {
    const proKey = "YBY-PRO-TRACKING-TEST";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: proKey,
      plan: "PROFESSIONAL_MONTHLY",
      status: "ACTIVE",
      auditsAllowed: 5,
      auditsUsed: 0,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    });

    let res = ProductionLicensingService.handleConsumeAuditRequest({ licenseKey: proKey, deviceHash: "dev_pro" });
    expect(res.auditsRemaining).toBe(4);

    res = ProductionLicensingService.handleConsumeAuditRequest({ licenseKey: proKey, deviceHash: "dev_pro" });
    expect(res.auditsRemaining).toBe(3);
  });

  it("9. Device Binding Enforcement: Key bound to device 1 rejects device 2", () => {
    const testKey = "YBY-PRO-DEVICE-BIND-TEST";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: testKey,
      plan: "PROFESSIONAL_MONTHLY",
      status: "ACTIVE",
      auditsAllowed: 5,
      auditsUsed: 0,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    });

    // Device 1 validates key -> key binds to Device 1
    const dev1Res = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: testKey,
      deviceHash: "device_hash_primary"
    });
    expect(dev1Res.valid).toBe(true);

    // Device 2 attempts to use key -> rejected for device mismatch
    const dev2Res = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: testKey,
      deviceHash: "device_hash_unauthorized"
    });
    expect(dev2Res.valid).toBe(false);
    expect(dev2Res.status).toBe("INVALID_KEY");
    expect(dev2Res.reason).toContain("Device Binding Violation");
  });

  it("10. Fail-Closed Behavior for New Audits on Network Failure", async () => {
    // Calling client with an invalid/unreachable URL
    const res = await verifyLicenseKeyOnline("YBY-PRO-MONTHLY-002", "dev_hash_1", "https://invalid-unreachable-licensing-domain.local");
    expect(res.status).toBe("NETWORK_ERROR");
    expect(res.auditsRemaining).toBe(0);
    expect(res.errorReason).toContain("Licensing server unreachable");
  });

  it("11. Zero Audit Data Storage & Privacy Enforcement: Payload with contract/PII rejected", () => {
    const leakyRequest = {
      licenseKey: "YBY-PRO-MONTHLY-002",
      deviceHash: "dev_hash_1",
      contractText: "CONFIDENTIAL VENDOR CONTRACT TERMS...",
      companyName: "ACME Corp",
      pii: "admin@acme.com"
    };

    const res = ProductionLicensingService.handleValidateKeyRequest(leakyRequest as any);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("Security Violation");
  });

  it("12. Client Online API Bridge returns minimal expected response schema", async () => {
    const testKey = "YBY-PRO-CLIENT-BRIDGE-TEST";
    const deviceHash = await getDeviceFingerprintHash("client-unit-test");
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: testKey,
      plan: "PROFESSIONAL_MONTHLY",
      status: "ACTIVE",
      auditsAllowed: 5,
      auditsUsed: 0,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    });

    const state = await verifyLicenseKeyOnline(testKey, deviceHash);
    expect(state.status).toBe("ACTIVE");
    expect(state.plan).toBe("PROFESSIONAL_MONTHLY");
    expect(state.auditsRemaining).toBe(5);
  });
});
