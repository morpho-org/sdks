import { describe, expect, test } from "vitest";
import {
  checkInvariants,
  parseDocumentedIds,
  parseTaggedIds,
} from "./security-invariants.ts";

const table = `| ID | Invariant |
| --- | --- |
| INV-01 | Deposit routing |
| INV-02 | Accounting |
`;

describe("parseDocumentedIds", () => {
  test("default", () => {
    expect(parseDocumentedIds(table)).toEqual(["INV-01", "INV-02"]);
  });

  test("behavior: ignores IDs outside table rows", () => {
    expect(parseDocumentedIds("See [INV-03] and INV-04.")).toEqual([]);
  });

  test("error: duplicate IDs", () => {
    expect(() => parseDocumentedIds(`${table}| INV-01 | Again |\n`)).toThrow(
      /Duplicate invariant IDs/,
    );
  });
});

describe("parseTaggedIds", () => {
  test("default", () => {
    expect(
      parseTaggedIds(
        'describe("[INV-01] a", () => {}); test("[INV-01] b"); it.each([])("[INV-02] c");',
      ),
    ).toEqual({ active: ["INV-01"], skipped: [] });
  });

  test("behavior: counts tags opening test titles, with any quote", () => {
    expect(
      parseTaggedIds(
        "describe('[INV-01] a'); test(`[INV-02] b`); it(\"[INV-03] c\");",
      ),
    ).toEqual({ active: ["INV-01", "INV-02", "INV-03"], skipped: [] });
  });

  test("behavior: ignores tags in comments, strings and later in a title", () => {
    expect(
      parseTaggedIds(
        '// [INV-01]\nconst s = "[INV-02]";\ntest("covers [INV-03]");',
      ),
    ).toEqual({ active: [], skipped: [] });
  });

  test("behavior: reports skipped and todo blocks separately", () => {
    expect(
      parseTaggedIds(
        'describe.skip("[INV-01] a"); test.todo("[INV-02] b"); test.only("[INV-03] c");',
      ),
    ).toEqual({ active: ["INV-03"], skipped: ["INV-01", "INV-02"] });
  });
});

describe("checkInvariants", () => {
  test("default", () => {
    expect(
      checkInvariants({
        documented: ["INV-01"],
        tagged: new Map([["INV-01", ["a.test.ts"]]]),
      }),
    ).toEqual([]);
  });

  test("error: documented invariant without a tagged test", () => {
    expect(
      checkInvariants({
        documented: ["INV-01", "INV-02"],
        tagged: new Map([["INV-01", ["a.test.ts"]]]),
      }),
    ).toEqual([
      "INV-02 is documented in SECURITY.md but no test is tagged [INV-02].",
    ]);
  });

  test("error: tagged test without a documented invariant", () => {
    expect(
      checkInvariants({
        documented: ["INV-01"],
        tagged: new Map([
          ["INV-01", ["a.test.ts"]],
          ["INV-09", ["b.test.ts"]],
        ]),
      }),
    ).toEqual([
      "[INV-09] is tagged in b.test.ts but is not documented in SECURITY.md.",
    ]);
  });

  test("error: tagged block is skipped", () => {
    expect(
      checkInvariants({
        documented: ["INV-01"],
        tagged: new Map([["INV-01", ["a.test.ts"]]]),
        skipped: new Map([["INV-01", ["b.test.ts"]]]),
      }),
    ).toEqual([
      "[INV-01] is tagged on a skipped or todo block in b.test.ts; skipped blocks do not count as coverage.",
    ]);
  });

  test("error: empty table", () => {
    expect(checkInvariants({ documented: [], tagged: new Map() })).toHaveLength(
      1,
    );
  });
});
