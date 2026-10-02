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
        'describe("[INV-01] a", () => {}); test("[INV-01] b"); test("[INV-02] c");',
      ),
    ).toEqual(["INV-01", "INV-02"]);
  });
});

describe("checkInvariants", () => {
  test("default", () => {
    expect(
      checkInvariants(["INV-01"], new Map([["INV-01", ["a.test.ts"]]])),
    ).toEqual([]);
  });

  test("error: documented invariant without a tagged test", () => {
    expect(
      checkInvariants(
        ["INV-01", "INV-02"],
        new Map([["INV-01", ["a.test.ts"]]]),
      ),
    ).toEqual([
      "INV-02 is documented in SECURITY.md but no test is tagged [INV-02].",
    ]);
  });

  test("error: tagged test without a documented invariant", () => {
    expect(
      checkInvariants(
        ["INV-01"],
        new Map([
          ["INV-01", ["a.test.ts"]],
          ["INV-09", ["b.test.ts"]],
        ]),
      ),
    ).toEqual([
      "[INV-09] is tagged in b.test.ts but is not documented in SECURITY.md.",
    ]);
  });

  test("error: empty table", () => {
    expect(checkInvariants([], new Map())).toHaveLength(1);
  });
});
