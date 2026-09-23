import ReconciliationWorker from "./reconciliation.worker?worker";
import RedactorWorker from "./redactor.worker?worker";

export function createReconciliationWorker(): Worker {
  return new ReconciliationWorker();
}

export function createRedactorWorker(): Worker {
  return new RedactorWorker();
}
