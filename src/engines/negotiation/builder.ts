import type {
  CalculationTerm,
  EvidenceRecord,
  NegotiationDraft,
  NegotiationItem,
  ReconciliationResult
} from "../../types";

/**
 * Sanitizes file names to ensure no internal local disk paths are exposed in vendor-facing drafts.
 */
export function sanitizeFileName(filePath: string): string {
  if (!filePath) return "Unknown_Source";
  const clean = filePath.split(/[/\\]/).pop() || filePath;
  return clean;
}

/**
 * Maps deterministic rule findings into structured vendor negotiation positions and asks.
 */
export function buildNegotiationItem(e: EvidenceRecord, terms: CalculationTerm[] = []): NegotiationItem {
  const cleanFileName = sanitizeFileName(e.source.fileName);
  const locationRef = `Page ${e.source.page ?? "N/A"} / Row ${e.source.row ?? "N/A"}`;
  const supportingTerms = terms
    .filter((t) => t.lockStatus === "HUMAN_LOCK")
    .map((t) => `${t.name}: ${t.value}`);

  let negotiationPosition = "";
  let suggestedAsk = "";
  let financialImpactFormatted = "";

  if (e.ruleId === "R1") {
    financialImpactFormatted = `+$${e.delta.toLocaleString()} Billed Price Overcharge`;
    negotiationPosition = `The renewal invoice amount exceeds the contractually mandated price cap defined in Clause ${e.source.page ? `Page ${e.source.page}` : "terms"}. The billed renewal price exceeds the agreed cap by $${e.delta.toLocaleString()}.`;
    suggestedAsk = `Issue an immediate invoice credit or revised billing statement of $${e.delta.toLocaleString()} to align the renewal cost with the contractual price cap limit.`;
  } else if (e.ruleId === "R2") {
    financialImpactFormatted = `+${e.delta} Unutilized / Shelf-ware Seats`;
    const isTelemetry = /telemetry|usage|\.csv$/i.test(cleanFileName);
    const sourceText = isTelemetry ? "Active user telemetry demonstrates" : "Verified audit terms demonstrate";
    negotiationPosition = `${sourceText} an unutilized variance of ${e.delta} contracted seats. Paying for unassigned or inactive seats creates unnecessary cost overhead.`;
    suggestedAsk = `De-escalate the renewal seat tier from contracted quantity down to active usage level (reduction of ${e.delta} seats) upon contract execution.`;
  } else if (e.ruleId === "R3") {
    financialImpactFormatted = `+${e.delta} Unused Add-on / Module Entitlements`;
    negotiationPosition = `Audit findings indicate add-on module entitlements are inactive or underutilized across active user profiles.`;
    suggestedAsk = `Remove or credit unutilized add-on modules prior to renewal contract confirmation.`;
  } else if (e.ruleId === "R4") {
    financialImpactFormatted = `+$${e.delta.toLocaleString()} Unscheduled Auto-Renewal Penalty`;
    negotiationPosition = `Auto-renewal escalation clause applied without meeting mandatory advance notification window requirements.`;
    suggestedAsk = `Waive auto-renewal escalation penalty and maintain baseline contracted rates.`;
  } else {
    financialImpactFormatted = e.delta > 0 ? `+$${e.delta.toLocaleString()} Discrepancy` : `${e.delta} Unit Discrepancy`;
    negotiationPosition = `Audit rule ${e.ruleId} identified a contractual variance of ${e.delta} against verified baseline data.`;
    suggestedAsk = `Adjust renewal invoice terms to resolve the ${e.ruleId} variance identified in evidence trace.`;
  }

  return {
    ruleId: e.ruleId,
    title: e.title,
    severity: e.severity,
    findingText: e.title,
    financialImpactFormatted,
    numericDelta: e.delta,
    negotiationPosition,
    suggestedAsk,
    formulaTrail: e.formula,
    sourceFile: cleanFileName,
    sourceHash: e.sourceHash,
    locationRef,
    supportingTerms
  };
}

/**
 * Main Deterministic Negotiation Draft Builder
 */
export function buildNegotiationDraft(
  result: ReconciliationResult | null,
  terms: CalculationTerm[] = []
): NegotiationDraft {
  const generatedAt = new Date().toISOString();
  const isHumanLocked = terms.length > 0 && terms.every((t) => t.lockStatus === "HUMAN_LOCK");

  if (!result) {
    return {
      generatedAt,
      overallStatus: "BLOCKED",
      totalOverchargeAmount: 0,
      totalShelfwareSeats: 0,
      items: [],
      isHumanLocked: false
    };
  }

  const items: NegotiationItem[] = (result.evidence || []).map((e) => buildNegotiationItem(e, terms));

  const totalOverchargeAmount = items
    .filter((item) => item.ruleId === "R1")
    .reduce((sum, item) => sum + item.numericDelta, 0);

  const totalShelfwareSeats = items
    .filter((item) => item.ruleId === "R2")
    .reduce((sum, item) => sum + item.numericDelta, 0);

  return {
    generatedAt,
    overallStatus: result.blocked ? "BLOCKED" : "PASS",
    totalOverchargeAmount,
    totalShelfwareSeats,
    items,
    isHumanLocked
  };
}
