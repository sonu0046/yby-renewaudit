import { describe, expect, it } from "vitest";
import { confirmTerm, editTerm, lockTerm } from "../../src/state/humanLock";

describe("Human Lock state machine", () => {
  it("requires confirmation before lock", () => {
    const t = { id:"x", name:"priceCap", value:100, lockStatus:"UNVERIFIED" as const,
      sourceRef:{fileName:"c.pdf",fileSha256:"x",page:1}};
    expect(() => lockTerm(t)).toThrow();
    const locked = lockTerm(confirmTerm(t));
    expect(locked.lockStatus).toBe("HUMAN_LOCK");
    expect(editTerm(locked, 120).lockStatus).toBe("BLOCKED");
  });
});