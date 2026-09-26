import type { EntitlementState } from "./types";
import { verifyLicensingNetworkPayload } from "./entitlement";
import { ProductionLicensingService } from "./server/licensingService";

/**
 * Client-Side Production Licensing API Bridge
 * Sends ONLY { licenseKey, deviceHash } over HTTPS to the Production Licensing API.
 */
export async function verifyLicenseKeyOnline(
  licenseKey: string,
  deviceHash: string,
  apiBaseUrl?: string
): Promise<EntitlementState> {
  const payload = { licenseKey, deviceHash };

  // 1. Zero Audit Data Privacy Assertion
  if (!verifyLicensingNetworkPayload(payload)) {
    return {
      status: "INVALID_KEY",
      plan: "FREE_FIRST_AUDIT",
      auditsAllowed: 0,
      auditsUsed: 0,
      auditsRemaining: 0,
      errorReason: "Privacy Violation: Outbound licensing payload rejected due to non-licensing metadata."
    };
  }

  try {
    // If external production API URL is provided, perform fetch call
    if (apiBaseUrl) {
      const response = await fetch(`${apiBaseUrl}/api/v1/licensing/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        return {
          status: "NETWORK_ERROR",
          plan: "FREE_FIRST_AUDIT",
          auditsAllowed: 0,
          auditsUsed: 0,
          auditsRemaining: 0,
          errorReason: `Licensing API returned HTTP error status ${response.status}.`
        };
      }

      const resJson = await response.json();
      return {
        status: resJson.status,
        plan: resJson.plan || "FREE_FIRST_AUDIT",
        auditsAllowed: resJson.auditsAllowed || (resJson.auditsRemaining || 0),
        auditsUsed: 0,
        auditsRemaining: resJson.auditsRemaining || 0,
        errorReason: resJson.reason
      };
    }

    // Direct isolated service handler invocation (Local/Edge execution mode)
    const serverRes = ProductionLicensingService.handleValidateKeyRequest(payload);
    return {
      status: serverRes.status,
      plan: serverRes.plan || "FREE_FIRST_AUDIT",
      auditsAllowed: serverRes.auditsRemaining || 0,
      auditsUsed: 0,
      auditsRemaining: serverRes.auditsRemaining || 0,
      errorReason: serverRes.reason
    };
  } catch {
    // Network failure fails closed for starting NEW audits
    return {
      status: "NETWORK_ERROR",
      plan: "FREE_FIRST_AUDIT",
      auditsAllowed: 0,
      auditsUsed: 0,
      auditsRemaining: 0,
      errorReason: "Licensing server unreachable. Gate 0 audit execution blocked until network connection is restored."
    };
  }
}
