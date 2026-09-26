import type { QuotaLeaseRecord, ServerLicenseRecord, ServerLicensingRequest, ServerLicensingResponse } from "./types";
import { verifyLicensingNetworkPayload } from "../entitlement";

/**
 * Server-side provisioned license key registry database store.
 * Zero contract, audit, PII or row data is stored here.
 */
const SERVER_LICENSE_DATABASE: Map<string, ServerLicenseRecord> = new Map([
  [
    "YBY-SINGLE-PROD-001",
    {
      licenseKey: "YBY-SINGLE-PROD-001",
      plan: "SINGLE_AUDIT",
      status: "ACTIVE",
      auditsAllowed: 1,
      auditsUsed: 0,
      auditsReserved: 0,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    }
  ],
  [
    "YBY-PRO-MONTHLY-002",
    {
      licenseKey: "YBY-PRO-MONTHLY-002",
      plan: "PROFESSIONAL_MONTHLY",
      status: "ACTIVE",
      auditsAllowed: 5,
      auditsUsed: 0,
      auditsReserved: 0,
      maxDevices: 1,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    }
  ],
  [
    "YBY-ANNUAL-PROD-003",
    {
      licenseKey: "YBY-ANNUAL-PROD-003",
      plan: "ANNUAL_PROFESSIONAL",
      status: "ACTIVE",
      auditsAllowed: 60,
      auditsUsed: 0,
      auditsReserved: 0,
      maxDevices: 1,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    }
  ],
  [
    "YBY-FREE-DEFAULT-000",
    {
      licenseKey: "YBY-FREE-DEFAULT-000",
      plan: "FREE_FIRST_AUDIT",
      status: "ACTIVE",
      auditsAllowed: 1,
      auditsUsed: 0,
      auditsReserved: 0,
      maxDevices: 1,
      createdAt: new Date().toISOString()
    }
  ],
  [
    "YBY-PRO-EXPIRED-999",
    {
      licenseKey: "YBY-PRO-EXPIRED-999",
      plan: "PROFESSIONAL_MONTHLY",
      status: "EXPIRED",
      auditsAllowed: 5,
      auditsUsed: 5,
      auditsReserved: 0,
      maxDevices: 1,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    }
  ]
]);

// Lease store: reservationId -> QuotaLeaseRecord
const ACTIVE_LEASES: Map<string, QuotaLeaseRecord> = new Map();

// Rate limiting store: deviceHash -> timestamps array
const RATE_LIMIT_STORE: Map<string, number[]> = new Map();

/**
 * Sweeps expired reservation leases (TTL = 15 minutes) and restores quota back to AVAILABLE state.
 */
function cleanExpiredLeases(): void {
  const now = Date.now();
  for (const [resId, lease] of ACTIVE_LEASES.entries()) {
    if (now > lease.leaseExpiresAt) {
      const record = SERVER_LICENSE_DATABASE.get(lease.licenseKey);
      if (record && (record.auditsReserved || 0) > 0) {
        record.auditsReserved = Math.max((record.auditsReserved || 0) - 1, 0);
      }
      ACTIVE_LEASES.delete(resId);
    }
  }
}

/**
 * Checks API rate limiting: Max 10 requests / 60 seconds per deviceHash
 */
function isRateLimited(deviceHash: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;

  let timestamps = RATE_LIMIT_STORE.get(deviceHash) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    return true;
  }

  timestamps.push(now);
  RATE_LIMIT_STORE.set(deviceHash, timestamps);
  return false;
}

export class ProductionLicensingService {
  /**
   * Helper to register a new provisioned license key on the server (e.g. after payment webhook)
   */
  public static registerProvisionedKey(record: ServerLicenseRecord): void {
    SERVER_LICENSE_DATABASE.set(record.licenseKey, { ...record, auditsReserved: record.auditsReserved || 0 });
  }

  /**
   * Resets rate limits and database for testing
   */
  public static resetServerStore(): void {
    RATE_LIMIT_STORE.clear();
    ACTIVE_LEASES.clear();
  }

  /**
   * Main API Handler for validateKey Endpoint:
   * Validates key, checks rate limits, checks device binding, asserts zero audit data leakage, checks expiry, calculates remaining quota.
   */
  public static handleValidateKeyRequest(payload: ServerLicensingRequest): ServerLicensingResponse {
    cleanExpiredLeases();

    // 1. Zero Audit Data Privacy Inspection
    if (!verifyLicensingNetworkPayload(payload)) {
      return {
        valid: false,
        status: "INVALID_KEY",
        reason: "Security Violation: Outbound licensing payload must contain ONLY { licenseKey, deviceHash }."
      };
    }

    const { licenseKey, deviceHash } = payload;

    if (!licenseKey || !deviceHash) {
      return {
        valid: false,
        status: "INVALID_KEY",
        reason: "Missing required licenseKey or deviceHash."
      };
    }

    // 2. Rate Limiting Check
    if (isRateLimited(deviceHash)) {
      return {
        valid: false,
        status: "NETWORK_ERROR",
        reason: "HTTP 429 Too Many Requests: Rate limit exceeded (max 10 requests per minute)."
      };
    }

    const record = SERVER_LICENSE_DATABASE.get(licenseKey.trim().toUpperCase());

    // 3. License key validation
    if (!record) {
      return {
        valid: false,
        status: "INVALID_KEY",
        reason: "Invalid or unrecognized license activation key."
      };
    }

    const reserved = record.auditsReserved || 0;

    // 4. Expiry check
    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      record.status = "EXPIRED";
      return {
        valid: false,
        plan: record.plan,
        auditsRemaining: 0,
        auditsReserved: reserved,
        status: "EXPIRED",
        reason: "License subscription has expired."
      };
    }

    // 5. Device Binding Verification
    if (!record.boundDeviceHash) {
      record.boundDeviceHash = deviceHash; // Bind on first activation
    } else if (record.boundDeviceHash !== deviceHash) {
      return {
        valid: false,
        plan: record.plan,
        status: "INVALID_KEY",
        reason: "Device Binding Violation: License is already registered to another device."
      };
    }

    // 6. Quota Calculation (Available = Allowed - Used - Reserved)
    const unreservedRemaining = Math.max(record.auditsAllowed - record.auditsUsed - reserved, 0);

    if (unreservedRemaining <= 0) {
      const exhaustedStatus = record.plan === "SINGLE_AUDIT" ? "SINGLE_AUDIT_ALREADY_CONSUMED" : "QUOTA_EXHAUSTED";
      return {
        valid: false,
        plan: record.plan,
        auditsRemaining: 0,
        auditsReserved: reserved,
        status: exhaustedStatus,
        reason: record.plan === "SINGLE_AUDIT"
          ? "Single Audit token has already been consumed."
          : "Audit quota exhausted for current billing cycle."
      };
    }

    return {
      valid: true,
      plan: record.plan,
      auditsRemaining: unreservedRemaining,
      auditsReserved: reserved,
      status: "ACTIVE"
    };
  }

  /**
   * Quota State Machine Step 1: AVAILABLE -> RESERVED (Gate 0 Audit Start)
   * Leases 1 audit credit with a 15-minute TTL.
   */
  public static handleReserveQuota(payload: ServerLicensingRequest): ServerLicensingResponse {
    cleanExpiredLeases();

    const valRes = ProductionLicensingService.handleValidateKeyRequest(payload);
    if (!valRes.valid) return valRes;

    const key = (payload.licenseKey || "").trim().toUpperCase();
    const record = SERVER_LICENSE_DATABASE.get(key)!;
    const reserved = record.auditsReserved || 0;

    const available = Math.max(record.auditsAllowed - record.auditsUsed - reserved, 0);
    if (available <= 0) {
      return {
        valid: false,
        plan: record.plan,
        auditsRemaining: 0,
        auditsReserved: reserved,
        status: record.plan === "SINGLE_AUDIT" ? "SINGLE_AUDIT_ALREADY_CONSUMED" : "QUOTA_EXHAUSTED",
        reason: "Cannot reserve quota: No available audits remaining."
      };
    }

    // Atomically reserve quota
    record.auditsReserved = reserved + 1;

    const reservationId = `RES-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const leaseExpiresAt = Date.now() + 15 * 60 * 1000; // 15-minute TTL lease

    ACTIVE_LEASES.set(reservationId, {
      reservationId,
      licenseKey: record.licenseKey,
      deviceHash: payload.deviceHash || record.boundDeviceHash || "DEFAULT_DEVICE",
      reservedAt: new Date().toISOString(),
      leaseExpiresAt
    });

    return {
      valid: true,
      plan: record.plan,
      auditsRemaining: Math.max(record.auditsAllowed - record.auditsUsed - record.auditsReserved, 0),
      auditsReserved: record.auditsReserved,
      reservationId,
      status: "ACTIVE"
    };
  }

  /**
   * Quota State Machine Step 2: RESERVED -> CONSUMED (AUDIT_COMPLETE)
   * Commits the reserved credit upon successful local audit reconciliation.
   */
  public static handleCommitQuota(payload: ServerLicensingRequest): ServerLicensingResponse {
    cleanExpiredLeases();

    const { reservationId } = payload;
    if (!reservationId || !ACTIVE_LEASES.has(reservationId)) {
      return {
        valid: false,
        status: "INVALID_KEY",
        reason: "Invalid or expired reservation ID."
      };
    }

    const lease = ACTIVE_LEASES.get(reservationId)!;
    const record = SERVER_LICENSE_DATABASE.get(lease.licenseKey)!;
    const reserved = record.auditsReserved || 0;

    // Atomically commit: Reserved -> Consumed
    record.auditsReserved = Math.max(reserved - 1, 0);
    record.auditsUsed += 1;

    ACTIVE_LEASES.delete(reservationId);

    const newRemaining = Math.max(record.auditsAllowed - record.auditsUsed - (record.auditsReserved || 0), 0);
    if (record.auditsAllowed - record.auditsUsed <= 0) {
      record.status = record.plan === "SINGLE_AUDIT" ? "SINGLE_AUDIT_ALREADY_CONSUMED" : "QUOTA_EXHAUSTED";
    }

    return {
      valid: record.status === "ACTIVE" || newRemaining > 0,
      plan: record.plan,
      auditsRemaining: newRemaining,
      auditsReserved: record.auditsReserved,
      status: record.status
    };
  }

  /**
   * Quota State Machine Step 3: RESERVED -> AVAILABLE (Audit Cancelled / Failed)
   * Explicitly releases a reserved credit back to available state.
   */
  public static handleReleaseQuota(payload: ServerLicensingRequest): ServerLicensingResponse {
    const { reservationId } = payload;
    if (reservationId && ACTIVE_LEASES.has(reservationId)) {
      const lease = ACTIVE_LEASES.get(reservationId)!;
      const record = SERVER_LICENSE_DATABASE.get(lease.licenseKey);
      if (record && (record.auditsReserved || 0) > 0) {
        record.auditsReserved = (record.auditsReserved || 0) - 1;
      }
      ACTIVE_LEASES.delete(reservationId);
    }

    return {
      valid: true,
      status: "ACTIVE",
      reason: "Quota reservation released back to AVAILABLE state."
    };
  }

  /**
   * Legacy simple consumption bridge (combines reserve + commit for simple calls)
   */
  public static handleConsumeAuditRequest(payload: ServerLicensingRequest): ServerLicensingResponse {
    const resRes = ProductionLicensingService.handleReserveQuota(payload);
    if (!resRes.valid || !resRes.reservationId) return resRes;

    return ProductionLicensingService.handleCommitQuota({
      ...payload,
      reservationId: resRes.reservationId
    });
  }
}
