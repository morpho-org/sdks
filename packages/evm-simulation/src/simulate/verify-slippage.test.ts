import type { MarketId } from "@morpho-org/blue-sdk";
import { blueAbi, vaultV2Abi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  ethAddress,
  type Hex,
  parseAbiParameters,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  InvalidSimulationResponseError,
  SlippageCheckUnavailableError,
} from "../errors.js";
import type { OperationLimit } from "../limits.js";
import type { RawLog } from "../types.js";
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
        logs: [] as const,
        morpho: zeroAddress,
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
      logs: [] as const,
      morpho: zeroAddress,
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
      verifySlippage({ ...input, after: new Map([[id, 118n]]) }),
    ).toThrow(`Limit operation 0 (${limit.type}): slippage for`);
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map([[`balance:${vault}:${owner}`, 10000n]]),
      }),
    ).toThrow(SlippageCheckUnavailableError);
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map([[`balance:${vault}:${owner}`, 10000n]]),
      }),
    ).toThrow(`Limit operation 0 (${limit.type}): missing observation for`);
  });
  test("behavior: names the index of the failing operation", () => {
    const second: OperationLimit = { ...limit, vault: receiver };
    const plan = planStateReads({
      operations: [{ limit }, { limit: second }],
      owner,
      morpho: zeroAddress,
    });
    const [first, failing] = plan.reads.map((read) => read.id);
    expect(() =>
      verifySlippage({
        ctx,
        operations: plan.operations,
        before: new Map([
          [first!, 20n],
          [failing!, 20n],
        ]),
        after: new Map([
          [first!, 119n],
          [failing!, 118n],
        ]),
        transfers: [],
        logs: [],
        morpho: zeroAddress,
        requestTransactions: [],
      }),
    ).toThrow(`Limit operation 1 (${second.type}): slippage for`);
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
      logs: [] as const,
      morpho: zeroAddress,
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
  test("error: ConsumerLimitViolationError reports the observed bound violation", () => {
    const plan = planStateReads({
      operations: [{ limit }],
      owner,
      morpho: zeroAddress,
    });
    const id = plan.reads[0]!.id;
    const error = (() => {
      try {
        verifySlippage({
          ctx,
          logs: [] as const,
          morpho: zeroAddress,
          operations: plan.operations,
          before: new Map([[id, 20n]]),
          after: new Map([[id, 118n]]),
          transfers: [],
          requestTransactions: [],
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain('allowed bound "99", got "98"');
  });
  test("behavior: a native assetsReceived quote uses incoming traces", () => {
    const nativeLimit = {
      ...limit,
      receiver,
      quote: { assetsReceived: 10n },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [{ limit: nativeLimit, assetsReceived: ethAddress }],
      owner,
      morpho: zeroAddress,
    });
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map(),
      after: new Map(),
      requestTransactions: [] as { from: Address; value?: bigint }[],
    };
    expect(
      verifySlippage({
        ...input,
        transfers: [
          {
            token: ethAddress,
            from: vault,
            to: receiver,
            amount: 10n,
            txIdx: 0,
          },
        ],
      })[0]?.checkedLimits.quote,
    ).toEqual({ assetsReceived: 10n });
    const error = (() => {
      try {
        verifySlippage({ ...input, transfers: [] });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect(error).not.toBeInstanceOf(SlippageCheckUnavailableError);
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
            marketId:
              "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
            shares: "borrowShares" as const,
          },
        ],
      },
    ];
    const before = new Map<string, StateValue>([
      ["position", { supplyShares: 900n, borrowShares: 30n, collateral: 0n }],
    ]);
    const after = new Map<string, StateValue>([
      ["position", { supplyShares: 1n, borrowShares: 20n, collateral: 0n }],
    ]);
    expect(
      verifySlippage({
        ctx,
        logs: [] as const,
        morpho: zeroAddress,
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
        logs: [] as const,
        morpho: zeroAddress,
        operations,
        before,
        after: new Map(),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
  test("behavior: debt shares minted are capped and debt shares burned are floored", () => {
    const borrow: OperationLimit = {
      type: "blueBorrow",
      marketId:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
      quote: { sharesMinted: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    const borrowOps = [
      {
        limit: borrow,
        measurements: [
          {
            field: "sharesMinted" as const,
            type: "position" as const,
            readId: "position",
            marketId:
              "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
            shares: "borrowShares" as const,
          },
        ],
      },
    ];
    const borrowBefore = new Map<string, StateValue>([
      ["position", { supplyShares: 0n, borrowShares: 0n, collateral: 0n }],
    ]);
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: borrowOps,
      before: borrowBefore,
      transfers: [] as const,
      requestTransactions: [] as const,
    };
    // A debt `sharesMinted` quote is a cap, not a floor: +1011 exceeds the 1%
    // bound on 1000, +980 is inside it.
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map([
          [
            "position",
            { supplyShares: 0n, borrowShares: 1011n, collateral: 0n },
          ],
        ]),
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(
      verifySlippage({
        ...input,
        after: new Map([
          [
            "position",
            { supplyShares: 0n, borrowShares: 980n, collateral: 0n },
          ],
        ]),
      })[0]?.checkedLimits.quote,
    ).toEqual({ sharesMinted: 1000n });

    const repay: OperationLimit = {
      type: "blueRepay",
      marketId:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
      quote: { sharesBurned: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    const repayOps = [
      {
        limit: repay,
        measurements: [
          {
            field: "sharesBurned" as const,
            type: "position" as const,
            readId: "position",
            marketId:
              "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
            shares: "borrowShares" as const,
          },
        ],
      },
    ];
    const repayBefore = new Map<string, StateValue>([
      ["position", { supplyShares: 0n, borrowShares: 2000n, collateral: 0n }],
    ]);
    // A debt `sharesBurned` quote is a floor: burning 980 is below the 1%
    // bound on 1000, burning 1000 satisfies it.
    expect(() =>
      verifySlippage({
        ctx,
        logs: [] as const,
        morpho: zeroAddress,
        operations: repayOps,
        before: repayBefore,
        after: new Map([
          [
            "position",
            { supplyShares: 0n, borrowShares: 1020n, collateral: 0n },
          ],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(
      verifySlippage({
        ctx,
        logs: [] as const,
        morpho: zeroAddress,
        operations: repayOps,
        before: repayBefore,
        after: new Map([
          [
            "position",
            { supplyShares: 0n, borrowShares: 1000n, collateral: 0n },
          ],
        ]),
        transfers: [],
        requestTransactions: [],
      })[0]?.checkedLimits.quote,
    ).toEqual({ sharesBurned: 1000n });
  });
  test("behavior: in-kind positions measure receiver supply shares per market", () => {
    const marketId =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId;
    const inKindLimit: OperationLimit = {
      type: "vaultV2InKindRedeem",
      vault,
      quote: { positions: [{ marketId, supplyShares: 100n }] },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [{ limit: inKindLimit }],
      owner,
      morpho: zeroAddress,
    });
    const id = plan.reads[0]!.id;
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: plan.operations,
      transfers: [] as const,
      requestTransactions: [] as const,
    };
    expect(
      verifySlippage({
        ...input,
        before: new Map([
          [id, { supplyShares: 0n, borrowShares: 0n, collateral: 0n }],
        ]),
        after: new Map([
          [id, { supplyShares: 100n, borrowShares: 0n, collateral: 0n }],
        ]),
      })[0]?.checkedLimits.quote,
    ).toEqual({ positions: [{ marketId, supplyShares: 100n }] });
    expect(() =>
      verifySlippage({
        ...input,
        before: new Map([
          [id, { supplyShares: 0n, borrowShares: 0n, collateral: 0n }],
        ]),
        after: new Map([
          [id, { supplyShares: 99n, borrowShares: 0n, collateral: 0n }],
        ]),
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(() =>
      verifySlippage({
        ...input,
        before: new Map(),
        after: new Map(),
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
  const forceExitTest = (
    type: "vaultV2ForceWithdraw" | "vaultV2ForceRedeem",
  ) => {
    const morpho: Address = "0x0000000000000000000000000000000000000004";
    const adapter: Address = "0x0000000000000000000000000000000000000005";
    const other: Address = "0x0000000000000000000000000000000000000006";
    const notMorpho: Address = "0x0000000000000000000000000000000000000007";
    const marketId =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId;
    const otherMarket =
      "0x2222222222222222222222222222222222222222222222222222222222222222" as MarketId;
    const forceLimit: OperationLimit = {
      type,
      vault,
      quote: { penalty: 7n, deallocations: [{ marketId, assets: 993n }] },
      slippageTolerance: 0n,
    };
    const forceDeallocate = ({
      onBehalf,
      penaltyAssets,
      assets = 993n,
    }: {
      onBehalf: Address;
      penaltyAssets: bigint;
      assets?: bigint;
    }): RawLog => ({
      address: vault,
      topics: encodeEventTopics({
        abi: vaultV2Abi,
        eventName: "ForceDeallocate",
        args: { sender: owner, onBehalf },
      }).filter((topic): topic is Hex => typeof topic === "string"),
      data: encodeAbiParameters(
        parseAbiParameters(
          "address adapter, uint256 assets, bytes32[] ids, uint256 penaltyAssets",
        ),
        [adapter, assets, [marketId], penaltyAssets],
      ),
    });
    const vaultWithdraw = (logOwner: Address): RawLog => ({
      address: vault,
      topics: encodeEventTopics({
        abi: vaultV2Abi,
        eventName: "Withdraw",
        args: { sender: owner, receiver: owner, onBehalf: logOwner },
      }).filter((topic): topic is Hex => typeof topic === "string"),
      data: encodeAbiParameters(
        parseAbiParameters("uint256 assets, uint256 shares"),
        [1000n, 500n],
      ),
    });
    const withdraw = ({
      id,
      onBehalf,
      assets,
      emitter = morpho,
    }: {
      id: MarketId;
      onBehalf: Address;
      assets: bigint;
      emitter?: Address;
    }): RawLog => ({
      address: emitter,
      topics: encodeEventTopics({
        abi: blueAbi,
        eventName: "Withdraw",
        args: { id, onBehalf, receiver: vault },
      }).filter((topic): topic is Hex => typeof topic === "string"),
      data: encodeAbiParameters(
        parseAbiParameters("address caller, uint256 assets, uint256 shares"),
        [adapter, assets, 0n],
      ),
    });
    const input = {
      ctx,
      morpho,
      operations: [{ limit: forceLimit, measurements: [] as const }] as const,
      before: new Map<string, StateValue>(),
      after: new Map<string, StateValue>(),
      transfers: [] as const,
      requestTransactions: [] as const,
    };
    // Exact quote passes; a zero-penalty ForceDeallocate for another account
    // is ignored, and the liquidity withdrawal stays uncounted.
    expect(
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: otherMarket, onBehalf: adapter, assets: 500n }),
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            forceDeallocate({ onBehalf: other, penaltyAssets: 0n }),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      })[0]?.checkedLimits.quote,
    ).toEqual({
      penalty: 7n,
      deallocations: [{ marketId, assets: 993n }],
    });
    expect(
      verifySlippage({
        ...input,
        operations: [
          {
            limit: { ...forceLimit, account: other },
            measurements: [] as const,
          },
        ],
        logs: [
          [
            vaultWithdraw(other),
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            forceDeallocate({ onBehalf: other, penaltyAssets: 7n }),
          ],
        ],
      })[0]?.checkedLimits.quote,
    ).toEqual({
      penalty: 7n,
      deallocations: [{ marketId, assets: 993n }],
    });
    const summedLimit: OperationLimit = {
      ...forceLimit,
      quote: { deallocations: [{ marketId, assets: 200n }] },
    };
    const summedInput = {
      ...input,
      operations: [{ limit: summedLimit, measurements: [] as const }] as const,
      logs: [
        [
          vaultWithdraw(owner),
          withdraw({ id: marketId, onBehalf: adapter, assets: 80n }),
          forceDeallocate({
            onBehalf: owner,
            penaltyAssets: 1n,
            assets: 80n,
          }),
          withdraw({ id: marketId, onBehalf: adapter, assets: 120n }),
          forceDeallocate({
            onBehalf: owner,
            penaltyAssets: 2n,
            assets: 120n,
          }),
        ],
      ],
    };
    expect(verifySlippage(summedInput)[0]?.checkedLimits.quote).toEqual({
      deallocations: [{ marketId, assets: 200n }],
    });
    expect(() =>
      verifySlippage({
        ...summedInput,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: marketId, onBehalf: adapter, assets: 80n }),
            forceDeallocate({
              onBehalf: owner,
              penaltyAssets: 1n,
              assets: 80n,
            }),
            withdraw({ id: marketId, onBehalf: adapter, assets: 121n }),
            forceDeallocate({
              onBehalf: owner,
              penaltyAssets: 2n,
              assets: 121n,
            }),
          ],
        ],
      }),
    ).toThrow(ConsumerLimitViolationError);
    // Realized penalty above the quote violates.
    expect(() =>
      verifySlippage({
        ...input,
        operations: [
          {
            limit: { ...forceLimit, quote: { penalty: 6n } },
            measurements: [] as const,
          },
        ],
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      }),
    ).toThrow(ConsumerLimitViolationError);
    // Deallocating more than quoted violates.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: marketId, onBehalf: adapter, assets: 994n }),
            forceDeallocate({
              onBehalf: owner,
              penaltyAssets: 7n,
              assets: 994n,
            }),
          ],
        ],
      }),
    ).toThrow(ConsumerLimitViolationError);
    // A realized deallocation in an unquoted market violates.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: otherMarket, onBehalf: adapter, assets: 1n }),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n, assets: 1n }),
          ],
        ],
      }),
    ).toThrow(ConsumerLimitViolationError);
    // A withdraw with a non-adapter onBehalf is ignored; a withdraw from a
    // non-Morpho emitter is ignored.
    expect(
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: otherMarket, onBehalf: other, assets: 999n }),
            withdraw({
              id: otherMarket,
              onBehalf: adapter,
              assets: 999n,
              emitter: notMorpho,
            }),
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      })[0]?.checkedLimits.quote,
    ).toEqual({
      penalty: 7n,
      deallocations: [{ marketId, assets: 993n }],
    });
    // The vault's penalty pull can emit a same-adapter liquidity `Withdraw`
    // between the forced withdraw and the `ForceDeallocate`; the pair is the
    // preceding withdraw of the same amount, not the penalty leg.
    expect(
      verifySlippage({
        ...input,
        logs: [
          [
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            withdraw({ id: otherMarket, onBehalf: adapter, assets: 7n }),
            vaultWithdraw(owner),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      })[0]?.checkedLimits.quote,
    ).toEqual({
      penalty: 7n,
      deallocations: [{ marketId, assets: 993n }],
    });
    // A same-adapter withdraw in a different user call is not paired: the
    // force-deallocation stays unpaired and fails closed.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
          ],
          [
            vaultWithdraw(owner),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      }),
    ).toThrow(SlippageCheckUnavailableError);
    // A malformed matching withdraw log is an invalid response.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            {
              ...withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
              data: "0x12",
            },
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      }),
    ).toThrow(InvalidSimulationResponseError);
    // An unpaired ForceDeallocate (e.g. a non-Blue adapter) fails closed when
    // deallocations are quoted.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      }),
    ).toThrow(SlippageCheckUnavailableError);
    // The vault's own Withdraw log must evidence the exit.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      }),
    ).toThrow(SlippageCheckUnavailableError);
    // A pure idle exit: the vault Withdraw is present, no ForceDeallocate —
    // realized penalty is zero and a quoted market simply saw no deallocation.
    expect(
      verifySlippage({
        ...input,
        operations: [
          {
            limit: {
              ...forceLimit,
              quote: { penalty: 0n, deallocations: [{ marketId, assets: 1n }] },
            },
            measurements: [] as const,
          },
        ],
        logs: [[vaultWithdraw(owner)]],
      })[0]?.checkedLimits.quote,
    ).toEqual({ penalty: 0n, deallocations: [{ marketId, assets: 1n }] });
  };
  test.each(["vaultV2ForceWithdraw", "vaultV2ForceRedeem"] as const)(
    "behavior: force-exit penalty and deallocations come from event logs for %s",
    forceExitTest,
  );
  test("behavior: position bounds compare the absolute after-state", () => {
    const borrowLimit: OperationLimit = {
      type: "blueSupplyCollateralBorrow",
      marketId:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
      quote: { sharesMinted: 200n },
      slippageTolerance: 0n,
      position: { maxBorrowShares: 100n, minCollateral: 5n },
    };
    const plan = planStateReads({
      operations: [{ limit: borrowLimit }],
      owner,
      morpho: zeroAddress,
    });
    const label = `Limit operation 0 (${borrowLimit.type})`;
    const id = plan.operations[0]!.positionBoundsReadId!;
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map<string, StateValue>([
        [id, { supplyShares: 0n, borrowShares: 50n, collateral: 3n }],
      ]),
      transfers: [] as const,
      requestTransactions: [] as const,
    };
    expect(
      verifySlippage({
        ...input,
        after: new Map<string, StateValue>([
          [id, { supplyShares: 0n, borrowShares: 100n, collateral: 5n }],
        ]),
      })[0]?.checkedLimits.position,
    ).toEqual({ maxBorrowShares: 100n, minCollateral: 5n });
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map<string, StateValue>([
          [id, { supplyShares: 0n, borrowShares: 101n, collateral: 5n }],
        ]),
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map<string, StateValue>([
          [id, { supplyShares: 0n, borrowShares: 101n, collateral: 5n }],
        ]),
      }),
    ).toThrow(
      `${label}: post-bundle position.maxBorrowShares "101" is above the maximum "100". Adjust the transaction or the bound.`,
    );
    const missingPositionPlan = planStateReads({
      operations: [
        {
          limit: { ...borrowLimit, quote: { assetsPaid: 1n } },
          assetsPaid: ethAddress,
        },
      ],
      owner,
      morpho: zeroAddress,
    });
    const missingPositionInput = {
      ...input,
      operations: missingPositionPlan.operations,
      before: new Map<string, StateValue>(),
      after: new Map<string, StateValue>(),
      transfers: [
        { token: ethAddress, from: owner, to: vault, amount: 1n, txIdx: 0 },
      ],
    };
    expect(() => verifySlippage(missingPositionInput)).toThrow(
      SlippageCheckUnavailableError,
    );
    expect(() => verifySlippage(missingPositionInput)).toThrow(
      `${label}: missing post-bundle position observation for "position"`,
    );
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
        logs: [] as const,
        morpho: zeroAddress,
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
    ).toThrow(SlippageCheckUnavailableError);
  });
});
