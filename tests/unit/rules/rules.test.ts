import { describe, expect, it } from "vitest";
import { evaluateRules } from "../../../src/engines/rules/rules";
import type { AuditPayload } from "../../../src/types";

const payload: AuditPayload = {
  contract: { terms: [
    { id:"1", name:"priceCap", value:100, lockStatus:"HUMAN_LOCK", sourceRef:{fileName:"c.pdf",fileSha256:"x",page:1}},
    { id:"2", name:"renewalPrice", value:120, lockStatus:"HUMAN_LOCK", sourceRef:{fileName:"r.csv",fileSha256:"y",row:2}},
    { id:"3", name:"contractedSeats", value:100, lockStatus:"HUMAN_LOCK", sourceRef:{fileName:"c.pdf",fileSha256:"x",page:2}},
    { id:"4", name:"usedSeats", value:80, lockStatus:"HUMAN_LOCK", sourceRef:{fileName:"u.csv",fileSha256:"z",row:3}}
  ]},
  usageRows: [], invoiceRows: [], mapping:{usage:"u",invoice:"i"},
  normalization:{currency:"USD",billingCycle:"ANNUAL",dateFormat:"ISO_8601"}
};

describe("R1-R8 deterministic core", () => {
  it("detects price cap and shelf-ware variance", () => {
    const ids = evaluateRules(payload).map(x => x.ruleId);
    expect(ids).toContain("R1");
    expect(ids).toContain("R2");
  });
});