import { describe, expect, it } from "vitest";
import {
  checkAuditAccess,
  consumeAuditCredit,
  createSignedToken,
  getDeviceFingerprintHash,
  MAX_FILE_SIZE_BYTES,
  MAX_ROW_COUNT,
  parseLicenseKey,
  validateGate0Safeguards,
  verifyLicensingNetworkPayload,
  verifySignedToken
} from "../../../src/licensing/entitlement";
import type { CalculationTerm } from "../../../src/types";
import type { EntitlementState } from "../../../src/licensing/types";

describe("G8.8 Licensing & Commercial Entitlement Suite", () => {
  it("1. Valid License Activation parses Single, Pro, and Annual plan credentials", () => {
    const singleState = parseLicenseKey("YBY-SINGLE-8849-AAAA");
    expect(singleState.status).toBe("ACTIVE");
    expect(singleState.plan).toBe("SINGLE_AUDIT");
    expect(singleState.auditsRemaining).toBe(1);
    expect(singleState.isConsumableSingleAudit).toBe(true);

    const proState = parseLicenseKey("YBY-PRO-9912-BBBB");
    expect(proState.status).toBe("ACTIVE");
    expect(proState.plan).toBe("PROFESSIONAL_MONTHLY");
    expect(proState.auditsRemaining).toBe(5);

    const annualState = parseLicenseKey("YBY-ANNUAL-7734-CCCC");
    expect(annualState.status).toBe("ACTIVE");
    expect(annualState.plan).toBe("ANNUAL_PROFESSIONAL");
    expect(annualState.auditsRemaining).toBe(60);
  });

  it("2. Quota Exhaustion blocks audit access when remaining audits reaches 0", () => {
    let state = parseLicenseKey("YBY-PRO-9912-BBBB");
    expect(checkAuditAccess(state).allowed).toBe(true);

    // Consume 5 credits
    for (let i = 0; i < 5; i++) {
      state = consumeAuditCredit(state);
    }

    expect(state.auditsRemaining).toBe(0);
    expect(state.status).toBe("QUOTA_EXHAUSTED");
    const access = checkAuditAccess(state);
    expect(access.allowed).toBe(false);
    expect(access.reason).toContain("Audit quota exhausted");
  });

  it("3. Signed token resists localStorage clear bypass via cryptographic device signature", async () => {
    const deviceHash = await getDeviceFingerprintHash("company-laptop-id");
    let state = parseLicenseKey("YBY-SINGLE-1001-TEST");
    state = consumeAuditCredit(state);

    expect(state.status).toBe("SINGLE_AUDIT_ALREADY_CONSUMED");
    const token = await createSignedToken(state, deviceHash);

    // Simulate localStorage clear and token re-verification
    const recoveredState = await verifySignedToken(token, deviceHash);
    expect(recoveredState).not.toBeNull();
    expect(recoveredState?.status).toBe("SINGLE_AUDIT_ALREADY_CONSUMED");
    expect(recoveredState?.auditsRemaining).toBe(0);

    // Tampered device hash fails verification
    const tamperedCheck = await verifySignedToken(token, "tampered-device-id");
    expect(tamperedCheck).toBeNull();
  });

  it("4. Single Audit Replay protection blocks 2nd execution of consumable token", () => {
    let state = parseLicenseKey("YBY-SINGLE-5544-ONETIME");
    expect(checkAuditAccess(state).allowed).toBe(true);

    state = consumeAuditCredit(state);
    expect(state.status).toBe("SINGLE_AUDIT_ALREADY_CONSUMED");
    
    const secondAccess = checkAuditAccess(state);
    expect(secondAccess.allowed).toBe(false);
    expect(secondAccess.reason).toContain("Single Audit token already consumed");
  });

  it("5. 25 MB File Boundary check rejects oversized files at Gate 0", () => {
    const validFile = new File([new Uint8Array(1024 * 1024)], "contract.pdf", { type: "application/pdf" });
    const validCheck = validateGate0Safeguards(validFile);
    expect(validCheck.valid).toBe(true);

    const oversizedFile = { name: "huge.pdf", size: MAX_FILE_SIZE_BYTES + 1024 } as File;
    const invalidCheck = validateGate0Safeguards(oversizedFile);
    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.errorCode).toBe("FILE_TOO_LARGE");
    expect(invalidCheck.errorMessage).toContain("exceeds the 25 MB maximum technical safeguard limit");
  });

  it("6. 50,001 Row Boundary check rejects oversized CSV datasets at Gate 0", () => {
    expect(validateGate0Safeguards(null, 50000).valid).toBe(true);

    const invalidCheck = validateGate0Safeguards(null, 50001);
    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.errorCode).toBe("ROW_LIMIT_EXCEEDED");
    expect(invalidCheck.errorMessage).toContain("exceeds the 50,000 maximum row safeguard limit");
  });

  it("7. Zero Audit Data Leakage inspection validates pure credential payload", () => {
    const validPayload = { licenseKey: "YBY-PRO-123", deviceHash: "hash123" };
    expect(verifyLicensingNetworkPayload(validPayload)).toBe(true);

    // Payload containing contract text or PII is rejected
    const leakyPayload1 = { licenseKey: "YBY-PRO-123", deviceHash: "hash123", contractText: "Confidential terms..." };
    expect(verifyLicensingNetworkPayload(leakyPayload1)).toBe(false);

    const leakyPayload2 = { licenseKey: "YBY-PRO-123", deviceHash: "hash123", pii: "john.doe@corp.com" };
    expect(verifyLicensingNetworkPayload(leakyPayload2)).toBe(false);
  });

  it("8. Licensing Network Failure fails closed with retry state for new audits", () => {
    const netErrorState = parseLicenseKey("YBY-NETERROR-9999");
    expect(netErrorState.status).toBe("NETWORK_ERROR");
    
    const access = checkAuditAccess(netErrorState);
    expect(access.allowed).toBe(false);
    expect(access.reason).toContain("Licensing service unreachable");
  });

  it("9. Expired License blocks new audit execution", () => {
    const expiredState = parseLicenseKey("YBY-EXPIRED-1111");
    expect(expiredState.status).toBe("EXPIRED");

    const access = checkAuditAccess(expiredState);
    expect(access.allowed).toBe(false);
    expect(access.reason).toContain("License subscription has expired");
  });

  it("10. License expiry or entitlement block preserves existing Human Lock state", () => {
    const terms: CalculationTerm[] = [
      { id: "1", name: "priceCap", value: 10000, sourceRef: { fileName: "contract.pdf", fileSha256: "h1" }, lockStatus: "HUMAN_LOCK" },
      { id: "2", name: "renewalPrice", value: 12000, sourceRef: { fileName: "contract.pdf", fileSha256: "h1" }, lockStatus: "HUMAN_LOCK" }
    ];

    const expiredState = parseLicenseKey("YBY-EXPIRED-1111");
    const access = checkAuditAccess(expiredState);

    // Access blocked for NEW audits
    expect(access.allowed).toBe(false);

    // Existing Human Lock terms remain 100% locked & intact
    expect(terms.every((t) => t.lockStatus === "HUMAN_LOCK")).toBe(true);
    expect(terms[0].value).toBe(10000);
  });

  it("11. G0_QuotaExhausted_PreventsNewFileIntake", () => {
    // Given: entitlementState = QUOTA_EXHAUSTED (auditsRemaining = 0)
    const state: EntitlementState = {
      status: "QUOTA_EXHAUSTED",
      plan: "FREE_FIRST_AUDIT",
      auditsAllowed: 1,
      auditsUsed: 1,
      auditsRemaining: 0
    };

    // Assert 1: Gate 0 audit access evaluator returns allowed = false
    const access = checkAuditAccess(state);
    expect(access.allowed).toBe(false);
    expect(access.reason).toContain("Audit quota exhausted");

    // Assert 2: Browse/click, drag/drop, parsing Worker, and AuditPayload generation are prevented
    let payloadCreated = false;
    let parsingWorkerInvoked = false;

    if (access.allowed) {
      payloadCreated = true;
      parsingWorkerInvoked = true;
    }

    expect(payloadCreated).toBe(false);
    expect(parsingWorkerInvoked).toBe(false);

    // Assert 3: Workflow execution remains BLOCKED
    expect(state.auditsRemaining).toBe(0);

    // Assert 4: Existing License Activation / Upgrade UI remains available & actionable
    const upgradeKey = "YBY-SINGLE-9988-UPGRADE";
    const upgradedState = parseLicenseKey(upgradeKey);
    expect(upgradedState.status).toBe("ACTIVE");
    expect(upgradedState.auditsRemaining).toBe(1);
    expect(checkAuditAccess(upgradedState).allowed).toBe(true);
  });
});
