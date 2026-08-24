import {
  AccrualPosition,
  AccrualVault,
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1Adapter,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  AccrualVaultV2MorphoVaultV1Adapter,
  ChainId,
  type IAccrualVaultV2Adapter,
  type IVaultV2Allocation,
  Market,
  type MarketId,
  MarketParams,
  MathLib,
  UnsupportedVaultV2AdapterError,
  VaultV2BlueMarketPublicAllocatorConfig,
  VaultV2BluePublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import {
  type Address,
  type Hash,
  isAddressEqual,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test, vi } from "vitest";
import { blueBorrow } from "../actions/index.js";
import { MAX_REALLOCATION_PENALTY } from "../helpers/constant.js";
import {
  InputExceedsMaxError,
  InsufficientSharedLiquidityError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationAdapterSupplySharesUnderflowError,
  ReallocationAllocationUnderflowError,
  ReallocationWithdrawExceedsMarketSupplyError,
  UnknownReallocationActiveAdaptersError,
  UnknownReallocationAdapterError,
  UnknownReallocationAllocationError,
  UnknownReallocationMarketError,
  UnknownReallocationMarketPublicAllocatorConfigError,
  UnknownReallocationPublicAllocatorConfigError,
} from "../types/index.js";
import { VaultV2BlueReallocationData } from "./vaultV2BlueReallocationData.js";

const TIMESTAMP = 1_700_000_000n;
const VAULT = "0x00000000000000000000000000000000000000A2";
const TARGET_ADAPTER = "0x00000000000000000000000000000000000000A3";
const SOURCE_ADAPTER = "0x0000000000000000000000000000000000000004";
const LOAN_TOKEN = "0x0000000000000000000000000000000000000005";
const IRM = "0x0000000000000000000000000000000000000006";
const OTHER_LOAN_TOKEN = "0x0000000000000000000000000000000000000010";
const OTHER_IRM = "0x0000000000000000000000000000000000000011";
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

const sourceParamsWithAnotherLoanToken = new MarketParams({
  ...sourceParams,
  loanToken: OTHER_LOAN_TOKEN,
});

const makeMarket = ({
  params,
  supply,
  supplyShares = supply * 1_000_000n,
  borrow,
  lastUpdate = TIMESTAMP,
}: {
  readonly params: MarketParams;
  readonly supply: bigint;
  readonly supplyShares?: bigint;
  readonly borrow: bigint;
  readonly lastUpdate?: bigint;
}) =>
  new Market({
    params,
    totalSupplyAssets: supply,
    totalBorrowAssets: borrow,
    totalSupplyShares: supplyShares,
    totalBorrowShares: borrow * 1_000_000n,
    lastUpdate,
    fee: 0n,
  });

interface FixtureOptions {
  readonly recordVault?: Address;
  readonly sourceMarketParams?: MarketParams;
  readonly sourceAdapter?: Address;
  readonly targetParentVault?: Address;
  readonly sourceParentVault?: Address;
  readonly targetAdaptiveCurveIrm?: Address;
  readonly sourceAdaptiveCurveIrm?: Address;
  readonly vaultAsset?: Address;
  readonly sourceSupply?: bigint;
  readonly sourceBorrow?: bigint;
  readonly sourceUntracked?: bigint;
  readonly targetSupply?: bigint;
  readonly targetTotalSupplyShares?: bigint;
  readonly targetBorrow?: bigint;
  readonly targetPositionAssets?: bigint;
  readonly targetTracked?: boolean;
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
  recordVault = VAULT,
  sourceMarketParams = sourceParams,
  sourceAdapter: sourceAdapterAddress = SOURCE_ADAPTER,
  targetParentVault = VAULT,
  sourceParentVault = VAULT,
  targetAdaptiveCurveIrm = IRM,
  sourceAdaptiveCurveIrm = IRM,
  vaultAsset = LOAN_TOKEN,
  sourceSupply = 1_000n,
  sourceBorrow = 0n,
  sourceUntracked = 0n,
  targetSupply = 100n,
  targetTotalSupplyShares,
  targetBorrow = 0n,
  targetPositionAssets = 0n,
  targetTracked = true,
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
  penalty = 0n,
  sourceLastUpdate = TIMESTAMP,
  targetLastUpdate = TIMESTAMP,
  vaultLastUpdate = TIMESTAMP,
  maxRate = 0n,
}: FixtureOptions = {}) => {
  const sameMarket = sourceMarketParams.id === targetParams.id;
  const targetMarket = makeMarket({
    params: targetParams,
    supply: sameMarket ? sourceSupply : targetSupply,
    supplyShares: targetTotalSupplyShares,
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
      parentVault: targetParentVault,
      skimRecipient: zeroAddress,
      marketIds: targetTracked ? [targetMarket.id] : [],
      adaptiveCurveIrm: targetAdaptiveCurveIrm,
      supplyShares: targetTracked
        ? { [targetMarket.id]: targetSupplyShares }
        : {},
    },
    targetTracked ? [targetMarket] : [],
  );
  const sourceAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
    {
      address: sourceAdapterAddress,
      parentVault: sourceParentVault,
      skimRecipient: zeroAddress,
      marketIds: [sourceMarket.id],
      adaptiveCurveIrm: sourceAdaptiveCurveIrm,
      supplyShares: { [sourceMarket.id]: sourceSupplyShares },
    },
    [sourceMarket],
  );
  const targetIds = targetAdapter.ids(targetMarket.params);
  const [, , targetAdapterMarketCapId] = targetIds;
  const sourceIds = sourceAdapter.ids(sourceMarket.params);
  const [sourceAdapterCapId, , sourceAdapterMarketCapId] = sourceIds;
  const sourceTargetIds = sourceAdapter.ids(targetMarket.params);
  const [, , sourceTargetAdapterMarketCapId] = sourceTargetIds;
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
  for (const id of sourceTargetIds) {
    if (allocations[id] == null)
      addAllocation({
        id,
        allocation: 0n,
        cap: { absoluteCap: 0n, relativeCap: 0n },
      });
  }

  const adapters =
    sourceAdapterAddress === TARGET_ADAPTER
      ? [
          new AccrualVaultV2MorphoMarketV1AdapterV2(
            {
              address: TARGET_ADAPTER,
              parentVault: targetParentVault,
              skimRecipient: zeroAddress,
              marketIds: Array.from(
                new Set([targetMarket.id, sourceMarket.id]),
              ),
              adaptiveCurveIrm: targetAdaptiveCurveIrm,
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
      asset: vaultAsset,
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
    data: new VaultV2BlueReallocationData({
      chainId: ChainId.EthMainnet,
      markets: {
        [targetMarket.id]: targetMarket,
        [sourceMarket.id]: sourceMarket,
      },
      vaults: { [VAULT]: vault },
      allocations: { [recordVault]: allocations },
      publicAllocatorConfigs: {
        [recordVault]: {
          vault: VAULT,
          canPullFromIdle,
          penalty,
        },
      },
      activeAdapters: {
        [recordVault]:
          allocatorActiveAdapters ?? adapters.map((adapter) => adapter.address),
      },
      marketPublicAllocatorConfigs: {
        [recordVault]: {
          [targetAdapterMarketCapId]: {
            vault: VAULT,
            adapter: TARGET_ADAPTER,
            adapterMarketCapId: targetAdapterMarketCapId,
            absoluteCap: allocatorTargetCap,
            canPullFromMarket: false,
          },
          [sourceAdapterMarketCapId]: {
            vault: VAULT,
            adapter: sourceAdapterAddress,
            adapterMarketCapId: sourceAdapterMarketCapId,
            absoluteCap: 0n,
            canPullFromMarket,
          },
          ...(sourceTargetAdapterMarketCapId === targetAdapterMarketCapId ||
          sourceTargetAdapterMarketCapId === sourceAdapterMarketCapId
            ? {}
            : {
                [sourceTargetAdapterMarketCapId]: {
                  vault: VAULT,
                  adapter: sourceAdapterAddress,
                  adapterMarketCapId: sourceTargetAdapterMarketCapId,
                  absoluteCap: 0n,
                  canPullFromMarket: false,
                },
              }),
        },
      },
    }),
    sourceAdapterCapId,
    sourceAdapterMarketCapId,
    sourceExpectedAssets,
    targetAdapterMarketCapId,
    targetExpectedAssets,
  };
};

describe("VaultV2BlueReallocationData construction", () => {
  test("error: UnsupportedVaultV2AdapterError", () => {
    const { data } = makeFixture();
    const vault = data.getVault(VAULT);
    const adapter = data.getAdapter(VAULT, TARGET_ADAPTER);
    const unsupportedAdapter: IAccrualVaultV2Adapter = {
      type: "UnsupportedAdapter",
      address: SECOND_TARGET_ADAPTER,
      parentVault: VAULT,
      adapterId: adapter.adapterId,
      skimRecipient: zeroAddress,
      realAssets: adapter.realAssets.bind(adapter),
      maxDeposit: adapter.maxDeposit.bind(adapter),
      maxWithdraw: adapter.maxWithdraw.bind(adapter),
    };
    const unsupportedVault = new AccrualVaultV2(
      {
        ...vault,
        liquidityAllocations: vault.liquidityAllocations?.map((allocation) => ({
          ...allocation,
        })),
      },
      undefined,
      [unsupportedAdapter],
      vault.assetBalance,
      { ...vault.forceDeallocatePenalties },
    );

    expect(
      () =>
        new VaultV2BlueReallocationData({
          chainId: data.chainId,
          vaults: { [VAULT]: unsupportedVault },
        }),
    ).toThrow(UnsupportedVaultV2AdapterError);
  });
});

describe("VaultV2BlueReallocationData accessors", () => {
  test("behavior: preserves checksummed address keys and values", () => {
    const { data } = makeFixture();

    expect(Object.keys(data.vaults)).toStrictEqual([VAULT]);
    expect(Object.keys(data.activeAdapters)).toStrictEqual([VAULT]);
    expect(
      data.getActiveAdapters(VAULT.toLowerCase() as Address),
    ).toStrictEqual(new Set([TARGET_ADAPTER, SOURCE_ADAPTER]));
  });

  test("behavior: returns a fetched empty active-adapter set", () => {
    const { data } = makeFixture({ allocatorActiveAdapters: [] });

    expect(data.getActiveAdapters(VAULT)).toStrictEqual(new Set());
  });

  test("error: UnknownReallocationActiveAdaptersError", () => {
    const { data } = makeFixture();
    delete (
      data.activeAdapters as Record<Address, ReadonlySet<Address> | undefined>
    )[VAULT];

    expect(() => data.getActiveAdapters(VAULT)).toThrow(
      UnknownReallocationActiveAdaptersError,
    );
  });

  test("error: UnknownReallocationAllocationError", () => {
    const { data } = makeFixture();

    expect(() => data.getAllocation(VAULT, zeroHash)).toThrow(
      UnknownReallocationAllocationError,
    );
  });

  test("error: UnknownReallocationPublicAllocatorConfigError", () => {
    const { data } = makeFixture();

    expect(() => data.getPublicAllocatorConfig(SECOND_VAULT)).toThrow(
      UnknownReallocationPublicAllocatorConfigError,
    );
  });

  test("error: UnknownReallocationMarketPublicAllocatorConfigError", () => {
    const { data } = makeFixture();

    expect(() => data.getMarketPublicAllocatorConfig(VAULT, zeroHash)).toThrow(
      UnknownReallocationMarketPublicAllocatorConfigError,
    );
  });

  test("error: UnknownReallocationAdapterError", () => {
    const { data } = makeFixture();

    expect(() => data.getAdapter(VAULT, zeroAddress)).toThrow(
      UnknownReallocationAdapterError,
    );
  });
});

describe("VaultV2BlueReallocationData.clone", () => {
  test("default: deep-clones liquidity adapter and allocation state", () => {
    const { data } = makeFixture();
    const fixtureVault = data.getVault(VAULT);
    const fixtureLiquidityAdapter = fixtureVault.accrualAdapters.find(
      ({ address }) => address === TARGET_ADAPTER,
    )!;
    const input = new VaultV2BlueReallocationData({
      chainId: data.chainId,
      markets: data.markets,
      vaults: {
        [VAULT]: new AccrualVaultV2(
          {
            ...fixtureVault,
            liquidityAdapter: fixtureLiquidityAdapter.address,
            liquidityAllocations: [
              {
                id: zeroHash,
                absoluteCap: 100n,
                relativeCap: MathLib.WAD,
                allocation: 10n,
              },
            ],
          },
          fixtureLiquidityAdapter,
          [...fixtureVault.accrualAdapters],
          fixtureVault.assetBalance,
          fixtureVault.forceDeallocatePenalties,
        ),
      },
    });

    const inputVault = input.getVault(VAULT);
    const clonedVault = input.clone().getVault(VAULT);

    expect(clonedVault.accrualLiquidityAdapter).toBe(
      clonedVault.accrualAdapters.find(
        ({ address }) => address === TARGET_ADAPTER,
      ),
    );
    expect(clonedVault.accrualLiquidityAdapter).not.toBe(
      inputVault.accrualLiquidityAdapter,
    );
    expect(clonedVault.liquidityAllocations).not.toBe(
      inputVault.liquidityAllocations,
    );

    const clonedAllocation =
      clonedVault.liquidityAllocations![0] as IVaultV2Allocation;
    clonedAllocation.allocation = 99n;

    expect(inputVault.liquidityAllocations?.[0]?.allocation).toBe(10n);
  });
});

describe("VaultV2BlueReallocationData.computeVaultV2BlueReallocations", () => {
  test("default: returns an action-ready market reallocation and durable cloned post-state", () => {
    const {
      data,
      sourceAdapterMarketCapId,
      sourceExpectedAssets,
      targetAdapterMarketCapId,
    } = makeFixture();

    expect(data.getActiveAdapters(VAULT)).toStrictEqual(
      new Set([TARGET_ADAPTER, SOURCE_ADAPTER]),
    );
    const result = data.computeVaultV2BlueReallocations(targetParams.id);

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
        penalty: 0n,
      },
    ]);
    expect(result.data).not.toBe(data);
    expect(result.data).not.toHaveProperty("firstTotalAssets");
    expect(
      result.data.getAllocation(VAULT, sourceAdapterMarketCapId).allocation,
    ).toBe(0n);
    expect(
      result.data.getAllocation(VAULT, targetAdapterMarketCapId).allocation,
    ).toBe(sourceExpectedAssets);
    expect(result.data.getVault(VAULT)._totalAssets).toBe(
      data.getVault(VAULT)._totalAssets,
    );
  });

  test("behavior: matches differently cased vault record keys", () => {
    const recordVault = VAULT.toLowerCase() as Address;
    const { data, sourceExpectedAssets } = makeFixture({ recordVault });

    const result = data.computeVaultV2BlueReallocations(targetParams.id);

    expect(Object.keys(data.vaults)).toStrictEqual([VAULT]);
    expect(Object.keys(data.allocations)).toStrictEqual([recordVault]);
    expect(result.reallocations[0]?.assets).toBe(sourceExpectedAssets);
    expect(Object.keys(result.data.vaults)).toStrictEqual([VAULT]);
    expect(Object.keys(result.data.allocations)).toStrictEqual([recordVault]);
  });

  test("behavior: returns transaction context separately from durable state", () => {
    const { data } = makeFixture();
    const context = { donatedPenaltyAssets: {}, firstTotalAssets: {} };

    // biome-ignore lint/complexity/useLiteralKeys: exercise the private transition shape directly.
    const transition = data["applyPublicReallocation"]({
      context,
      reallocation: {
        vault: VAULT,
        from: {
          type: "market",
          adapter: SOURCE_ADAPTER,
          marketParams: sourceParams,
        },
        to: { adapter: TARGET_ADAPTER },
        assets: 1n,
        penalty: 0n,
      },
      targetMarketId: targetParams.id,
      timestamp: TIMESTAMP,
      probe: true,
    });

    expect(context.firstTotalAssets).toStrictEqual({});
    expect(transition.context.firstTotalAssets[VAULT]).toBe(
      data.getVault(VAULT)._totalAssets,
    );
    expect(transition.data).not.toHaveProperty("firstTotalAssets");
  });

  test("behavior: probe clones only transition adapters and allocations", () => {
    const { data } = makeFixture();
    const untouchedAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        address: SECOND_TARGET_ADAPTER,
        parentVault: VAULT,
        skimRecipient: zeroAddress,
        marketIds: [],
        adaptiveCurveIrm: IRM,
        supplyShares: {},
      },
      [],
    );
    (data.getVault(VAULT).accrualAdapters as IAccrualVaultV2Adapter[]).push(
      untouchedAdapter,
    );
    const sourceAdapter = data.getAdapter(VAULT, SOURCE_ADAPTER);
    const targetAdapter = data.getAdapter(VAULT, TARGET_ADAPTER);

    // biome-ignore lint/complexity/useLiteralKeys: exercise the private probe snapshot directly.
    const transition = data["applyPublicReallocation"]({
      context: { donatedPenaltyAssets: {}, firstTotalAssets: {} },
      reallocation: {
        vault: VAULT,
        from: {
          type: "market",
          adapter: SOURCE_ADAPTER,
          marketParams: sourceParams,
        },
        to: { adapter: TARGET_ADAPTER },
        assets: 1n,
        penalty: 0n,
      },
      targetMarketId: targetParams.id,
      timestamp: TIMESTAMP,
      probe: true,
    });
    const probeVault = transition.data.getVault(VAULT);
    const expectedAllocationIds = new Set([
      ...sourceAdapter.ids(sourceParams),
      ...targetAdapter.ids(targetParams),
    ]);

    expect(transition.data.getAdapter(VAULT, SOURCE_ADAPTER)).not.toBe(
      sourceAdapter,
    );
    expect(transition.data.getAdapter(VAULT, TARGET_ADAPTER)).not.toBe(
      targetAdapter,
    );
    expect(
      probeVault.accrualAdapters.find(({ address }) =>
        isAddressEqual(address, SECOND_TARGET_ADAPTER),
      ),
    ).toBe(untouchedAdapter);
    expect(
      Object.keys(transition.data.allocations[VAULT] ?? {}).sort(),
    ).toStrictEqual([...expectedAllocationIds].sort());
  });

  test("error: ReallocationAdapterSupplySharesUnderflowError", () => {
    const { data } = makeFixture();
    const sourceAdapter = data.getAdapter(VAULT, SOURCE_ADAPTER);
    (sourceAdapter.supplyShares as Record<MarketId, bigint>)[sourceParams.id] =
      0n;

    expect(() =>
      // biome-ignore lint/complexity/useLiteralKeys: exercise the private transition invariant directly.
      data["applyPublicReallocation"]({
        context: { donatedPenaltyAssets: {}, firstTotalAssets: {} },
        reallocation: {
          vault: VAULT,
          from: {
            type: "market",
            adapter: SOURCE_ADAPTER,
            marketParams: sourceParams,
          },
          to: { adapter: TARGET_ADAPTER },
          assets: 1n,
          penalty: 7n,
        },
        targetMarketId: targetParams.id,
        timestamp: TIMESTAMP,
        probe: true,
      }),
    ).toThrow(ReallocationAdapterSupplySharesUnderflowError);
  });

  test("error: ReallocationAllocationUnderflowError", () => {
    const { data, sourceAdapterCapId } = makeFixture();
    const allocation = data.getAllocation(VAULT, sourceAdapterCapId);
    (data.allocations[VAULT] as Record<Hash, IVaultV2Allocation>)[
      sourceAdapterCapId
    ] = { ...allocation, allocation: 0n };

    expect(() =>
      // biome-ignore lint/complexity/useLiteralKeys: exercise the private transition invariant directly.
      data["applyPublicReallocation"]({
        context: { donatedPenaltyAssets: {}, firstTotalAssets: {} },
        reallocation: {
          vault: VAULT,
          from: {
            type: "market",
            adapter: SOURCE_ADAPTER,
            marketParams: sourceParams,
          },
          to: { adapter: TARGET_ADAPTER },
          assets: 1n,
          penalty: 7n,
        },
        targetMarketId: targetParams.id,
        timestamp: TIMESTAMP,
        probe: true,
      }),
    ).toThrow(ReallocationAllocationUnderflowError);
  });

  test("behavior: rejects underflowing cap probes without aborting discovery", () => {
    const { data, sourceAdapterCapId } = makeFixture();
    const allocation = data.getAllocation(VAULT, sourceAdapterCapId);
    (data.allocations[VAULT] as Record<Hash, IVaultV2Allocation>)[
      sourceAdapterCapId
    ] = { ...allocation, allocation: 1n };

    expect(data.getPublicReallocationLiquidity(targetParams.id)).toBe(1n);
  });

  test("behavior: allocates into a configured target with no existing position", () => {
    const { data, sourceExpectedAssets, targetAdapterMarketCapId } =
      makeFixture({
        targetTracked: false,
      });

    expect(data.getAdapter(VAULT, TARGET_ADAPTER).marketIds).not.toContain(
      targetParams.id,
    );

    const result = data.computeVaultV2BlueReallocations(targetParams.id);
    const targetAdapter = result.data.getAdapter(VAULT, TARGET_ADAPTER);

    expect(result.reallocations).toHaveLength(1);
    expect(targetAdapter.marketIds).toContain(targetParams.id);
    expect(targetAdapter.markets.map(({ id }) => id)).toContain(
      targetParams.id,
    );
    expect(targetAdapter.supplyShares[targetParams.id]).toBeGreaterThan(0n);
    expect(
      result.data.getAllocation(VAULT, targetAdapterMarketCapId).allocation,
    ).toBe(sourceExpectedAssets);
  });

  test("behavior: honors the configured source-utilization ceiling", () => {
    const { data } = makeFixture({ sourceBorrow: 900n });

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
    expect(
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxWithdrawalUtilization: MathLib.WAD,
      }).reallocations[0]?.assets,
    ).toBe(100n);
  });

  test("behavior: refreshes only adapter views for changed markets", () => {
    const { data } = makeFixture();
    const targetAdapter = data.getAdapter(VAULT, TARGET_ADAPTER);
    const sourceAdapter = data.getAdapter(VAULT, SOURCE_ADAPTER);
    const previousTargetMarkets = targetAdapter.markets;
    const previousSourceMarkets = sourceAdapter.markets;
    const targetMarket = data
      .getMarket(targetParams.id)
      .accrueInterest(TIMESTAMP + 1n);

    (
      data as unknown as {
        setMarkets(markets: Iterable<Market>): void;
      }
    ).setMarkets([targetMarket]);

    expect(data.getMarket(targetParams.id)).toBe(targetMarket);
    expect(targetAdapter.markets).not.toBe(previousTargetMarkets);
    expect(targetAdapter.markets[0]).toBe(targetMarket);
    expect(sourceAdapter.markets).toBe(previousSourceMarkets);
  });

  test.each([0n, MathLib.WAD])(
    "behavior: accepts maxWithdrawalUtilization boundary %s",
    (maxWithdrawalUtilization) => {
      const { data } = makeFixture();

      expect(() =>
        data.computeVaultV2BlueReallocations(targetParams.id, {
          maxWithdrawalUtilization,
        }),
      ).not.toThrow();
    },
  );

  test.each([0n, MAX_REALLOCATION_PENALTY])(
    "behavior: accepts maxPenalty boundary %s",
    (maxPenalty) => {
      const { data } = makeFixture();

      expect(() =>
        data.computeVaultV2BlueReallocations(targetParams.id, { maxPenalty }),
      ).not.toThrow();
    },
  );

  test.each([
    {
      maxWithdrawalUtilization: -1n,
      ErrorClass: NegativeInputError,
    },
    {
      maxWithdrawalUtilization: MathLib.WAD + 1n,
      ErrorClass: InputExceedsMaxError,
    },
  ])(
    "error: rejects maxWithdrawalUtilization $maxWithdrawalUtilization",
    ({ maxWithdrawalUtilization, ErrorClass }) => {
      const { data } = makeFixture();

      expect(() =>
        data.computeVaultV2BlueReallocations(targetParams.id, {
          maxWithdrawalUtilization,
        }),
      ).toThrow(ErrorClass);
    },
  );

  test.each([
    { maxPenalty: -1n, ErrorClass: NegativeInputError },
    {
      maxPenalty: MAX_REALLOCATION_PENALTY + 1n,
      ErrorClass: InputExceedsMaxError,
    },
  ])("error: rejects maxPenalty $maxPenalty", ({ maxPenalty, ErrorClass }) => {
    const { data } = makeFixture();

    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id, { maxPenalty }),
    ).toThrow(ErrorClass);
  });

  test("behavior: skips targets whose Morpho supply would mint fewer shares than assets", () => {
    const { data } = makeFixture({
      targetSupply: 2_000_000n,
      targetTotalSupplyShares: 0n,
      idle: 300n,
    });

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: ignores inactive source and target adapters", () => {
    for (const allocatorActiveAdapters of [
      [TARGET_ADAPTER],
      [SOURCE_ADAPTER],
    ] as const) {
      const { data } = makeFixture({ allocatorActiveAdapters });

      expect(
        data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
      ).toStrictEqual([]);
    }
  });

  test.each([
    [
      "a target adapter belonging to another vault",
      { targetParentVault: SECOND_VAULT },
    ],
    [
      "a source adapter belonging to another vault",
      { sourceParentVault: SECOND_VAULT },
    ],
    [
      "a target market with another loan token",
      { vaultAsset: OTHER_LOAN_TOKEN },
    ],
    [
      "a source market with another loan token",
      { sourceMarketParams: sourceParamsWithAnotherLoanToken },
    ],
    [
      "a target adapter with another adaptive curve IRM",
      { targetAdaptiveCurveIrm: OTHER_IRM },
    ],
    [
      "a source adapter with another adaptive curve IRM",
      { sourceAdaptiveCurveIrm: OTHER_IRM },
    ],
    [
      "a target with a zero allocation cap",
      {
        targetCaps: [
          { absoluteCap: 0n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        ],
      },
    ],
  ] satisfies readonly (readonly [string, FixtureOptions])[])(
    "behavior: ignores %s",
    (_, options) => {
      const { data } = makeFixture(options);

      expect(
        data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
      ).toStrictEqual([]);
    },
  );

  test("behavior: matches active adapters regardless of address casing", () => {
    const sourceAdapter =
      "0x00000000000000000000000000000000000000AB" as Address;
    const { data } = makeFixture({
      sourceAdapter,
      allocatorActiveAdapters: [
        `0x${TARGET_ADAPTER.slice(2).toUpperCase()}` as Address,
        `0x${sourceAdapter.slice(2).toUpperCase()}` as Address,
      ],
    });

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
    ).toHaveLength(1);
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
      [new Market({ ...targetMarket })],
    );
    const secondTargetIds = secondTargetAdapter.ids(targetParams);
    const [, , secondTargetAdapterMarketCapId] = secondTargetIds;
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
        liquidityAllocations: firstVault.liquidityAllocations?.map(
          (allocation) => ({ ...allocation }),
        ),
      },
      undefined,
      [secondTargetAdapter],
      500n,
      {},
    );
    const sharedData = new VaultV2BlueReallocationData({
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
          [secondTargetAdapterMarketCapId]: {
            vault: SECOND_VAULT,
            adapter: SECOND_TARGET_ADAPTER,
            adapterMarketCapId: secondTargetAdapterMarketCapId,
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

    const result = sharedData.computeVaultV2BlueReallocations(targetParams.id);
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
    const { data, targetAdapterMarketCapId } = makeFixture();
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
      {
        ...fixtureVault,
        liquidityAllocations: fixtureVault.liquidityAllocations?.map(
          (allocation) => ({ ...allocation }),
        ),
      },
      fixtureVault.accrualLiquidityAdapter,
      [...fixtureVault.accrualAdapters, legacyAdapter, nestedAdapter],
      fixtureVault.assetBalance,
      fixtureVault.forceDeallocatePenalties,
    );
    const input = new VaultV2BlueReallocationData({
      chainId: data.chainId,
      markets: data.markets,
      vaults: { [VAULT]: inputVault },
      allocations: data.allocations,
      publicAllocatorConfigs: data.publicAllocatorConfigs,
      activeAdapters: data.activeAdapters,
      marketPublicAllocatorConfigs: data.marketPublicAllocatorConfigs,
    });

    const cloned = input.clone();
    expect(cloned.publicAllocatorConfigs).toBe(input.publicAllocatorConfigs);
    expect(cloned.activeAdapters).toBe(input.activeAdapters);
    expect(cloned.marketPublicAllocatorConfigs).toBe(
      input.marketPublicAllocatorConfigs,
    );
    expect(cloned.allocations[VAULT]).not.toBe(input.allocations[VAULT]);
    expect(cloned.getAllocation(VAULT, targetAdapterMarketCapId)).toBe(
      input.getAllocation(VAULT, targetAdapterMarketCapId),
    );
    expect(cloned.getPublicAllocatorConfig(VAULT)).toBeInstanceOf(
      VaultV2BluePublicAllocatorConfig,
    );
    expect(
      cloned.getMarketPublicAllocatorConfig(VAULT, targetAdapterMarketCapId),
    ).toBeInstanceOf(VaultV2BlueMarketPublicAllocatorConfig);
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

    const simulated = input.computeVaultV2BlueReallocations(
      targetMarket.id,
    ).data;
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

    const first = data.computeVaultV2BlueReallocations(targetParams.id);
    const second = data.computeVaultV2BlueReallocations(targetParams.id);

    expect(second.reallocations).toStrictEqual(first.reallocations);
    expect(second.data).toStrictEqual(first.data);
    expect(data).toStrictEqual(initialData);
  });

  test("behavior: ranks market liquidity before idle and depletes both sources", () => {
    const { data, sourceExpectedAssets } = makeFixture({ idle: 300n });

    const result = data.computeVaultV2BlueReallocations(targetParams.id);

    expect(
      result.reallocations.map(({ from, assets, penalty }) => ({
        from: from.type,
        assets,
        penalty,
      })),
    ).toStrictEqual([
      { from: "market", assets: sourceExpectedAssets, penalty: 0n },
      { from: "idle", assets: 300n, penalty: 0n },
    ]);
    expect(result.data.getVault(VAULT).assetBalance).toBe(0n);
  });

  test("behavior: excludes the target market through a different adapter", () => {
    const { data } = makeFixture({
      sourceMarketParams: targetParams,
    });

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: allows deallocation assets to exceed stored allocation", () => {
    const { data, sourceExpectedAssets } = makeFixture({
      sourceUntracked: 900n,
    });

    const result = data.computeVaultV2BlueReallocations(targetParams.id);

    expect(result.reallocations[0]?.assets).toBe(sourceExpectedAssets);
    expect(result.data.getVault(VAULT).assetBalance).toBe(0n);
  });

  test("behavior: target untracked interest consumes allocator headroom", () => {
    const { data } = makeFixture({
      targetPositionAssets: 100n,
      targetUntracked: 10n,
      allocatorTargetCap: 100n,
    });

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
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
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: finds liquidity between shared lower and target upper caps", () => {
    const penalty = MathLib.WAD;
    const { data } = makeFixture({
      sourceAdapter: TARGET_ADAPTER,
      sourceSupply: 100n,
      targetPositionAssets: 0n,
      firstTotalAssets: 140n,
      idle: 40n,
      canPullFromIdle: false,
      vaultLastUpdate: TIMESTAMP - 1n,
      maxRate: MathLib.WAD,
      penalty,
      targetCaps: [
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD / 2n },
        { absoluteCap: 80n, relativeCap: MathLib.WAD },
        { absoluteCap: 80n, relativeCap: MathLib.WAD },
      ],
    });

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
    });

    expect(result.reallocations).toHaveLength(1);
    expect(result.reallocations[0]?.assets).toBe(80n);
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

    const result = data.computeVaultV2BlueReallocations(targetParams.id);

    expect(result.reallocations[0]?.assets).toBe(500n);
    expect(result.data.getVault(VAULT)._totalAssets).toBe(1_000n);
  });

  test("behavior: recognizes zero-elapsed losses at the one-unit relative-cap boundary", () => {
    const { data, targetAdapterMarketCapId } = makeFixture({
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

    const result = data.computeVaultV2BlueReallocations(targetParams.id);

    expect(result.reallocations).toHaveLength(1);
    expect(result.reallocations[0]?.assets).toBe(450n);
    expect(
      result.data.getAllocation(VAULT, targetAdapterMarketCapId).allocation,
    ).toBe(450n);
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

    const result = data.computeVaultV2BlueReallocations(targetParams.id);

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
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations[0]
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
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
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
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: defaults to the latest market or vault update timestamp", () => {
    const { data } = makeFixture({
      sourceLastUpdate: TIMESTAMP + 1n,
      vaultLastUpdate: TIMESTAMP + 2n,
    });

    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id),
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

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: MathLib.WAD,
    });

    expect(result.reallocations[0]?.assets).toBe(500n);
    expect(result.data.getVault(VAULT)._totalAssets).toBe(1_000n);
  });

  test("behavior: excludes penalty donations from idle liquidity in the same plan", () => {
    const penalty = MathLib.WAD / 10n;
    const cap = { absoluteCap: 110n, relativeCap: MathLib.WAD };
    const { data } = makeFixture({
      sourceSupply: 100n,
      targetSupply: 0n,
      firstTotalAssets: 100n,
      vaultLastUpdate: TIMESTAMP - 1n,
      maxRate: MathLib.WAD,
      penalty,
      allocatorTargetCap: 110n,
      targetCaps: [cap, cap, cap],
    });

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
    });

    expect(
      result.reallocations.map(({ from, assets }) => ({
        from: from.type,
        assets,
      })),
    ).toStrictEqual([{ from: "market", assets: 100n }]);
    expect(result.data.getVault(VAULT).assetBalance).toBe(10n);
  });

  test("behavior: makes prior penalty donations available in a later transaction", () => {
    const penalty = MathLib.WAD / 10n;
    const cap = { absoluteCap: 10_000n, relativeCap: MathLib.WAD - 1n };
    const { data } = makeFixture({
      sourceSupply: 99n,
      targetSupply: 0n,
      firstTotalAssets: 100n,
      maxRate: MathLib.WAD,
      penalty,
      targetCaps: [cap, cap, cap],
    });

    const first = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
    });
    const second = first.data.computeVaultV2BlueReallocations(targetParams.id, {
      timestamp: TIMESTAMP + 1n,
      maxPenalty: penalty,
    });

    expect(first.reallocations).toHaveLength(1);
    expect(second.reallocations[0]).toMatchObject({
      from: { type: "idle" },
      assets: 10n,
    });
  });

  test("behavior: disabled discovery returns no calls", () => {
    const { data } = makeFixture();

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id, { enabled: false })
        .reallocations,
    ).toStrictEqual([]);
  });

  test("error: UnknownReallocationMarketError with an explicit timestamp", () => {
    const data = new VaultV2BlueReallocationData({
      chainId: ChainId.EthMainnet,
    });

    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
      }),
    ).toThrow(UnknownReallocationMarketError);
  });

  test("error: UnknownReallocationMarketError for incomplete source state", () => {
    const { data } = makeFixture();
    const incompleteData = data.clone();
    delete (incompleteData.markets as Record<MarketId, Market | undefined>)[
      sourceParams.id
    ];
    vi.spyOn(data, "clone").mockReturnValue(incompleteData);

    expect(() => data.computeVaultV2BlueReallocations(targetParams.id)).toThrow(
      UnknownReallocationMarketError,
    );
  });

  test("error: UnknownReallocationActiveAdaptersError for incomplete vault state", () => {
    const { data } = makeFixture();
    delete (
      data.activeAdapters as Record<Address, ReadonlySet<Address> | undefined>
    )[VAULT];

    expect(() => data.computeVaultV2BlueReallocations(targetParams.id)).toThrow(
      UnknownReallocationActiveAdaptersError,
    );
  });

  test("error: UnknownReallocationPublicAllocatorConfigError for incomplete vault state", () => {
    const { data } = makeFixture();
    delete (
      data.publicAllocatorConfigs as Record<
        Address,
        VaultV2BluePublicAllocatorConfig | undefined
      >
    )[VAULT];

    expect(() => data.computeVaultV2BlueReallocations(targetParams.id)).toThrow(
      UnknownReallocationPublicAllocatorConfigError,
    );
  });

  test.each([
    ["target", "targetAdapterMarketCapId"],
    ["source", "sourceAdapterMarketCapId"],
  ] as const)(
    "error: UnknownReallocationMarketPublicAllocatorConfigError for incomplete %s state",
    (_, configId) => {
      const fixture = makeFixture();
      const { data } = fixture;
      delete (
        data.marketPublicAllocatorConfigs[VAULT] as Record<
          Hash,
          VaultV2BlueMarketPublicAllocatorConfig | undefined
        >
      )[fixture[configId]];

      expect(() =>
        data.computeVaultV2BlueReallocations(targetParams.id),
      ).toThrow(UnknownReallocationMarketPublicAllocatorConfigError);
    },
  );

  test.each([
    ["target", "targetAdapterMarketCapId"],
    ["source", "sourceAdapterMarketCapId"],
  ] as const)(
    "error: UnknownReallocationAllocationError for incomplete %s state",
    (_, allocationId) => {
      const fixture = makeFixture();
      const { data } = fixture;
      delete (
        data.allocations[VAULT] as Record<Hash, IVaultV2Allocation | undefined>
      )[fixture[allocationId]];

      expect(() =>
        data.computeVaultV2BlueReallocations(targetParams.id),
      ).toThrow(UnknownReallocationAllocationError);
    },
  );

  test("behavior: ignores a vault with fetched but absent allocator config", () => {
    const { data } = makeFixture();
    (
      data.publicAllocatorConfigs as Record<
        Address,
        VaultV2BluePublicAllocatorConfig | undefined
      >
    )[VAULT] = undefined;

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: ignores vault liquidity above the penalty threshold", () => {
    const { data, sourceExpectedAssets } = makeFixture({
      idle: 300n,
      penalty: 8n,
    });
    const getActiveAdapters = vi.spyOn(
      VaultV2BlueReallocationData.prototype,
      "getActiveAdapters",
    );

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
    expect(
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: 7n,
      }).reallocations,
    ).toStrictEqual([]);
    expect(
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
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
    expect(getActiveAdapters).toHaveBeenCalledTimes(1);
    getActiveAdapters.mockRestore();
  });
});

describe("VaultV2BlueReallocationData.computeVaultV2BlueReallocations operation", () => {
  test("default: caps friendly reallocations to the 90% target", () => {
    const { data } = makeFixture({ targetSupply: 100n, targetBorrow: 90n });

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      operation: { type: "borrow", amount: 20n },
    });

    expect(result.reallocations).toHaveLength(1);
    expect(result.reallocations[0]?.assets).toBe(23n);
    expect(result.data.getMarket(targetParams.id).totalSupplyAssets).toBe(123n);
  });

  test("error: rejects a remaining amount below a shared-cap lower bound", () => {
    const penalty = MathLib.WAD;
    const { data } = makeFixture({
      sourceAdapter: TARGET_ADAPTER,
      sourceSupply: 100n,
      targetBorrow: 90n,
      targetPositionAssets: 0n,
      firstTotalAssets: 100n,
      vaultLastUpdate: TIMESTAMP - 1n,
      maxRate: MathLib.WAD,
      penalty,
      targetCaps: [
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD / 2n },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
      ],
    });

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: penalty,
      }).reallocations[0]?.assets,
    ).toBe(100n);
    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: penalty,
        operation: { type: "borrow", amount: 81n },
      }),
    ).toThrow(InsufficientSharedLiquidityError);
  });

  test("error: validates maxWithdrawalUtilization before an operation early return", () => {
    const { data } = makeFixture({ targetSupply: 100n, targetBorrow: 0n });

    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxWithdrawalUtilization: MathLib.WAD + 1n,
        operation: { type: "borrow", amount: 1n },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("behavior: applies the configured ceiling during the friendly phase", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 90n,
      sourceBorrow: 900n,
    });

    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxWithdrawalUtilization: MathLib.WAD,
        operation: { type: "borrow", amount: 20n },
      },
    );

    expect(reallocations[0]?.assets).toBe(23n);
  });

  test("behavior: rounds required supply up to the utilization target", () => {
    const { data } = makeFixture({ targetSupply: 1n, targetBorrow: 0n });

    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { operation: { type: "borrow", amount: 1n } },
    );

    expect(reallocations[0]?.assets).toBe(1n);
  });

  test("behavior: plans at the latest snapshot timestamp by default", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 90n,
      sourceLastUpdate: TIMESTAMP + 2n,
    });

    const defaultReallocations = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { operation: { type: "borrow", amount: 20n } },
    );
    const explicitReallocations = data.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        timestamp: TIMESTAMP + 2n,
        operation: { type: "borrow", amount: 20n },
      },
    );

    expect(defaultReallocations).toStrictEqual(explicitReallocations);
  });

  test("behavior: falls back only for the remaining absolute shortfall", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      sourceSupply: 1_000n,
      sourceBorrow: 940n,
    });
    const clone = vi.spyOn(VaultV2BlueReallocationData.prototype, "clone");

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      reallocatableVaults: [VAULT as Address].values(),
      maxWithdrawalUtilization: 950_000_000_000_000_000n,
      operation: { type: "borrow", amount: 40n },
    });

    expect(result.reallocations.map(({ assets }) => assets)).toStrictEqual([
      10n,
      30n,
    ]);
    expect(result.data.getMarket(targetParams.id).totalSupplyAssets).toBe(140n);
    expect(clone).toHaveBeenCalledTimes(1);
    clone.mockRestore();
  });

  test("behavior: plans a loan-asset withdraw", () => {
    const { data } = makeFixture({ targetSupply: 100n, targetBorrow: 90n });

    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { operation: { type: "withdraw", amount: 10n } },
    );

    expect(reallocations[0]?.assets).toBe(10n);
  });

  test("behavior: preserves the configured penalty for every retained flat call", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      idle: 300n,
      penalty: 7n,
    });
    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: 7n,
        operation: { type: "borrow", amount: 1_100n },
      },
    );

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
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: 6n,
        operation: { type: "borrow", amount: 1n },
      }).reallocations,
    ).toStrictEqual([]);
    expect(
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: 7n,
        operation: { type: "borrow", amount: 1n },
      }).reallocations[0]?.assets,
    ).toBe(2n);
  });

  test("error: InsufficientSharedLiquidityError rejects a partial plan", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      sourceSupply: 50n,
    });

    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id, {
        operation: { type: "borrow", amount: 100n },
      }),
    ).toThrow(InsufficientSharedLiquidityError);
  });

  test("error: ReallocationWithdrawExceedsMarketSupplyError", () => {
    const { data } = makeFixture({ targetSupply: 100n });

    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id, {
        operation: { type: "withdraw", amount: 101n },
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
        data.computeVaultV2BlueReallocations(targetParams.id, {
          operation: { type: operation, amount },
        }),
      ).toThrow(NonPositiveInputError);
      expect(data).toStrictEqual(initialData);
    },
  );

  test("behavior: disabled planning returns no calls", () => {
    const { data } = makeFixture();

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      enabled: false,
      operation: { type: "borrow", amount: 0n },
    });

    expect(result.reallocations).toStrictEqual([]);
    expect(result.data).toBe(data);
  });
});

describe("VaultV2BlueReallocationData liquidity metrics", () => {
  test("default: sums idle and market liquidity in target-utilization math", () => {
    const { data, sourceExpectedAssets } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 50n,
      idle: 300n,
    });

    expect(data.getPublicReallocationLiquidity(targetParams.id)).toBe(
      sourceExpectedAssets + 300n,
    );
    expect(data.getAvailableLiquidityToUtilization(targetParams.id)).toBe(
      1_210n,
    );
    expect(
      data.getAvailableLiquidityToUtilization(
        targetParams.id,
        (MathLib.WAD * 8n) / 10n,
      ),
    ).toBe(30n);
  });

  test("behavior: applies the configured source-utilization ceiling", () => {
    const { data } = makeFixture({ sourceBorrow: 900n });

    expect(
      data.getPublicReallocationLiquidity(targetParams.id, {
        maxWithdrawalUtilization: MathLib.WAD,
      }),
    ).toBe(100n);
  });

  test("error: NegativeInputError for a negative maximum penalty", () => {
    const { data } = makeFixture();

    expect(() =>
      data.getPublicReallocationLiquidity(targetParams.id, { maxPenalty: -1n }),
    ).toThrow(NegativeInputError);
    expect(() =>
      data.getAvailableLiquidityToUtilization(targetParams.id, MathLib.WAD, {
        maxPenalty: -1n,
      }),
    ).toThrow(NegativeInputError);
  });
});
