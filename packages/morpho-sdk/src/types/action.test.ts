import type { Address, Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  isRequirementApproval,
  isRequirementAuthorization,
  isRequirementShape,
  isTransactionShape,
} from "./action.js";

const validTx = {
  to: "0x0000000000000000000000000000000000000000" as Address,
  value: 0n,
  data: "0x" as Hex,
  action: { type: "custom", args: { foo: 1 } },
};

const validApprovalTx = {
  to: "0x0000000000000000000000000000000000000001" as Address,
  value: 0n,
  data: "0x" as Hex,
  action: {
    type: "erc20Approval" as const,
    args: { spender: "0x02" as Address, amount: 1n },
  },
};

const validAuthTx = {
  to: "0x0000000000000000000000000000000000000003" as Address,
  value: 0n,
  data: "0x" as Hex,
  action: {
    type: "morphoAuthorization" as const,
    args: { authorized: "0x04" as Address, isAuthorized: true },
  },
};

const validRequirement = {
  sign: async () => ({ args: {}, action: { type: "permit", args: {} } }),
  action: { type: "permit", args: { spender: "0x05" } },
};

describe("isTransactionShape", () => {
  test("default", () => {
    expect(isTransactionShape(validTx)).toBe(true);
  });

  test("error: not an object", () => {
    expect(isTransactionShape(null)).toBe(false);
    expect(isTransactionShape(undefined)).toBe(false);
    expect(isTransactionShape("0x")).toBe(false);
    expect(isTransactionShape(42)).toBe(false);
    expect(isTransactionShape([])).toBe(false);
  });

  test("error: missing or wrong-typed `to`", () => {
    expect(isTransactionShape({ ...validTx, to: undefined })).toBe(false);
    expect(isTransactionShape({ ...validTx, to: 42 })).toBe(false);
  });

  test("error: missing or wrong-typed `value`", () => {
    expect(isTransactionShape({ ...validTx, value: undefined })).toBe(false);
    expect(isTransactionShape({ ...validTx, value: 0 })).toBe(false);
    expect(isTransactionShape({ ...validTx, value: "0" })).toBe(false);
  });

  test("error: missing or wrong-typed `data`", () => {
    expect(isTransactionShape({ ...validTx, data: undefined })).toBe(false);
    expect(isTransactionShape({ ...validTx, data: null })).toBe(false);
    expect(isTransactionShape({ ...validTx, data: 0 })).toBe(false);
  });

  test("error: missing `action`", () => {
    const { action: _action, ...noAction } = validTx;
    expect(isTransactionShape(noAction)).toBe(false);
    expect(isTransactionShape({ ...validTx, action: null })).toBe(false);
    expect(isTransactionShape({ ...validTx, action: "x" })).toBe(false);
  });

  test("error: action.type non-string", () => {
    expect(
      isTransactionShape({ ...validTx, action: { type: 42, args: {} } }),
    ).toBe(false);
  });

  test("error: action.args non-object", () => {
    expect(
      isTransactionShape({ ...validTx, action: { type: "x", args: null } }),
    ).toBe(false);
    expect(
      isTransactionShape({ ...validTx, action: { type: "x", args: "x" } }),
    ).toBe(false);
  });
});

describe("isRequirementShape", () => {
  test("default", () => {
    expect(isRequirementShape(validRequirement)).toBe(true);
  });

  test("error: not an object", () => {
    expect(isRequirementShape(null)).toBe(false);
    expect(isRequirementShape(undefined)).toBe(false);
    expect(isRequirementShape([])).toBe(false);
  });

  test("error: sign not a function", () => {
    expect(isRequirementShape({ ...validRequirement, sign: "x" })).toBe(false);
    expect(isRequirementShape({ ...validRequirement, sign: undefined })).toBe(
      false,
    );
  });

  test("error: missing action", () => {
    const { action: _action, ...noAction } = validRequirement;
    expect(isRequirementShape(noAction)).toBe(false);
  });

  test("error: action.type non-string", () => {
    expect(
      isRequirementShape({
        ...validRequirement,
        action: { type: 42, args: {} },
      }),
    ).toBe(false);
  });

  test("error: action.args non-object", () => {
    expect(
      isRequirementShape({
        ...validRequirement,
        action: { type: "x", args: null },
      }),
    ).toBe(false);
  });
});

describe("isRequirementApproval (tightened)", () => {
  test("default", () => {
    expect(isRequirementApproval(validApprovalTx)).toBe(true);
  });

  test("error: missing data / value / args (regression after typeof tightening)", () => {
    // Previously a loose `'to' in r && 'value' in r && ...` check would let these slip through;
    // now they must satisfy `isTransactionShape` (typeof checks on every field).
    expect(
      isRequirementApproval({
        to: "0x" as Address,
        action: { type: "erc20Approval" },
        // biome-ignore lint/suspicious/noExplicitAny: deliberate malformed input
      } as any),
    ).toBe(false);
    expect(
      isRequirementApproval({
        to: "0x" as Address,
        value: 0n,
        action: { type: "erc20Approval", args: {} },
        // biome-ignore lint/suspicious/noExplicitAny: deliberate malformed input — missing data
      } as any),
    ).toBe(false);
  });

  test("error: action.type is not erc20Approval", () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberate — flipping action.type to assert the discriminant check.
    const flipped = {
      ...validApprovalTx,
      action: { ...validApprovalTx.action, type: "morphoAuthorization" as any },
    };
    expect(isRequirementApproval(flipped)).toBe(false);
  });
});

describe("isRequirementAuthorization (tightened)", () => {
  test("default", () => {
    expect(isRequirementAuthorization(validAuthTx)).toBe(true);
  });

  test("error: action.type is not morphoAuthorization", () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberate — flipping action.type to assert the discriminant check.
    const flipped = {
      ...validAuthTx,
      action: { ...validAuthTx.action, type: "erc20Approval" as any },
    };
    expect(isRequirementAuthorization(flipped)).toBe(false);
  });

  test("error: malformed shape rejected (regression after tightening)", () => {
    expect(
      isRequirementAuthorization({
        to: "0x" as Address,
        action: { type: "morphoAuthorization" },
        // biome-ignore lint/suspicious/noExplicitAny: deliberate malformed input
      } as any),
    ).toBe(false);
  });
});
