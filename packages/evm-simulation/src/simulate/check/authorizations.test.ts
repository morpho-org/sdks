import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { SimulationAuthorization } from "../../authorizations.js";
import {
  AuthorizationRequestMismatchError,
  PermissionChangeMismatchError,
} from "../../errors.js";
import type { SimulationState } from "../../result.js";
import { makeCheckContext, TEST_OWNER } from "../../test-helpers/index.js";
import type { Transfer } from "../../types.js";
import type { ExecutedCall } from "../backends/parse-response.js";
import { checkAuthorizations } from "./authorizations.js";

const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);

const emptyState = (
  overrides: Partial<SimulationState> = {},
): SimulationState => ({
  balances: [],
  allowances: [],
  morphoAuthorizations: [],
  nonces: [],
  positions: [],
  markets: [],
  vaults: [],
  ...overrides,
});

const approvalAuth: SimulationAuthorization = {
  type: "erc20Approval",
  token: TOKEN,
  owner: TEST_OWNER,
  spender: SPENDER,
  amount: 100n,
};

const prepCalls: ExecutedCall[] = [
  {
    planned: {
      type: "preparation",
      authorizationIndex: 0,
      callIndex: 0,
      transaction: {
        from: TEST_OWNER,
        to: TOKEN,
        data: "0x095ea7b3",
        value: 0n,
      },
    },
    result: { status: true, returnData: "0x", gasUsed: 0n, logs: [] },
  },
];

const pulled: Transfer[] = [
  { token: TOKEN, from: TEST_OWNER, to: SPENDER, amount: 60n, txIdx: 0 },
];

describe("checkAuthorizations — preview", () => {
  test("erc20Approval verified by allowance diff", () => {
    const before = emptyState();
    const after = emptyState({
      allowances: [
        { token: TOKEN, owner: TEST_OWNER, spender: SPENDER, amount: 40n },
      ],
    });
    const preparations = checkAuthorizations({
      ctx: makeCheckContext({ mode: "preview" }),
      authorizations: [approvalAuth],
      operations: [],
      before,
      after,
      executedCalls: prepCalls,
      transfers: pulled,
    });
    expect(preparations).toHaveLength(1);
    expect(preparations[0]?.authorizationIndex).toBe(0);
    expect(preparations[0]?.calls).toHaveLength(1);
  });

  test("approve replaces a pre-existing allowance", () => {
    // approve(100) replaces before=777; expected after = 100 − 60 pulled = 40.
    const before = emptyState({
      allowances: [
        { token: TOKEN, owner: TEST_OWNER, spender: SPENDER, amount: 777n },
      ],
    });
    const after = emptyState({
      allowances: [
        { token: TOKEN, owner: TEST_OWNER, spender: SPENDER, amount: 40n },
      ],
    });
    expect(() =>
      checkAuthorizations({
        ctx: makeCheckContext({ mode: "preview" }),
        authorizations: [approvalAuth],
        operations: [],
        before,
        after,
        executedCalls: prepCalls,
        transfers: pulled,
      }),
    ).not.toThrow();
  });

  test("error: additive expectation would pass wrongly — replacement enforced", () => {
    // before=777 pulled=60 → additive would expect 817, replacement expects 40.
    const before = emptyState({
      allowances: [
        { token: TOKEN, owner: TEST_OWNER, spender: SPENDER, amount: 777n },
      ],
    });
    const additiveAfter = emptyState({
      allowances: [
        { token: TOKEN, owner: TEST_OWNER, spender: SPENDER, amount: 817n },
      ],
    });
    expect(() =>
      checkAuthorizations({
        ctx: makeCheckContext({ mode: "preview" }),
        authorizations: [approvalAuth],
        operations: [],
        before,
        after: additiveAfter,
        executedCalls: prepCalls,
        transfers: pulled,
      }),
    ).toThrow(PermissionChangeMismatchError);
  });

  test("error: no preparation calls → AuthorizationRequestMismatchError", () => {
    const before = emptyState();
    const after = emptyState({
      allowances: [
        { token: TOKEN, owner: TEST_OWNER, spender: SPENDER, amount: 40n },
      ],
    });
    expect(() =>
      checkAuthorizations({
        ctx: makeCheckContext({ mode: "preview" }),
        authorizations: [approvalAuth],
        operations: [],
        before,
        after,
        executedCalls: [],
        transfers: pulled,
      }),
    ).toThrow(AuthorizationRequestMismatchError);
  });

  test("error: allowance mismatch → PermissionChangeMismatchError", () => {
    const before = emptyState();
    const after = emptyState({
      allowances: [
        { token: TOKEN, owner: TEST_OWNER, spender: SPENDER, amount: 999n },
      ],
    });
    expect(() =>
      checkAuthorizations({
        ctx: makeCheckContext({ mode: "preview" }),
        authorizations: [approvalAuth],
        operations: [],
        before,
        after,
        executedCalls: prepCalls,
        transfers: pulled,
      }),
    ).toThrow(PermissionChangeMismatchError);
  });

  test("error: approval that never pulled → AuthorizationRequestMismatchError", () => {
    const before = emptyState();
    const after = emptyState({
      allowances: [
        { token: TOKEN, owner: TEST_OWNER, spender: SPENDER, amount: 100n },
      ],
    });
    expect(() =>
      checkAuthorizations({
        ctx: makeCheckContext({ mode: "preview" }),
        authorizations: [approvalAuth],
        operations: [],
        before,
        after,
        executedCalls: prepCalls,
        transfers: [],
      }),
    ).toThrow(AuthorizationRequestMismatchError);
  });
});

describe("checkAuthorizations — final", () => {
  test("before-state allowance covers the pull", () => {
    const before = emptyState({
      allowances: [
        { token: TOKEN, owner: TEST_OWNER, spender: SPENDER, amount: 60n },
      ],
    });
    const preparations = checkAuthorizations({
      ctx: makeCheckContext({ mode: "final" }),
      authorizations: [approvalAuth],
      operations: [],
      before,
      after: emptyState(),
      executedCalls: [],
      transfers: pulled,
    });
    expect(preparations).toHaveLength(0);
  });

  test("error: pull exceeds the before allowance", () => {
    const before = emptyState({
      allowances: [
        { token: TOKEN, owner: TEST_OWNER, spender: SPENDER, amount: 10n },
      ],
    });
    expect(() =>
      checkAuthorizations({
        ctx: makeCheckContext({ mode: "final" }),
        authorizations: [approvalAuth],
        operations: [],
        before,
        after: emptyState(),
        executedCalls: [],
        transfers: pulled,
      }),
    ).toThrow(AuthorizationRequestMismatchError);
  });
});
