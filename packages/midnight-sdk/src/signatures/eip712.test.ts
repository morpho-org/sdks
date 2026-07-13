import { describe, expect, test } from "vitest";
import { eip712Digest } from "./eip712.js";

describe("eip712Digest", () => {
  test("default", () => {
    const domainSeparator =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const structHash =
      "0x0000000000000000000000000000000000000000000000000000000000000002";

    expect(eip712Digest(domainSeparator, structHash)).toBe(
      "0xf0ea82caad44da271e51b0402eda1521c8e7275ebea7d20c30c2f0c4eb5a3ede",
    );
  });
});
