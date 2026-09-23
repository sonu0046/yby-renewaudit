import { describe, expect, it } from "vitest";
import { sha256 } from "../../src/security/hashing/sha256";

describe("SHA-256", () => {
  it("hashes client-side bytes deterministically", async () => {
    expect(await sha256(new TextEncoder().encode("hello")))
      .toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});