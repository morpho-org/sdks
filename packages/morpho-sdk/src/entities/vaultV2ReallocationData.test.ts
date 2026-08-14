import {
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  ChainId,
  type IVaultV2Allocation,
  Market,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import type { Address, Hash } from "viem";
import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { blueBorrow } from "../actions/index.js";
import { computeVaultV2Reallocations } from "../helpers/index.js";
import {
  InsufficientSharedLiquidityError,
  ReallocationWithdrawExceedsMarketSupplyError,
} from "../types/index.js";
import { VaultV2ReallocationData } from "./vaultV2ReallocationData.js";

const TIMESTAMP = 1_700_000_000n;
const ALLOCATOR = "0x0000000000000000000000000000000000000001";
const VAULT = "0x0000000000000000000000000000000000000002";
const TARGET_ADAPTER = "0x0000000000000000000000000000000000000003";
const SOURCE_ADAPTER = "0x0000000000000000000000000000000000000004";
const LOAN_TOKEN = "0x0000000000000000000000000000000000000005";
const IRM = "0x0000000000000000000000000000000000000006";

const targetParams = new MarketParams({
  loanToken: LOAN_TOKEN,
  collateralToken: "0x0000000000000000000000000000000000000007",
  oracle: "0x0000000000000000000000000000000000000008",
  irm: IRM,
  lltv: 860_000_000_000_000_000n,
});

const sourceParams = new MarketParams({
  loanToken: LOAN_TOKEN,
  collateralToken: "0x0000000000000000000000000000000000000009",
  oracle: "0x000000000000000000000000000000000000000A",
  irm: IRM,
  lltv: 860_000_000_000_000_000n,
});

const makeMarket = ({
  params,
  supply,
  borrow,
}: {
  readonly params: MarketParams;
  readonly supply: bigint;
  readonly borrow: bigint;
}) =>
  new Market({
    params,
    totalSupplyAssets: supply,
    totalBorrowAssets: borrow,
    totalSupplyShares: supply * 1_000_000n,
    totalBorrowShares: borrow * 1_000_000n,
    lastUpdate: TIMESTAMP,
    fee: 0n,
  });

interface FixtureOptions {
  readonly sourceMarketParams?: MarketParams;
  readonly sourceAdapter?: Address;
  readonly sourceSupply?: bigint;
  readonly sourceBorrow?: bigint;
  readonly sourceUntracked?: bigint;
  readonly targetSupply?: bigint;
  readonly targetBorrow?: bigint;
  readonly targetPositionAssets?: bigint;
  readonly targetUntracked?: bigint;
  readonly targetCaps?: readonly [
    { readonly absoluteCap: bigint; readonly relativeCap: bigint },
    { readonly absoluteCap: bigint; readonly relativeCap: bigint },
    { readonly absoluteCap: bigint; readonly relativeCap: bigint },
  ];
  readonly allocatorTargetCap?: bigint;
  readonly firstTotalAssets?: bigint;
  readonly idle?: bigint;
  readonly canPullFromIdle?: boolean;
  readonly canPullFromMarket?: boolean;
  readonly penalty?: bigint;
}

const makeFixture = ({
  sourceMarketParams = sourceParams,
  sourceAdapter: sourceAdapterAddress = SOURCE_ADAPTER,
  sourceSupply = 1_000n,
  sourceBorrow = 0n,
  sourceUntracked = 0n,
  targetSupply = 100n,
  targetBorrow = 0n,
  targetPositionAssets = 0n,
  targetUntracked = 0n,
  targetCaps = [
    { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
    { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
    { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
  ],
  allocatorTargetCap = 10_000n,
  firstTotalAssets,
  idle = 0n,
  canPullFromIdle = true,
  canPullFromMarket = true,
  penalty = 7n,
}: FixtureOptions = {}) => {
  const sameMarket = sourceMarketParams.id === targetParams.id;
  const targetMarket = makeMarket({
    params: targetParams,
    supply: sameMarket ? sourceSupply : targetSupply,
    borrow: sameMarket ? sourceBorrow : targetBorrow,
  });
  const sourceMarket = sameMarket
    ? targetMarket
    : makeMarket({
        params: sourceMarketParams,
        supply: sourceSupply,
        borrow: sourceBorrow,
      });
  const targetSupplyShares = targetMarket.toSupplyShares(
    targetPositionAssets,
    "Down",
  );
  const sourceSupplyShares = sourceMarket.toSupplyShares(sourceSupply, "Down");
  const targetExpectedAssets = targetMarket.toSupplyAssets(targetSupplyShares);
  const sourceExpectedAssets = sourceMarket.toSupplyAssets(sourceSupplyShares);

  const targetAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
    {
      address: TARGET_ADAPTER,
      parentVault: VAULT,
      skimRecipient: zeroAddress,
      marketIds: [targetMarket.id],
      adaptiveCurveIrm: IRM,
      supplyShares: { [targetMarket.id]: targetSupplyShares },
    },
    [targetMarket],
  );
  const sourceAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
    {
      address: sourceAdapterAddress,
      parentVault: VAULT,
      skimRecipient: zeroAddress,
      marketIds: [sourceMarket.id],
      adaptiveCurveIrm: IRM,
      supplyShares: { [sourceMarket.id]: sourceSupplyShares },
    },
    [sourceMarket],
  );
  const targetIds = targetAdapter.ids(targetMarket.params);
  const sourceIds = sourceAdapter.ids(sourceMarket.params);
  const allocations: Record<Hash, IVaultV2Allocation | undefined> = {};

  const addAllocation = ({
    id,
    allocation,
    cap,
  }: {
    readonly id: Hash;
    readonly allocation: bigint;
    readonly cap: {
      readonly absoluteCap: bigint;
      readonly relativeCap: bigint;
    };
  }) => {
    const current = allocations[id];
    allocations[id] = {
      id,
      absoluteCap: cap.absoluteCap,
      relativeCap: cap.relativeCap,
      allocation: (current?.allocation ?? 0n) + allocation,
    };
  };

  for (const id of sourceIds) {
    addAllocation({
      id,
      allocation: sourceExpectedAssets - sourceUntracked,
      cap: {
        absoluteCap: 10_000n,
        relativeCap: MathLib.WAD,
      },
    });
  }
  for (const [index, id] of targetIds.entries()) {
    addAllocation({
      id,
      allocation: targetExpectedAssets - targetUntracked,
      cap: targetCaps[index]!,
    });
  }

  const adapters =
    sourceAdapterAddress === TARGET_ADAPTER
      ? [
          new AccrualVaultV2MorphoMarketV1AdapterV2(
            {
              address: TARGET_ADAPTER,
              parentVault: VAULT,
              skimRecipient: zeroAddress,
              marketIds: Array.from(
                new Set([targetMarket.id, sourceMarket.id]),
              ),
              adaptiveCurveIrm: IRM,
              supplyShares: {
                [targetMarket.id]: targetSupplyShares,
                [sourceMarket.id]: sourceSupplyShares,
              },
            },
            sameMarket ? [targetMarket] : [targetMarket, sourceMarket],
          ),
        ]
      : [targetAdapter, sourceAdapter];
  const totalAssets =
    firstTotalAssets ?? sourceExpectedAssets + targetExpectedAssets + idle;
  const vault = new AccrualVaultV2(
    {
      address: VAULT,
      name: "Vault V2",
      symbol: "v2",
      decimals: 18,
      asset: LOAN_TOKEN,
      _totalAssets: totalAssets,
      totalSupply: totalAssets,
      virtualShares: 0n,
      maxRate: 0n,
      lastUpdate: TIMESTAMP,
      liquidityAdapter: zeroAddress,
      liquidityData: "0x",
      liquidityAllocations: undefined,
      performanceFee: 0n,
      managementFee: 0n,
      performanceFeeRecipient: zeroAddress,
      managementFeeRecipient: zeroAddress,
    },
    undefined,
    adapters,
    idle,
    {},
  );

  return {
    data: new VaultV2ReallocationData({
      chainId: ChainId.EthMainnet,
      allocator: ALLOCATOR,
      markets: {
        [targetMarket.id]: targetMarket,
        [sourceMarket.id]: sourceMarket,
      },
      vaults: { [VAULT]: vault },
      allocations: { [VAULT]: allocations },
      publicAllocatorConfigs: {
        [VAULT]: {
          allocator: ALLOCATOR,
          vault: VAULT,
          canPullFromIdle,
          penalty,
        },
      },
      marketPublicAllocatorConfigs: {
        [VAULT]: {
          [targetIds[2]]: {
            allocator: ALLOCATOR,
            vault: VAULT,
            adapter: TARGET_ADAPTER,
            marketParamsId: targetIds[2],
            absoluteCap: allocatorTargetCap,
            canPullFromMarket: false,
            isActiveAdapter: true,
          },
          [sourceIds[2]]: {
            allocator: ALLOCATOR,
            vault: VAULT,
            adapter: sourceAdapterAddress,
            marketParamsId: sourceIds[2],
            absoluteCap: 0n,
            canPullFromMarket,
            isActiveAdapter: true,
          },
        },
      },
    }),
    sourceExpectedAssets,
    sourceIds,
    targetExpectedAssets,
    targetIds,
  };
};

describe("VaultV2ReallocationData.computeVaultV2Reallocations", () => {
  test("default: returns an action-ready market reallocation and cloned post-state", () => {
    const { data, sourceExpectedAssets, sourceIds, targetIds } = makeFixture();

    const result = data.computeVaultV2Reallocations(targetParams.id);

    expect(result.reallocations).toStrictEqual([
      {
        allocator: ALLOCATOR,
        type: "bluePublicAllocator",
        vault: VAULT,
        from: {
          type: "market",
          adapter: SOURCE_ADAPTER,
          marketParams: sourceParams,
        },
        to: { adapter: TARGET_ADAPTER },
        assets: sourceExpectedAssets,
        penalty: 7n,
      },
    ]);
    expect(result.data).not.toBe(data);
    expect(result.data.getAllocation(VAULT, sourceIds[2]).allocation).toBe(0n);
    expect(result.data.getAllocation(VAULT, targetIds[2]).allocation).toBe(
      sourceExpectedAssets,
    );
    expect(result.data.getVault(VAULT)._totalAssets).toBe(
      data.getVault(VAULT)._totalAssets,
    );
  });

  test("behavior: ranks market liquidity before idle and depletes both sources", () => {
    const { data, sourceExpectedAssets } = makeFixture({ idle: 300n });

    const result = data.computeVaultV2Reallocations(targetParams.id);

    expect(
      result.reallocations.map(({ from, assets, penalty }) => ({
        from: from.type,
        assets,
        penalty,
      })),
    ).toStrictEqual([
      { from: "market", assets: sourceExpectedAssets, penalty: 7n },
      { from: "idle", assets: 300n, penalty: 7n },
    ]);
    expect(result.data.getVault(VAULT).assetBalance).toBe(2n);
  });

  test("behavior: permits the target market through a different adapter", () => {
    const { data, sourceExpectedAssets } = makeFixture({
      sourceMarketParams: targetParams,
    });

    expect(
      data.computeVaultV2Reallocations(targetParams.id).reallocations,
    ).toMatchObject([
      {
        from: { type: "market", adapter: SOURCE_ADAPTER },
        to: { adapter: TARGET_ADAPTER },
        assets: sourceExpectedAssets,
      },
    ]);
  });

  test("behavior: allows deallocation assets to exceed stored allocation", () => {
    const { data, sourceExpectedAssets } = makeFixture({
      sourceUntracked: 900n,
    });

    const result = data.computeVaultV2Reallocations(targetParams.id);

    expect(result.reallocations[0]?.assets).toBe(sourceExpectedAssets);
    expect(result.data.getVault(VAULT).assetBalance).toBe(1n);
  });

  test("behavior: target untracked interest consumes allocator headroom", () => {
    const { data } = makeFixture({
      targetPositionAssets: 100n,
      targetUntracked: 10n,
      allocatorTargetCap: 100n,
    });

    expect(
      data.computeVaultV2Reallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: shared collateral ids retain both markets' untracked interest", () => {
    const sharedCollateralSource = new MarketParams({
      ...sourceParams,
      collateralToken: targetParams.collateralToken,
    });
    const { data } = makeFixture({
      sourceMarketParams: sharedCollateralSource,
      sourceUntracked: 10n,
      targetPositionAssets: 100n,
      targetUntracked: 20n,
      targetCaps: [
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        { absoluteCap: 1_099n, relativeCap: MathLib.WAD },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
      ],
    });

    expect(
      data.computeVaultV2Reallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: freezes firstTotalAssets while applying relative caps", () => {
    const { data } = makeFixture({
      firstTotalAssets: 1_000n,
      targetCaps: [
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD / 2n },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD / 2n },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD / 2n },
      ],
    });

    const result = data.computeVaultV2Reallocations(targetParams.id);

    expect(result.reallocations[0]?.assets).toBe(500n);
    expect(result.data.getVault(VAULT)._totalAssets).toBe(1_000n);
  });

  test("behavior: caps each call at uint128", () => {
    const sourceSupply = MathLib.MAX_UINT_128 + 10n;
    const { data } = makeFixture({
      sourceSupply,
      targetSupply: 0n,
      firstTotalAssets: sourceSupply,
      allocatorTargetCap: MathLib.MAX_UINT_256,
      targetCaps: [
        { absoluteCap: MathLib.MAX_UINT_256, relativeCap: MathLib.WAD },
        { absoluteCap: MathLib.MAX_UINT_256, relativeCap: MathLib.WAD },
        { absoluteCap: MathLib.MAX_UINT_256, relativeCap: MathLib.WAD },
      ],
    });

    expect(
      data.computeVaultV2Reallocations(targetParams.id).reallocations[0]
        ?.assets,
    ).toBe(MathLib.MAX_UINT_128);
  });

  test("behavior: rejects target market supply overflow", () => {
    const { data } = makeFixture({
      targetSupply: MathLib.MAX_UINT_128,
      firstTotalAssets: MathLib.MAX_UINT_128 + 1_000n,
      allocatorTargetCap: MathLib.MAX_UINT_256,
      targetCaps: [
        { absoluteCap: MathLib.MAX_UINT_256, relativeCap: MathLib.WAD },
        { absoluteCap: MathLib.MAX_UINT_256, relativeCap: MathLib.WAD },
        { absoluteCap: MathLib.MAX_UINT_256, relativeCap: MathLib.WAD },
      ],
    });

    expect(
      data.computeVaultV2Reallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: same-market deallocation creates target supply headroom", () => {
    const { data } = makeFixture({
      sourceMarketParams: targetParams,
      sourceSupply: MathLib.MAX_UINT_128,
      firstTotalAssets: MathLib.MAX_UINT_128,
      allocatorTargetCap: MathLib.MAX_UINT_256,
      targetCaps: [
        { absoluteCap: MathLib.MAX_UINT_256, relativeCap: MathLib.WAD },
        { absoluteCap: MathLib.MAX_UINT_256, relativeCap: MathLib.WAD },
        { absoluteCap: MathLib.MAX_UINT_256, relativeCap: MathLib.WAD },
      ],
    });

    expect(
      data.computeVaultV2Reallocations(targetParams.id).reallocations[0]
        ?.assets,
    ).toBe(MathLib.MAX_UINT_128);
  });

  test("behavior: disabled discovery returns no calls", () => {
    const { data } = makeFixture();

    expect(
      data.computeVaultV2Reallocations(targetParams.id, { enabled: false })
        .reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: ignores vault liquidity above the penalty threshold", () => {
    const { data, sourceExpectedAssets } = makeFixture({
      idle: 300n,
      penalty: 8n,
    });

    expect(
      data.computeVaultV2Reallocations(targetParams.id, {
        maxPenalty: 7n,
      }).reallocations,
    ).toStrictEqual([]);
    expect(
      data
        .computeVaultV2Reallocations(targetParams.id, {
          maxPenalty: 8n,
        })
        .reallocations.map(({ from, assets }) => ({
          from: from.type,
          assets,
        })),
    ).toStrictEqual([
      { from: "market", assets: sourceExpectedAssets },
      { from: "idle", assets: 300n },
    ]);
  });
});

describe("computeVaultV2Reallocations", () => {
  test("default: caps friendly reallocations to the 90% target", () => {
    const { data } = makeFixture({ targetSupply: 100n, targetBorrow: 90n });

    const reallocations = computeVaultV2Reallocations({
      reallocationData: data,
      marketId: targetParams.id,
      operation: "borrow",
      amount: 20n,
    });

    expect(reallocations).toHaveLength(1);
    expect(reallocations[0]?.assets).toBe(23n);
  });

  test("behavior: rounds required supply up to the utilization target", () => {
    const { data } = makeFixture({ targetSupply: 1n, targetBorrow: 0n });

    const reallocations = computeVaultV2Reallocations({
      reallocationData: data,
      marketId: targetParams.id,
      operation: "borrow",
      amount: 1n,
    });

    expect(reallocations[0]?.assets).toBe(1n);
  });

  test("behavior: falls back to a 100% source-utilization ceiling", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      sourceSupply: 1_000n,
      sourceBorrow: 950n,
    });

    const reallocations = computeVaultV2Reallocations({
      reallocationData: data,
      marketId: targetParams.id,
      operation: "borrow",
      amount: 40n,
    });

    expect(reallocations[0]?.assets).toBe(40n);
  });

  test("behavior: plans a loan-asset withdraw", () => {
    const { data } = makeFixture({ targetSupply: 100n, targetBorrow: 90n });

    const reallocations = computeVaultV2Reallocations({
      reallocationData: data,
      marketId: targetParams.id,
      operation: "withdraw",
      amount: 10n,
    });

    expect(reallocations[0]?.assets).toBe(10n);
  });

  test("behavior: preserves the configured penalty for every retained flat call", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      idle: 300n,
    });
    const reallocations = computeVaultV2Reallocations({
      reallocationData: data,
      marketId: targetParams.id,
      operation: "borrow",
      amount: 1_100n,
    });

    const tx = blueBorrow({
      market: {
        chainId: ChainId.EthMainnet,
        marketParams: targetParams,
      },
      args: {
        amount: 1_100n,
        receiver: VAULT,
        minSharePrice: 0n,
        reallocations,
      },
    });

    expect(reallocations).toHaveLength(2);
    expect(tx.value).toBe(0n);
    expect(tx.action.args.reallocationPenaltyAssets).toBe(2n);
  });

  test("behavior: excludes reallocations above the penalty threshold", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 90n,
      penalty: 7n,
    });

    expect(
      computeVaultV2Reallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: 1n,
        options: { maxPenalty: 6n },
      }),
    ).toStrictEqual([]);
    expect(
      computeVaultV2Reallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: 1n,
        options: { maxPenalty: 7n },
      })[0]?.assets,
    ).toBe(2n);
  });

  test("error: InsufficientSharedLiquidityError rejects a partial plan", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      sourceSupply: 50n,
    });

    expect(() =>
      computeVaultV2Reallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: 100n,
      }),
    ).toThrow(InsufficientSharedLiquidityError);
  });

  test("error: ReallocationWithdrawExceedsMarketSupplyError", () => {
    const { data } = makeFixture({ targetSupply: 100n });

    expect(() =>
      computeVaultV2Reallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "withdraw",
        amount: 101n,
      }),
    ).toThrow(ReallocationWithdrawExceedsMarketSupplyError);
  });

  test("behavior: disabled planning returns no calls", () => {
    const { data } = makeFixture();

    expect(
      computeVaultV2Reallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: 1_000n,
        options: { enabled: false },
      }),
    ).toStrictEqual([]);
  });
});

describe("VaultV2ReallocationData liquidity metrics", () => {
  test("default: sums idle and market liquidity in target-utilization math", () => {
    const { data, sourceExpectedAssets } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 50n,
      idle: 300n,
    });

    expect(data.getPublicReallocationLiquidityVaultV2(targetParams.id)).toBe(
      sourceExpectedAssets + 300n,
    );
    expect(
      data.getAvailableLiquidityToUtilizationVaultV2(targetParams.id),
    ).toBe(1_210n);
    expect(
      data.getAvailableLiquidityToUtilizationVaultV2(
        targetParams.id,
        (MathLib.WAD * 8n) / 10n,
      ),
    ).toBe(30n);
  });
});
