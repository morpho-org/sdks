import {
  AccrualPosition,
  AccrualVault,
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1Adapter,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  AccrualVaultV2MorphoVaultV1Adapter,
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
import {
  InsufficientSharedLiquidityError,
  NonPositiveInputError,
  ReallocationWithdrawExceedsMarketSupplyError,
  UnknownReallocationMarketError,
} from "../types/index.js";
import {
  computeVaultV2Reallocations,
  VaultV2ReallocationData,
} from "./vaultV2ReallocationData.js";

const TIMESTAMP = 1_700_000_000n;
const VAULT = "0x0000000000000000000000000000000000000002";
const TARGET_ADAPTER = "0x0000000000000000000000000000000000000003";
const SOURCE_ADAPTER = "0x0000000000000000000000000000000000000004";
const LOAN_TOKEN = "0x0000000000000000000000000000000000000005";
const IRM = "0x0000000000000000000000000000000000000006";
const SECOND_VAULT = "0x000000000000000000000000000000000000000b";
const SECOND_TARGET_ADAPTER = "0x000000000000000000000000000000000000000C";
const LEGACY_MARKET_ADAPTER = "0x000000000000000000000000000000000000000d";
const VAULT_V1_ADAPTER = "0x000000000000000000000000000000000000000E";
const NESTED_VAULT = "0x000000000000000000000000000000000000000F";

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
  lastUpdate = TIMESTAMP,
}: {
  readonly params: MarketParams;
  readonly supply: bigint;
  readonly borrow: bigint;
  readonly lastUpdate?: bigint;
}) =>
  new Market({
    params,
    totalSupplyAssets: supply,
    totalBorrowAssets: borrow,
    totalSupplyShares: supply * 1_000_000n,
    totalBorrowShares: borrow * 1_000_000n,
    lastUpdate,
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
  readonly allocatorActiveAdapters?: Iterable<Address>;
  readonly penalty?: bigint;
  readonly sourceLastUpdate?: bigint;
  readonly targetLastUpdate?: bigint;
  readonly vaultLastUpdate?: bigint;
  readonly maxRate?: bigint;
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
  allocatorActiveAdapters,
  penalty = 7n,
  sourceLastUpdate = TIMESTAMP,
  targetLastUpdate = TIMESTAMP,
  vaultLastUpdate = TIMESTAMP,
  maxRate = 0n,
}: FixtureOptions = {}) => {
  const sameMarket = sourceMarketParams.id === targetParams.id;
  const targetMarket = makeMarket({
    params: targetParams,
    supply: sameMarket ? sourceSupply : targetSupply,
    borrow: sameMarket ? sourceBorrow : targetBorrow,
    lastUpdate: targetLastUpdate,
  });
  const sourceMarket = sameMarket
    ? targetMarket
    : makeMarket({
        params: sourceMarketParams,
        supply: sourceSupply,
        borrow: sourceBorrow,
        lastUpdate: sourceLastUpdate,
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
      maxRate,
      lastUpdate: vaultLastUpdate,
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
      markets: {
        [targetMarket.id]: targetMarket,
        [sourceMarket.id]: sourceMarket,
      },
      vaults: { [VAULT]: vault },
      allocations: { [VAULT]: allocations },
      publicAllocatorConfigs: {
        [VAULT]: {
          vault: VAULT,
          canPullFromIdle,
          penalty,
        },
      },
      activeAdapters: {
        [VAULT]:
          allocatorActiveAdapters ?? adapters.map((adapter) => adapter.address),
      },
      marketPublicAllocatorConfigs: {
        [VAULT]: {
          [targetIds[2]]: {
            vault: VAULT,
            adapter: TARGET_ADAPTER,
            marketParamsId: targetIds[2],
            absoluteCap: allocatorTargetCap,
            canPullFromMarket: false,
          },
          [sourceIds[2]]: {
            vault: VAULT,
            adapter: sourceAdapterAddress,
            marketParamsId: sourceIds[2],
            absoluteCap: 0n,
            canPullFromMarket,
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

    expect(data.activeAdapters[VAULT]).toStrictEqual(
      new Set([TARGET_ADAPTER, SOURCE_ADAPTER]),
    );
    const result = data.computeVaultV2Reallocations(targetParams.id);

    expect(result.reallocations).toStrictEqual([
      {
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

  test("behavior: ignores inactive source and target adapters", () => {
    for (const allocatorActiveAdapters of [
      [TARGET_ADAPTER],
      [SOURCE_ADAPTER],
    ] as const) {
      const { data } = makeFixture({ allocatorActiveAdapters });

      expect(
        data.computeVaultV2Reallocations(targetParams.id).reallocations,
      ).toStrictEqual([]);
    }
  });

  test("behavior: keeps two vault adapters on one canonical market", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetPositionAssets: 50n,
      idle: 500n,
      canPullFromMarket: false,
      penalty: 0n,
    });
    const targetMarket = data.getMarket(targetParams.id);
    const secondTargetShares = targetMarket.toSupplyShares(50n, "Down");
    const secondTargetAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        address: SECOND_TARGET_ADAPTER,
        parentVault: SECOND_VAULT,
        skimRecipient: zeroAddress,
        marketIds: [targetMarket.id],
        adaptiveCurveIrm: IRM,
        supplyShares: { [targetMarket.id]: secondTargetShares },
      },
      [targetMarket],
    );
    const secondTargetIds = secondTargetAdapter.ids(targetParams);
    const secondAllocations: Record<Hash, IVaultV2Allocation> = {};
    for (const id of secondTargetIds) {
      secondAllocations[id] = {
        id,
        absoluteCap: 10_000n,
        relativeCap: MathLib.WAD,
        allocation: 50n,
      };
    }
    const firstVault = data.getVault(VAULT);
    const secondVault = new AccrualVaultV2(
      {
        ...firstVault,
        address: SECOND_VAULT,
        _totalAssets: 550n,
        totalSupply: 550n,
      },
      undefined,
      [secondTargetAdapter],
      500n,
      {},
    );
    const sharedData = new VaultV2ReallocationData({
      chainId: data.chainId,
      markets: data.markets,
      vaults: {
        [VAULT]: firstVault,
        [SECOND_VAULT]: secondVault,
      },
      allocations: {
        [VAULT]: data.allocations[VAULT],
        [SECOND_VAULT]: secondAllocations,
      },
      publicAllocatorConfigs: {
        [VAULT]: data.publicAllocatorConfigs[VAULT],
        [SECOND_VAULT]: {
          vault: SECOND_VAULT,
          canPullFromIdle: true,
          penalty: 0n,
        },
      },
      activeAdapters: {
        [VAULT]: data.activeAdapters[VAULT],
        [SECOND_VAULT]: new Set([SECOND_TARGET_ADAPTER]),
      },
      marketPublicAllocatorConfigs: {
        [VAULT]: data.marketPublicAllocatorConfigs[VAULT],
        [SECOND_VAULT]: {
          [secondTargetIds[2]]: {
            vault: SECOND_VAULT,
            adapter: SECOND_TARGET_ADAPTER,
            marketParamsId: secondTargetIds[2],
            absoluteCap: 10_000n,
            canPullFromMarket: false,
          },
        },
      },
    });

    const initialCanonicalMarket = sharedData.getMarket(targetParams.id);
    expect(sharedData.getAdapter(VAULT, TARGET_ADAPTER).markets[0]).toBe(
      initialCanonicalMarket,
    );
    expect(
      sharedData.getAdapter(SECOND_VAULT, SECOND_TARGET_ADAPTER).markets[0],
    ).toBe(initialCanonicalMarket);

    const result = sharedData.computeVaultV2Reallocations(targetParams.id);
    const finalCanonicalMarket = result.data.getMarket(targetParams.id);

    expect(result.reallocations).toHaveLength(2);
    expect(result.data.getAdapter(VAULT, TARGET_ADAPTER).markets[0]).toBe(
      finalCanonicalMarket,
    );
    expect(
      result.data.getAdapter(SECOND_VAULT, SECOND_TARGET_ADAPTER).markets[0],
    ).toBe(finalCanonicalMarket);
  });

  test("behavior: deep-clones legacy and nested accrued adapters", () => {
    const { data } = makeFixture();
    const targetMarket = data.getMarket(targetParams.id);
    const legacyPosition = new AccrualPosition(
      {
        user: LEGACY_MARKET_ADAPTER,
        supplyShares: targetMarket.toSupplyShares(25n, "Down"),
        borrowShares: 0n,
        collateral: 0n,
      },
      targetMarket,
    );
    const legacyAdapter = new AccrualVaultV2MorphoMarketV1Adapter(
      {
        address: LEGACY_MARKET_ADAPTER,
        parentVault: VAULT,
        skimRecipient: zeroAddress,
        marketParamsList: [targetParams],
      },
      [legacyPosition],
    );
    const nestedPosition = new AccrualPosition(
      {
        user: NESTED_VAULT,
        supplyShares: targetMarket.toSupplyShares(30n, "Down"),
        borrowShares: 0n,
        collateral: 0n,
      },
      targetMarket,
    );
    const nestedVault = new AccrualVault(
      {
        address: NESTED_VAULT,
        name: "Nested Vault",
        symbol: "nv",
        asset: LOAN_TOKEN,
        decimalsOffset: 0n,
        curator: VAULT,
        owner: VAULT,
        guardian: VAULT,
        fee: 0n,
        feeRecipient: VAULT,
        skimRecipient: VAULT,
        pendingTimelock: { value: 1n, validAt: TIMESTAMP + 1n },
        pendingGuardian: { value: VAULT, validAt: TIMESTAMP + 2n },
        pendingOwner: VAULT,
        timelock: 0n,
        supplyQueue: [targetMarket.id],
        totalSupply: 30n,
        lastTotalAssets: 30n,
        publicAllocatorConfig: {
          admin: VAULT,
          fee: 1n,
          accruedFee: 2n,
        },
      },
      [
        {
          config: {
            vault: NESTED_VAULT,
            marketId: targetMarket.id,
            cap: 1_000n,
            pendingCap: { value: 2_000n, validAt: TIMESTAMP + 3n },
            removableAt: 0n,
            enabled: true,
            publicAllocatorConfig: {
              vault: NESTED_VAULT,
              marketId: targetMarket.id,
              maxIn: 100n,
              maxOut: 200n,
            },
          },
          position: nestedPosition,
        },
      ],
    );
    const nestedAdapter = new AccrualVaultV2MorphoVaultV1Adapter(
      {
        address: VAULT_V1_ADAPTER,
        parentVault: VAULT,
        skimRecipient: zeroAddress,
        morphoVaultV1: NESTED_VAULT,
      },
      nestedVault,
      30n,
    );
    const fixtureVault = data.getVault(VAULT);
    const inputVault = new AccrualVaultV2(
      fixtureVault,
      fixtureVault.accrualLiquidityAdapter,
      [...fixtureVault.accrualAdapters, legacyAdapter, nestedAdapter],
      fixtureVault.assetBalance,
      fixtureVault.forceDeallocatePenalties,
    );
    const input = new VaultV2ReallocationData({
      chainId: data.chainId,
      markets: data.markets,
      vaults: { [VAULT]: inputVault },
      allocations: data.allocations,
      publicAllocatorConfigs: data.publicAllocatorConfigs,
      activeAdapters: data.activeAdapters,
      marketPublicAllocatorConfigs: data.marketPublicAllocatorConfigs,
    });

    const cloned = input.clone();
    expect(cloned.activeAdapters[VAULT]).toStrictEqual(
      input.activeAdapters[VAULT],
    );
    expect(cloned.activeAdapters[VAULT]).not.toBe(input.activeAdapters[VAULT]);
    const inputLegacy = input
      .getVault(VAULT)
      .accrualAdapters.find(
        (adapter) => adapter instanceof AccrualVaultV2MorphoMarketV1Adapter,
      );
    const clonedLegacy = cloned
      .getVault(VAULT)
      .accrualAdapters.find(
        (adapter) => adapter instanceof AccrualVaultV2MorphoMarketV1Adapter,
      );
    const inputNested = input
      .getVault(VAULT)
      .accrualAdapters.find(
        (adapter) => adapter instanceof AccrualVaultV2MorphoVaultV1Adapter,
      );
    const clonedNested = cloned
      .getVault(VAULT)
      .accrualAdapters.find(
        (adapter) => adapter instanceof AccrualVaultV2MorphoVaultV1Adapter,
      );

    expect(clonedLegacy).not.toBe(inputLegacy);
    expect(clonedLegacy?.positions[0]).not.toBe(inputLegacy?.positions[0]);
    expect(clonedLegacy?.positions[0]?.market).not.toBe(
      inputLegacy?.positions[0]?.market,
    );
    expect(clonedNested).not.toBe(inputNested);
    expect(clonedNested?.accrualVaultV1).not.toBe(inputNested?.accrualVaultV1);
    expect(clonedNested?.accrualVaultV1.allocations).not.toBe(
      inputNested?.accrualVaultV1.allocations,
    );

    const simulated = input.computeVaultV2Reallocations(targetMarket.id).data;
    const simulatedLegacy = simulated
      .getVault(VAULT)
      .accrualAdapters.find(
        (adapter) => adapter instanceof AccrualVaultV2MorphoMarketV1Adapter,
      );
    const simulatedNested = simulated
      .getVault(VAULT)
      .accrualAdapters.find(
        (adapter) => adapter instanceof AccrualVaultV2MorphoVaultV1Adapter,
      );
    const simulatedTargetMarket = simulated.getMarket(targetMarket.id);
    expect(simulatedLegacy?.positions[0]?.market.totalSupplyAssets).toBe(
      simulatedTargetMarket.totalSupplyAssets,
    );
    expect(
      simulatedNested?.accrualVaultV1.allocations.get(targetMarket.id)?.position
        .market.totalSupplyAssets,
    ).toBe(simulatedTargetMarket.totalSupplyAssets);

    clonedLegacy!.positions[0]!.supplyShares += 1n;
    clonedNested!.accrualVaultV1.pendingTimelock.value = 99n;
    const clonedNestedAllocation = clonedNested!.accrualVaultV1.allocations.get(
      targetMarket.id,
    )!;
    clonedNestedAllocation.config.pendingCap.value = 88n;
    clonedNestedAllocation.position.supplyShares += 2n;

    expect(inputLegacy?.positions[0]?.supplyShares).toBe(
      legacyPosition.supplyShares,
    );
    expect(inputNested?.accrualVaultV1.pendingTimelock.value).toBe(1n);
    expect(
      inputNested?.accrualVaultV1.allocations.get(targetMarket.id)?.config
        .pendingCap.value,
    ).toBe(2_000n);
    expect(
      inputNested?.accrualVaultV1.allocations.get(targetMarket.id)?.position
        .supplyShares,
    ).toBe(nestedPosition.supplyShares);
  });

  test("behavior: repeated cap probes are deterministic and isolated", () => {
    const { data } = makeFixture({ idle: 300n });
    const initialData = data.clone();

    const first = data.computeVaultV2Reallocations(targetParams.id);
    const second = data.computeVaultV2Reallocations(targetParams.id);

    expect(second.reallocations).toStrictEqual(first.reallocations);
    expect(second.data).toStrictEqual(first.data);
    expect(data).toStrictEqual(initialData);
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

  test("behavior: excludes the target market through a different adapter", () => {
    const { data } = makeFixture({
      sourceMarketParams: targetParams,
    });

    expect(
      data.computeVaultV2Reallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
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

  test("behavior: recognizes zero-elapsed losses at the one-unit relative-cap boundary", () => {
    const { data, targetIds } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 0n,
      firstTotalAssets: 1_000n,
      idle: 900n,
      canPullFromMarket: false,
      penalty: 0n,
      targetCaps: [
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD / 2n },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD / 2n },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD / 2n },
      ],
    });

    const result = data.computeVaultV2Reallocations(targetParams.id);

    expect(result.reallocations).toHaveLength(1);
    expect(result.reallocations[0]?.assets).toBe(450n);
    expect(result.data.getAllocation(VAULT, targetIds[2]).allocation).toBe(
      450n,
    );
    expect(result.data.getVault(VAULT)._totalAssets).toBe(900n);
  });

  test("behavior: reuses firstTotalAssets across two reallocations for one vault", () => {
    const relativeCap = (MathLib.WAD * 3n) / 4n;
    const { data } = makeFixture({
      sourceSupply: 500n,
      targetSupply: 0n,
      firstTotalAssets: 1_000n,
      idle: 400n,
      penalty: 0n,
      targetCaps: [
        { absoluteCap: 10_000n, relativeCap },
        { absoluteCap: 10_000n, relativeCap },
        { absoluteCap: 10_000n, relativeCap },
      ],
    });

    const result = data.computeVaultV2Reallocations(targetParams.id);

    expect(
      result.reallocations.map(({ from, assets }) => ({
        from: from.type,
        assets,
      })),
    ).toStrictEqual([
      { from: "market", assets: 500n },
      { from: "idle", assets: 175n },
    ]);
    expect(result.data.getVault(VAULT)._totalAssets).toBe(900n);
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

  test("behavior: same-market deallocation is not counted as target liquidity", () => {
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
      data.computeVaultV2Reallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: defaults to the latest market or vault update timestamp", () => {
    const { data } = makeFixture({
      sourceLastUpdate: TIMESTAMP + 1n,
      vaultLastUpdate: TIMESTAMP + 2n,
    });

    expect(() =>
      data.computeVaultV2Reallocations(targetParams.id),
    ).not.toThrow();
  });

  test("behavior: freezes firstTotalAssets after the first penalty donation", () => {
    const { data } = makeFixture({
      sourceSupply: 500n,
      targetSupply: 0n,
      firstTotalAssets: 500n,
      maxRate: MathLib.WAD,
      vaultLastUpdate: TIMESTAMP - 1n,
      penalty: MathLib.WAD,
      allocatorTargetCap: 10_000n,
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

  test("behavior: disabled discovery returns no calls", () => {
    const { data } = makeFixture();

    expect(
      data.computeVaultV2Reallocations(targetParams.id, { enabled: false })
        .reallocations,
    ).toStrictEqual([]);
  });

  test("error: UnknownReallocationMarketError with an explicit timestamp", () => {
    const { data } = makeFixture();
    data.markets[targetParams.id] = undefined;

    expect(() =>
      data.computeVaultV2Reallocations(targetParams.id, {
        timestamp: TIMESTAMP,
      }),
    ).toThrow(UnknownReallocationMarketError);
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

  test("behavior: plans at the latest snapshot timestamp by default", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 90n,
      sourceLastUpdate: TIMESTAMP + 2n,
    });

    const defaultReallocations = computeVaultV2Reallocations({
      reallocationData: data,
      marketId: targetParams.id,
      operation: "borrow",
      amount: 20n,
    });
    const explicitReallocations = computeVaultV2Reallocations({
      reallocationData: data,
      marketId: targetParams.id,
      operation: "borrow",
      amount: 20n,
      options: { timestamp: TIMESTAMP + 2n },
    });

    expect(defaultReallocations).toStrictEqual(explicitReallocations);
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
      options: { reallocatableVaults: [VAULT as Address].values() },
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

  test.each([
    { operation: "borrow", amount: 0n },
    { operation: "borrow", amount: -1n },
    { operation: "withdraw", amount: 0n },
    { operation: "withdraw", amount: -1n },
  ] as const)(
    "error: NonPositiveInputError for $operation amount $amount",
    ({ operation, amount }) => {
      const { data } = makeFixture({ targetSupply: 100n, targetBorrow: 95n });
      const initialData = data.clone();

      expect(() =>
        computeVaultV2Reallocations({
          reallocationData: data,
          marketId: targetParams.id,
          operation,
          amount,
        }),
      ).toThrow(NonPositiveInputError);
      expect(data).toStrictEqual(initialData);
    },
  );

  test("behavior: disabled planning returns no calls", () => {
    const { data } = makeFixture();

    expect(
      computeVaultV2Reallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: 0n,
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
