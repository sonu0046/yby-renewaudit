import { describe, expect, it } from "vitest";
import { redactPII } from "../../src/security/pii/redact";

describe("PII isolation", () => {
  it("redacts email and phone without network dependencies", () => {
    expect(redactPII("a@example.com +91 98765 43210")).toBe("[REDACTED] [REDACTED]");
  });
});