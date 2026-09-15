import { describe, expect, test } from "vitest";

import { readRequiredEnv, sanitizeAnnotation } from "./workflow.ts";

describe("readRequiredEnv", () => {
  test("default", () => {
    expect(readRequiredEnv({ GH_TOKEN: "x" }, "GH_TOKEN")).toBe("x");
  });

  test("error: unset or blank variable", () => {
    expect(() => readRequiredEnv({}, "GH_TOKEN")).toThrow(/GH_TOKEN/);
    expect(() => readRequiredEnv({ GH_TOKEN: "" }, "GH_TOKEN")).toThrow(
      /GH_TOKEN/,
    );
  });
});

describe("sanitizeAnnotation", () => {
  test("default", () => {
    expect(sanitizeAnnotation("plain message")).toBe("plain message");
  });

  test("behavior: encodes line breaks and percent signs", () => {
    expect(sanitizeAnnotation("100% done\r\nnext ::error:: line")).toBe(
      "100%25 done%0D%0Anext ::error:: line",
    );
  });
});
