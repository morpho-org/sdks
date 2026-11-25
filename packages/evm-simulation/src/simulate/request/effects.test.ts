import { maxUint256, zeroAddress, zeroHash } from "viem";
import { describe, expect, it } from "vitest";
import { SimulationValidationError } from "../../errors.js";
import type { SimulationEffect } from "../../limits.js";
import type { SimulateParams } from "../../params.js";
import { parseEffects } from "./effects.js";
import { parseRequest } from "./parse-request.js";

const approval: SimulationEffect = {
  type: "erc20Approval",
  token: zeroAddress,
  owner: zeroAddress,
  spender: zeroAddress,
  amount: 0n,
};
const effects: readonly SimulationEffect[] = [
  approval,
  {
    type: "blueAuthorization",
    authorizer: zeroAddress,
    authorized: zeroAddress,
    isAuthorized: false,
  },
  {
    type: "midnightAuthorization",
    onBehalf: zeroAddress,
    authorized: zeroAddress,
    isAuthorized: true,
  },
  { type: "midnightCancelOffers", onBehalf: zeroAddress, groups: [zeroHash] },
];
const request = (limits: unknown) =>
  parseRequest(
    {
      transactions: [
        {
          from: "0x0000000000000000000000000000000000000001",
          to: "0x0000000000000000000000000000000000000002",
          data: "0x",
        },
      ],
      limits,
    } as SimulateParams,
    1,
  );

describe("control effect parsing", () => {
  it("rejects holes in effects and cancellation groups", () => {
    for (const value of [
      Array(1),
      [approval, ...Array(1)],
      [{ ...effects[3], groups: Array(1) }],
      [{ ...effects[3], groups: [zeroHash, ...Array(1)] }],
    ]) {
      expect(() => parseEffects(value, 1)).toThrow(SimulationValidationError);
    }
  });
  it.each(effects)(
    "accepts $type with empty operations and omitted or explicit binding",
    (effect) => {
      expect(request({ operations: [], effects: [effect] }).limits).toEqual({
        operations: [],
        effects: [effect],
      });
      expect(parseEffects([{ ...effect, txIdx: 0 }], 1)).toEqual([
        { ...effect, txIdx: 0 },
      ]);
    },
  );
  it("retains empty-operations rejection unless validated effects are non-empty", () => {
    for (const limits of [
      { operations: [] },
      { operations: [], effects: [] },
      { effects: [approval] },
      { operations: [], effects: [{}] },
    ])
      expect(() => request(limits)).toThrow(SimulationValidationError);
  });
  it.each([undefined, null, 0, "none", {}])(
    "explains missing or non-array operations with effects: %s",
    (operations) => {
      let error: unknown;
      try {
        request({
          ...(operations === undefined ? {} : { operations }),
          effects: [approval],
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect((error as SimulationValidationError).fieldErrors).toEqual([
        'limits.operations: must be an array (or pass "none")',
      ]);
    },
  );
  it.each([undefined, []])(
    "explains the effects-only alternative for empty operations: %s",
    (effectList) => {
      let error: unknown;
      try {
        request({ operations: [], effects: effectList });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect((error as SimulationValidationError).fieldErrors).toEqual([
        'limits.operations: must be a non-empty array, or [] with non-empty limits.effects (or pass "none")',
      ]);
    },
  );
  it.each([-1, 1, 0.5, NaN, Infinity, "0", null])(
    "rejects invalid caller transaction index %s",
    (txIdx) => {
      expect(() =>
        request({ operations: [], effects: [{ ...approval, txIdx }] }),
      ).toThrow(SimulationValidationError);
    },
  );
  it("accepts the last explicit index and preserves the implicit last binding", () => {
    expect(parseEffects([{ ...approval, txIdx: 2 }, approval], 3)).toEqual([
      { ...approval, txIdx: 2 },
      approval,
    ]);
  });
  it.each(
    [
      null,
      {},
      "effect",
      [null],
      [{ type: "unknown" }],
      [{ ...approval, extra: true }],
      [{ ...approval, token: "0x12" }],
      [{ ...approval, amount: -1n }],
      [{ ...approval, amount: maxUint256 + 1n }],
      [{ ...approval, amount: 0 }],
      [{ ...effects[1], isAuthorized: 1 }],
      [{ ...effects[2], onBehalf: undefined }],
      [{ ...effects[3], groups: [] }],
      [{ ...effects[3], groups: ["0x12"] }],
      [{ ...effects[3], groups: [zeroHash, zeroHash] }],
    ].map((value) => ({ value })),
  )("rejects malformed effects $value", ({ value }) => {
    expect(() => parseEffects(value, 1)).toThrow(SimulationValidationError);
  });
  it("leaves omitted effects absent", () =>
    expect(parseEffects(undefined, 1)).toBeUndefined());
});
