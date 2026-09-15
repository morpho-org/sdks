import { describe, expect, test } from "vitest";

import { sanitizeAnnotation } from "./annotations.ts";

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
