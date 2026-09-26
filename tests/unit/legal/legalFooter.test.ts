import { describe, expect, it } from "vitest";
import { LegalFooterModal } from "../../../src/components/legal/LegalFooterModal";

describe("Commercial & Legal Compliance Layer (Razorpay Onboarding)", () => {
  it("1. LegalFooterModal exports valid react component function", () => {
    expect(typeof LegalFooterModal).toBe("function");
  });
});
