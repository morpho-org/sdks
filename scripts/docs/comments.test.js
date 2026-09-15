import { parse } from "@babel/parser";
import { describe, expect, test } from "vitest";
import { normalizeDeclarationComments } from "./comments.mjs";

describe("normalizeDeclarationComments", () => {
  test("default", () => {
    const source = `/**
 * Builds a transaction.
 * @param params - Transaction inputs.
 * @param params.amount - Asset amount.
 *   In the smallest unit.
 * @param params.receiver - Recipient.
 * @returns A frozen transaction.
 * @throws {RangeError} when the amount is negative.
 */
export declare function build(params: { amount: bigint; receiver: string }): object;`;
    const output = normalizeDeclarationComments(source);
    expect(output).toContain("@param params - Transaction inputs.");
    expect(output).toContain(
      "- `params.amount`: Asset amount.\n *   In the smallest unit.",
    );
    expect(output).toContain("- `params.receiver`: Recipient.");
    expect(output).toContain("@returns A frozen transaction.");
    expect(output).toContain(
      "@throws `RangeError` when the amount is negative.",
    );
    expect(output).not.toContain("@param params.amount");
  });

  test("behavior: keeps examples and comment-like strings unchanged", () => {
    const example = [
      "```ts",
      "// @internal is text in this example, not a release tag.",
      "const value = { amount: 1n };",
      "```",
    ];
    const source = `/**
 * Example.
 * @example
${example.map((line) => ` * ${line}`).join("\n")}
 */
export declare const literal: "/** @param {string} hidden - literal text */";`;
    const output = normalizeDeclarationComments(source);
    expect(output).toContain(
      `@example\n${example.map((line) => ` * ${line}`).join("\n")}`,
    );
    expect(output.slice(output.indexOf("export declare"))).toBe(
      source.slice(source.indexOf("export declare")),
    );
  });

  test("behavior: preserves optional defaults, nested types, and repeated returns", () => {
    const output = normalizeDeclarationComments(`/**
 * @param {{ nested: { amount: bigint } }} [params] - Inputs.
 * @param {bigint} [params.amount=0n] - Amount.
 * @returns {object} Lazy transaction.
 * @returns {() => object} returns.buildTx Builds the transaction.
 * @returns {Promise<object[]>} returns.getRequirements Reads requirements.
 */
export declare function build(params?: object): object;`);
    expect(output).toContain("@param params - Optional. Inputs.");
    expect(output).toContain(
      "`params.amount`: Optional. Default: `0n`. Amount.",
    );
    expect(output.match(/@returns/g)).toHaveLength(1);
    expect(output).toContain("returns.buildTx Builds the transaction.");
    expect(output).toContain("returns.getRequirements Reads requirements.");
  });

  test("behavior: retains warnings, defaults, overload prose, and internal tags", () => {
    const output = normalizeDeclarationComments(`/**
 * @warning Liquidity is unavailable during callbacks.
 * @default 42
 * @overload Accepts a default value.
 * @internal
 */
export declare const hidden: number;`);
    expect(output).toContain(
      "Warning:\n *\n * Liquidity is unavailable during callbacks.",
    );
    expect(output).toContain("@defaultValue 42");
    expect(output).toContain("Overloads:\n *\n * Accepts a default value.");
    expect(output).toContain("@internal");
  });

  test("behavior: handles CRLF, one-line comments, and repeated generation", () => {
    const source =
      "/** @throws {RangeError} when invalid. */\r\nexport declare function check(): void;";
    const output = normalizeDeclarationComments(source);
    expect(output).toContain("@throws `RangeError` when invalid.");
    expect(normalizeDeclarationComments(output)).toBe(output);
    expect(
      parse(output, { sourceType: "module", plugins: ["typescript"] }).program
        .body,
    ).toHaveLength(1);
  });

  test("error: rejects invalid declarations and unclosed JSDoc types", () => {
    expect(() =>
      normalizeDeclarationComments("export declare const =;"),
    ).toThrow(SyntaxError);
    expect(() =>
      normalizeDeclarationComments(
        "/** @param {string broken */\nexport declare function check(): void;",
      ),
    ).toThrow(SyntaxError);
  });

  test("behavior: names destructured inputs without changing parameter types", () => {
    const output = normalizeDeclarationComments(`/**
 * @param prefix - Prefix.
 * @param params.amount - Amount.
 * @param pair.first - First item.
 */
export declare const build: (prefix: string, { amount }: { readonly amount: bigint }, [first, second]?: readonly [number, string]) => bigint;`);
    expect(output).toContain(
      "(prefix: string, params: { readonly amount: bigint }, pair?: readonly [number, string]) => bigint",
    );
    expect(output).toContain("`params.amount`: Amount.");
    expect(output).toContain("`pair.first`: First item.");
    expect(normalizeDeclarationComments(output)).toBe(output);
  });
});
