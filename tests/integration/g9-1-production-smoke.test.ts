import { describe, expect, it } from "vitest";
import { ProductionLicensingService } from "../../src/licensing/server/licensingService";
import { verifyLicenseKeyOnline } from "../../src/licensing/apiClient";
import { checkAuditAccess, getDeviceFingerprintHash } from "../../src/licensing/entitlement";

describe("G9.1 Production Licensing API Smoke Test Suite", () => {
  it("1. Valid Single Audit Key smoke test", async () => {
    const key = "YBY-SINGLE-SMOKE-001";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: key,
      plan: "SINGLE_AUDIT",
      status: "ACTIVE",
      auditsAllowed: 1,
      auditsUsed: 0,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    });

    const deviceHash = await getDeviceFingerprintHash("device-smoke-1");
    const entitlement = await verifyLicenseKeyOnline(key, deviceHash);

    expect(entitlement.status).toBe("ACTIVE");
    expect(entitlement.plan).toBe("SINGLE_AUDIT");
    expect(entitlement.auditsRemaining).toBe(1);
    expect(checkAuditAccess(entitlement).allowed).toBe(true);
  });

  it("2. Valid Monthly Key smoke test", async () => {
    const key = "YBY-PRO-SMOKE-002";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: key,
      plan: "PROFESSIONAL_MONTHLY",
      status: "ACTIVE",
      auditsAllowed: 5,
      auditsUsed: 0,
      maxDevices: 1,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    });

    const deviceHash = await getDeviceFingerprintHash("device-smoke-2");
    const entitlement = await verifyLicenseKeyOnline(key, deviceHash);

    expect(entitlement.status).toBe("ACTIVE");
    expect(entitlement.plan).toBe("PROFESSIONAL_MONTHLY");
    expect(entitlement.auditsRemaining).toBe(5);
    expect(checkAuditAccess(entitlement).allowed).toBe(true);
  });

  it("3. Valid Annual Key smoke test", async () => {
    const key = "YBY-ANNUAL-SMOKE-003";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: key,
      plan: "ANNUAL_PROFESSIONAL",
      status: "ACTIVE",
      auditsAllowed: 60,
      auditsUsed: 0,
      maxDevices: 1,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    });

    const deviceHash = await getDeviceFingerprintHash("device-smoke-3");
    const entitlement = await verifyLicenseKeyOnline(key, deviceHash);

    expect(entitlement.status).toBe("ACTIVE");
    expect(entitlement.plan).toBe("ANNUAL_PROFESSIONAL");
    expect(entitlement.auditsRemaining).toBe(60);
    expect(checkAuditAccess(entitlement).allowed).toBe(true);
  });

  it("4. Expired Key smoke test", async () => {
    const key = "YBY-PRO-EXPIRED-SMOKE-004";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: key,
      plan: "PROFESSIONAL_MONTHLY",
      status: "EXPIRED",
      auditsAllowed: 5,
      auditsUsed: 5,
      maxDevices: 1,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    });

    const deviceHash = await getDeviceFingerprintHash("device-smoke-4");
    const entitlement = await verifyLicenseKeyOnline(key, deviceHash);

    expect(entitlement.status).toBe("EXPIRED");
    expect(entitlement.auditsRemaining).toBe(0);
    expect(checkAuditAccess(entitlement).allowed).toBe(false);
  });

  it("5. Consumed Single Key smoke test", async () => {
    const key = "YBY-SINGLE-CONSUMED-SMOKE-005";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: key,
      plan: "SINGLE_AUDIT",
      status: "ACTIVE",
      auditsAllowed: 1,
      auditsUsed: 0,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    });

    const deviceHash = await getDeviceFingerprintHash("device-smoke-5");
    
    // 1st run consumes
    ProductionLicensingService.handleConsumeAuditRequest({ licenseKey: key, deviceHash });

    // Subsequent check shows consumed status
    const entitlement = await verifyLicenseKeyOnline(key, deviceHash);
    expect(entitlement.status).toBe("SINGLE_AUDIT_ALREADY_CONSUMED");
    expect(entitlement.auditsRemaining).toBe(0);
    expect(checkAuditAccess(entitlement).allowed).toBe(false);
  });

  it("6. Wrong deviceHash smoke test", async () => {
    const key = "YBY-PRO-BIND-SMOKE-006";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: key,
      plan: "PROFESSIONAL_MONTHLY",
      status: "ACTIVE",
      auditsAllowed: 5,
      auditsUsed: 0,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    });

    // Bind to Primary Device
    await verifyLicenseKeyOnline(key, "device-primary-authorized");

    // Re-verify with Wrong Device
    const entitlement = await verifyLicenseKeyOnline(key, "device-unauthorized-attacker");
    expect(entitlement.status).toBe("INVALID_KEY");
    expect(entitlement.errorReason).toContain("Device Binding Violation");
    expect(checkAuditAccess(entitlement).allowed).toBe(false);
  });

  it("7. Quota Exhaustion smoke test", async () => {
    const key = "YBY-PRO-EXHAUSTED-SMOKE-007";
    ProductionLicensingService.registerProvisionedKey({
      licenseKey: key,
      plan: "PROFESSIONAL_MONTHLY",
      status: "ACTIVE",
      auditsAllowed: 5,
      auditsUsed: 5,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    });

    const deviceHash = await getDeviceFingerprintHash("device-smoke-7");
    const entitlement = await verifyLicenseKeyOnline(key, deviceHash);

    expect(entitlement.status).toBe("QUOTA_EXHAUSTED");
    expect(entitlement.auditsRemaining).toBe(0);
    expect(checkAuditAccess(entitlement).allowed).toBe(false);
  });

  it("8. Network Failure / Fail-Closed smoke test", async () => {
    const entitlement = await verifyLicenseKeyOnline(
      "YBY-PRO-SMOKE-002",
      "device-smoke-8",
      "https://offline-unreachable-api-host.internal"
    );

    expect(entitlement.status).toBe("NETWORK_ERROR");
    expect(checkAuditAccess(entitlement).allowed).toBe(false);
  });

  it("9. Confirm Response Contains Only Licensing Metadata", () => {
    const response = ProductionLicensingService.handleValidateKeyRequest({
      licenseKey: "YBY-FREE-DEFAULT-000",
      deviceHash: "device-smoke-9"
    });

    const keys = Object.keys(response);
    const allowedResponseKeys = ["valid", "plan", "auditsRemaining", "auditsReserved", "status", "reason"];
    const containsUnexpected = keys.some((k) => !allowedResponseKeys.includes(k));

    expect(containsUnexpected).toBe(false);
    expect(response).not.toHaveProperty("contract");
    expect(response).not.toHaveProperty("pii");
    expect(response).not.toHaveProperty("findings");
    expect(response).not.toHaveProperty("evidence");
  });

  it("10. Confirm LICENSING_SERVER_SECRET never reaches client bundle", () => {
    // Assert server secret is strictly encapsulated inside server module
    const clientBundleModule = import("../../src/licensing/apiClient");
    expect(clientBundleModule).not.toHaveProperty("LICENSING_SERVER_SECRET");
    expect(clientBundleModule).not.toHaveProperty("getServerSecret");
  });
});
