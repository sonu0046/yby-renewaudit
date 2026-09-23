import type { ReconciliationResult, WorkerEventType } from "../types";

export function createWorkerEvent(
  type: WorkerEventType,
  payload?: ReconciliationResult | Record<string, unknown> | undefined,
  percent?: number,
  message?: string
) {
  return { type, ...(payload !== undefined ? { payload } : {}), ...(percent !== undefined ? { percent } : {}), ...(message !== undefined ? { message } : {}) };
}
