import type { PlanType } from "../../licensing/types";

export interface PaymentWebhookPayload {
  eventId: string;
  eventType: "payment.captured" | "payment.failed" | "subscription.activated" | "subscription.cancelled";
  paymentId: string;
  amountINR: number;
  customerEmail: string;
  planType: PlanType;
  signature: string;
  [key: string]: any;
}

export interface PaymentWebhookResponse {
  success: boolean;
  provisionedKey?: string;
  message: string;
  isDuplicate?: boolean;
}

export interface IdempotencyRecord {
  eventId: string;
  paymentId: string;
  licenseKey: string;
  processedAt: string;
}
