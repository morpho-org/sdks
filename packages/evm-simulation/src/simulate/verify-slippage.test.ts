import { type Address, ethAddress, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  MissingVerificationEvidenceError,
} from "../errors.js";
import type { OperationLimit } from "../limits.js";
import type { CheckContext } from "./context.js";
import { planStateReads, type StateValue } from "./state/read-state.js";
import { verifySlippage } from "./verify-slippage.js";

const owner: Address = "0x0000000000000000000000000000000000000001";
const vault: Address = "0x0000000000000000000000000000000000000002";
const receiver: Address = "0x0000000000000000000000000000000000000003";
const ctx: CheckContext = {
  chainId: 1,
  mode: "final",
  owner,
  limits: { operations: [] },
  block: {
    chainId: 1,
    stateBlockNumber: 1n,
    stateBlockHash: "0x00",
    stateBlockTimestamp: 1n,
    blockNumber: 2n,
    blockTimestamp: 2n,
  },
};
const limit: OperationLimit = {
  type: "vaultV2Deposit",
  vault,
  account: receiver,
  quote: { sharesMinted: 100n },
  slippageTolerance: 10_000000000000000n,
};

describe("verifySlippage", () => {
  test("default: no operations", () => {
    expect(
      verifySlippage({
        ctx,
        operations: [],
        before: new Map(),
        after: new Map(),
        transfers: [],
        requestTransactions: [],
      }),
    ).toEqual([]);
  });
  test("behavior: recipient balance and inclusive percentage", () => {
    const plan = planStateReads({
      operations: [{ limit }],
      owner,
      morpho: zeroAddress,
    });
    const id = plan.reads[0]!.id;
    const input = {
      ctx,
      operations: plan.operations,
      before: new Map([[id, 20n]]),
      transfers: [],
      requestTransactions: [],
    };
    expect(
      verifySlippage({ ...input, after: new Map([[id, 119n]]) })[0],
    ).toMatchObject({
      account: receiver,
      checkedLimits: {
        quote: limit.quote,
        slippageTolerance: limit.slippageTolerance,
      },
    });
    expect(() =>
      verifySlippage({ ...input, after: new Map([[id, 118n]]) }),
    ).toThrow(ConsumerLimitViolationError);
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map([[`balance:${vault}:${owner}`, 10000n]]),
      }),
    ).toThrow(MissingVerificationEvidenceError);
  });
  test("behavior: native payments use net user traces and exclude other accounts/tokens", () => {
    const nativeLimit = {
      ...limit,
      quote: { assetsPaid: 10n },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [{ limit: nativeLimit, assetsPaid: ethAddress }],
      owner,
      morpho: zeroAddress,
    });
    const input = {
      ctx,
      operations: plan.operations,
      before: new Map(),
      after: new Map(),
      transfers: [
        { token: ethAddress, from: owner, to: vault, amount: 12n, txIdx: 0 },
        { token: ethAddress, from: vault, to: owner, amount: 2n, txIdx: 0 },
        { token: vault, from: owner, to: receiver, amount: 1000n, txIdx: 0 },
        {
          token: ethAddress,
          from: receiver,
          to: vault,
          amount: 1000n,
          txIdx: 0,
        },
      ],
      requestTransactions: [],
    };
    expect(verifySlippage(input)[0]?.checkedLimits.quote).toEqual({
      assetsPaid: 10n,
    });
    expect(() =>
      verifySlippage({ ...input, transfers: input.transfers.slice(0, 1) }),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("behavior: position shares use requested component and direction", () => {
    const operations = [
      {
        limit: {
          ...limit,
          quote: { sharesBurned: 10n },
          slippageTolerance: 0n,
        },
        measurements: [
          {
            field: "sharesBurned" as const,
            type: "position" as const,
            readId: "position",
            shares: "borrowShares" as const,
          },
        ],
      },
    ];
    const before = new Map<string, StateValue>([
      ["position", { supplyShares: 900n, borrowShares: 30n }],
    ]);
    const after = new Map<string, StateValue>([
      ["position", { supplyShares: 1n, borrowShares: 20n }],
    ]);
    expect(
      verifySlippage({
        ctx,
        operations,
        before,
        after,
        transfers: [],
        requestTransactions: [],
      })[0]?.checkedLimits.quote,
    ).toEqual({ sharesBurned: 10n });
    expect(() =>
      verifySlippage({
        ctx,
        operations,
        before,
        after: new Map(),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(MissingVerificationEvidenceError);
  });
  test("error: incoming native refund does not cover outgoing value evidence", () => {
    const nativeLimit = {
      ...limit,
      quote: { assetsPaid: 10n },
      slippageTolerance: 10_000000000000000n,
    };
    const plan = planStateReads({
      operations: [{ limit: nativeLimit, assetsPaid: ethAddress }],
      owner,
      morpho: zeroAddress,
    });
    expect(() =>
      verifySlippage({
        ctx,
        operations: plan.operations,
        before: new Map(),
        after: new Map(),
        transfers: [
          {
            token: ethAddress,
            from: receiver,
            to: owner,
            amount: 2n,
            txIdx: 0,
          },
        ],
        requestTransactions: [{ from: owner, value: 10n }],
      }),
    ).toThrow(MissingVerificationEvidenceError);
  });
});
