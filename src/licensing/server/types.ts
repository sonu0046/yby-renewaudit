import type { PlanType, EntitlementStatus } from "../types";

export interface QuotaLeaseRecord {
  reservationId: string;
  licenseKey: string;
  deviceHash: string;
  reservedAt: string;
  leaseExpiresAt: number;
}

export interface ServerLicenseRecord {
  licenseKey: string;
  plan: PlanType;
  status: EntitlementStatus;
  auditsAllowed: number;
  auditsUsed: number;
  auditsReserved?: number;
  boundDeviceHash?: string;
  maxDevices: number;
  expiresAt?: string;
  createdAt: string;
}

export interface ServerLicensingRequest {
  licenseKey?: string;
  deviceHash?: string;
  reservationId?: string;
  [key: string]: any;
}

export interface ServerLicensingResponse {
  valid: boolean;
  plan?: PlanType;
  auditsRemaining?: number;
  auditsReserved?: number;
  reservationId?: string;
  status: EntitlementStatus;
  reason?: string;
}
