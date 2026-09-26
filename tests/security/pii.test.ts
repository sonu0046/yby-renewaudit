import { describe, expect, it } from "vitest";
import { redactPII } from "../../src/security/pii/redact";

describe("PII isolation", () => {
  it("redacts email, phone, and contract identifiers without network dependencies", () => {
    expect(redactPII("a@example.com +91 98765 43210")).toBe("[REDACTED] [REDACTED]");
    expect(redactPII("contract #88491")).toBe("contract [REDACTED]");
  });

  it("sanitizes composite procurement snippets containing email, phone, and contract numbers", () => {
    const input = "Contact procurement lead john.doe@techcorp.com or call +91 98765 43210 for contract #88491.";
    const expected = "Contact procurement lead [REDACTED] or call [REDACTED] for contract [REDACTED].";
    expect(redactPII(input)).toBe(expected);
  });
});