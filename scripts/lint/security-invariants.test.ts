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
    expect(
      parseDocumentedIds(`${table}\n| Other | table |\n| INV-09 | x |\n`),
    ).toEqual(["INV-01", "INV-02"]);
  });

  test("error: malformed ID cells", () => {
    for (const cell of ["`INV-08`", "**INV-08**", "INV-100", "", "Oracle"])
      expect(() => parseDocumentedIds(`${table}| ${cell} | New |\n`)).toThrow(
        /Malformed invariant IDs/,
      );
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
        'describe("[INV-01] a", () => { test("[INV-01] b", () => {}); }); it.each([])("[INV-02] c", () => {});',
      ),
    ).toEqual({ active: ["INV-01", "INV-02"], skipped: [] });
  });

  test("behavior: counts tags opening test titles, with any quote", () => {
    expect(
      parseTaggedIds(
        "describe('[INV-01] a', () => { test(`[INV-02] b`, () => {}); }); it(\"[INV-03] c\", () => {});",
      ),
    ).toEqual({ active: ["INV-02", "INV-01", "INV-03"], skipped: [] });
  });

  test("behavior: ignores tags in comments, strings and later in a title", () => {
    expect(
      parseTaggedIds(
        '// describe("[INV-01] a", () => {});\n/* test("[INV-02] b"); */\nconst s = "[INV-03]";\ntest("covers [INV-04]", () => {});',
      ),
    ).toEqual({ active: [], skipped: [] });
  });

  test("behavior: reports skip, todo, fails, skipIf and runIf blocks separately", () => {
    expect(
      parseTaggedIds(
        'test.skip("[INV-01] a", () => {}); test.todo("[INV-02] b"); test.only("[INV-03] c", () => {}); test.fails("[INV-04] d", () => {}); test.skipIf(x)("[INV-05] e", () => {}); test.runIf(x)("[INV-06] f", () => {});',
      ),
    ).toEqual({
      active: ["INV-03"],
      skipped: ["INV-01", "INV-02", "INV-04", "INV-05", "INV-06"],
    });
  });

  test("behavior: treats tags nested in a skipped suite as skipped", () => {
    expect(
      parseTaggedIds(
        'describe.skip("p", () => { describe("c", () => { test("[INV-01] a", () => {}); }); });\ndescribe.skipIf(x)("q", () => { expect(f).toThrow(/\\)/); test("[INV-02] b", () => {}); });\ndescribe("r", () => { expect(g).toMatch(/\'/); test("[INV-03] c", () => {}); });',
      ),
    ).toEqual({ active: ["INV-03"], skipped: ["INV-01", "INV-02"] });
  });

  test("behavior: does not count a tagged suite with no runnable test", () => {
    expect(
      parseTaggedIds(
        'describe("[INV-01] a", () => { test.skip("x", () => {}); }); describe("[INV-02] b", () => {});',
      ),
    ).toEqual({ active: [], skipped: ["INV-01", "INV-02"] });
  });

  test("error: throws on a file that does not parse", () => {
    expect(() => parseTaggedIds('describe("[INV-01] a", () => {')).toThrow(
      "Cannot parse test file",
    );
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
      "[INV-01] is tagged in b.test.ts only on blocks that may not run (skip, todo, fails, skipIf, runIf, or a suite with no runnable test); such blocks do not count as coverage.",
    ]);
  });

  test("error: empty table", () => {
    expect(checkInvariants({ documented: [], tagged: new Map() })).toHaveLength(
      1,
    );
  });
});
