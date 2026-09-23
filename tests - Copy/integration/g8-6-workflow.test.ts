import { describe, expect, it } from "vitest";
import { runGates } from "../../src/engines/gates/gates";
import { editTerm } from "../../src/state/humanLock";
import { buildAuditPayloadFromRows } from "../../src/workflow/input";
import { createWorkerEvent } from "../../src/workers/messages";

describe("G8.6 integrated audit workflow", () => {
  it("derives traceable terms from uploaded rows without auto-verifying them", () => {
    const payload = buildAuditPayloadFromRows(
      [{ priceCap: "10000", renewalPrice: "12000", contractedSeats: "100", usedSeats: "72" }],
      "quote.csv"
    );

    expect(payload.contract.terms).toHaveLength(4);
    expect(payload.contract.terms.every((term) => term.lockStatus === "UNVERIFIED")).toBe(true);
    expect(payload.contract.terms.every((term) => /^([a-f0-9]{64})$/.test(term.sourceRef.fileSha256))).toBe(true);
  });

  it("invalidates the human lock when a locked term is edited", () => {
    const payload = buildAuditPayloadFromRows(
      [{ priceCap: "10000", renewalPrice: "12000", contractedSeats: "100", usedSeats: "72" }],
      "quote.csv"
    );

    const lockedTerms = payload.contract.terms.map((term) => ({ ...term, lockStatus: "HUMAN_LOCK" as const }));
    const edited = editTerm(lockedTerms[0], 15000);
    const nextPayload = {
      ...payload,
      contract: {
        terms: lockedTerms.map((term) => (term.id === edited.id ? edited : term))
      }
    };

    expect(runGates(nextPayload).find((gate) => gate.gate === "G4")?.status).toBe("BLOCK");
  });

  it("exposes the worker lifecycle contract used by the UI", () => {
    expect(createWorkerEvent("START")).toMatchObject({ type: "START" });
    expect(createWorkerEvent("PROGRESS", undefined, 42)).toMatchObject({ type: "PROGRESS", percent: 42 });
    expect(createWorkerEvent("RESULT", { blocked: false })).toMatchObject({ type: "RESULT", payload: { blocked: false } });
    expect(createWorkerEvent("BLOCKED", { blocked: true })).toMatchObject({ type: "BLOCKED", payload: { blocked: true } });
    expect(createWorkerEvent("ERROR", undefined, undefined, "audit failed")).toMatchObject({ type: "ERROR", message: "audit failed" });
  });
});
