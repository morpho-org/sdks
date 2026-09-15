import { describe, expect, test } from "vitest";
import { filterDocModel } from "./model.mjs";

describe("filterDocModel", () => {
  test("default", () => {
    const model = {
      name: "example",
      members: [
        {
          name: "entrypoint",
          members: [
            { name: "public", fileUrlPath: "src/public.d.ts" },
            { name: "internal", fileUrlPath: "src/internal/helper.d.ts" },
            { name: "generated", fileUrlPath: "src/api/sdk.d.ts" },
            { name: "generatedTypes", fileUrlPath: "src\\api\\types.d.ts" },
            { name: "test", fileUrlPath: "src/helpers.test.d.ts" },
          ],
        },
      ],
    };
    const filtered = filterDocModel(model);
    expect(filtered.members[0].members).toEqual([
      { name: "public", fileUrlPath: "src/public.d.ts" },
    ]);
    expect(model.members[0].members).toHaveLength(5);
  });

  test("behavior: retains ordinary types, source-less entries, and public members", () => {
    const model = {
      members: [
        { fileUrlPath: "src/types.d.ts" },
        { fileUrlPath: "src/internalValue.d.ts" },
        { name: "entrypoint", members: [] },
      ],
    };
    expect(filterDocModel(model)).toEqual(model);
  });
});
