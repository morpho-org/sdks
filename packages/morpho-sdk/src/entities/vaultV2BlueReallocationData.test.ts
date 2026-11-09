import { fc, test as fcTest } from "@fast-check/vitest";
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
  MarketUtils,
  MathLib,
  SharesMath,
  UnsupportedMarketIrmError,
  UnsupportedVaultV2AdapterError,
  VaultV2BlueMarketPublicAllocatorConfig,
  VaultV2BluePublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import {
  type Address,
  decodeFunctionData,
  type Hash,
  isAddressEqual,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test, vi } from "vitest";
import {
  MIDNIGHT_ADAPTER,
  withMidnightAdapter,
} from "../../test/fixtures/vaultV2Midnight.js";
import { blueBundlesV1Abi } from "../abis.js";
import {
  getBlueBundlesV1PenaltyAssets,
  getBlueBundlesV1ReferralFeeAssets,
} from "../actions/blue/common.js";
import { blueSupplyCollateralBorrow } from "../actions/index.js";
import {
  DEFAULT_CAP_ACCRUAL_BUFFER,
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  MAX_REALLOCATION_PENALTY,
} from "../helpers/constant.js";
import {
  InputExceedsMaxError,
  InsufficientSharedLiquidityError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationAdapterSupplySharesUnderflowError,
  ReallocationAllocationUnderflowError,
  ReallocationWithdrawExceedsMarketSupplyError,
  ReferralFeePctExceededError,
  UnknownReallocationActiveAdaptersError,
  UnknownReallocationAdapterError,
  UnknownReallocationAllocationError,
  UnknownReallocationMarketError,
  UnknownReallocationMarketPublicAllocatorConfigError,
  UnknownReallocationPublicAllocatorConfigError,
  UnknownReallocationVaultError,
  type VaultV2BlueReallocation,
} from "../types/index.js";
import { VaultV2BlueReallocationData } from "./vaultV2BlueReallocationData.js";

const originalComputeAtUtilization = (
  VaultV2BlueReallocationData.prototype as unknown as {
    computeVaultV2BlueReallocationsAtUtilizationInPlace: (
      ...args: never[]
    ) => unknown;
  }
).computeVaultV2BlueReallocationsAtUtilizationInPlace;
const TIMESTAMP = 1_700_000_000n;
const VAULT = "0x00000000000000000000000000000000000000A2";
const TARGET_ADAPTER = "0x00000000000000000000000000000000000000A3";
const SOURCE_ADAPTER = "0x0000000000000000000000000000000000000004";
const SIBLING_SOURCE_ADAPTER = "0x0000000000000000000000000000000000000012";
const SIBLING_SOURCE_ADAPTER_V2 = "0x0000000000000000000000000000000000000013";
const LOAN_TOKEN = "0x0000000000000000000000000000000000000005";
const IRM = "0x0000000000000000000000000000000000000006";
const OTHER_LOAN_TOKEN = "0x0000000000000000000000000000000000000010";
const OTHER_IRM = "0x0000000000000000000000000000000000000011";
const SECOND_VAULT = "0x000000000000000000000000000000000000000b";
const SECOND_TARGET_ADAPTER = "0x000000000000000000000000000000000000000C";
const THIRD_VAULT = "0x0000000000000000000000000000000000000014";
const THIRD_TARGET_ADAPTER = "0x0000000000000000000000000000000000000015";
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
  rateAtTarget = 0n,
}: {
  readonly params: MarketParams;
  readonly supply: bigint;
  readonly supplyShares?: bigint;
  readonly borrow: bigint;
  readonly lastUpdate?: bigint;
  readonly rateAtTarget?: bigint;
}) =>
  new Market({
    params,
    totalSupplyAssets: supply,
    totalBorrowAssets: borrow,
    totalSupplyShares: supplyShares,
    totalBorrowShares: borrow * 1_000_000n,
    lastUpdate,
    fee: 0n,
    rateAtTarget,
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
  readonly sourceTotalSupplyShares?: bigint;
  readonly sourcePositionShares?: bigint;
  readonly siblingSourcePosition?: {
    readonly address: Address;
    readonly supplyShares: bigint;
  };
  readonly sourceBorrow?: bigint;
  readonly sourceRateAtTarget?: bigint;
  readonly sourceUntracked?: bigint;
  readonly targetSupply?: bigint;
  readonly targetTotalSupplyShares?: bigint;
  readonly targetBorrow?: bigint;
  readonly targetRateAtTarget?: bigint;
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
  readonly sourceAbsoluteCap?: bigint;
  readonly vaultLastUpdate?: bigint;
  readonly maxRate?: bigint;
  readonly blueBalances?: Readonly<Record<Address, bigint | undefined>>;
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
  sourceTotalSupplyShares,
  sourcePositionShares,
  siblingSourcePosition,
  sourceBorrow = 0n,
  sourceRateAtTarget = 0n,
  sourceUntracked = 0n,
  targetSupply = 100n,
  targetTotalSupplyShares,
  targetBorrow = 0n,
  targetRateAtTarget = 0n,
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
  sourceAbsoluteCap = 10_000n,
  vaultLastUpdate = TIMESTAMP,
  maxRate = 0n,
  blueBalances,
}: FixtureOptions = {}) => {
  const sameMarket = sourceMarketParams.id === targetParams.id;
  const targetMarket = makeMarket({
    params: targetParams,
    supply: sameMarket ? sourceSupply : targetSupply,
    supplyShares: targetTotalSupplyShares,
    borrow: sameMarket ? sourceBorrow : targetBorrow,
    lastUpdate: targetLastUpdate,
    rateAtTarget: targetRateAtTarget,
  });
  const sourceMarket = sameMarket
    ? targetMarket
    : makeMarket({
        params: sourceMarketParams,
        supply: sourceSupply,
        supplyShares: sourceTotalSupplyShares,
        borrow: sourceBorrow,
        lastUpdate: sourceLastUpdate,
        rateAtTarget: sourceRateAtTarget,
      });
  const targetSupplyShares = targetMarket.toSupplyShares(
    targetPositionAssets,
    "Down",
  );
  const sourceSupplyShares =
    sourcePositionShares ?? sourceMarket.toSupplyShares(sourceSupply, "Down");
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
  const siblingSourceAdapter =
    siblingSourcePosition == null
      ? undefined
      : new AccrualVaultV2MorphoMarketV1Adapter(
          {
            address: siblingSourcePosition.address,
            parentVault: sourceParentVault,
            skimRecipient: zeroAddress,
            marketParamsList: [sourceMarket.params],
          },
          [
            new AccrualPosition(
              {
                user: siblingSourcePosition.address,
                supplyShares: siblingSourcePosition.supplyShares,
                borrowShares: 0n,
                collateral: 0n,
              },
              sourceMarket,
            ),
          ],
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
        absoluteCap: sourceAbsoluteCap,
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
          ...(siblingSourceAdapter == null ? [] : [siblingSourceAdapter]),
        ]
      : [
          targetAdapter,
          sourceAdapter,
          ...(siblingSourceAdapter == null ? [] : [siblingSourceAdapter]),
        ];
  const siblingSourceExpectedAssets =
    siblingSourcePosition == null
      ? 0n
      : sourceMarket.toSupplyAssets(siblingSourcePosition.supplyShares);
  const totalAssets =
    firstTotalAssets ??
    sourceExpectedAssets +
      siblingSourceExpectedAssets +
      targetExpectedAssets +
      idle;
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
      blueBalances,
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

  test("error: UnknownReallocationVaultError", () => {
    const { data } = makeFixture();

    expect(() => data.getVault(SECOND_VAULT)).toThrow(
      UnknownReallocationVaultError,
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

  test("error: UnknownReallocationPublicAllocatorConfigError for absent config", () => {
    const { data } = makeFixture();
    (
      data.publicAllocatorConfigs as Record<
        Address,
        VaultV2BluePublicAllocatorConfig | undefined
      >
    )[VAULT] = undefined;

    expect(() => data.getPublicAllocatorConfig(VAULT)).toThrow(
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
      blueBalances: data.blueBalances,
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
  const capTestTargetSupply = 10n ** 24n;
  const capTestHeadroom = 10n ** 21n;

  const makeCapTestFixture = (sourceType: "idle" | "market") => {
    const absoluteCap = capTestTargetSupply + capTestHeadroom;
    const { data, targetAdapterMarketCapId } = makeFixture({
      sourceSupply: sourceType === "market" ? capTestTargetSupply : 1_000n,
      sourceAbsoluteCap: 10n ** 30n,
      targetSupply: capTestTargetSupply,
      targetBorrow: capTestTargetSupply / 2n,
      targetRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
      targetPositionAssets: capTestTargetSupply,
      targetCaps: [
        { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
        { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
        { absoluteCap, relativeCap: MathLib.WAD },
      ],
      allocatorTargetCap: absoluteCap,
      idle: sourceType === "idle" ? capTestTargetSupply : 0n,
      canPullFromIdle: sourceType === "idle",
      canPullFromMarket: sourceType === "market",
    });

    return { data, targetAdapterMarketCapId, absoluteCap };
  };

  const makeSharedCapTestFixture = (adapterAbsoluteCap: bigint) =>
    makeFixture({
      sourceAdapter: TARGET_ADAPTER,
      sourceSupply: capTestTargetSupply,
      sourceBorrow: capTestTargetSupply / 2n,
      sourceRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
      sourceAbsoluteCap: 10n ** 30n,
      targetSupply: capTestTargetSupply,
      targetBorrow: capTestTargetSupply / 2n,
      targetRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
      targetPositionAssets: capTestTargetSupply,
      targetCaps: [
        { absoluteCap: adapterAbsoluteCap, relativeCap: MathLib.WAD },
        { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
        { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
      ],
      allocatorTargetCap: 10n ** 30n,
      firstTotalAssets: 10n ** 30n,
      canPullFromIdle: false,
      canPullFromMarket: true,
    });

  const createTestContext = () => ({
    donatedPenaltyAssets: {},
    firstTotalAssets: {},
  });

  const applyPlanAtTimestamp = ({
    data,
    reallocations,
    timestamp,
  }: {
    readonly data: VaultV2BlueReallocationData;
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly timestamp: bigint;
  }) => {
    let simulated = data.clone();
    let context = createTestContext();
    for (const reallocation of reallocations) {
      // biome-ignore lint/complexity/useLiteralKeys: exercise the simulated onchain transition at inclusion time.
      const transition = simulated["applyPublicReallocation"]({
        context,
        reallocation,
        targetMarketId: targetParams.id,
        timestamp,
      });
      simulated = transition.data;
      context = transition.context;
    }
    return simulated;
  };

  const applyPlanAtCapHorizon = (
    data: VaultV2BlueReallocationData,
    reallocations: readonly VaultV2BlueReallocation[],
  ) =>
    applyPlanAtTimestamp({
      data,
      reallocations,
      timestamp: TIMESTAMP + DEFAULT_CAP_ACCRUAL_BUFFER,
    });

  const expectTargetCapsAtHorizon = (
    data: VaultV2BlueReallocationData,
    reallocations: readonly VaultV2BlueReallocation[],
  ) => {
    const simulated = applyPlanAtCapHorizon(data, reallocations);
    for (const id of data.getAdapter(VAULT, TARGET_ADAPTER).ids(targetParams)) {
      const { allocation, absoluteCap } = simulated.getAllocation(VAULT, id);
      expect(allocation).toBeLessThanOrEqual(absoluteCap);
    }
  };

  test("behavior: carries source interest reserve into later legs on shared cap ids", () => {
    const makeMultiLegFixture = (adapterAbsoluteCap: bigint) =>
      makeFixture({
        sourceAdapter: TARGET_ADAPTER,
        sourceSupply: capTestTargetSupply,
        sourceBorrow: (capTestTargetSupply * 3n) / 5n,
        sourceRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
        sourceAbsoluteCap: 10n ** 30n,
        targetSupply: capTestTargetSupply,
        targetBorrow: capTestTargetSupply / 2n,
        targetRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
        targetPositionAssets: capTestTargetSupply,
        targetCaps: [
          { absoluteCap: adapterAbsoluteCap, relativeCap: MathLib.WAD },
          { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
          { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
        ],
        allocatorTargetCap: 10n ** 30n,
        firstTotalAssets: 10n ** 30n,
        idle: capTestTargetSupply,
        canPullFromIdle: true,
        canPullFromMarket: true,
      });
    const probe = makeMultiLegFixture(10n ** 30n);
    const adapter = probe.data.getAdapter(VAULT, TARGET_ADAPTER);
    const targetAdapterCapId = adapter.ids(targetParams)[0]!;
    const capTimestamp = TIMESTAMP + DEFAULT_CAP_ACCRUAL_BUFFER;
    const targetShares = adapter.supplyShares[targetParams.id] ?? 0n;
    const sourceShares = adapter.supplyShares[sourceParams.id] ?? 0n;
    const targetMarket = probe.data.getMarket(targetParams.id);
    const sourceMarket = probe.data.getMarket(sourceParams.id);
    const targetInterest = MathLib.zeroFloorSub(
      targetMarket.accrueInterest(capTimestamp).toSupplyAssets(targetShares),
      targetMarket.accrueInterest(TIMESTAMP).toSupplyAssets(targetShares),
    );
    const sourceInterest = MathLib.zeroFloorSub(
      sourceMarket.accrueInterest(capTimestamp).toSupplyAssets(sourceShares),
      sourceMarket.accrueInterest(TIMESTAMP).toSupplyAssets(sourceShares),
    );
    const idleHeadroom = 10n ** 22n;
    const absoluteCap =
      probe.data.getAllocation(VAULT, targetAdapterCapId).allocation +
      targetInterest +
      sourceInterest +
      idleHeadroom;
    const { data } = makeMultiLegFixture(absoluteCap);

    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
    );
    const allocationAtTimestamp = applyPlanAtTimestamp({
      data,
      reallocations,
      timestamp: TIMESTAMP,
    }).getAllocation(VAULT, targetAdapterCapId).allocation;

    expect(targetInterest).toBeGreaterThan(0n);
    expect(sourceInterest).toBeGreaterThan(0n);
    expect(reallocations.map(({ from }) => from.type)).toEqual([
      "market",
      "idle",
    ]);
    expect(reallocations[1]?.assets).toBe(idleHeadroom);
    expect(allocationAtTimestamp).toBe(
      absoluteCap - targetInterest - sourceInterest,
    );
    expectTargetCapsAtHorizon(data, reallocations);
  });

  test("behavior: freezes pre-plan target reserve across legs", () => {
    const idleAssets = (capTestTargetSupply * 3n) / 10n;
    const marketHeadroom = 10n ** 20n;
    const makeMultiLegFixture = (marketAbsoluteCap: bigint) =>
      makeFixture({
        sourceSupply: (capTestTargetSupply * 9n) / 20n,
        sourceBorrow: (capTestTargetSupply * 9n) / 40n,
        sourceRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
        sourceAbsoluteCap: 10n ** 30n,
        targetSupply: capTestTargetSupply,
        targetBorrow: capTestTargetSupply / 2n,
        targetRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
        targetPositionAssets: capTestTargetSupply,
        targetCaps: [
          { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
          { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
          { absoluteCap: marketAbsoluteCap, relativeCap: MathLib.WAD },
        ],
        allocatorTargetCap: 10n ** 30n,
        firstTotalAssets: 10n ** 30n,
        idle: idleAssets,
        canPullFromIdle: true,
        canPullFromMarket: true,
      });
    const probe = makeMultiLegFixture(10n ** 30n);
    const adapter = probe.data.getAdapter(VAULT, TARGET_ADAPTER);
    const targetShares = adapter.supplyShares[targetParams.id] ?? 0n;
    const targetMarket = probe.data.getMarket(targetParams.id);
    const targetInterest = MathLib.zeroFloorSub(
      targetMarket
        .accrueInterest(TIMESTAMP + DEFAULT_CAP_ACCRUAL_BUFFER)
        .toSupplyAssets(targetShares),
      targetMarket.accrueInterest(TIMESTAMP).toSupplyAssets(targetShares),
    );
    const absoluteCap =
      probe.data.getAllocation(VAULT, probe.targetAdapterMarketCapId)
        .allocation +
      targetInterest +
      idleAssets +
      marketHeadroom;
    const { data, targetAdapterMarketCapId } = makeMultiLegFixture(absoluteCap);

    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
    );
    const allocationAtTimestamp = applyPlanAtTimestamp({
      data,
      reallocations,
      timestamp: TIMESTAMP,
    }).getAllocation(VAULT, targetAdapterMarketCapId).allocation;

    expect(targetInterest).toBeGreaterThan(0n);
    expect(reallocations.map(({ from }) => from.type)).toEqual([
      "idle",
      "market",
    ]);
    expect(reallocations[0]?.assets).toBe(idleAssets);
    expect(reallocations[1]?.assets).toBe(marketHeadroom);
    expect(allocationAtTimestamp).toBe(absoluteCap - targetInterest);
    expect(
      data.getAllocation(VAULT, targetAdapterMarketCapId).absoluteCap,
    ).toBeGreaterThan(0n);
    expectTargetCapsAtHorizon(data, reallocations);
  });

  test("behavior: skips source accrual projection sharing no capped id", () => {
    const { data } = makeFixture({ sourceBorrow: 1n });
    const snapshot = new VaultV2BlueReallocationData({
      ...data,
      markets: {
        ...data.markets,
        [sourceParams.id]: new Market({
          ...data.getMarket(sourceParams.id),
          rateAtTarget: undefined,
        }),
      },
    });

    const { reallocations } = snapshot.computeVaultV2BlueReallocations(
      targetParams.id,
      { timestamp: TIMESTAMP },
    );

    expect(reallocations.some(({ from }) => from.type === "market")).toBe(true);
  });

  test.each(["idle", "market"] as const)(
    "behavior: reserves target-market accrual under absolute caps for %s reallocations",
    (sourceType) => {
      const { data, absoluteCap } = makeCapTestFixture(sourceType);
      const targetShares =
        data.getAdapter(VAULT, TARGET_ADAPTER).supplyShares[targetParams.id] ??
        0n;
      const accruedTargetMarket = data
        .getMarket(targetParams.id)
        .accrueInterest(TIMESTAMP + DEFAULT_CAP_ACCRUAL_BUFFER);
      const expectedAccruedAllocation =
        accruedTargetMarket.toSupplyAssets(targetShares);
      const expectedBufferedAssets = absoluteCap - expectedAccruedAllocation;
      const defaultResult = data.computeVaultV2BlueReallocations(
        targetParams.id,
      );
      const defaultPlan = defaultResult.reallocations[0]!;
      const zeroBufferPlan = data.computeVaultV2BlueReallocations(
        targetParams.id,
        { capAccrualBuffer: 0n },
      ).reallocations[0]!;

      expect(accruedTargetMarket.totalSupplyAssets).toBeGreaterThan(
        data.getMarket(targetParams.id).totalSupplyAssets,
      );
      expect(defaultPlan.from.type).toBe(sourceType);
      expect(defaultPlan.assets).toBeLessThan(capTestHeadroom);
      expect(defaultPlan.assets).toBe(expectedBufferedAssets);
      expect(defaultResult.data.getMarket(targetParams.id).lastUpdate).toBe(
        TIMESTAMP,
      );
      expect(zeroBufferPlan.from.type).toBe(sourceType);
      expect(zeroBufferPlan.assets).toBe(capTestHeadroom);
    },
  );

  test("behavior: reserves target accrual in allocator max-in", () => {
    const makeAllocatorFixture = (targetAbsoluteCap: bigint) =>
      makeFixture({
        sourceSupply: 1_000n,
        sourceAbsoluteCap: 10n ** 30n,
        targetSupply: capTestTargetSupply,
        targetBorrow: capTestTargetSupply / 2n,
        targetRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
        targetPositionAssets: capTestTargetSupply,
        targetCaps: [
          { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
          { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
          { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
        ],
        allocatorTargetCap: targetAbsoluteCap,
        firstTotalAssets: 10n ** 30n,
        idle: capTestTargetSupply,
        canPullFromIdle: true,
        canPullFromMarket: false,
      });
    const probe = makeAllocatorFixture(10n ** 30n);
    const targetMarket = probe.data.getMarket(targetParams.id);
    const targetShares =
      probe.data.getAdapter(VAULT, TARGET_ADAPTER).supplyShares[
        targetParams.id
      ] ?? 0n;
    const targetInterest = MathLib.zeroFloorSub(
      targetMarket
        .accrueInterest(TIMESTAMP + DEFAULT_CAP_ACCRUAL_BUFFER)
        .toSupplyAssets(targetShares),
      targetMarket.accrueInterest(TIMESTAMP).toSupplyAssets(targetShares),
    );
    const smallHeadroom = targetInterest * 2n + 1n;
    const allocatorTargetCap =
      probe.data.getAllocation(VAULT, probe.targetAdapterMarketCapId)
        .allocation + smallHeadroom;
    const { data } = makeAllocatorFixture(allocatorTargetCap);
    const defaultPlan = data.computeVaultV2BlueReallocations(targetParams.id)
      .reallocations[0]!;
    const zeroBufferPlan = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { capAccrualBuffer: 0n },
    ).reallocations[0]!;

    expect(targetInterest).toBeGreaterThan(0n);
    expect(zeroBufferPlan.assets).toBe(smallHeadroom);
    expect(defaultPlan.assets).toBe(zeroBufferPlan.assets - targetInterest);
  });

  test("behavior: reserves source interest on shared adapter cap ids", () => {
    const initialFixture = makeSharedCapTestFixture(10n ** 30n);
    const adapter = initialFixture.data.getAdapter(VAULT, TARGET_ADAPTER);
    const targetAdapterCapId = adapter.ids(targetParams)[0]!;
    const targetMarket = initialFixture.data.getMarket(targetParams.id);
    const sourceMarket = initialFixture.data.getMarket(sourceParams.id);
    const targetShares = adapter.supplyShares[targetParams.id] ?? 0n;
    const sourceShares = adapter.supplyShares[sourceParams.id] ?? 0n;
    const capTimestamp = TIMESTAMP + DEFAULT_CAP_ACCRUAL_BUFFER;
    const targetInterest = MathLib.zeroFloorSub(
      targetMarket.accrueInterest(capTimestamp).toSupplyAssets(targetShares),
      targetMarket.toSupplyAssets(targetShares),
    );
    const sourceInterest = MathLib.zeroFloorSub(
      sourceMarket.accrueInterest(capTimestamp).toSupplyAssets(sourceShares),
      sourceMarket.toSupplyAssets(sourceShares),
    );
    const currentAllocation = initialFixture.data.getAllocation(
      VAULT,
      targetAdapterCapId,
    ).allocation;
    const limitedAdapterCap =
      currentAllocation + targetInterest + sourceInterest / 2n;
    const limitedData = makeSharedCapTestFixture(limitedAdapterCap).data;
    const defaultPlan = limitedData.computeVaultV2BlueReallocations(
      targetParams.id,
    );
    const zeroBufferPlan = limitedData.computeVaultV2BlueReallocations(
      targetParams.id,
      { capAccrualBuffer: 0n },
    );
    const sufficientCapData = makeSharedCapTestFixture(
      currentAllocation + targetInterest + sourceInterest + 1n,
    ).data;
    const sufficientCapPlan = sufficientCapData.computeVaultV2BlueReallocations(
      targetParams.id,
    );

    expect(sourceInterest).toBeGreaterThan(0n);
    expect(
      defaultPlan.reallocations.some(({ from }) => from.type === "market"),
    ).toBe(false);
    expect(
      zeroBufferPlan.reallocations.some(({ from }) => from.type === "market"),
    ).toBe(true);
    expect(
      sufficientCapPlan.reallocations.some(
        ({ from }) => from.type === "market",
      ),
    ).toBe(true);
  });

  test.each(["borrow", "withdraw"] as const)(
    "behavior: reserves target-market accrual for %s operation plans",
    (type) => {
      const { data, absoluteCap } = makeCapTestFixture("idle");
      const targetShares =
        data.getAdapter(VAULT, TARGET_ADAPTER).supplyShares[targetParams.id] ??
        0n;
      const accruedTargetMarket = data
        .getMarket(targetParams.id)
        .accrueInterest(TIMESTAMP + DEFAULT_CAP_ACCRUAL_BUFFER);
      const expectedBufferedAssets =
        absoluteCap - accruedTargetMarket.toSupplyAssets(targetShares);
      const operation = {
        type,
        amount: capTestTargetSupply / 2n,
      };
      const defaultPlan = data.computeVaultV2BlueReallocations(
        targetParams.id,
        { operation, allocatorCapHeadroom: 0n },
      ).reallocations[0]!;
      const zeroBufferPlan = data.computeVaultV2BlueReallocations(
        targetParams.id,
        { operation, capAccrualBuffer: 0n, allocatorCapHeadroom: 0n },
      ).reallocations[0]!;

      expect(defaultPlan.assets).toBe(expectedBufferedAssets);
      expect(zeroBufferPlan.assets).toBe(capTestHeadroom);
    },
  );

  test("behavior: fallback pass sizes with the frozen pre-plan reserve", () => {
    const sourceSupply = capTestTargetSupply * 10_000n;
    const targetMarketSupply = capTestTargetSupply * 1_000_000n;
    const targetPositionAssets = capTestTargetSupply * 100n;
    const operationAmount = capTestTargetSupply * 4_000n;
    const makeFallbackFixture = (targetAbsoluteCap: bigint) =>
      makeFixture({
        sourceAdapter: TARGET_ADAPTER,
        sourceSupply,
        sourceBorrow: (sourceSupply * 3n) / 5n,
        sourceRateAtTarget: (MathLib.WAD * 20n) / Time.s.from.y(1n),
        sourceAbsoluteCap: 10n ** 30n,
        targetSupply: targetMarketSupply,
        targetBorrow: (targetMarketSupply * 999n) / 1_000n,
        targetRateAtTarget: MathLib.WAD / (10n * Time.s.from.y(1n)),
        targetPositionAssets,
        targetCaps: [
          { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
          { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
          { absoluteCap: targetAbsoluteCap, relativeCap: MathLib.WAD },
        ],
        allocatorTargetCap: 10n ** 30n,
        firstTotalAssets: 10n ** 30n,
        idle: 0n,
        canPullFromIdle: false,
        canPullFromMarket: true,
      });
    const probe = makeFallbackFixture(10n ** 30n);
    const targetAdapterMarketCapId = probe.targetAdapterMarketCapId;
    const capTimestamp = TIMESTAMP + DEFAULT_CAP_ACCRUAL_BUFFER;
    const targetMarket = probe.data.getMarket(targetParams.id);
    const targetShares =
      probe.data.getAdapter(VAULT, TARGET_ADAPTER).supplyShares[
        targetParams.id
      ] ?? 0n;
    const reservePrePlan = MathLib.zeroFloorSub(
      targetMarket.accrueInterest(capTimestamp).toSupplyAssets(targetShares),
      targetMarket.accrueInterest(TIMESTAMP).toSupplyAssets(targetShares),
    );
    const operationMarket = targetMarket.accrueInterest(TIMESTAMP);
    const operationShortfall = MathLib.zeroFloorSub(
      operationMarket.totalBorrowAssets + operationAmount,
      operationMarket.totalSupplyAssets,
    );
    const initialAllocation = probe.data.getAllocation(
      VAULT,
      targetAdapterMarketCapId,
    ).allocation;
    const absoluteCap =
      initialAllocation + operationShortfall + reservePrePlan + 1n;
    const { data } = makeFallbackFixture(absoluteCap);
    const maxWithdrawalUtilization = (MathLib.WAD * 7n) / 10n;
    const friendlyOnly = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxWithdrawalUtilization,
    });
    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      operation: {
        type: "borrow",
        amount: operationAmount,
      },
      maxWithdrawalUtilization,
    });
    const plannedData = applyPlanAtTimestamp({
      data,
      reallocations: result.reallocations,
      timestamp: TIMESTAMP,
    });
    expect(reservePrePlan).toBeGreaterThan(0n);
    expect(result.reallocations.length).toBeGreaterThan(
      friendlyOnly.reallocations.length,
    );
    expect(
      plannedData.getAllocation(VAULT, targetAdapterMarketCapId).allocation,
    ).toBe(initialAllocation + operationShortfall);
    expect(
      plannedData.getAllocation(VAULT, targetAdapterMarketCapId).allocation,
    ).toBeLessThanOrEqual(absoluteCap - reservePrePlan);
    expectTargetCapsAtHorizon(data, result.reallocations);
  });

  test("error: validates a negative cap-accrual buffer before an early return", () => {
    const { data } = makeCapTestFixture("idle");

    expect(() =>
      data.getAvailableLiquidityToUtilization(
        targetParams.id,
        800_000_000_000_000_000n,
        { capAccrualBuffer: -1n },
      ),
    ).toThrow(NegativeInputError);
  });

  test("behavior: skips buffered accrual for a target with an ineligible IRM", () => {
    const { data } = makeFixture({
      targetAdaptiveCurveIrm: OTHER_IRM,
      sourceAdaptiveCurveIrm: OTHER_IRM,
      targetBorrow: 1n,
    });
    const snapshot = new VaultV2BlueReallocationData({
      ...data,
      markets: {
        ...data.markets,
        [targetParams.id]: new Market({
          ...data.getMarket(targetParams.id),
          rateAtTarget: undefined,
        }),
      },
    });

    expect(
      snapshot.computeVaultV2BlueReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
      }).reallocations,
    ).toEqual([]);
  });

  test("behavior: getPublicReallocationLiquidity uses buffered planning", () => {
    const { data } = makeCapTestFixture("idle");
    const defaultPlanAssets = data
      .computeVaultV2BlueReallocations(targetParams.id)
      .reallocations.reduce((total, { assets }) => total + assets, 0n);

    expect(data.getPublicReallocationLiquidity(targetParams.id)).toBe(
      defaultPlanAssets,
    );
    expect(
      data.getPublicReallocationLiquidity(targetParams.id, {
        capAccrualBuffer: 0n,
      }),
    ).toBe(capTestHeadroom);
    expect(() =>
      data.getPublicReallocationLiquidity(targetParams.id, {
        capAccrualBuffer: -1n,
      }),
    ).toThrow(NegativeInputError);
  });

  test("behavior: reserves buffered caps in utilization liquidity", () => {
    const { data } = makeCapTestFixture("idle");
    const market = data.getMarket(targetParams.id).accrueInterest(TIMESTAMP);
    const defaultLiquidity = data.getAvailableLiquidityToUtilization(
      targetParams.id,
    );
    const zeroBufferLiquidity = data.getAvailableLiquidityToUtilization(
      targetParams.id,
      undefined,
      { capAccrualBuffer: 0n },
    );

    expect(defaultLiquidity).toBeLessThan(zeroBufferLiquidity);
    expect(zeroBufferLiquidity).toBe(
      MarketUtils.getBorrowToUtilization(
        {
          totalSupplyAssets: market.totalSupplyAssets + capTestHeadroom,
          totalBorrowAssets: market.totalBorrowAssets,
        },
        (MathLib.WAD * 9n) / 10n,
      ),
    );
  });

  test("behavior: cap-accrual buffer does not loosen a binding relative cap", () => {
    const targetRelativeCapacity = capTestTargetSupply + capTestHeadroom;
    const { data } = makeFixture({
      sourceSupply: 1_000n,
      sourceAbsoluteCap: 10n ** 30n,
      targetSupply: capTestTargetSupply,
      targetBorrow: capTestTargetSupply / 2n,
      targetRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
      targetPositionAssets: capTestTargetSupply,
      targetCaps: [
        { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
        { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
        { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD / 2n },
      ],
      allocatorTargetCap: 10n ** 30n,
      firstTotalAssets: targetRelativeCapacity * 2n,
      idle: capTestTargetSupply + 2n * capTestHeadroom,
      canPullFromIdle: true,
      canPullFromMarket: false,
      maxRate: MathLib.WAD,
    });
    const defaultPlan = data.computeVaultV2BlueReallocations(targetParams.id)
      .reallocations[0]!;
    const zeroBufferPlan = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { capAccrualBuffer: 0n },
    ).reallocations[0]!;

    expect(zeroBufferPlan.assets).toBe(capTestHeadroom);
    expect(defaultPlan.assets).toBeLessThan(zeroBufferPlan.assets);
  });

  test("behavior: buffered plan stays under cap at the buffer horizon and unbuffered plan reproduces cap overflow", () => {
    const { data, targetAdapterMarketCapId, absoluteCap } =
      makeCapTestFixture("idle");
    const defaultPlan = data.computeVaultV2BlueReallocations(targetParams.id)
      .reallocations[0]!;
    const zeroBufferPlan = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { capAccrualBuffer: 0n },
    ).reallocations[0]!;

    // biome-ignore lint/complexity/useLiteralKeys: exercise the simulated onchain transition at inclusion time.
    const bufferedTransition = data.clone()["applyPublicReallocation"]({
      context: createTestContext(),
      reallocation: defaultPlan,
      targetMarketId: targetParams.id,
      timestamp: TIMESTAMP + DEFAULT_CAP_ACCRUAL_BUFFER,
    });
    // biome-ignore lint/complexity/useLiteralKeys: exercise the simulated onchain transition at inclusion time.
    const unbufferedTransition = data.clone()["applyPublicReallocation"]({
      context: createTestContext(),
      reallocation: zeroBufferPlan,
      targetMarketId: targetParams.id,
      timestamp: TIMESTAMP + 1n,
    });

    expect(
      bufferedTransition.data.getAllocation(VAULT, targetAdapterMarketCapId)
        .allocation,
    ).toBeLessThanOrEqual(absoluteCap);
    expect(
      unbufferedTransition.data.getAllocation(VAULT, targetAdapterMarketCapId)
        .allocation,
    ).toBeGreaterThan(absoluteCap);
  });

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
    const context = createTestContext();

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
    expect(transition.firstTotalAssets).toBe(data.getVault(VAULT)._totalAssets);
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
      context: createTestContext(),
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
        context: createTestContext(),
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
        context: createTestContext(),
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

  test("behavior: ignores unsupported markets outside the reallocation plan", () => {
    const { data, sourceExpectedAssets } = makeFixture();
    const unsupportedMarket = new Market({
      ...data.getMarket(sourceParams.id),
      params: new MarketParams({ ...sourceParams, irm: OTHER_IRM }),
      totalBorrowAssets: 1n,
      totalBorrowShares: 1n,
      rateAtTarget: undefined,
    });
    const snapshot = new VaultV2BlueReallocationData({
      ...data,
      markets: { ...data.markets, [unsupportedMarket.id]: unsupportedMarket },
    });

    expect(
      snapshot.computeVaultV2BlueReallocations(targetParams.id, {
        timestamp: TIMESTAMP + 1n,
      }).reallocations[0]?.assets,
    ).toBe(sourceExpectedAssets);
  });

  test.each([
    ["allocator capacity", { allocatorTargetCap: 0n }],
    [
      "adapter absolute capacity",
      {
        idle: 1n,
        targetPositionAssets: 100n,
        targetCaps: [
          { absoluteCap: 100n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        ],
      },
    ],
    [
      "collateral absolute capacity",
      {
        idle: 1n,
        targetPositionAssets: 100n,
        targetCaps: [
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 100n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        ],
      },
    ],
    [
      "adapter relative capacity",
      {
        idle: 1n,
        targetCaps: [
          { absoluteCap: 10_000n, relativeCap: 0n },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        ],
      },
    ],
    [
      "collateral relative capacity",
      {
        idle: 1n,
        targetCaps: [
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: 0n },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        ],
      },
    ],
    [
      "market absolute capacity",
      {
        targetPositionAssets: 100n,
        targetCaps: [
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 100n, relativeCap: MathLib.WAD },
        ],
      },
    ],
    [
      "market relative capacity",
      {
        targetCaps: [
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: 0n },
        ],
      },
    ],
    [
      "rounding-only relative capacity",
      {
        targetSupply: 2n,
        targetTotalSupplyShares: 1_000_000n,
        targetCaps: [
          { absoluteCap: 10_000n, relativeCap: 0n },
          { absoluteCap: 10_000n, relativeCap: 0n },
          { absoluteCap: 10_000n, relativeCap: 0n },
        ],
      },
    ],
    [
      "uint128 supply share capacity",
      { targetTotalSupplyShares: MathLib.MAX_UINT_128 },
    ],
    [
      "supply share minting",
      { targetSupply: 2_000_000n, targetTotalSupplyShares: 0n, idle: 300n },
    ],
    [
      "uint128 supply capacity",
      {
        targetSupply: MathLib.MAX_UINT_128,
        targetTotalSupplyShares: MathLib.MAX_UINT_128,
      },
    ],
  ] satisfies readonly (readonly [string, FixtureOptions])[])(
    "behavior: skips unsupported source IRM with zero target %s",
    (_, options) => {
      const { data } = makeFixture({ ...options, sourceBorrow: 1n });
      const snapshot = new VaultV2BlueReallocationData({
        ...data,
        markets: {
          ...data.markets,
          [sourceParams.id]: new Market({
            ...data.getMarket(sourceParams.id),
            rateAtTarget: undefined,
          }),
        },
      });

      expect(
        snapshot.computeVaultV2BlueReallocations(targetParams.id, {
          timestamp: TIMESTAMP + 1n,
        }).reallocations,
      ).toEqual([]);
    },
  );

  test.each([0n, -2n])(
    "behavior: respects full target absolute caps with %s untracked assets",
    (targetUntracked) => {
      const { data, targetAdapterMarketCapId } = makeFixture({
        targetSupply: 5n,
        targetTotalSupplyShares: 1_000_000n,
        targetPositionAssets: 3n,
        targetUntracked,
        sourceSupply: 1n,
        targetCaps: [
          { absoluteCap: 3n, relativeCap: MathLib.WAD },
          { absoluteCap: 3n, relativeCap: MathLib.WAD },
          { absoluteCap: 3n, relativeCap: MathLib.WAD },
        ],
      });

      const result = data.computeVaultV2BlueReallocations(targetParams.id);

      expect(result.reallocations).toEqual([]);
      expect(
        result.data.getAllocation(VAULT, targetAdapterMarketCapId).allocation,
      ).toBe(3n - targetUntracked);
    },
  );

  test("behavior: tracks target share value above requested assets", () => {
    const { data, targetAdapterMarketCapId } = makeFixture({
      targetSupply: 5n,
      targetTotalSupplyShares: 1_000_000n,
      targetPositionAssets: 3n,
      targetUntracked: 2n,
      idle: 1n,
      targetCaps: [
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
      ],
    });
    const oldAllocation = data.getAllocation(
      VAULT,
      targetAdapterMarketCapId,
    ).allocation;
    const assets = 1n;

    // biome-ignore lint/complexity/useLiteralKeys: inspect the simulated transition's target-cap accounting.
    const transition = data["applyPublicReallocation"]({
      context: createTestContext(),
      reallocation: {
        vault: VAULT,
        from: { type: "idle" },
        to: { adapter: TARGET_ADAPTER },
        assets,
        penalty: 0n,
      },
      targetMarketId: targetParams.id,
      timestamp: TIMESTAMP,
    });
    const targetAdapter = transition.data.getAdapter(VAULT, TARGET_ADAPTER);
    const targetMarket = transition.data.getMarket(targetParams.id);
    const targetShares = targetAdapter.supplyShares[targetParams.id] ?? 0n;
    const trackedAllocation = transition.data.getAllocation(
      VAULT,
      targetAdapterMarketCapId,
    ).allocation;

    expect(trackedAllocation).toBe(targetMarket.toSupplyAssets(targetShares));
    expect(trackedAllocation).toBeGreaterThan(oldAllocation + assets);
  });

  test("behavior: blocks allocation growth under zero target relative caps", () => {
    const { data } = makeFixture({
      targetSupply: 2n,
      targetTotalSupplyShares: 1_000_000n,
      sourceSupply: 1n,
      targetCaps: [
        { absoluteCap: 10_000n, relativeCap: 0n },
        { absoluteCap: 10_000n, relativeCap: 0n },
        { absoluteCap: 10_000n, relativeCap: 0n },
      ],
    });

    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
    );

    expect(reallocations).toEqual([]);
  });

  test.each([
    [
      "adapter",
      {
        sourceAdapter: TARGET_ADAPTER,
        targetCaps: [
          { absoluteCap: 1_100n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        ],
      },
    ],
    [
      "collateral",
      {
        sourceMarketParams: new MarketParams({
          ...sourceParams,
          collateralToken: targetParams.collateralToken,
        }),
        targetCaps: [
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 1_100n, relativeCap: MathLib.WAD },
          { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        ],
      },
    ],
  ] satisfies readonly (readonly [string, FixtureOptions])[])(
    "behavior: source withdrawal frees a full shared %s cap",
    (_, options) => {
      const { data, sourceExpectedAssets } = makeFixture({
        ...options,
        targetPositionAssets: 100n,
      });

      const { reallocations } = data.computeVaultV2BlueReallocations(
        targetParams.id,
        { timestamp: TIMESTAMP + 1n },
      );

      expect(reallocations).toHaveLength(1);
      expect(reallocations[0]?.assets).toBe(sourceExpectedAssets);
      expect(reallocations[0]?.from.type).toBe("market");
    },
  );

  test("behavior: skips unsupported zero-share sources", () => {
    const { data } = makeFixture({
      sourceBorrow: 1n,
      sourcePositionShares: 0n,
      // Keep tracked allocations positive to reach the zero-share guard.
      sourceUntracked: -1n,
    });
    const snapshot = new VaultV2BlueReallocationData({
      ...data,
      markets: {
        ...data.markets,
        [sourceParams.id]: new Market({
          ...data.getMarket(sourceParams.id),
          rateAtTarget: undefined,
        }),
      },
    });

    expect(
      snapshot.computeVaultV2BlueReallocations(targetParams.id, {
        timestamp: TIMESTAMP + 1n,
      }).reallocations,
    ).toEqual([]);
  });

  test("error: UnsupportedMarketIrmError when source projection is required", () => {
    const { data } = makeFixture({ sourceBorrow: 1n });
    const snapshot = new VaultV2BlueReallocationData({
      ...data,
      markets: {
        ...data.markets,
        [sourceParams.id]: new Market({
          ...data.getMarket(sourceParams.id),
          rateAtTarget: undefined,
        }),
      },
    });

    expect(() =>
      snapshot.computeVaultV2BlueReallocations(targetParams.id, {
        timestamp: TIMESTAMP + 1n,
      }),
    ).toThrow(UnsupportedMarketIrmError);
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

  test("behavior: deep-clones accrued adapters and isolates source-market probes", () => {
    const { data, targetAdapterMarketCapId } = makeFixture();
    const targetMarket = data.getMarket(targetParams.id);
    const sourceMarket = new Market({ ...data.getMarket(sourceParams.id) });
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
    const siblingV2Adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        address: SIBLING_SOURCE_ADAPTER_V2,
        parentVault: VAULT,
        skimRecipient: zeroAddress,
        marketIds: [sourceMarket.id],
        adaptiveCurveIrm: OTHER_IRM,
        supplyShares: { [sourceMarket.id]: 0n },
      },
      [sourceMarket],
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
    const nestedSourcePosition = new AccrualPosition(
      {
        user: NESTED_VAULT,
        supplyShares: 0n,
        borrowShares: 0n,
        collateral: 0n,
      },
      sourceMarket,
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
          },
          position: nestedPosition,
        },
        {
          config: {
            vault: NESTED_VAULT,
            marketId: sourceMarket.id,
            cap: 1_000n,
            pendingCap: { value: 0n, validAt: 0n },
            removableAt: 0n,
            enabled: true,
          },
          position: nestedSourcePosition,
        },
      ],
    );
    const nestedAdapter = new AccrualVaultV2MorphoVaultV1Adapter(
      {
        address: VAULT_V1_ADAPTER,
        parentVault: VAULT,
        skimRecipient: zeroAddress,
        morphoVaultV1: NESTED_VAULT,
        parentAllocation: 25n,
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
      [
        ...fixtureVault.accrualAdapters,
        siblingV2Adapter,
        legacyAdapter,
        nestedAdapter,
      ],
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
    const inputSiblingV2 = input
      .getVault(VAULT)
      .accrualAdapters.find(
        (adapter): adapter is AccrualVaultV2MorphoMarketV1AdapterV2 =>
          adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2 &&
          isAddressEqual(adapter.address, SIBLING_SOURCE_ADAPTER_V2),
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
    expect(clonedNested?.parentAllocation).toBe(25n);

    // biome-ignore lint/complexity/useLiteralKeys: exercise probe isolation directly.
    const probe = input["applyPublicReallocation"]({
      context: createTestContext(),
      reallocation: {
        vault: VAULT,
        from: {
          type: "market",
          adapter: SOURCE_ADAPTER,
          marketParams: sourceParams,
        },
        to: { adapter: TARGET_ADAPTER },
        assets: 2n,
        penalty: 0n,
      },
      targetMarketId: targetMarket.id,
      timestamp: TIMESTAMP,
      probe: true,
    }).data;
    const probedSourceMarket = probe.getMarket(sourceMarket.id);
    const probedSiblingV2 = probe
      .getVault(VAULT)
      .accrualAdapters.find(
        (adapter): adapter is AccrualVaultV2MorphoMarketV1AdapterV2 =>
          adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2 &&
          isAddressEqual(adapter.address, SIBLING_SOURCE_ADAPTER_V2),
      );
    const probedNested = probe
      .getVault(VAULT)
      .accrualAdapters.find(
        (adapter) => adapter instanceof AccrualVaultV2MorphoVaultV1Adapter,
      );
    expect(probedSiblingV2?.markets[0]).toStrictEqual(probedSourceMarket);
    expect(
      probedNested?.accrualVaultV1.allocations.get(sourceMarket.id)?.position
        .market,
    ).toStrictEqual(probedSourceMarket);
    expect(inputSiblingV2?.markets[0]?.totalSupplyAssets).toBe(
      sourceMarket.totalSupplyAssets,
    );
    expect(
      inputNested?.accrualVaultV1.allocations.get(sourceMarket.id)?.position
        .market.totalSupplyAssets,
    ).toBe(sourceMarket.totalSupplyAssets);

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

  test("behavior: refreshes sibling adapters sharing the probed source market", () => {
    const { data } = makeFixture({
      sourceSupply: 6_464n,
      sourceTotalSupplyShares: 10_000n,
      sourcePositionShares: 5_157n,
      siblingSourcePosition: {
        address: SIBLING_SOURCE_ADAPTER,
        supplyShares: 4_843n,
      },
      targetSupply: 0n,
      firstTotalAssets: 100n,
      targetCaps: [
        { absoluteCap: 2n, relativeCap: MathLib.WAD / 32n },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
      ],
    });

    const result = data.computeVaultV2BlueReallocations(targetParams.id);
    const sourceMarket = result.data.getMarket(sourceParams.id);
    const siblingAdapter = result.data
      .getVault(VAULT)
      .accrualAdapters.find(
        (adapter): adapter is AccrualVaultV2MorphoMarketV1Adapter =>
          adapter instanceof AccrualVaultV2MorphoMarketV1Adapter &&
          isAddressEqual(adapter.address, SIBLING_SOURCE_ADAPTER),
      );

    expect(result.reallocations[0]?.assets).toBe(2n);
    expect(siblingAdapter?.positions[0]?.market.totalSupplyAssets).toBe(
      sourceMarket.totalSupplyAssets,
    );
    expect(siblingAdapter?.positions[0]?.market.totalSupplyShares).toBe(
      sourceMarket.totalSupplyShares,
    );
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

  test("behavior: conservatively omits rounding-only shared-cap liquidity", () => {
    const { data, sourceAdapterCapId } = makeFixture({
      sourceAdapter: TARGET_ADAPTER,
      sourceSupply: 8n,
      targetSupply: 1n,
      targetTotalSupplyShares: 1_000_001n,
      targetPositionAssets: 0n,
      targetCaps: [
        { absoluteCap: 7n, relativeCap: MathLib.WAD },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
      ],
    });

    // biome-ignore lint/complexity/useLiteralKeys: inspect the share-based allocation rejected by conservative cap tracking.
    const transition = data["applyPublicReallocation"]({
      context: createTestContext(),
      reallocation: {
        vault: VAULT,
        from: {
          type: "market",
          adapter: TARGET_ADAPTER,
          marketParams: sourceParams,
        },
        to: { adapter: TARGET_ADAPTER },
        assets: 7n,
        penalty: 0n,
      },
      targetMarketId: targetParams.id,
      timestamp: TIMESTAMP,
      probe: true,
    });

    expect(
      transition.data.getAllocation(VAULT, sourceAdapterCapId).allocation,
    ).toBe(8n);
    const adapter = transition.data.getAdapter(VAULT, TARGET_ADAPTER);
    const shareBasedAllocation =
      transition.data
        .getMarket(sourceParams.id)
        .toSupplyAssets(adapter.supplyShares[sourceParams.id] ?? 0n) +
      transition.data
        .getMarket(targetParams.id)
        .toSupplyAssets(adapter.supplyShares[targetParams.id] ?? 0n);
    expect(shareBasedAllocation).toBeLessThanOrEqual(7n);
    expect(
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
    ).toStrictEqual([]);
    expect(data.getPublicReallocationLiquidity(targetParams.id)).toBe(0n);
  });

  test("behavior: bounds rejection when no shared-cap amount is valid", () => {
    const { data } = makeFixture({
      sourceAdapter: TARGET_ADAPTER,
      sourceSupply: 1_000_000n,
      targetPositionAssets: 0n,
      allocatorTargetCap: 1_000_000n,
      targetCaps: [
        { absoluteCap: 999_999n, relativeCap: MathLib.WAD },
        { absoluteCap: 2_000_000n, relativeCap: MathLib.WAD },
        { absoluteCap: 2_000_000n, relativeCap: MathLib.WAD },
      ],
    });

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id).reallocations,
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

  test("behavior: caps an empty target at uint128 supply shares", () => {
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
    ).toBe(MathLib.MAX_UINT_128 / SharesMath.VIRTUAL_SHARES);
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

  test("behavior: caps target market supply shares at uint128", () => {
    const { data } = makeFixture({
      targetSupply: MathLib.MAX_UINT_128 / 2n,
      targetTotalSupplyShares: MathLib.MAX_UINT_128 - 100n,
    });

    const result = data.computeVaultV2BlueReallocations(targetParams.id);

    expect(result.reallocations).toHaveLength(1);
    expect(result.reallocations[0]?.assets).toBe(50n);
    expect(result.data.getMarket(targetParams.id).totalSupplyShares).toBe(
      MathLib.MAX_UINT_128,
    );
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
  const roundingCap = 88_899_561_451n;
  const makeRoundingFixture = (sourceType: "idle" | "market") => {
    const targetSupply = 10n ** 15n;
    const { data, targetAdapterMarketCapId } = makeFixture({
      sourceSupply: sourceType === "market" ? 10n ** 12n : 0n,
      sourceBorrow: sourceType === "market" ? 5n * 10n ** 11n : 0n,
      sourceAbsoluteCap: 10n ** 15n,
      targetSupply,
      targetTotalSupplyShares: targetSupply * 1_000_000n + 1n,
      targetBorrow: targetSupply - 1n,
      targetRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
      targetPositionAssets: 0n,
      targetCaps: [
        { absoluteCap: 10n ** 15n, relativeCap: MathLib.WAD },
        { absoluteCap: 10n ** 15n, relativeCap: MathLib.WAD },
        { absoluteCap: 10n ** 15n, relativeCap: MathLib.WAD },
      ],
      allocatorTargetCap: roundingCap,
      idle: sourceType === "idle" ? roundingCap + 1n : 0n,
      canPullFromIdle: true,
      canPullFromMarket: sourceType === "market",
      penalty: 0n,
    });

    return { data, targetAdapterMarketCapId };
  };

  test.each(["idle", "market"] as const)(
    "behavior: avoids a target-cap dust leg for %s reallocations",
    (sourceType) => {
      const { data, targetAdapterMarketCapId } =
        makeRoundingFixture(sourceType);
      const targetMarket = data.getMarket(targetParams.id);
      const targetAdapter = data.getAdapter(VAULT, TARGET_ADAPTER);
      const targetIds = targetAdapter.ids(targetParams);
      const operation = {
        type: "borrow" as const,
        amount: roundingCap + 1n,
      };

      expect(
        targetMarket.toSupplyAssets(
          targetMarket.toSupplyShares(roundingCap, "Down"),
          "Down",
        ),
      ).toBe(roundingCap - 1n);
      expect(targetAdapter.supplyShares[targetParams.id] ?? 0n).toBe(0n);
      for (const id of targetIds)
        expect(data.getAllocation(VAULT, id).allocation).toBe(0n);

      const result = data.computeVaultV2BlueReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
        capAccrualBuffer: 0n,
        operation,
      });

      expect(result.reallocations.map(({ assets }) => assets)).toEqual([
        roundingCap,
      ]);
      expect(result.reallocations[0]?.from.type).toBe(sourceType);
      expect(
        result.data.getAllocation(VAULT, targetAdapterMarketCapId).allocation,
      ).toBe(roundingCap);
      expect(
        result.data.getAllocation(VAULT, targetAdapterMarketCapId).allocation,
      ).toBeLessThanOrEqual(roundingCap);
    },
  );

  test("behavior: avoids a target-cap dust leg with the default buffer", () => {
    const { data, targetAdapterMarketCapId } = makeRoundingFixture("idle");
    const targetMarket = data.getMarket(targetParams.id);
    const targetAdapter = data.getAdapter(VAULT, TARGET_ADAPTER);

    expect(
      targetMarket.toSupplyAssets(
        targetMarket.toSupplyShares(roundingCap, "Down"),
        "Down",
      ),
    ).toBe(roundingCap - 1n);
    expect(targetAdapter.supplyShares[targetParams.id] ?? 0n).toBe(0n);
    for (const id of targetAdapter.ids(targetParams))
      expect(data.getAllocation(VAULT, id).allocation).toBe(0n);

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      timestamp: TIMESTAMP,
      operation: { type: "borrow", amount: roundingCap + 1n },
    });

    expect(result.reallocations.map(({ assets }) => assets)).toEqual([
      roundingCap,
    ]);
    expect(
      result.data.getAllocation(VAULT, targetAdapterMarketCapId).allocation,
    ).toBe(roundingCap);
    expect(
      result.data.getAllocation(VAULT, targetAdapterMarketCapId).allocation,
    ).toBeLessThanOrEqual(roundingCap);
  });

  test.each([
    {
      tier: "penalized",
      penalty: MathLib.WAD / 1_000n,
      expectedAssets: 71n,
    },
    { tier: "free", penalty: 0n, expectedAssets: 82n },
  ] as const)(
    "behavior: selects the nearest non-monotonic shared-cap fit ($tier tier)",
    ({ tier, penalty, expectedAssets }) => {
      const operationAmount = 72n;
      const { data } = makeFixture({
        sourceAdapter: TARGET_ADAPTER,
        sourceSupply: 761_078n,
        sourceTotalSupplyShares: 1_691_858n,
        sourcePositionShares: 1_251_351n,
        sourceUntracked: 1n,
        targetSupply: 1n,
        targetTotalSupplyShares: 1_000_001n,
        targetBorrow: 0n,
        targetPositionAssets: 0n,
        vaultLastUpdate: TIMESTAMP - 1n,
        maxRate: MathLib.WAD,
        penalty,
        allocatorTargetCap: 1_000_000n,
        sourceAbsoluteCap: 1_000_000n,
        targetCaps: [
          { absoluteCap: 353_798n, relativeCap: MathLib.WAD },
          { absoluteCap: 1_000_000n, relativeCap: MathLib.WAD },
          { absoluteCap: 1_000_000n, relativeCap: MathLib.WAD },
        ],
      });

      const result = data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: penalty,
        operation: { type: "borrow", amount: operationAmount },
      });

      const assets = result.reallocations[0]?.assets ?? 0n;
      expect(assets).toBe(expectedAssets);
      if (tier === "free") expect(assets).toBeGreaterThan(operationAmount);
    },
  );

  test("default: caps friendly reallocations to the 90% target", () => {
    const { data } = makeFixture({ targetSupply: 100n, targetBorrow: 90n });

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      operation: { type: "borrow", amount: 20n },
    });

    expect(result.reallocations).toHaveLength(1);
    expect(result.reallocations[0]?.assets).toBe(23n);
    expect(result.data.getMarket(targetParams.id).totalSupplyAssets).toBe(123n);
  });

  test("behavior: keeps the 90% target sizing at the allocator cap headroom limit", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 3_500n,
    });

    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { operation: { type: "borrow", amount: 20n } },
    );

    expect(reallocations.map(({ assets }) => assets)).toEqual([34n]);
  });

  test("behavior: reduces a cap-bound operation plan to its absolute shortfall", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 30n,
    });
    const operation = { type: "borrow", amount: 20n } as const;

    expect(
      data
        .computeVaultV2BlueReallocations(targetParams.id, { operation })
        .reallocations.map(({ assets }) => assets),
    ).toEqual([20n]);
    expect(
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation,
          allocatorCapHeadroom: 0n,
        })
        .reallocations.map(({ assets }) => assets),
    ).toEqual([30n]);
  });

  test("behavior: returns no reallocation when an idle-bound plan has no shortfall", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 90n,
      sourceSupply: 0n,
      idle: 2n,
      allocatorTargetCap: 10_000n,
    });

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id, {
        operation: { type: "borrow", amount: 1n },
      }).reallocations,
    ).toStrictEqual([]);
  });

  test("behavior: reduces an idle-bound plan to its absolute shortfall", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 90n,
      sourceSupply: 0n,
      idle: 13n,
      allocatorTargetCap: 10_000n,
    });

    expect(
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation: { type: "borrow", amount: 11n },
        })
        .reallocations.map(({ from, assets }) => [from.type, assets]),
    ).toStrictEqual([["idle", 1n]]);
  });

  test("behavior: keeps an idle leg that leaves more than the headroom share of idle", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 1_000n,
      targetBorrow: 900n,
      idle: 10_000n,
      allocatorTargetCap: 10_000n,
    });
    const operation = { type: "borrow", amount: 10n } as const;
    const legs = (allocatorCapHeadroom?: bigint) =>
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation,
          allocatorCapHeadroom,
        })
        .reallocations.map(({ from, assets }) => [from.type, assets] as const);

    expect(legs(0n)).toStrictEqual([["idle", 12n]]);
    expect(legs()).toStrictEqual(legs(0n));
  });

  test("behavior: treats an idle leg at exactly the headroom share as idle-bound", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 1_000n,
      targetBorrow: 900n,
      idle: 100n,
      allocatorTargetCap: 10_000n,
    });
    const operation = { type: "borrow", amount: 89n } as const;
    const legs = (allocatorCapHeadroom?: bigint) =>
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation,
          allocatorCapHeadroom,
        })
        .reallocations.map(({ from, assets }) => [from.type, assets] as const);

    expect(legs(0n)).toStrictEqual([["idle", 99n]]);
    expect(legs()).toStrictEqual([]);
  });

  test("behavior: keeps an idle leg one asset short of the headroom share", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 1_000n,
      targetBorrow: 900n,
      idle: 100n,
      allocatorTargetCap: 10_000n,
    });
    const operation = { type: "borrow", amount: 88n } as const;
    const legs = (allocatorCapHeadroom?: bigint) =>
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation,
          allocatorCapHeadroom,
        })
        .reallocations.map(({ from, assets }) => [from.type, assets] as const);

    expect(legs(0n)).toStrictEqual([["idle", 98n]]);
    expect(legs()).toStrictEqual([["idle", 98n]]);
  });

  test("behavior: moves the idle-bound threshold with a custom allocatorCapHeadroom", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 1_000n,
      targetBorrow: 900n,
      idle: 100n,
      allocatorTargetCap: 10_000n,
      canPullFromMarket: false,
    });
    const legs = (amount: bigint, allocatorCapHeadroom?: bigint) =>
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation: { type: "borrow", amount },
          allocatorCapHeadroom,
        })
        .reallocations.map(({ from, assets }) => [from.type, assets] as const);

    expect(legs(81n, 0n)).toStrictEqual([["idle", 90n]]);
    expect(legs(81n, MathLib.WAD / 10n)).toStrictEqual([]);
    expect(legs(80n, 0n)).toStrictEqual([["idle", 89n]]);
    expect(legs(80n, MathLib.WAD / 10n)).toStrictEqual([["idle", 89n]]);
    expect(legs(80n)).toStrictEqual([["idle", 89n]]);
  });

  test("behavior: keeps a vault's market leg when its idle leg is idle-bound", () => {
    const { data } = makeFixture({
      sourceSupply: 20n,
      sourceBorrow: 8n,
      targetSupply: 1_000n,
      targetBorrow: 900n,
      idle: 1n,
    });
    const operation = { type: "borrow", amount: 10n } as const;
    const legs = (allocatorCapHeadroom?: bigint) =>
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation,
          allocatorCapHeadroom,
        })
        .reallocations.map(({ from, assets }) => [from.type, assets] as const);
    const fullPlan = legs(0n);

    expect(fullPlan).toStrictEqual([
      ["market", 11n],
      ["idle", 1n],
    ]);
    expect(fullPlan[0]?.[1]).toBeGreaterThan(fullPlan[1]?.[1] ?? 0n);
    expect(legs()).toStrictEqual([["market", 11n]]);
  });

  test("behavior: keeps the headroom plan when the reduced plan falls short", () => {
    const fixture = {
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 30n,
    };
    const { data } = makeFixture(fixture);
    const { data: shortData } = makeFixture({ ...fixture, sourceSupply: 10n });
    const clone = data.clone.bind(data);
    // The second plan is the reduced one; give it too little source liquidity.
    vi.spyOn(data, "clone")
      .mockImplementationOnce(clone)
      .mockImplementationOnce(() => shortData.clone())
      .mockImplementation(clone);

    expect(
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation: { type: "borrow", amount: 20n },
        })
        .reallocations.map(({ assets }) => assets),
    ).toEqual([29n]);
  });

  test("behavior: applies a custom allocatorCapHeadroom", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 40n,
    });
    const legs = (allocatorCapHeadroom?: bigint) =>
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          allocatorCapHeadroom,
          operation: { type: "borrow", amount: 20n },
        })
        .reallocations.map(({ assets }) => assets);

    // 1% keeps the 90% target; 25% leaves 30 under the cap, so only the shortfall moves.
    expect(legs()).toEqual([34n]);
    expect(legs(MathLib.WAD / 4n)).toEqual([20n]);
  });

  test("behavior: falls back to the full-cap target plan when the full-cap shortfall plan falls short", () => {
    const fixture = {
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 30n,
    };
    const { data } = makeFixture(fixture);
    const { data: shortData } = makeFixture({ ...fixture, sourceSupply: 10n });
    const clone = data.clone.bind(data);
    // Starve the headroom plan and the full-cap shortfall plan.
    vi.spyOn(data, "clone")
      .mockImplementationOnce(() => shortData.clone())
      .mockImplementationOnce(() => shortData.clone())
      .mockImplementation(clone);

    expect(
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation: { type: "borrow", amount: 20n },
        })
        .reallocations.map(({ assets }) => assets),
    ).toEqual([30n]);
  });

  test("behavior: reports the target plan's liquidity when every pass falls short", () => {
    const fixture = {
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 30n,
    };
    const { data } = makeFixture(fixture);
    const { data: shortData } = makeFixture({ ...fixture, sourceSupply: 10n });
    const clone = data.clone.bind(data);
    // Only the target plan sees the full source.
    vi.spyOn(data, "clone")
      .mockImplementationOnce(clone)
      .mockImplementation(() => shortData.clone());

    const thrown = (() => {
      try {
        data.computeVaultV2BlueReallocations(targetParams.id, {
          operation: { type: "borrow", amount: 40n },
        });
      } catch (error) {
        return error;
      }
    })();

    expect(thrown).toBeInstanceOf(InsufficientSharedLiquidityError);
    expect(thrown).toMatchObject({
      params: { shortfall: 40n, available: 29n },
    });
  });

  test("behavior: keeps a sibling target adapter's leg when another adapter of the vault is cap-bound", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 10n,
    });
    const targetMarket = data.getMarket(targetParams.id);
    const secondTargetAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        address: SECOND_TARGET_ADAPTER,
        parentVault: VAULT,
        skimRecipient: zeroAddress,
        marketIds: [targetMarket.id],
        adaptiveCurveIrm: IRM,
        supplyShares: {},
      },
      [new Market({ ...targetMarket })],
    );
    const [secondAdapterCapId, , secondAdapterMarketCapId] =
      secondTargetAdapter.ids(targetParams);
    const vault = data.getVault(VAULT);
    const twoTargetData = new VaultV2BlueReallocationData({
      chainId: data.chainId,
      markets: data.markets,
      vaults: {
        [VAULT]: new AccrualVaultV2(
          {
            ...vault,
            liquidityAllocations: vault.liquidityAllocations?.map(
              (allocation) => ({ ...allocation }),
            ),
          },
          undefined,
          [...vault.accrualAdapters, secondTargetAdapter],
          vault.assetBalance,
          {},
        ),
      },
      allocations: {
        [VAULT]: {
          ...data.allocations[VAULT],
          [secondAdapterCapId]: {
            id: secondAdapterCapId,
            absoluteCap: 4n,
            relativeCap: MathLib.WAD,
            allocation: 0n,
          },
          [secondAdapterMarketCapId]: {
            id: secondAdapterMarketCapId,
            absoluteCap: 10_000n,
            relativeCap: MathLib.WAD,
            allocation: 0n,
          },
        },
      },
      publicAllocatorConfigs: data.publicAllocatorConfigs,
      activeAdapters: {
        [VAULT]: new Set([
          ...(data.activeAdapters[VAULT] ?? []),
          SECOND_TARGET_ADAPTER,
        ]),
      },
      marketPublicAllocatorConfigs: {
        [VAULT]: {
          ...data.marketPublicAllocatorConfigs[VAULT],
          [secondAdapterMarketCapId]: {
            vault: VAULT,
            adapter: SECOND_TARGET_ADAPTER,
            adapterMarketCapId: secondAdapterMarketCapId,
            absoluteCap: 10_000n,
            canPullFromMarket: false,
          },
        },
      },
    });
    const legs = (allocatorCapHeadroom?: bigint) =>
      twoTargetData
        .computeVaultV2BlueReallocations(targetParams.id, {
          allocatorCapHeadroom,
          operation: { type: "borrow", amount: 1n },
        })
        .reallocations.map(({ to, assets }) => [to.adapter, assets]);

    expect(legs(0n)).toEqual([
      [TARGET_ADAPTER, 10n],
      [SECOND_TARGET_ADAPTER, 3n],
    ]);
    // The second adapter's 4 stays in the budget although the first is cap-bound.
    expect(legs()).toEqual([[TARGET_ADAPTER, 4n]]);
  });

  test("behavior: treats idle split across target adapters as idle-bound", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100_000n,
      targetBorrow: 90_000n,
      idle: 1_000n,
      canPullFromMarket: false,
      allocatorTargetCap: 10_000n,
    });
    const targetMarket = data.getMarket(targetParams.id);
    const targetAdapter = data.getAdapter(VAULT, TARGET_ADAPTER);
    const [targetAdapterCapId] = targetAdapter.ids(targetParams);
    const secondTargetAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        address: SECOND_TARGET_ADAPTER,
        parentVault: VAULT,
        skimRecipient: zeroAddress,
        marketIds: [targetMarket.id],
        adaptiveCurveIrm: IRM,
        supplyShares: {},
      },
      [new Market({ ...targetMarket })],
    );
    const [secondAdapterCapId, , secondAdapterMarketCapId] =
      secondTargetAdapter.ids(targetParams);
    const vault = data.getVault(VAULT);
    const twoTargetData = new VaultV2BlueReallocationData({
      chainId: data.chainId,
      markets: data.markets,
      vaults: {
        [VAULT]: new AccrualVaultV2(
          {
            ...vault,
            liquidityAllocations: vault.liquidityAllocations?.map(
              (allocation) => ({ ...allocation }),
            ),
          },
          undefined,
          [...vault.accrualAdapters, secondTargetAdapter],
          vault.assetBalance,
          {},
        ),
      },
      allocations: {
        [VAULT]: {
          ...data.allocations[VAULT],
          [targetAdapterCapId]: {
            id: targetAdapterCapId,
            absoluteCap: 501n,
            relativeCap: MathLib.WAD,
            allocation: 0n,
          },
          [secondAdapterCapId]: {
            id: secondAdapterCapId,
            absoluteCap: 495n,
            relativeCap: MathLib.WAD,
            allocation: 0n,
          },
          [secondAdapterMarketCapId]: {
            id: secondAdapterMarketCapId,
            absoluteCap: 10_000n,
            relativeCap: MathLib.WAD,
            allocation: 0n,
          },
        },
      },
      publicAllocatorConfigs: data.publicAllocatorConfigs,
      activeAdapters: {
        [VAULT]: new Set([
          ...(data.activeAdapters[VAULT] ?? []),
          SECOND_TARGET_ADAPTER,
        ]),
      },
      marketPublicAllocatorConfigs: {
        [VAULT]: {
          ...data.marketPublicAllocatorConfigs[VAULT],
          [secondAdapterMarketCapId]: {
            vault: VAULT,
            adapter: SECOND_TARGET_ADAPTER,
            adapterMarketCapId: secondAdapterMarketCapId,
            absoluteCap: 10_000n,
            canPullFromMarket: false,
          },
        },
      },
    });
    const legs = (allocatorCapHeadroom?: bigint) =>
      twoTargetData
        .computeVaultV2BlueReallocations(targetParams.id, {
          allocatorCapHeadroom,
          operation: { type: "borrow", amount: 894n },
        })
        .reallocations.map(
          ({ to, from, assets }) => [to.adapter, from.type, assets] as const,
        );

    expect(legs(0n)).toStrictEqual([
      [TARGET_ADAPTER, "idle", 501n],
      [SECOND_TARGET_ADAPTER, "idle", 493n],
    ]);
    expect(legs()).toStrictEqual([]);
  });

  test("behavior: reduces a cap-bound withdraw plan to its absolute shortfall", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 30n,
    });

    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { operation: { type: "withdraw", amount: 20n } },
    );

    expect(reallocations.map(({ assets }) => assets)).toEqual([20n]);
  });

  test("behavior: uses the full allocator cap only when the shortfall needs it", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 20n,
    });

    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { operation: { type: "borrow", amount: 20n } },
    );

    expect(reallocations.map(({ assets }) => assets)).toEqual([20n]);
  });

  test("behavior: skips a cap-bound plan when the operation has no shortfall", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 95n,
      allocatorTargetCap: 10n,
    });
    const operation = { type: "borrow", amount: 5n } as const;

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id, { operation })
        .reallocations,
    ).toEqual([]);
    expect(
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation,
          allocatorCapHeadroom: 0n,
        })
        .reallocations.map(({ assets }) => assets),
    ).toEqual([10n]);
  });

  test("behavior: keeps what uncapped vaults move when another vault is cap-bound", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 95n,
      idle: 500n,
      canPullFromMarket: false,
      allocatorTargetCap: 11n,
    });
    const secondTargetAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        address: SECOND_TARGET_ADAPTER,
        parentVault: SECOND_VAULT,
        skimRecipient: zeroAddress,
        marketIds: [targetParams.id],
        adaptiveCurveIrm: IRM,
        supplyShares: {},
      },
      [new Market({ ...data.getMarket(targetParams.id) })],
    );
    const secondTargetIds = secondTargetAdapter.ids(targetParams);
    const [, , secondTargetAdapterMarketCapId] = secondTargetIds;
    const secondAllocations: Record<Hash, IVaultV2Allocation> = {};
    for (const id of secondTargetIds)
      secondAllocations[id] = {
        id,
        absoluteCap: 10_000n,
        relativeCap: MathLib.WAD,
        allocation: 0n,
      };
    const firstVault = data.getVault(VAULT);
    const sharedData = new VaultV2BlueReallocationData({
      chainId: data.chainId,
      markets: data.markets,
      vaults: {
        [VAULT]: firstVault,
        [SECOND_VAULT]: new AccrualVaultV2(
          {
            ...firstVault,
            address: SECOND_VAULT,
            _totalAssets: 5n,
            totalSupply: 5n,
            liquidityAllocations: firstVault.liquidityAllocations?.map(
              (allocation) => ({ ...allocation }),
            ),
          },
          undefined,
          [secondTargetAdapter],
          5n,
          {},
        ),
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
    const operation = { type: "borrow", amount: 5n } as const;
    const legs = (allocatorCapHeadroom?: bigint) =>
      sharedData
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation,
          allocatorCapHeadroom,
        })
        .reallocations.map(({ vault, assets }) => [vault, assets]);

    expect(legs(0n)).toStrictEqual([
      [VAULT, 11n],
      [SECOND_VAULT, 1n],
    ]);
    expect(legs()).toStrictEqual([[VAULT, 2n]]);
  });

  test("behavior: budgets the reduced plan by another vault's unbound idle when one vault's idle leg is idle-bound", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100_000n,
      targetBorrow: 90_000n,
      idle: 1_001n,
      canPullFromMarket: false,
      allocatorTargetCap: 10_000n,
    });
    const secondTargetAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        address: SECOND_TARGET_ADAPTER,
        parentVault: SECOND_VAULT,
        skimRecipient: zeroAddress,
        marketIds: [targetParams.id],
        adaptiveCurveIrm: IRM,
        supplyShares: {},
      },
      [new Market({ ...data.getMarket(targetParams.id) })],
    );
    const secondTargetIds = secondTargetAdapter.ids(targetParams);
    const [, , secondTargetAdapterMarketCapId] = secondTargetIds;
    const secondAllocations: Record<Hash, IVaultV2Allocation> = {};
    for (const id of secondTargetIds)
      secondAllocations[id] = {
        id,
        absoluteCap: 10_000n,
        relativeCap: MathLib.WAD,
        allocation: 0n,
      };
    const firstVault = data.getVault(VAULT);
    const sharedData = new VaultV2BlueReallocationData({
      chainId: data.chainId,
      markets: data.markets,
      vaults: {
        [VAULT]: firstVault,
        [SECOND_VAULT]: new AccrualVaultV2(
          {
            ...firstVault,
            address: SECOND_VAULT,
            _totalAssets: 10_000n,
            totalSupply: 10_000n,
            liquidityAllocations: firstVault.liquidityAllocations?.map(
              (allocation) => ({ ...allocation }),
            ),
          },
          undefined,
          [secondTargetAdapter],
          10_000n,
          {},
        ),
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
            absoluteCap: 1_000n,
            canPullFromMarket: false,
          },
        },
      },
    });
    const operation = { type: "borrow", amount: 1_350n } as const;
    const legs = (allocatorCapHeadroom?: bigint) =>
      sharedData
        .computeVaultV2BlueReallocations(targetParams.id, {
          operation,
          allocatorCapHeadroom,
        })
        .reallocations.map(
          ({ vault, from, assets }) => [vault, from.type, assets] as const,
        );
    const fullPlan = legs(0n);
    const defaultPlan = legs();

    expect(fullPlan).toStrictEqual([
      [VAULT, "idle", 1_001n],
      [SECOND_VAULT, "idle", 499n],
    ]);
    expect(defaultPlan.length).toBeGreaterThan(0);
    // Drawing on the idle-bound vault again is a known open policy gap; fixing it would change this assertion.
    expect(defaultPlan).toStrictEqual([[VAULT, "idle", 499n]]);

    const secondVaultIdleAssets = fullPlan.reduce(
      (total, [vault, from, assets]) =>
        vault === SECOND_VAULT && from === "idle" ? total + assets : total,
      0n,
    );
    const defaultIdleAssets = defaultPlan.reduce(
      (total, [, from, assets]) => (from === "idle" ? total + assets : total),
      0n,
    );
    expect(secondVaultIdleAssets).toBe(499n);
    expect(defaultIdleAssets).toBe(secondVaultIdleAssets);
  });

  test("error: InsufficientSharedLiquidityError when the full allocator cap is short", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 19n,
    });
    const compute = () =>
      data.computeVaultV2BlueReallocations(targetParams.id, {
        operation: { type: "borrow", amount: 20n },
      });
    const thrown = () => {
      try {
        compute();
      } catch (error) {
        return error;
      }
    };
    const params = { shortfall: 20n, available: 19n };

    expect(thrown()).toBeInstanceOf(InsufficientSharedLiquidityError);
    expect(thrown()).toMatchObject({ params });

    // `available` keeps the best pass when the last pass moves less.
    const { data: shortData } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      allocatorTargetCap: 19n,
      sourceSupply: 10n,
    });
    const clone = data.clone.bind(data);
    vi.spyOn(data, "clone")
      .mockImplementationOnce(clone)
      .mockImplementationOnce(clone)
      .mockImplementationOnce(clone)
      .mockImplementation(() => shortData.clone());

    expect(thrown()).toMatchObject({ params });
  });

  test.each([
    [-1n, NegativeInputError],
    [MathLib.WAD + 1n, InputExceedsMaxError],
  ] as const)(
    "error: validates allocatorCapHeadroom %s",
    (allocatorCapHeadroom, error) => {
      const { data } = makeFixture({ targetSupply: 100n, targetBorrow: 0n });

      expect(() =>
        data.computeVaultV2BlueReallocations(targetParams.id, {
          allocatorCapHeadroom,
          operation: { type: "borrow", amount: 1n },
        }),
      ).toThrow(error);
    },
  );

  test("behavior: overshoots a shared-cap lower bound", () => {
    const penalty = MathLib.WAD;
    const { data } = makeFixture({
      sourceAdapter: TARGET_ADAPTER,
      sourceSupply: 100n,
      blueBalances: { [LOAN_TOKEN]: 200n },
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
    expect(
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: penalty,
        operation: { type: "borrow", amount: 100n },
      }).reallocations[0]?.assets,
    ).toBe(100n);
  });

  test("behavior: overshoots a shared-cap lower bound at a realistic penalty", () => {
    const penalty = MathLib.WAD / 1_000n;
    const sharedCollateralSource = new MarketParams({
      ...sourceParams,
      collateralToken: targetParams.collateralToken,
    });
    const { data } = makeFixture({
      sourceMarketParams: sharedCollateralSource,
      sourceSupply: 10_000n,
      targetSupply: 1_000n,
      targetBorrow: 900n,
      targetPositionAssets: 0n,
      firstTotalAssets: 19_998n,
      idle: 9_998n,
      canPullFromIdle: false,
      vaultLastUpdate: TIMESTAMP - 1n,
      maxRate: MathLib.WAD,
      penalty,
      targetCaps: [
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD / 2n },
        { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
      ],
    });

    expect(
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: penalty,
        operation: { type: "borrow", amount: 200n },
      }).reallocations[0]?.assets,
    ).toBe(1_001n);
    expect(
      data.getPublicReallocationLiquidity(targetParams.id, {
        maxPenalty: penalty,
      }),
    ).toBe(10_000n);
    expect(
      data.getAvailableLiquidityToUtilization(
        targetParams.id,
        (MathLib.WAD * 9n) / 10n,
        { maxPenalty: penalty },
      ),
    ).toBe(9_000n);
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

  test("behavior: defaults to and preserves the snapshot timestamp", () => {
    const timestamp = TIMESTAMP + Time.s.from.y(1n);
    const { data: fixtureData } = makeFixture({
      sourceSupply: 1_000n,
      sourceBorrow: 850n,
      sourceRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
      targetSupply: 100n,
      targetBorrow: 0n,
    });
    const data = new VaultV2BlueReallocationData({
      ...fixtureData,
      timestamp,
    });

    const defaultResult = data.computeVaultV2BlueReallocations(targetParams.id);
    const explicitResult = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { timestamp },
    );
    const sourceMarketAtTimestamp = data
      .getMarket(sourceParams.id)
      .accrueInterest(timestamp);
    const sourceWithdrawals = defaultResult.reallocations
      .filter(
        ({ from }) =>
          from.type === "market" && from.marketParams.id === sourceParams.id,
      )
      .reduce((assets, { assets: withdrawal }) => assets + withdrawal, 0n);

    expect(defaultResult.reallocations).toStrictEqual(
      explicitResult.reallocations,
    );
    expect(data.clone().timestamp).toBe(timestamp);
    expect(defaultResult.data.timestamp).toBe(timestamp);
    expect(defaultResult.reallocations).not.toHaveLength(0);
    expect(
      MarketUtils.getUtilization({
        totalSupplyAssets:
          sourceMarketAtTimestamp.totalSupplyAssets - sourceWithdrawals,
        totalBorrowAssets: sourceMarketAtTimestamp.totalBorrowAssets,
      }),
    ).toBeLessThanOrEqual((MathLib.WAD * 9n) / 10n);
  });

  test("behavior: operation planning defaults to the snapshot timestamp", () => {
    const timestamp = TIMESTAMP + Time.s.from.y(1n);
    const { data: fixtureData } = makeFixture({
      sourceSupply: 1_000n,
      sourceBorrow: 850n,
      sourceRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
      targetSupply: 100n,
      targetBorrow: 90n,
    });
    const data = new VaultV2BlueReallocationData({
      ...fixtureData,
      timestamp,
    });
    const operation = { type: "borrow", amount: 20n } as const;

    const defaultResult = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { operation },
    );
    const explicitResult = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { timestamp, operation },
    );

    expect(defaultResult.reallocations).toStrictEqual(
      explicitResult.reallocations,
    );
  });

  test("behavior: no-op operation planning returns post-state accrued to the requested timestamp", () => {
    const timestamp = TIMESTAMP + Time.s.from.y(1n);
    const { data } = makeFixture();
    const initialData = data.clone();

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      timestamp,
      operation: { type: "borrow", amount: 1n },
    });

    expect(result.reallocations).toStrictEqual([]);
    expect(result.data).not.toBe(data);
    expect(result.data.getMarket(targetParams.id).lastUpdate).toBe(timestamp);
    expect(data).toStrictEqual(initialData);
  });

  test("behavior: continuation from a no-op post-state plans at the requested timestamp", () => {
    const timestamp = TIMESTAMP + Time.s.from.y(1n);
    const { data } = makeFixture({
      sourceSupply: 1_000n,
      sourceBorrow: 800n,
      sourceRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
      targetSupply: 1_001n,
    });
    const first = data.computeVaultV2BlueReallocations(targetParams.id, {
      timestamp,
      operation: { type: "borrow", amount: 1n },
    });
    const continuation = first.data.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        operation: { type: "borrow", amount: 1_000n },
        maxWithdrawalUtilization: 900_000_000_000_000_000n,
        capAccrualBuffer: 0n,
      },
    );
    const explicit = data.computeVaultV2BlueReallocations(targetParams.id, {
      timestamp,
      operation: { type: "borrow", amount: 1_000n },
      maxWithdrawalUtilization: 900_000_000_000_000_000n,
      capAccrualBuffer: 0n,
    });

    expect(continuation.reallocations).not.toHaveLength(0);
    expect(continuation.reallocations).toStrictEqual(explicit.reallocations);
  });

  test("behavior: snapshot timestamp never precedes market lastUpdate", () => {
    const updateWindow = Time.s.from.y(1n);
    const timestamp = TIMESTAMP - updateWindow / 2n;
    const lastUpdate = TIMESTAMP - updateWindow;
    const { data: fixtureData } = makeFixture({
      sourceSupply: 1_000n,
      sourceBorrow: 850n,
      sourceRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
      targetSupply: 100n,
      targetBorrow: 0n,
      sourceLastUpdate: lastUpdate,
      targetLastUpdate: lastUpdate,
      vaultLastUpdate: lastUpdate,
    });
    const latestMarket = makeMarket({
      params: sourceParamsWithAnotherLoanToken,
      supply: 1n,
      borrow: 0n,
      lastUpdate: TIMESTAMP,
    });
    const data = new VaultV2BlueReallocationData({
      ...fixtureData,
      timestamp,
      markets: {
        ...fixtureData.markets,
        [latestMarket.id]: latestMarket,
      },
    });

    const snapshotResult = data.computeVaultV2BlueReallocations(
      targetParams.id,
      { timestamp },
    );
    const latestResult = data.computeVaultV2BlueReallocations(targetParams.id, {
      timestamp: TIMESTAMP,
    });
    const defaultResult = data.computeVaultV2BlueReallocations(targetParams.id);

    expect(snapshotResult.reallocations).not.toStrictEqual(
      latestResult.reallocations,
    );
    expect(defaultResult.reallocations).toStrictEqual(
      latestResult.reallocations,
    );
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

  test("behavior: uses the full cap when the headroom clips the fallback leg", () => {
    const { data } = makeFixture({
      targetSupply: 100n,
      targetBorrow: 100n,
      sourceSupply: 1_000n,
      sourceBorrow: 940n,
      allocatorTargetCap: 40n,
    });
    const legs = (allocatorCapHeadroom?: bigint) =>
      data
        .computeVaultV2BlueReallocations(targetParams.id, {
          maxWithdrawalUtilization: 950_000_000_000_000_000n,
          allocatorCapHeadroom,
          operation: { type: "borrow", amount: 40n },
        })
        .reallocations.map(({ assets }) => assets);

    expect(legs()).toStrictEqual([10n, 30n]);
    expect(legs()).toStrictEqual(legs(0n));
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
      blueBalances: { [LOAN_TOKEN]: 1_002n },
    });
    const { reallocations } = data.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: 7n,
        operation: { type: "borrow", amount: 1_100n },
      },
    );

    const tx = blueSupplyCollateralBorrow({
      market: {
        chainId: ChainId.EthMainnet,
        marketParams: targetParams,
      },
      args: {
        userAddress: VAULT,
        collateralAssets: 0n,
        borrowAssets: 1_100n,
        maxLtv: MathLib.MAX_UINT_256,
        reallocations,
        deadline: 1_900_000_000n,
      },
    });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: tx.data,
    });
    if (decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow") {
      throw new Error(`Unexpected function ${decoded.functionName}`);
    }

    expect(reallocations).toHaveLength(2);
    expect(tx.value).toBe(0n);
    expect(tx.action.args.reallocations).toBe(2);
    expect(decoded.args[6].map(({ penalty }) => penalty)).toEqual([7n, 7n]);
  });

  test("behavior: excludes reallocations above the penalty threshold", () => {
    const targetSupply = 100n;
    const targetBorrow = 90n;
    const borrowAmount = 20n;
    const penalty = 7n;
    const { data } = makeFixture({
      targetSupply,
      targetBorrow,
      penalty,
    });

    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: 6n,
        operation: { type: "borrow", amount: borrowAmount },
      }),
    ).toThrow(InsufficientSharedLiquidityError);

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
      operation: { type: "borrow", amount: borrowAmount },
    });
    const absoluteShortfall = targetBorrow + borrowAmount - targetSupply;
    const penalizedAssets = result.reallocations
      .filter(({ penalty: legPenalty }) => legPenalty > 0n)
      .reduce((total, { assets }) => total + assets, 0n);

    expect(penalizedAssets).toBe(absoluteShortfall);
    expect(
      result.reallocations.map(({ penalty: legPenalty, assets }) => [
        legPenalty,
        assets,
      ]),
    ).toEqual([[penalty, absoluteShortfall]]);
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

describe("VaultV2BlueReallocationData penalty-aware operation planning", () => {
  const wellFundedBlueBalances = { [LOAN_TOKEN]: 1_000_000_000_000n };

  const addSecondVault = (
    data: VaultV2BlueReallocationData,
    {
      idle,
      penalty,
      allocatorTargetCap = 10_000n,
      vaultAddress = SECOND_VAULT,
      adapterAddress = SECOND_TARGET_ADAPTER,
    }: {
      readonly idle: bigint;
      readonly penalty: bigint;
      readonly allocatorTargetCap?: bigint;
      readonly vaultAddress?: Address;
      readonly adapterAddress?: Address;
    },
  ) => {
    const targetMarket = data.getMarket(targetParams.id);
    const secondTargetAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        address: adapterAddress,
        parentVault: vaultAddress,
        skimRecipient: zeroAddress,
        marketIds: [targetMarket.id],
        adaptiveCurveIrm: IRM,
        supplyShares: {},
      },
      [new Market({ ...targetMarket })],
    );
    const [, , secondTargetAdapterMarketCapId] =
      secondTargetAdapter.ids(targetParams);
    const secondAllocations: Record<Hash, IVaultV2Allocation> = {};
    for (const id of secondTargetAdapter.ids(targetParams)) {
      secondAllocations[id] = {
        id,
        absoluteCap: allocatorTargetCap,
        relativeCap: MathLib.WAD,
        allocation: 0n,
      };
    }
    const firstVault = data.getVault(VAULT);
    const secondVault = new AccrualVaultV2(
      {
        ...firstVault,
        address: vaultAddress,
        _totalAssets: idle,
        totalSupply: idle,
        liquidityAllocations: firstVault.liquidityAllocations?.map(
          (allocation) => ({ ...allocation }),
        ),
      },
      undefined,
      [secondTargetAdapter],
      idle,
      {},
    );

    return new VaultV2BlueReallocationData({
      chainId: data.chainId,
      blueBalances: data.blueBalances,
      markets: data.markets,
      vaults: {
        ...data.vaults,
        [vaultAddress]: secondVault,
      },
      allocations: {
        ...data.allocations,
        [vaultAddress]: secondAllocations,
      },
      publicAllocatorConfigs: {
        ...data.publicAllocatorConfigs,
        [vaultAddress]: {
          vault: vaultAddress,
          canPullFromIdle: true,
          penalty,
        },
      },
      activeAdapters: {
        ...data.activeAdapters,
        [vaultAddress]: new Set([adapterAddress]),
      },
      marketPublicAllocatorConfigs: {
        ...data.marketPublicAllocatorConfigs,
        [vaultAddress]: {
          [secondTargetAdapterMarketCapId]: {
            vault: vaultAddress,
            adapter: adapterAddress,
            adapterMarketCapId: secondTargetAdapterMarketCapId,
            absoluteCap: allocatorTargetCap,
            canPullFromMarket: false,
          },
        },
      },
    });
  };

  const paidPenalty = MathLib.WAD / 100n;
  const makePaidIdleOperationData = (
    blueBalances?: Readonly<Record<Address, bigint | undefined>>,
    penalty = paidPenalty,
  ) => {
    const { data: baseData } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      canPullFromIdle: false,
      canPullFromMarket: false,
      blueBalances,
    });
    const targetMarket = baseData.getMarket(targetParams.id);
    return {
      baseData,
      data: addSecondVault(baseData, {
        idle: 1_000n,
        penalty,
      }),
      targetLiquidity: MathLib.zeroFloorSub(
        targetMarket.totalSupplyAssets,
        targetMarket.totalBorrowAssets,
      ),
    };
  };

  test.for([
    { type: "borrow" },
    { type: "withdraw" },
    { type: "refinance" },
  ] as const)(
    "sizes penalized idle legs for the Blue flash-loan balance ($type)",
    ({ type }) => {
      const others = 0n;
      const { data, targetLiquidity } = makePaidIdleOperationData({
        [LOAN_TOKEN]: 10n + others,
      });
      const blueBalance = targetLiquidity + others;
      const amount = 20n;
      const accountingShortfall = 10n;
      const operation = { type, amount } as const;
      const result = data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: paidPenalty,
        operation,
      });
      const paidAssets = result.reallocations.reduce(
        (total, { assets }) => total + assets,
        0n,
      );
      const penaltyAssets = getBlueBundlesV1PenaltyAssets(result.reallocations);
      const idleAssets = result.reallocations.reduce(
        (total, { from, assets }) =>
          from.type === "idle" ? total + assets : total,
        0n,
      );
      const need = type === "refinance" ? amount + penaltyAssets : amount;
      const baselinePaidAssets =
        type === "refinance"
          ? MathLib.mulDivUp(
              accountingShortfall,
              MathLib.WAD,
              MathLib.WAD - paidPenalty,
            )
          : accountingShortfall;
      const postMarket = result.data.getMarket(targetParams.id);
      const postSupply =
        postMarket.totalSupplyAssets - (type === "withdraw" ? amount : 0n);
      const postBorrow =
        postMarket.totalBorrowAssets +
        (type === "borrow"
          ? amount
          : type === "refinance"
            ? amount + penaltyAssets
            : 0n);

      expect(paidAssets).toBeGreaterThan(baselinePaidAssets);
      expect(blueBalance + idleAssets - penaltyAssets).toBeGreaterThanOrEqual(
        need,
      );
      expect(postSupply).toBeGreaterThanOrEqual(postBorrow);

      const smallerPlan = result.reallocations.map((reallocation, index) =>
        index === 0
          ? { ...reallocation, assets: reallocation.assets - 1n }
          : reallocation,
      );
      const smallerPenalty = getBlueBundlesV1PenaltyAssets(smallerPlan);
      const smallerNeed =
        type === "refinance" ? amount + smallerPenalty : amount;
      expect(blueBalance + idleAssets - 1n - smallerPenalty).toBeLessThan(
        smallerNeed,
      );
    },
  );

  test("sizes refinance idle legs for referral fees and penalty transfers", () => {
    const blueBalance = 10n;
    const amount = 20n;
    const referralFeePct = MathLib.WAD / 10n;
    const { data } = makePaidIdleOperationData({
      [LOAN_TOKEN]: blueBalance,
    });
    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: paidPenalty,
      operation: { type: "refinance", amount, referralFeePct },
    });
    const feeAssets = getBlueBundlesV1ReferralFeeAssets(amount, referralFeePct);
    const paidAssets = result.reallocations.reduce(
      (total, { assets }) => total + assets,
      0n,
    );
    const penaltyAssets = getBlueBundlesV1PenaltyAssets(result.reallocations);
    const idleAssets = result.reallocations.reduce(
      (total, { from, assets }) =>
        from.type === "idle" ? total + assets : total,
      0n,
    );

    expect(feeAssets).toBe(2n);
    expect(paidAssets).toBe(14n);
    expect(result.reallocations).toHaveLength(1);
    expect(blueBalance + idleAssets - penaltyAssets).toBeGreaterThanOrEqual(
      amount + feeAssets + penaltyAssets,
    );

    const smallerReallocation = {
      ...result.reallocations[0]!,
      assets: paidAssets - 1n,
    };
    const smallerPenalty = getBlueBundlesV1PenaltyAssets([smallerReallocation]);
    expect(blueBalance + idleAssets - 1n - smallerPenalty).toBeLessThan(
      amount + feeAssets + smallerPenalty,
    );

    const postMarket = result.data.getMarket(targetParams.id);
    expect(postMarket.totalSupplyAssets).toBeGreaterThanOrEqual(
      postMarket.totalBorrowAssets + amount + feeAssets + penaltyAssets,
    );
  });

  test("throws when Blue cannot fund the penalty flash loan from its snapshot balance", () => {
    const penalty = MathLib.WAD / 10n;
    const blueBalance = 1n;
    const { data } = makePaidIdleOperationData(
      { [LOAN_TOKEN]: blueBalance },
      penalty,
    );
    let thrown: unknown;

    try {
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: penalty,
        operation: { type: "borrow", amount: 20n },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InsufficientSharedLiquidityError);
    if (!(thrown instanceof InsufficientSharedLiquidityError)) throw thrown;

    const penaltyAssets = getBlueBundlesV1PenaltyAssets([
      { assets: 22n, penalty },
    ]);
    expect(penaltyAssets).toBe(3n);
    expect(thrown.params.available).toBe(22n);
    expect(thrown.params.shortfall).toBe(24n);
  });

  test("rejects an earlier market withdrawal before later paid idle funding", () => {
    const { data: baseData } = makeFixture({
      sourceSupply: 10n,
      targetSupply: 100n,
      targetBorrow: 100n,
      canPullFromIdle: false,
      canPullFromMarket: true,
      penalty: 0n,
      blueBalances: { [LOAN_TOKEN]: 10n },
    });
    const data = addSecondVault(baseData, { idle: 11n, penalty: 1n });
    let thrown: unknown;

    try {
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: 1n,
        operation: { type: "borrow", amount: 20n },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InsufficientSharedLiquidityError);
    if (!(thrown instanceof InsufficientSharedLiquidityError)) throw thrown;
    expect(thrown.params).toStrictEqual({
      marketId: targetParams.id,
      shortfall: 22n,
      available: 21n,
    });
  });

  test("uses fallback Blue liquidity for sizing without rejecting its balance deficit", () => {
    const penalty = MathLib.WAD / 10n;
    const makeData = (blueBalances?: Readonly<Record<Address, bigint>>) => {
      const { data } = makeFixture({
        sourceSupply: 0n,
        targetSupply: 100n,
        targetBorrow: 100n,
        canPullFromIdle: false,
        canPullFromMarket: false,
        blueBalances,
      });
      return addSecondVault(data, { idle: 1_000n, penalty });
    };
    const options = {
      maxPenalty: penalty,
      operation: { type: "borrow", amount: 20n },
    } as const;
    const fallbackData = makeData();
    const fallbackPlan = fallbackData.computeVaultV2BlueReallocations(
      targetParams.id,
      options,
    );
    const postMarket = fallbackPlan.data.getMarket(targetParams.id);

    expect(fallbackData.blueBalances[LOAN_TOKEN]).toBeUndefined();
    expect(fallbackPlan.reallocations).not.toHaveLength(0);
    expect(postMarket.totalSupplyAssets).toBeGreaterThanOrEqual(
      postMarket.totalBorrowAssets + 20n,
    );

    expect(() =>
      makeData({ [LOAN_TOKEN]: 1n }).computeVaultV2BlueReallocations(
        targetParams.id,
        options,
      ),
    ).toThrow(InsufficientSharedLiquidityError);
  });

  test("stops growing a market-only paid pass when the physical deficit stalls", () => {
    const { data } = makeFixture({
      sourceSupply: 10n ** 24n - 10n ** 23n + 899_999n,
      sourceAbsoluteCap: 10n ** 30n,
      targetSupply: 10n ** 23n,
      targetBorrow: 0n,
      targetCaps: [
        { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
        { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
        { absoluteCap: 10n ** 30n, relativeCap: MathLib.WAD },
      ],
      allocatorTargetCap: 10n ** 30n,
      canPullFromIdle: false,
      canPullFromMarket: true,
      penalty: 1n,
      blueBalances: { [LOAN_TOKEN]: 1n },
    });

    const cloneSpy = vi.spyOn(VaultV2BlueReallocationData.prototype, "clone");
    let thrown: unknown;
    try {
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: 1n,
        operation: { type: "borrow", amount: 10n ** 24n },
      });
    } catch (error) {
      thrown = error;
    }
    const cloneCount = cloneSpy.mock.calls.length;
    cloneSpy.mockRestore();

    expect(thrown).toBeInstanceOf(InsufficientSharedLiquidityError);
    if (!(thrown instanceof InsufficientSharedLiquidityError)) throw thrown;
    expect(thrown.params.available).toBe(0n);
    expect(thrown.params.shortfall).toBe(10n ** 24n - 10n ** 23n);
    expect(cloneCount).toBeLessThan(28);
  });

  test("retries a stalled paid tier at its full capacity before rejecting", () => {
    const penalty = MathLib.WAD / 10n;
    const targetLiquidity = 112n;
    const marketCapacity = 1_080n;
    const amount = targetLiquidity + 1_000n;
    const { data: baseData } = makeFixture({
      sourceSupply: 1_200n,
      sourceBorrow: 108n,
      targetSupply: targetLiquidity,
      targetBorrow: 0n,
      canPullFromIdle: false,
      canPullFromMarket: true,
      penalty,
      blueBalances: {
        [LOAN_TOKEN]: targetLiquidity + marketCapacity,
      },
    });
    const data = addSecondVault(baseData, {
      idle: 500n,
      penalty,
      allocatorTargetCap: 20_000n,
    });
    expect(
      data
        .getMarket(sourceParams.id)
        .getWithdrawToUtilization((MathLib.WAD * 9n) / 10n),
    ).toBe(marketCapacity);
    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
      operation: { type: "borrow", amount },
    });

    expect(result.reallocations).toStrictEqual([
      {
        vault: VAULT,
        from: {
          type: "market",
          adapter: SOURCE_ADAPTER,
          marketParams: sourceParams,
        },
        to: { adapter: TARGET_ADAPTER },
        assets: marketCapacity,
        penalty,
      },
      {
        vault: SECOND_VAULT,
        from: { type: "idle" },
        to: { adapter: SECOND_TARGET_ADAPTER },
        assets: 32n,
        penalty,
      },
    ]);
  });

  test("keeps an uncovered full-capacity attempt out of the selected plan", () => {
    const penalty = MathLib.WAD / 10n;
    const higherPenalty = MathLib.WAD / 5n;
    const marketCapacity = 1_080n;
    const { data: baseData } = makeFixture({
      sourceSupply: 1_200n,
      sourceBorrow: 108n,
      targetSupply: 10n,
      targetBorrow: 0n,
      allocatorTargetCap: 20_000n,
      canPullFromIdle: false,
      canPullFromMarket: true,
      penalty,
      blueBalances: { [LOAN_TOKEN]: 1_102n },
    });
    const dataWithTenPercentIdle = addSecondVault(baseData, {
      idle: 12n,
      penalty,
    });
    const data = addSecondVault(dataWithTenPercentIdle, {
      idle: 1_000n,
      penalty: higherPenalty,
      vaultAddress: THIRD_VAULT,
      adapterAddress: THIRD_TARGET_ADAPTER,
    });
    expect(
      data
        .getMarket(sourceParams.id)
        .getWithdrawToUtilization((MathLib.WAD * 9n) / 10n),
    ).toBe(marketCapacity);

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: higherPenalty,
      operation: { type: "borrow", amount: 1_010n },
    });

    expect(result.reallocations).toStrictEqual([
      {
        vault: VAULT,
        from: {
          type: "market",
          adapter: SOURCE_ADAPTER,
          marketParams: sourceParams,
        },
        to: { adapter: TARGET_ADAPTER },
        assets: 1_000n,
        penalty,
      },
      {
        vault: THIRD_VAULT,
        from: { type: "idle" },
        to: { adapter: THIRD_TARGET_ADAPTER },
        assets: 10n,
        penalty: higherPenalty,
      },
    ]);
    expect(getBlueBundlesV1PenaltyAssets(result.reallocations)).toBe(102n);
  });

  test("does not keep a full-capacity attempt with an unfunded earlier withdrawal", () => {
    const penalty = MathLib.WAD / 10n;
    const higherPenalty = MathLib.WAD / 5n;
    const marketCapacity = 1_080n;
    const { data: baseData } = makeFixture({
      sourceSupply: 1_200n,
      sourceBorrow: 108n,
      targetSupply: 10n,
      targetBorrow: 0n,
      allocatorTargetCap: 20_000n,
      canPullFromIdle: false,
      canPullFromMarket: true,
      penalty,
      blueBalances: { [LOAN_TOKEN]: 1_102n },
    });
    const dataWithTenPercentIdle = addSecondVault(baseData, {
      idle: 20n,
      penalty,
    });
    const data = addSecondVault(dataWithTenPercentIdle, {
      idle: 1_000n,
      penalty: higherPenalty,
      vaultAddress: THIRD_VAULT,
      adapterAddress: THIRD_TARGET_ADAPTER,
    });
    expect(
      data
        .getMarket(sourceParams.id)
        .getWithdrawToUtilization((MathLib.WAD * 9n) / 10n),
    ).toBe(marketCapacity);

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: higherPenalty,
      operation: { type: "borrow", amount: 1_010n },
    });

    expect(result.reallocations).toStrictEqual([
      {
        vault: VAULT,
        from: {
          type: "market",
          adapter: SOURCE_ADAPTER,
          marketParams: sourceParams,
        },
        to: { adapter: TARGET_ADAPTER },
        assets: 1_000n,
        penalty,
      },
      {
        vault: THIRD_VAULT,
        from: { type: "idle" },
        to: { adapter: THIRD_TARGET_ADAPTER },
        assets: 10n,
        penalty: higherPenalty,
      },
    ]);
    expect(getBlueBundlesV1PenaltyAssets(result.reallocations)).toBe(102n);
  });

  test("bisects fallback growth to the smallest covering paid leg", () => {
    const penalty = MathLib.WAD / 20n;
    const { data, targetLiquidity } = makePaidIdleOperationData(
      undefined,
      penalty,
    );
    const amount = 20n;
    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
      operation: { type: "borrow", amount },
    });
    const oneLessAssets = 10n;
    const oneLessPenalty = getBlueBundlesV1PenaltyAssets([
      { assets: oneLessAssets, penalty },
    ]);
    const paidPenaltyAssets = getBlueBundlesV1PenaltyAssets(
      result.reallocations,
    );

    expect(targetLiquidity).toBe(10n);
    expect(result.reallocations).toStrictEqual([
      {
        vault: SECOND_VAULT,
        from: { type: "idle" },
        to: { adapter: SECOND_TARGET_ADAPTER },
        assets: 11n,
        penalty,
      },
    ]);
    expect(targetLiquidity + oneLessAssets - oneLessPenalty).toBeLessThan(
      amount,
    );
    expect(targetLiquidity + 11n - paidPenaltyAssets).toBeGreaterThanOrEqual(
      amount,
    );
  });

  test("keeps a fallback tier that improves accounting while its estimate stays flat", () => {
    const { data: baseData } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 94n,
      canPullFromIdle: false,
      canPullFromMarket: false,
    });
    const firstTierData = addSecondVault(baseData, {
      idle: 5n,
      penalty: MathLib.WAD / 10n,
    });
    const data = addSecondVault(firstTierData, {
      idle: 1n,
      penalty: MathLib.WAD,
      vaultAddress: THIRD_VAULT,
      adapterAddress: THIRD_TARGET_ADAPTER,
    });
    const amount = 12n;
    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: MathLib.WAD,
      operation: { type: "borrow", amount },
    });
    const fallbackBalance = [targetParams.id, sourceParams.id].reduce(
      (total, marketId) => {
        const market = data.getMarket(marketId);
        return (
          total +
          MathLib.zeroFloorSub(
            market.totalSupplyAssets,
            market.totalBorrowAssets,
          )
        );
      },
      0n,
    );
    const firstTierPenalty = getBlueBundlesV1PenaltyAssets([
      { assets: 5n, penalty: MathLib.WAD / 10n },
    ]);
    const totalPenalty = getBlueBundlesV1PenaltyAssets([
      { assets: 5n, penalty: MathLib.WAD / 10n },
      { assets: 1n, penalty: MathLib.WAD },
    ]);
    const firstTierEstimatedDeficit = MathLib.zeroFloorSub(
      amount + firstTierPenalty,
      fallbackBalance + 5n,
    );
    const finalEstimatedDeficit = MathLib.zeroFloorSub(
      amount + totalPenalty,
      fallbackBalance + 6n,
    );

    expect(data.blueBalances[LOAN_TOKEN]).toBeUndefined();
    expect(result.reallocations).toStrictEqual([
      {
        vault: SECOND_VAULT,
        from: { type: "idle" },
        to: { adapter: SECOND_TARGET_ADAPTER },
        assets: 5n,
        penalty: MathLib.WAD / 10n,
      },
      {
        vault: THIRD_VAULT,
        from: { type: "idle" },
        to: { adapter: THIRD_TARGET_ADAPTER },
        assets: 1n,
        penalty: MathLib.WAD,
      },
    ]);
    expect(fallbackBalance).toBe(6n);
    expect(firstTierEstimatedDeficit).toBe(2n);
    expect(finalEstimatedDeficit).toBe(firstTierEstimatedDeficit);
  });

  test("finds a covering borrow plan whose penalties fit the borrow amount", () => {
    const sourceMarket = makeMarket({
      params: sourceParams,
      supply: 10n,
      borrow: 0n,
    });
    const halfPositionShares = sourceMarket.toSupplyShares(5n, "Down");
    const { data } = makeFixture({
      sourceSupply: 10n,
      sourcePositionShares: halfPositionShares,
      siblingSourcePosition: {
        address: SECOND_TARGET_ADAPTER,
        supplyShares: halfPositionShares,
      },
      targetSupply: 100n,
      targetBorrow: 90n,
      canPullFromIdle: false,
      canPullFromMarket: true,
      penalty: (MathLib.WAD * 9n) / 10n,
      blueBalances: { [LOAN_TOKEN]: 29n },
    });
    const multiVaultData = addSecondVault(data, {
      idle: 13n,
      penalty: (MathLib.WAD * 92n) / 100n,
    });

    const result = multiVaultData.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: MathLib.WAD,
        operation: { type: "borrow", amount: 20n },
      },
    );

    expect(result.reallocations).toStrictEqual([
      {
        vault: VAULT,
        from: {
          type: "market",
          adapter: SOURCE_ADAPTER,
          marketParams: sourceParams,
        },
        to: { adapter: TARGET_ADAPTER },
        assets: 5n,
        penalty: (MathLib.WAD * 9n) / 10n,
      },
      {
        vault: SECOND_VAULT,
        from: { type: "idle" },
        to: { adapter: SECOND_TARGET_ADAPTER },
        assets: 5n,
        penalty: (MathLib.WAD * 92n) / 100n,
      },
    ]);
    expect(getBlueBundlesV1PenaltyAssets(result.reallocations)).toBe(10n);
  });

  test.for([{ type: "borrow" }, { type: "withdraw" }] as const)(
    "returns the exact 100% penalty plan for $type",
    ({ type }) => {
      const { data } = makePaidIdleOperationData(
        { [LOAN_TOKEN]: 1_000n },
        MathLib.WAD,
      );
      const result = data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: MathLib.WAD,
        operation: { type, amount: 20n },
      });

      expect(result.reallocations).toStrictEqual([
        {
          vault: SECOND_VAULT,
          from: { type: "idle" },
          to: { adapter: SECOND_TARGET_ADAPTER },
          assets: 10n,
          penalty: MathLib.WAD,
        },
      ]);
      const postMarket = result.data.getMarket(targetParams.id);
      expect(postMarket.totalSupplyAssets).toBeGreaterThanOrEqual(
        postMarket.totalBorrowAssets,
      );
    },
  );

  test("rejects a selected borrow plan whose penalty exceeds the amount", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      canPullFromIdle: false,
      canPullFromMarket: false,
    });
    const paidData = addSecondVault(data, {
      idle: 250n,
      penalty: (MathLib.WAD * 9n) / 10n,
    });

    let thrown: unknown;
    try {
      paidData.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: (MathLib.WAD * 9n) / 10n,
        operation: { type: "borrow", amount: 20n },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InputExceedsMaxError);
    if (!(thrown instanceof InputExceedsMaxError)) throw thrown;
    expect(thrown).toMatchObject({
      field: "reallocationPenaltyAssets",
      value: 90n,
      max: 20n,
    });
  });

  test("keeps fallback accounting shortfall separate from balance estimates", () => {
    const penalty = MathLib.WAD / 10n;
    const { data: baseData } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 100n,
      canPullFromIdle: false,
      canPullFromMarket: false,
    });
    const data = addSecondVault(baseData, {
      idle: 10n,
      penalty,
      allocatorTargetCap: 5n,
    });
    const amount = 10n;
    const estimatedBlueBalance = [targetParams.id, sourceParams.id].reduce(
      (total, marketId) => {
        const market = data.getMarket(marketId);
        return (
          total +
          MathLib.zeroFloorSub(
            market.totalSupplyAssets,
            market.totalBorrowAssets,
          )
        );
      },
      0n,
    );
    const allocatedAssets = 5n;
    const penaltyAssets = getBlueBundlesV1PenaltyAssets([
      { assets: allocatedAssets, penalty },
    ]);

    let thrown: unknown;
    try {
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: penalty,
        operation: { type: "borrow", amount },
      });
    } catch (error) {
      thrown = error;
    }

    expect(data.blueBalances[LOAN_TOKEN]).toBeUndefined();
    expect(estimatedBlueBalance).toBe(0n);
    expect(estimatedBlueBalance).toBeLessThan(amount + penaltyAssets);
    expect(thrown).toBeInstanceOf(InsufficientSharedLiquidityError);
    if (!(thrown instanceof InsufficientSharedLiquidityError)) throw thrown;
    expect(thrown.params).toStrictEqual({
      marketId: targetParams.id,
      shortfall: 10n,
      available: allocatedAssets,
    });
  });

  test("drops a paid market tier that does not improve an explicit-balance plan", () => {
    const { data: baseData } = makeFixture({
      sourceSupply: 100n,
      sourceAbsoluteCap: 1_000n,
      targetSupply: 100n,
      targetBorrow: 90n,
      canPullFromIdle: false,
      canPullFromMarket: true,
      penalty: (MathLib.WAD * 2n) / 100n,
      blueBalances: { [LOAN_TOKEN]: 5n },
    });
    const onePercentData = addSecondVault(baseData, {
      idle: 10n,
      penalty: MathLib.WAD / 100n,
    });
    const threePercentData = addSecondVault(onePercentData, {
      idle: 100n,
      penalty: (MathLib.WAD * 3n) / 100n,
      vaultAddress: THIRD_VAULT,
      adapterAddress: THIRD_TARGET_ADAPTER,
    });

    const result = threePercentData.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: (MathLib.WAD * 3n) / 100n,
        operation: { type: "borrow", amount: 20n },
      },
    );

    expect(result.reallocations).toStrictEqual([
      {
        vault: SECOND_VAULT,
        from: { type: "idle" },
        to: { adapter: SECOND_TARGET_ADAPTER },
        assets: 10n,
        penalty: MathLib.WAD / 100n,
      },
      {
        vault: THIRD_VAULT,
        from: { type: "idle" },
        to: { adapter: THIRD_TARGET_ADAPTER },
        assets: 7n,
        penalty: (MathLib.WAD * 3n) / 100n,
      },
    ]);
  });

  test("uses an idle tier instead of an underfunded market withdrawal", () => {
    const marketPenalty = paidPenalty / 2n;
    const idlePenalty = paidPenalty;
    const operation = { type: "borrow", amount: 20n } as const;
    const makeData = (blueBalance: bigint) => {
      const { data: baseData } = makeFixture({
        sourceSupply: 5n,
        targetSupply: 100n,
        targetBorrow: 90n,
        canPullFromIdle: false,
        canPullFromMarket: true,
        penalty: marketPenalty,
        blueBalances: { [LOAN_TOKEN]: blueBalance },
      });
      return addSecondVault(baseData, {
        idle: 1_000n,
        penalty: idlePenalty,
      });
    };
    const wellFundedPlan = makeData(1_000n).computeVaultV2BlueReallocations(
      targetParams.id,
      { maxPenalty: idlePenalty, operation },
    );

    expect(
      wellFundedPlan.reallocations.map(({ from }) => from.type),
    ).toStrictEqual(["market", "idle"]);
    expect(wellFundedPlan.reallocations[0]?.assets).toBe(5n);

    const underfundedPlan = makeData(3n).computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: idlePenalty,
        operation,
      },
    );

    expect(underfundedPlan.reallocations).toStrictEqual([
      {
        vault: SECOND_VAULT,
        from: { type: "idle" },
        to: { adapter: SECOND_TARGET_ADAPTER },
        assets: 18n,
        penalty: idlePenalty,
      },
    ]);
  });

  test("keeps the current borrow plan when Blue has enough balance for the penalty", () => {
    const blueBalance = 11n;
    const { data, targetLiquidity } = makePaidIdleOperationData({
      [LOAN_TOKEN]: blueBalance,
    });
    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: paidPenalty,
      operation: { type: "borrow", amount: 20n },
    });
    const penaltyAssets = getBlueBundlesV1PenaltyAssets(result.reallocations);
    const idleAssets = result.reallocations.reduce(
      (total, { from, assets }) =>
        from.type === "idle" ? total + assets : total,
      0n,
    );

    expect(
      result.reallocations.map(({ vault, from, assets, penalty }) => [
        vault,
        from.type,
        assets,
        penalty,
      ]),
    ).toStrictEqual([[SECOND_VAULT, "idle", 10n, paidPenalty]]);
    expect(targetLiquidity).toBe(10n);
    expect(blueBalance + idleAssets - penaltyAssets).toBeGreaterThanOrEqual(
      20n,
    );
  });

  test("uses summed snapshot liquidity when Blue balances are omitted", () => {
    const { baseData, targetLiquidity } = makePaidIdleOperationData();
    const sameTokenMarket = makeMarket({
      params: new MarketParams({
        ...sourceParams,
        collateralToken: "0x0000000000000000000000000000000000000014",
        oracle: "0x0000000000000000000000000000000000000015",
      }),
      supply: 60n,
      borrow: 20n,
    });
    const differentTokenMarket = makeMarket({
      params: new MarketParams({
        ...sourceParamsWithAnotherLoanToken,
        collateralToken: "0x0000000000000000000000000000000000000016",
        oracle: "0x0000000000000000000000000000000000000017",
      }),
      supply: 500n,
      borrow: 0n,
    });
    const overborrowedMarket = makeMarket({
      params: new MarketParams({
        ...sourceParams,
        collateralToken: "0x0000000000000000000000000000000000000018",
        oracle: "0x0000000000000000000000000000000000000019",
      }),
      supply: 5n,
      borrow: 15n,
    });
    const markets = {
      ...baseData.markets,
      [sameTokenMarket.id]: sameTokenMarket,
      [differentTokenMarket.id]: differentTokenMarket,
      [overborrowedMarket.id]: overborrowedMarket,
    };
    const expectedBlueBalance =
      targetLiquidity +
      MathLib.zeroFloorSub(
        sameTokenMarket.totalSupplyAssets,
        sameTokenMarket.totalBorrowAssets,
      ) +
      MathLib.zeroFloorSub(
        overborrowedMarket.totalSupplyAssets,
        overborrowedMarket.totalBorrowAssets,
      );
    const makeSnapshotData = (
      blueBalances?: Readonly<Record<Address, bigint | undefined>>,
    ) =>
      new VaultV2BlueReallocationData({
        ...baseData,
        blueBalances,
        markets,
      });
    const secondVault = { idle: 1_000n, penalty: paidPenalty };
    const fallbackData = addSecondVault(makeSnapshotData(), secondVault);
    const explicitData = addSecondVault(
      makeSnapshotData({ [LOAN_TOKEN]: expectedBlueBalance }),
      secondVault,
    );
    const targetOnlyData = addSecondVault(
      makeSnapshotData({ [LOAN_TOKEN]: targetLiquidity }),
      secondVault,
    );
    const operation = { type: "borrow", amount: 20n } as const;
    const fallbackPlan = fallbackData.computeVaultV2BlueReallocations(
      targetParams.id,
      { maxPenalty: paidPenalty, operation },
    );
    const explicitPlan = explicitData.computeVaultV2BlueReallocations(
      targetParams.id,
      { maxPenalty: paidPenalty, operation },
    );
    const targetOnlyPlan = targetOnlyData.computeVaultV2BlueReallocations(
      targetParams.id,
      { maxPenalty: paidPenalty, operation },
    );
    const paidAssets = fallbackPlan.reallocations.reduce(
      (total, { assets }) => total + assets,
      0n,
    );
    const penaltyAssets = getBlueBundlesV1PenaltyAssets(
      fallbackPlan.reallocations,
    );
    const idleAssets = fallbackPlan.reallocations.reduce(
      (total, { from, assets }) =>
        from.type === "idle" ? total + assets : total,
      0n,
    );

    expect(expectedBlueBalance).toBe(50n);
    expect(expectedBlueBalance).not.toBe(targetLiquidity);
    expect(
      MathLib.zeroFloorSub(
        differentTokenMarket.totalSupplyAssets,
        differentTokenMarket.totalBorrowAssets,
      ),
    ).toBeGreaterThan(0n);
    expect(
      MathLib.zeroFloorSub(
        overborrowedMarket.totalSupplyAssets,
        overborrowedMarket.totalBorrowAssets,
      ),
    ).toBe(0n);
    expect(fallbackPlan.reallocations).toStrictEqual(
      explicitPlan.reallocations,
    );
    expect(fallbackPlan.reallocations).not.toStrictEqual(
      targetOnlyPlan.reallocations,
    );
    expect(paidAssets).toBe(10n);
    expect(
      expectedBlueBalance + idleAssets - penaltyAssets,
    ).toBeGreaterThanOrEqual(20n);
  });

  test.for([
    { type: "borrow" },
    { type: "withdraw" },
    { type: "refinance" },
  ] as const)(
    "throws when only paid market legs cannot satisfy Blue's physical balance ($type)",
    ({ type }) => {
      const { data } = makeFixture({
        sourceSupply: 10n,
        targetSupply: 100n,
        targetBorrow: 90n,
        canPullFromIdle: false,
        canPullFromMarket: true,
        penalty: paidPenalty,
        blueBalances: { [LOAN_TOKEN]: 20n },
      });
      let thrown: unknown;

      try {
        data.computeVaultV2BlueReallocations(targetParams.id, {
          maxPenalty: paidPenalty,
          operation: { type, amount: 20n },
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(InsufficientSharedLiquidityError);
      if (!(thrown instanceof InsufficientSharedLiquidityError)) throw thrown;

      const accountingShortfall = 10n;
      const refinancePenalty = type === "refinance" ? 1n : 0n;
      const physicalShortfall = type === "refinance" ? 2n : 1n;
      const transferShortfall = 0n;
      expect(thrown.params.available).toBe(10n);
      expect(thrown.params.shortfall).toBe(
        MathLib.max(
          accountingShortfall + refinancePenalty,
          thrown.params.available +
            MathLib.max(physicalShortfall, transferShortfall),
        ),
      );
    },
  );

  test("clones Blue balances and adds idle inflows to the post-state", () => {
    const lowerCaseLoanToken = LOAN_TOKEN.toLowerCase() as Address;
    const { baseData } = makePaidIdleOperationData({
      [lowerCaseLoanToken]: 11n,
    });
    const cloned = baseData.clone();
    const result = addSecondVault(baseData, {
      idle: 1_000n,
      penalty: paidPenalty,
    }).computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: paidPenalty,
      operation: { type: "borrow", amount: 20n },
    });
    const idleAssets = result.reallocations.reduce(
      (total, { from, assets }) =>
        from.type === "idle" ? total + assets : total,
      0n,
    );

    expect(
      result.reallocations.reduce((total, { assets }) => total + assets, 0n),
    ).toBe(10n);
    expect(cloned.blueBalances).not.toBe(baseData.blueBalances);
    expect(cloned.blueBalances[lowerCaseLoanToken]).toBe(11n);
    expect(result.data.blueBalances[lowerCaseLoanToken]).toBe(11n + idleAssets);
  });

  test("uses free liquidity for the 90% target before a larger penalized vault", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      idle: 100n,
      canPullFromMarket: false,
    });
    const penalty = 7n;
    const multiVaultData = addSecondVault(data, {
      idle: 1_000n,
      penalty,
    });

    const result = multiVaultData.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: penalty,
        operation: { type: "borrow", amount: 20n },
      },
    );

    expect(
      result.reallocations.map(({ vault, penalty: legPenalty, assets }) => [
        vault,
        legPenalty,
        assets,
      ]),
    ).toEqual([[VAULT, 0n, 23n]]);
  });

  test("uses penalized liquidity only for the remaining absolute shortfall", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      blueBalances: { [LOAN_TOKEN]: 11n },
      idle: 4n,
      canPullFromMarket: false,
    });
    const penalty = 7n;
    const multiVaultData = addSecondVault(data, {
      idle: 1_000n,
      penalty,
    });

    const result = multiVaultData.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: penalty,
        operation: { type: "borrow", amount: 20n },
      },
    );

    const penalizedAssets = result.reallocations
      .filter(({ penalty: legPenalty }) => legPenalty > 0n)
      .reduce((total, { assets }) => total + assets, 0n);
    expect(penalizedAssets).toBe(6n);
    expect(result.reallocations).toHaveLength(2);
    expect(
      result.reallocations.map(({ penalty: legPenalty, assets }) => [
        legPenalty,
        assets,
      ]),
    ).toEqual([
      [0n, 4n],
      [penalty, 6n],
    ]);
  });

  test.for([
    { type: "borrow" },
    { type: "withdraw" },
    { type: "refinance" },
  ] as const)(
    "skips penalized vaults when free liquidity removes the $type shortfall above 90%",
    ({ type }) => {
      const { data } = makeFixture({
        sourceSupply: 0n,
        targetSupply: 100n,
        targetBorrow: 90n,
        idle: 4n,
        canPullFromMarket: false,
      });
      const penalty = 7n;
      const multiVaultData = addSecondVault(data, {
        idle: 1_000n,
        penalty,
      });
      const amount = 12n;
      const operation = { type, amount };
      const defaultHeadroom = multiVaultData.computeVaultV2BlueReallocations(
        targetParams.id,
        {
          maxPenalty: penalty,
          operation,
        },
      );
      const noHeadroom = multiVaultData.computeVaultV2BlueReallocations(
        targetParams.id,
        {
          maxPenalty: penalty,
          operation,
          allocatorCapHeadroom: 0n,
        },
      );
      const postOperation = (
        result: ReturnType<
          typeof multiVaultData.computeVaultV2BlueReallocations
        >,
      ) => {
        const market = result.data.getMarket(targetParams.id);
        const supply =
          market.totalSupplyAssets - (type === "withdraw" ? amount : 0n);
        const borrow =
          market.totalBorrowAssets + (type === "withdraw" ? 0n : amount);
        return {
          supply,
          borrow,
          utilization: MathLib.wDivDown(borrow, supply),
        };
      };
      for (const result of [defaultHeadroom, noHeadroom]) {
        expect(
          result.reallocations.filter(
            ({ penalty: legPenalty }) => legPenalty > 0n,
          ),
        ).toEqual([]);
        expect(
          result.reallocations.map(({ vault, penalty: legPenalty }) => [
            vault,
            legPenalty,
          ]),
        ).toContainEqual([VAULT, 0n]);
        const { supply, borrow } = postOperation(result);
        expect(supply).toBeGreaterThanOrEqual(borrow);
      }
      const { utilization: defaultPostOperationUtilization } =
        postOperation(defaultHeadroom);
      // Default headroom may cover only the shortfall.
      expect(defaultPostOperationUtilization).toBeLessThanOrEqual(MathLib.WAD);
      const { utilization: noHeadroomPostOperationUtilization } =
        postOperation(noHeadroom);
      expect(noHeadroomPostOperationUtilization).toBeGreaterThan(
        DEFAULT_SUPPLY_TARGET_UTILIZATION,
      );
      expect(noHeadroomPostOperationUtilization).toBeLessThan(MathLib.WAD);
      expect(
        noHeadroom.reallocations.map(
          ({ vault, penalty: legPenalty, assets }) => [
            vault,
            legPenalty,
            assets,
          ],
        ),
      ).toEqual([[VAULT, 0n, 4n]]);
    },
  );

  test("splits the shortfall across same-tier penalized vaults without overshoot", () => {
    const penalty = 7n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      blueBalances: { [LOAN_TOKEN]: 12n },
      idle: 4n,
      canPullFromMarket: false,
      penalty,
    });
    const multiVaultData = addSecondVault(data, {
      idle: 7n,
      penalty,
    });

    const result = multiVaultData.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: penalty,
        operation: { type: "borrow", amount: 20n },
        allocatorCapHeadroom: 0n,
      },
    );

    expect(result.reallocations).toHaveLength(2);
    expect(
      result.reallocations.reduce((total, { assets }) => total + assets, 0n),
    ).toBe(10n);
    expect(
      result.reallocations.every(
        ({ penalty: legPenalty }) => legPenalty === penalty,
      ),
    ).toBe(true);
    expect(
      result.reallocations.map(({ vault, penalty: legPenalty, assets }) => [
        vault,
        legPenalty,
        assets,
      ]),
    ).toEqual([
      [SECOND_VAULT, penalty, 7n],
      [VAULT, penalty, 3n],
    ]);
  });

  test("sizes a penalized vault's idle and market sources together to the shortfall", () => {
    const penalty = 7n;
    const { data } = makeFixture({
      sourceSupply: 100n,
      sourceBorrow: 90n,
      targetSupply: 100n,
      targetBorrow: 90n,
      idle: 3n,
      canPullFromMarket: true,
      penalty,
    });

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
      operation: { type: "borrow", amount: 20n },
    });
    const paidLegs = result.reallocations.filter(
      ({ penalty: legPenalty }) => legPenalty > 0n,
    );

    expect(paidLegs.reduce((total, { assets }) => total + assets, 0n)).toBe(
      10n,
    );
    expect(
      paidLegs.every(({ penalty: legPenalty }) => legPenalty === penalty),
    ).toBe(true);
    expect(new Set(paidLegs.map(({ from }) => from.type))).toEqual(
      new Set(["idle", "market"]),
    );
  });

  fcTest.prop([
    fc
      .tuple(
        fc.bigInt({ min: 100n, max: 10_000n }),
        fc.bigInt({ min: 0n, max: 2_000n }),
        fc.bigInt({ min: 0n, max: 5_000n }),
        fc.bigInt({ min: 1n, max: MathLib.WAD / 10n }),
        fc.constantFrom("borrow" as const, "withdraw" as const),
      )
      .chain(([supply, freeIdle, paidIdle, penalty, type]) =>
        fc
          .record({
            borrow: fc.bigInt({ min: 0n, max: supply }),
            amount: fc.bigInt({
              min: 1n,
              max: type === "withdraw" ? supply : 3_000n,
            }),
          })
          .map(({ borrow, amount }) => ({
            supply,
            borrow,
            freeIdle,
            paidIdle,
            penalty,
            type,
            amount,
          })),
      ),
  ])(
    "uses free liquidity for the target and paid liquidity only for the absolute shortfall",
    ({ supply, borrow, freeIdle, paidIdle, penalty, type, amount }) => {
      const targetCaps = [
        { absoluteCap: 1_000_000_000_000n, relativeCap: MathLib.WAD },
        { absoluteCap: 1_000_000_000_000n, relativeCap: MathLib.WAD },
        { absoluteCap: 1_000_000_000_000n, relativeCap: MathLib.WAD },
      ] as const;
      const { data } = makeFixture({
        sourceSupply: 0n,
        targetSupply: supply,
        targetBorrow: borrow,
        blueBalances: wellFundedBlueBalances,
        idle: freeIdle,
        canPullFromMarket: false,
        allocatorTargetCap: 1_000_000_000_000n,
        targetCaps,
      });
      const multiVaultData = addSecondVault(data, {
        idle: paidIdle,
        penalty,
        allocatorTargetCap: 1_000_000_000_000n,
      });
      const supplyAfterOperation =
        type === "withdraw" ? supply - amount : supply;
      const borrowAfterOperation = type === "borrow" ? borrow + amount : borrow;
      const shortfall =
        borrowAfterOperation > supplyAfterOperation
          ? borrowAfterOperation - supplyAfterOperation
          : 0n;
      const required =
        MathLib.wDivUp(
          borrowAfterOperation,
          DEFAULT_SUPPLY_TARGET_UTILIZATION,
        ) - supplyAfterOperation;
      const utilization =
        supplyAfterOperation === 0n
          ? borrowAfterOperation === 0n
            ? 0n
            : MathLib.WAD
          : MathLib.wDivDown(borrowAfterOperation, supplyAfterOperation);
      const operation = { type, amount };
      const hasNoPlan =
        utilization <= DEFAULT_SUPPLY_TARGET_UTILIZATION || required <= 0n;

      let result:
        | ReturnType<
            VaultV2BlueReallocationData["computeVaultV2BlueReallocations"]
          >
        | undefined;
      let thrown: unknown;
      try {
        result = multiVaultData.computeVaultV2BlueReallocations(
          targetParams.id,
          {
            maxPenalty: penalty,
            operation,
            allocatorCapHeadroom: 0n,
          },
        );
      } catch (error) {
        thrown = error;
      }

      if (hasNoPlan) {
        expect(thrown).toBeUndefined();
        expect(result?.reallocations).toEqual([]);
        return;
      }

      if (freeIdle + paidIdle < shortfall) {
        expect(thrown).toBeInstanceOf(InsufficientSharedLiquidityError);
        return;
      }

      expect(thrown).toBeUndefined();
      expect(result).toBeDefined();
      const reallocations = result!.reallocations;
      const freeLegs = reallocations.filter(
        ({ penalty: legPenalty }) => legPenalty === 0n,
      );
      const paidLegs = reallocations.filter(
        ({ penalty: legPenalty }) => legPenalty > 0n,
      );
      const free = freeLegs.reduce((total, { assets }) => total + assets, 0n);
      const paid = paidLegs.reduce((total, { assets }) => total + assets, 0n);

      expect(free).toBe(freeIdle < required ? freeIdle : required);
      expect(paid).toBe(shortfall > free ? shortfall - free : 0n);
      expect(
        reallocations
          .slice(0, freeLegs.length)
          .every(({ penalty: legPenalty }) => legPenalty === 0n),
      ).toBe(true);
      expect(
        reallocations
          .slice(freeLegs.length)
          .every(({ penalty: legPenalty }) => legPenalty > 0n),
      ).toBe(true);
      expect(
        paidLegs.every(({ penalty: legPenalty }) => legPenalty === penalty),
      ).toBe(true);
      if (paid > 0n) {
        expect(free).toBe(freeIdle);
        expect(supplyAfterOperation + free + paid).toBe(borrowAfterOperation);
      }
    },
  );

  fcTest.prop([
    fc
      .tuple(
        fc.bigInt({ min: 100n, max: 10_000n }),
        fc.bigInt({ min: 0n, max: 2_000n }),
        fc.bigInt({ min: 3_400n, max: 5_000n }),
        fc.bigInt({ min: 1n, max: MathLib.WAD / 10n }),
      )
      .chain(([supply, freeIdle, paidIdle, penalty]) =>
        fc
          .record({
            borrow: fc.bigInt({ min: 0n, max: supply }),
            amount: fc.bigInt({ min: 1n, max: 3_000n }),
          })
          .map(({ borrow, amount }) => ({
            supply,
            borrow,
            freeIdle,
            paidIdle,
            penalty,
            amount,
          })),
      ),
  ])(
    "sizes refinance penalties to the minimal net assets needed",
    ({ supply, borrow, freeIdle, paidIdle, penalty, amount }) => {
      const allocatorTargetCap = 1_000_000_000_000n;
      const targetCaps = [
        { absoluteCap: allocatorTargetCap, relativeCap: MathLib.WAD },
        { absoluteCap: allocatorTargetCap, relativeCap: MathLib.WAD },
        { absoluteCap: allocatorTargetCap, relativeCap: MathLib.WAD },
      ] as const;
      const { data } = makeFixture({
        sourceSupply: 0n,
        targetSupply: supply,
        targetBorrow: borrow,
        blueBalances: wellFundedBlueBalances,
        idle: freeIdle,
        canPullFromMarket: false,
        allocatorTargetCap,
        targetCaps,
      });
      const multiVaultData = addSecondVault(data, {
        idle: paidIdle,
        penalty,
        allocatorTargetCap,
      });
      const borrowAfterOperation = borrow + amount;
      const required =
        MathLib.wDivUp(
          borrowAfterOperation,
          DEFAULT_SUPPLY_TARGET_UTILIZATION,
        ) - supply;
      const utilization =
        supply === 0n
          ? borrowAfterOperation === 0n
            ? 0n
            : MathLib.WAD
          : MathLib.wDivDown(borrowAfterOperation, supply);
      const free =
        utilization > DEFAULT_SUPPLY_TARGET_UTILIZATION && required > 0n
          ? freeIdle < required
            ? freeIdle
            : required
          : 0n;
      const shortfall =
        borrowAfterOperation > supply ? borrowAfterOperation - supply : 0n;
      const g = borrowAfterOperation - supply - free;

      let result:
        | ReturnType<
            VaultV2BlueReallocationData["computeVaultV2BlueReallocations"]
          >
        | undefined;
      let thrown: unknown;
      try {
        result = multiVaultData.computeVaultV2BlueReallocations(
          targetParams.id,
          {
            maxPenalty: penalty,
            operation: { type: "refinance", amount, referralFeePct: 0n },
            allocatorCapHeadroom: 0n,
          },
        );
      } catch (error) {
        thrown = error;
      }

      expect(free + paidIdle).toBeGreaterThanOrEqual(shortfall);
      expect(thrown).toBeUndefined();
      expect(result).toBeDefined();
      const paidLegs = result!.reallocations.filter(
        ({ penalty: legPenalty }) => legPenalty > 0n,
      );

      if (g <= 0n) {
        expect(paidLegs).toEqual([]);
        return;
      }

      expect(paidLegs).toHaveLength(1);
      const paidLeg = paidLegs[0]!;
      const netAssets =
        paidLeg.assets - getBlueBundlesV1PenaltyAssets([paidLeg]);
      const previousLeg = { ...paidLeg, assets: paidLeg.assets - 1n };
      const previousNetAssets =
        previousLeg.assets - getBlueBundlesV1PenaltyAssets([previousLeg]);

      expect(netAssets).toBeGreaterThanOrEqual(g);
      expect(previousNetAssets).toBeLessThan(g);
    },
  );

  test("replans free and penalized tiers around allocator-cap headroom", () => {
    const targetSupply = 100n;
    const targetBorrow = 90n;
    const borrowAmount = 20n;
    const absoluteShortfall = targetBorrow + borrowAmount - targetSupply;
    const penalty = 7n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply,
      targetBorrow,
      blueBalances: wellFundedBlueBalances,
      idle: 100n,
      canPullFromMarket: false,
      allocatorTargetCap: 4n,
    });
    const multiVaultData = addSecondVault(data, {
      idle: 1_000n,
      penalty,
    });
    const plan = (allocatorCapHeadroom?: bigint) =>
      multiVaultData.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: penalty,
        operation: { type: "borrow", amount: borrowAmount },
        allocatorCapHeadroom,
      });
    const assertPlan = ({
      allocatorCapHeadroom,
      freeAssets,
      penalizedAssets,
    }: {
      readonly allocatorCapHeadroom?: bigint;
      readonly freeAssets: bigint;
      readonly penalizedAssets: bigint;
    }) => {
      const result = plan(allocatorCapHeadroom);
      const actualFreeAssets = result.reallocations
        .filter(({ penalty: legPenalty }) => legPenalty === 0n)
        .reduce((total, { assets }) => total + assets, 0n);
      const actualPenalizedAssets = result.reallocations
        .filter(({ penalty: legPenalty }) => legPenalty > 0n)
        .reduce((total, { assets }) => total + assets, 0n);

      expect(actualFreeAssets).toBe(freeAssets);
      expect(actualPenalizedAssets).toBe(absoluteShortfall - actualFreeAssets);
      expect(actualPenalizedAssets).toBe(penalizedAssets);
      expect(
        result.reallocations.map(({ vault, penalty: legPenalty, assets }) => [
          vault,
          legPenalty,
          assets,
        ]),
      ).toEqual([
        [VAULT, 0n, freeAssets],
        [SECOND_VAULT, penalty, penalizedAssets],
      ]);
    };

    assertPlan({ freeAssets: 3n, penalizedAssets: 7n });
    assertPlan({
      allocatorCapHeadroom: 0n,
      freeAssets: 4n,
      penalizedAssets: 6n,
    });

    const referralFeePct = MathLib.WAD / 10n;
    const feeAssets = getBlueBundlesV1ReferralFeeAssets(
      borrowAmount,
      referralFeePct,
    );
    const refinanceShortfall = absoluteShortfall + feeAssets;
    const assertRefinanceCoverage = (allocatorCapHeadroom?: bigint) => {
      const result = multiVaultData.computeVaultV2BlueReallocations(
        targetParams.id,
        {
          maxPenalty: penalty,
          operation: {
            type: "refinance",
            amount: borrowAmount,
            referralFeePct,
          },
          allocatorCapHeadroom,
        },
      );
      const assets = result.reallocations.reduce(
        (total, { assets: legAssets }) => total + legAssets,
        0n,
      );
      const penalties = getBlueBundlesV1PenaltyAssets(result.reallocations);

      expect(assets - penalties).toBeGreaterThanOrEqual(refinanceShortfall);
    };

    assertRefinanceCoverage();
    assertRefinanceCoverage(0n);
  });

  test("uses penalized liquidity for only the remaining withdraw shortfall", () => {
    const targetSupply = 100n;
    const targetBorrow = 90n;
    const withdrawAmount = 20n;
    const penalty = 7n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply,
      targetBorrow,
      blueBalances: { [LOAN_TOKEN]: 11n },
      idle: 4n,
      canPullFromMarket: false,
    });
    const multiVaultData = addSecondVault(data, {
      idle: 1_000n,
      penalty,
    });

    const result = multiVaultData.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: penalty,
        operation: { type: "withdraw", amount: withdrawAmount },
      },
    );

    const freeAssets = result.reallocations
      .filter(({ penalty: legPenalty }) => legPenalty === 0n)
      .reduce((total, { assets }) => total + assets, 0n);
    const absoluteShortfall =
      targetBorrow > targetSupply - withdrawAmount
        ? targetBorrow - (targetSupply - withdrawAmount)
        : 0n;
    const penalizedAssets = result.reallocations
      .filter(({ penalty: legPenalty }) => legPenalty > 0n)
      .reduce((total, { assets }) => total + assets, 0n);

    expect(freeAssets).toBe(4n);
    expect(penalizedAssets).toBe(absoluteShortfall - freeAssets);
    expect(result.reallocations).toHaveLength(2);
    expect(
      result.reallocations.map(({ vault, penalty: legPenalty, assets }) => [
        vault,
        legPenalty,
        assets,
      ]),
    ).toEqual([
      [VAULT, 0n, 4n],
      [SECOND_VAULT, penalty, 6n],
    ]);
  });

  test("uses free liquidity at 100% source utilization before friendly penalized liquidity", () => {
    const { data } = makeFixture({
      sourceSupply: 100n,
      sourceBorrow: 90n,
      targetSupply: 100n,
      targetBorrow: 90n,
      idle: 0n,
      canPullFromIdle: false,
      canPullFromMarket: true,
    });
    const penalty = 7n;
    const multiVaultData = addSecondVault(data, {
      idle: 1_000n,
      penalty,
    });

    const result = multiVaultData.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: penalty,
        operation: { type: "borrow", amount: 20n },
      },
    );

    expect(
      result.reallocations.map(
        ({ vault, from, penalty: legPenalty, assets }) => [
          vault,
          from.type,
          legPenalty,
          assets,
        ],
      ),
    ).toEqual([[VAULT, "market", 0n, 10n]]);
  });

  test("uses cheaper penalized vaults before larger, more expensive vaults", () => {
    const expensivePenalty = 10n;
    const cheaperPenalty = 5n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      blueBalances: { [LOAN_TOKEN]: 12n },
      idle: 1_000n,
      canPullFromMarket: false,
      penalty: expensivePenalty,
    });
    const multiVaultData = addSecondVault(data, {
      idle: 4n,
      penalty: cheaperPenalty,
    });

    const result = multiVaultData.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: expensivePenalty,
        operation: { type: "borrow", amount: 20n },
      },
    );

    expect(
      result.reallocations.map(({ vault, penalty, assets }) => [
        vault,
        penalty,
        assets,
      ]),
    ).toEqual([
      [SECOND_VAULT, cheaperPenalty, 4n],
      [VAULT, expensivePenalty, 6n],
    ]);
  });

  test("uses cheaper positive-tier 100% fallback before more expensive idle liquidity", () => {
    const cheaperPenalty = 5n;
    const expensivePenalty = 10n;
    const { data } = makeFixture({
      sourceSupply: 100n,
      sourceBorrow: 90n,
      targetSupply: 100n,
      targetBorrow: 90n,
      blueBalances: { [LOAN_TOKEN]: 21n },
      idle: 0n,
      canPullFromIdle: false,
      canPullFromMarket: true,
      penalty: cheaperPenalty,
    });
    const multiVaultData = addSecondVault(data, {
      idle: 1_000n,
      penalty: expensivePenalty,
    });
    const sourceMarket = data.getMarket(sourceParams.id);
    expect(
      sourceMarket.getWithdrawToUtilization((MathLib.WAD * 9n) / 10n),
    ).toBe(0n);
    expect(sourceMarket.getWithdrawToUtilization(MathLib.WAD)).toBe(10n);

    const result = multiVaultData.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: expensivePenalty,
        operation: { type: "borrow", amount: 20n },
      },
    );

    expect(
      result.reallocations.map(({ vault, from, penalty, assets }) => [
        vault,
        from.type,
        penalty,
        assets,
      ]),
    ).toEqual([[VAULT, "market", cheaperPenalty, 10n]]);
  });

  test("limits a single penalized leg to the absolute shortfall", () => {
    const penalty = 7n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      blueBalances: { [LOAN_TOKEN]: 11n },
      idle: 100n,
      canPullFromMarket: false,
      penalty,
    });

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
      operation: { type: "borrow", amount: 20n },
    });

    expect(result.reallocations).toHaveLength(1);
    expect(result.reallocations[0]?.assets).toBe(10n);
  });

  test("does not reallocate when an operation leaves utilization below 100%", () => {
    const penalty = 7n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      idle: 100n,
      canPullFromMarket: false,
      penalty,
    });

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
      operation: { type: "borrow", amount: 5n },
    });

    expect(result.reallocations).toStrictEqual([]);
  });

  test("matches borrow planning for refinance when liquidity is free", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      idle: 100n,
      canPullFromMarket: false,
    });
    const amount = 20n;
    const referralFeePct = MathLib.WAD / 10n;

    const refinance = data.computeVaultV2BlueReallocations(targetParams.id, {
      operation: { type: "refinance", amount, referralFeePct },
    });
    const borrow = data.computeVaultV2BlueReallocations(targetParams.id, {
      operation: {
        type: "borrow",
        amount:
          amount + getBlueBundlesV1ReferralFeeAssets(amount, referralFeePct),
      },
    });

    expect(refinance.reallocations).toStrictEqual(borrow.reallocations);
  });

  test("sizes a paid refinance leg to cover its fee and allocator penalty", () => {
    const penalty = MathLib.WAD / 10n;
    const amount = 200n;
    const referralFeePct = MathLib.WAD / 100n;
    const targetSupply = 1_000n;
    const targetBorrow = 900n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply,
      targetBorrow,
      blueBalances: wellFundedBlueBalances,
      idle: 1_000n,
      canPullFromMarket: false,
      penalty,
    });
    const feeAssets = getBlueBundlesV1ReferralFeeAssets(amount, referralFeePct);

    const refinance = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
      operation: { type: "refinance", amount, referralFeePct },
    });
    expect(refinance.reallocations).toHaveLength(1);
    const refinanceLeg = refinance.reallocations[0];
    expect(refinanceLeg?.penalty).toBe(penalty);
    const paidAssets = refinanceLeg?.assets ?? 0n;
    const destinationBorrow = targetBorrow + amount + feeAssets;
    const supplyAfter = refinance.data.getMarket(
      targetParams.id,
    ).totalSupplyAssets;

    expect(feeAssets).toBeGreaterThan(0n);
    expect(paidAssets).toBeGreaterThan(0n);
    expect(supplyAfter).toBeGreaterThanOrEqual(
      destinationBorrow + MathLib.wMulUp(paidAssets, penalty),
    );
    expect(targetSupply + paidAssets - 1n).toBeLessThan(
      destinationBorrow + MathLib.wMulUp(paidAssets - 1n, penalty),
    );

    const borrow = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
      operation: { type: "borrow", amount },
    });
    const borrowAssets = borrow.reallocations.reduce(
      (total, { assets }) => total + assets,
      0n,
    );

    expect(paidAssets).toBeGreaterThan(borrowAssets);
  });

  test("retries a paid refinance pass after per-leg penalty rounding", () => {
    const penalty = MathLib.WAD / 10n;
    const { data } = makeFixture({
      sourceSupply: 1_000n,
      sourceBorrow: 404n,
      targetSupply: 10_000n,
      targetBorrow: 9_000n,
      blueBalances: wellFundedBlueBalances,
      idle: 500n,
      penalty,
    });

    const result = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
      operation: { type: "refinance", amount: 1_902n },
    });
    const paidLegs = result.reallocations.filter(
      ({ penalty: legPenalty }) => legPenalty === penalty,
    );

    expect(paidLegs.map(({ from, assets }) => [from.type, assets])).toEqual([
      ["market", 551n],
      ["idle", 453n],
    ]);
    expect(
      paidLegs.reduce((total, { assets }) => total + assets, 0n) -
        getBlueBundlesV1PenaltyAssets(paidLegs),
    ).toBe(902n);
  });

  test("replans a paid refinance pass from a snapshot when per-leg rounding leaves a gap", () => {
    const penalty = MathLib.WAD / 10n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      blueBalances: { [LOAN_TOKEN]: 100n },
      idle: 5n,
      canPullFromMarket: false,
      penalty,
    });
    const multiVaultData = addSecondVault(data, {
      idle: 5n,
      penalty,
    });

    const result = multiVaultData.computeVaultV2BlueReallocations(
      targetParams.id,
      {
        maxPenalty: penalty,
        operation: { type: "refinance", amount: 18n },
      },
    );

    expect(
      result.reallocations.map(({ assets, penalty: legPenalty }) => [
        assets,
        legPenalty,
      ]),
    ).toEqual([
      [5n, penalty],
      [5n, penalty],
    ]);
  });

  describe("physical-balance penalty refinement", () => {
    const penalty = MathLib.WAD / 50n;
    const options = {
      timestamp: TIMESTAMP,
      capAccrualBuffer: 0n,
      allocatorCapHeadroom: 0n,
      maxPenalty: MathLib.WAD,
    };
    const makePaidIdleFixture = (overrides: FixtureOptions = {}) =>
      makeFixture({
        sourceSupply: 0n,
        targetSupply: 1_000n,
        targetBorrow: 995n,
        blueBalances: { [LOAN_TOKEN]: 5n },
        idle: 200n,
        canPullFromMarket: false,
        penalty,
        ...overrides,
      }).data;

    test.each([
      { amount: 53n, referralFeePct: 0n },
      { amount: 52n, referralFeePct: MathLib.WAD / 50n },
      { amount: 40n, referralFeePct: MathLib.WAD / 4n },
    ])(
      "behavior: finds the one-unit refinance penalty with $amount principal",
      ({ amount, referralFeePct }) => {
        const data = makePaidIdleFixture();
        const before = data.clone();
        const result = data.computeVaultV2BlueReallocations(targetParams.id, {
          ...options,
          operation: { type: "refinance", amount, referralFeePct },
        });

        expect(getBlueBundlesV1ReferralFeeAssets(amount, referralFeePct)).toBe(
          53n - amount,
        );
        expect(result.reallocations).toEqual([
          expect.objectContaining({
            assets: 50n,
            penalty,
            from: { type: "idle" },
          }),
        ]);
        expect(getBlueBundlesV1PenaltyAssets(result.reallocations)).toBe(1n);
        expect(result.data.getMarket(targetParams.id).totalSupplyAssets).toBe(
          1_050n,
        );
        expect(result.data.getVault(VAULT).assetBalance).toBe(151n);
        expect(result.data).not.toBe(data);
        expect(data).toStrictEqual(before);
        expect(
          data.computeVaultV2BlueReallocations(targetParams.id, {
            ...options,
            operation: { type: "refinance", amount, referralFeePct },
          }),
        ).toStrictEqual(result);
      },
    );

    test.each([49n, 52n, 101n])(
      "behavior: retains the baseline when the retry only reallocates %s assets",
      (retryAssets) => {
        const data = makePaidIdleFixture();
        let freePasses = 0;
        let baselineData: VaultV2BlueReallocationData | undefined;
        const passSpy = vi.spyOn(
          VaultV2BlueReallocationData.prototype as unknown as {
            computeVaultV2BlueReallocationsAtUtilizationInPlace: (
              ...args: never[]
            ) => {
              readonly data: VaultV2BlueReallocationData;
              readonly reallocations: readonly VaultV2BlueReallocation[];
            };
          },
          "computeVaultV2BlueReallocationsAtUtilizationInPlace",
        );
        passSpy.mockImplementation(function (
          this: VaultV2BlueReallocationData,
          ...args
        ) {
          const input = args[0] as unknown as {
            penalty?: bigint;
            maxAssets?: bigint;
          };
          if (input.penalty === 0n) freePasses++;
          const result = originalComputeAtUtilization.call(
            this,
            ...((freePasses > 2 && input.penalty === penalty
              ? [{ ...input, maxAssets: retryAssets }]
              : args) as never[]),
          ) as {
            readonly data: VaultV2BlueReallocationData;
            readonly reallocations: readonly VaultV2BlueReallocation[];
          };
          if (
            freePasses === 2 &&
            result.reallocations.length === 1 &&
            result.reallocations[0]?.assets === 52n
          )
            baselineData = result.data;
          return result;
        });
        try {
          const result = data.computeVaultV2BlueReallocations(targetParams.id, {
            ...options,
            operation: { type: "refinance", amount: 53n },
          });
          expect(freePasses).toBe(4);
          expect(result.reallocations.map(({ assets }) => assets)).toEqual([
            52n,
          ]);
          expect(getBlueBundlesV1PenaltyAssets(result.reallocations)).toBe(2n);
          expect(baselineData).toBeDefined();
          expect(result.data).toBe(baselineData);
        } finally {
          passSpy.mockRestore();
        }
      },
    );

    test("behavior: includes free idle before sizing the paid retry", () => {
      const data = addSecondVault(
        makePaidIdleFixture({ penalty: 0n, idle: 2n }),
        {
          idle: 200n,
          penalty,
        },
      );
      const result = data.computeVaultV2BlueReallocations(targetParams.id, {
        ...options,
        operation: { type: "refinance", amount: 55n },
      });
      expect(
        result.reallocations.map(({ assets, penalty: rate }) => [assets, rate]),
      ).toEqual([
        [2n, 0n],
        [50n, penalty],
      ]);
      expect(getBlueBundlesV1PenaltyAssets(result.reallocations)).toBe(1n);
      expect(result.data.getMarket(targetParams.id).totalSupplyAssets).toBe(
        1_052n,
      );
    });

    test("behavior: leaves discovery and missing-balance planning unchanged", () => {
      const data = makePaidIdleFixture({ blueBalances: undefined });
      const result = data.computeVaultV2BlueReallocations(targetParams.id, {
        ...options,
        operation: { type: "refinance", amount: 53n },
      });
      expect(data.blueBalances).not.toHaveProperty(LOAN_TOKEN);
      expect(result.reallocations.map(({ assets }) => assets)).toEqual([52n]);
      expect(getBlueBundlesV1PenaltyAssets(result.reallocations)).toBe(2n);
      const discovery = data.computeVaultV2BlueReallocations(
        targetParams.id,
        options,
      );
      expect(discovery.reallocations.map(({ assets }) => assets)).toEqual([
        200n,
      ]);
    });

    test("behavior: reuses a normalized single-use vault allowlist and headroom", () => {
      const data = makePaidIdleFixture({ allocatorTargetCap: 100n });
      const reallocatableVaults = (function* (): Generator<Address> {
        yield VAULT;
      })();
      const result = data.computeVaultV2BlueReallocations(targetParams.id, {
        ...options,
        reallocatableVaults,
        allocatorCapHeadroom: MathLib.WAD / 10n,
        operation: { type: "refinance", amount: 53n },
      });
      expect(result.reallocations).toEqual([
        expect.objectContaining({ vault: VAULT, assets: 50n, penalty }),
      ]);
      expect(result.data.getVault(VAULT).assetBalance).toBe(151n);
    });

    test.each([
      { rate: MathLib.WAD / 2n, balance: 2n, assets: 4n },
      { rate: (3n * MathLib.WAD) / 4n, balance: 6n, assets: 8n },
      { rate: (99n * MathLib.WAD) / 100n, balance: 198n, assets: 200n },
    ])(
      "behavior: preserves feasible refinance plans at high rate $rate",
      ({ rate, balance, assets: expectedAssets }) => {
        const data = makePaidIdleFixture({
          targetBorrow: 1_000n,
          blueBalances: { [LOAN_TOKEN]: balance },
          penalty: rate,
        });
        const result = data.computeVaultV2BlueReallocations(targetParams.id, {
          ...options,
          operation: { type: "refinance", amount: 2n },
        });
        expect(result.reallocations.map(({ assets }) => assets)).toEqual([
          expectedAssets,
        ]);
        expect(getBlueBundlesV1PenaltyAssets(result.reallocations)).toBe(
          balance,
        );
        expect(expectedAssets).toBe(2n + balance);
      },
    );

    test.each(["borrow", "withdraw", "refinance"] as const)(
      "behavior: funds mixed market/idle %s reallocations and the penalty flash loan",
      (type) => {
        const data = makePaidIdleFixture({
          sourceSupply: 50n,
          sourceAdapter: TARGET_ADAPTER,
          targetCaps: [
            { absoluteCap: 110n, relativeCap: MathLib.WAD },
            { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
            { absoluteCap: 10_000n, relativeCap: MathLib.WAD },
          ],
          idle: 60n,
          canPullFromMarket: true,
          blueBalances: { [LOAN_TOKEN]: 55n },
        });
        const result = data.computeVaultV2BlueReallocations(targetParams.id, {
          ...options,
          operation: { type, amount: 100n },
        });
        const charged = getBlueBundlesV1PenaltyAssets(result.reallocations);
        const idle = result.reallocations.reduce(
          (total, leg) => total + (leg.from.type === "idle" ? leg.assets : 0n),
          0n,
        );
        const marketAssets = result.reallocations.reduce(
          (total, leg) =>
            total + (leg.from.type === "market" ? leg.assets : 0n),
          0n,
        );
        const debtPenalty = type === "refinance" ? charged : 0n;
        expect(marketAssets).toBe(type === "refinance" ? 38n : 35n);
        expect(charged).toBe(3n);
        expect(charged + marketAssets).toBeLessThanOrEqual(55n);
        expect(55n + idle).toBeGreaterThanOrEqual(100n + debtPenalty + charged);
        expect(5n + marketAssets + idle).toBeGreaterThanOrEqual(
          100n + debtPenalty,
        );
      },
    );

    test("behavior: preserves the multi-vault dust-tier limitation", () => {
      const data = addSecondVault(
        makePaidIdleFixture({
          penalty: MathLib.WAD / 100n,
          idle: 25n,
          targetBorrow: 1_000n,
          blueBalances: { [LOAN_TOKEN]: 100n },
        }),
        { idle: 100n, penalty },
      );
      const result = data.computeVaultV2BlueReallocations(targetParams.id, {
        ...options,
        operation: { type: "withdraw", amount: 26n },
      });
      expect(result.reallocations.map(({ assets }) => assets)).toEqual([
        25n,
        1n,
      ]);
      expect(getBlueBundlesV1PenaltyAssets(result.reallocations)).toBe(2n);
    });

    test.each(["borrow", "withdraw", "refinance"] as const)(
      "behavior: checks %s plans against an independent idle-only integer oracle",
      (type) => {
        for (const rate of [
          0n,
          1n,
          MathLib.WAD / 100n,
          penalty,
          MathLib.WAD / 10n,
          MathLib.WAD / 2n - 1n,
          MathLib.WAD / 2n,
          MathLib.WAD - 1n,
          MathLib.WAD,
        ]) {
          for (const amount of [1n, 10n, 49n, 50n, 51n, 52n, 53n, 54n, 99n]) {
            for (const balance of [0n, 5n, 20n, 1_000n]) {
              const local = balance === 0n ? 0n : 5n;
              const referralFeePct =
                type === "refinance" ? MathLib.WAD / 50n : 0n;
              const fee =
                (amount * referralFeePct) / (MathLib.WAD - referralFeePct);
              let minimumPenalty: bigint | undefined;
              for (let assets = 0n; assets <= 200n; assets++) {
                const charged =
                  (assets * rate + MathLib.WAD - 1n) / MathLib.WAD;
                const debtPenalty = type === "refinance" ? charged : 0n;
                if (
                  local + assets < amount + fee + debtPenalty ||
                  charged > balance ||
                  balance + assets < amount + fee + debtPenalty + charged ||
                  (type !== "refinance" && charged > amount)
                )
                  continue;
                if (minimumPenalty == null || charged < minimumPenalty)
                  minimumPenalty = charged;
              }
              const data = makePaidIdleFixture({
                targetBorrow: 1_000n - local,
                blueBalances: { [LOAN_TOKEN]: balance },
                penalty: rate,
              });
              const compute = () =>
                data.computeVaultV2BlueReallocations(targetParams.id, {
                  ...options,
                  operation: { type, amount, referralFeePct },
                });
              if (minimumPenalty == null) {
                expect(compute).toThrow(InsufficientSharedLiquidityError);
                continue;
              }
              const result = compute();
              const assets = result.reallocations.reduce(
                (total, leg) => total + leg.assets,
                0n,
              );
              const charged = result.reallocations.reduce(
                (total, leg) =>
                  total +
                  (leg.assets * leg.penalty + MathLib.WAD - 1n) / MathLib.WAD,
                0n,
              );
              const debtPenalty = type === "refinance" ? charged : 0n;
              expect(charged).toBe(minimumPenalty);
              expect(charged).toBeLessThanOrEqual(balance);
              expect(local + assets).toBeGreaterThanOrEqual(
                amount + fee + debtPenalty,
              );
              expect(balance + assets).toBeGreaterThanOrEqual(
                amount + fee + debtPenalty + charged,
              );
              expect(assets).toBeLessThanOrEqual(200n);
            }
          }
        }
      },
    );
  });

  test("uses one paid pass when the first refinance budget covers", () => {
    const penalty = MathLib.WAD / 10n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      blueBalances: { [LOAN_TOKEN]: 12n },
      idle: 100n,
      canPullFromMarket: false,
      penalty,
    });
    const ownedPassInstances = new WeakSet<VaultV2BlueReallocationData>();
    const markOwned = (
      instance: VaultV2BlueReallocationData,
    ): VaultV2BlueReallocationData => {
      ownedPassInstances.add(instance);
      const clone = instance.clone.bind(instance);
      vi.spyOn(instance, "clone").mockImplementation(() => markOwned(clone()));
      return instance;
    };
    markOwned(data);
    const passSpy = vi.spyOn(
      VaultV2BlueReallocationData.prototype as unknown as {
        computeVaultV2BlueReallocationsAtUtilizationInPlace: (
          ...args: never[]
        ) => unknown;
      },
      "computeVaultV2BlueReallocationsAtUtilizationInPlace",
    );

    try {
      const result = data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: penalty,
        operation: { type: "refinance", amount: 12n },
      });
      const paidLegs = result.reallocations.filter(
        ({ penalty: legPenalty }) => legPenalty === penalty,
      );
      const paidPassCalls = passSpy.mock.calls.filter(([args], index) => {
        const input = args as unknown as { readonly penalty?: bigint };
        const instance = passSpy.mock.contexts[index] as
          | VaultV2BlueReallocationData
          | undefined;
        return (
          input.penalty === penalty &&
          instance != null &&
          ownedPassInstances.has(instance)
        );
      }).length;
      const reallocatedAssets = paidLegs.reduce(
        (total, { assets }) => total + assets,
        0n,
      );

      expect(paidPassCalls).toBe(1);
      expect(paidLegs).toHaveLength(1);
      expect(reallocatedAssets - getBlueBundlesV1PenaltyAssets(paidLegs)).toBe(
        2n,
      );
    } finally {
      passSpy.mockRestore();
    }
  });

  test("grosses up retries for a high-penalty refinance pass", () => {
    const penalty = MathLib.WAD - MathLib.WAD / 100n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      blueBalances: wellFundedBlueBalances,
      idle: 150n,
      canPullFromMarket: false,
      penalty,
    });
    const multiVaultData = addSecondVault(data, {
      idle: 150n,
      penalty,
    });
    const passSpy = vi.spyOn(
      VaultV2BlueReallocationData.prototype as unknown as {
        computeVaultV2BlueReallocationsAtUtilizationInPlace: (
          ...args: never[]
        ) => unknown;
      },
      "computeVaultV2BlueReallocationsAtUtilizationInPlace",
    );

    try {
      const result = multiVaultData.computeVaultV2BlueReallocations(
        targetParams.id,
        {
          maxPenalty: penalty,
          operation: { type: "refinance", amount: 12n },
        },
      );
      const paidLegs = result.reallocations.filter(
        ({ penalty: legPenalty }) => legPenalty === penalty,
      );
      const reallocatedAssets = paidLegs.reduce(
        (total, { assets }) => total + assets,
        0n,
      );
      const penaltyAssets = getBlueBundlesV1PenaltyAssets(paidLegs);
      const paidPassCalls = passSpy.mock.calls.filter(([args]) => {
        const input = args as unknown as { readonly penalty?: bigint };
        return input.penalty === penalty;
      }).length;

      expect(paidPassCalls).toBe(9);
      expect(paidLegs).toHaveLength(2);
      expect(reallocatedAssets).toBeGreaterThanOrEqual(2n + penaltyAssets);
      expect(reallocatedAssets - penaltyAssets).toBe(2n);
    } finally {
      passSpy.mockRestore();
    }
  });

  test("bounds retries for a penalty one unit below WAD", () => {
    const penalty = MathLib.WAD - 1n;
    const idle = (3n * MathLib.WAD) / 4n;
    const allocatorTargetCap = 2n * idle;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      idle,
      canPullFromMarket: false,
      penalty,
      allocatorTargetCap,
      targetCaps: [
        { absoluteCap: allocatorTargetCap, relativeCap: MathLib.WAD },
        { absoluteCap: allocatorTargetCap, relativeCap: MathLib.WAD },
        { absoluteCap: allocatorTargetCap, relativeCap: MathLib.WAD },
      ],
    });
    const multiVaultData = addSecondVault(data, {
      idle,
      penalty,
      allocatorTargetCap,
    });
    const passSpy = vi.spyOn(
      VaultV2BlueReallocationData.prototype as unknown as {
        computeVaultV2BlueReallocationsAtUtilizationInPlace: (
          ...args: never[]
        ) => unknown;
      },
      "computeVaultV2BlueReallocationsAtUtilizationInPlace",
    );

    try {
      expect(() =>
        multiVaultData.computeVaultV2BlueReallocations(targetParams.id, {
          maxPenalty: penalty,
          operation: { type: "refinance", amount: 11n },
        }),
      ).toThrow(InsufficientSharedLiquidityError);
      const paidPassCalls = passSpy.mock.calls.filter(([args]) => {
        const input = args as unknown as { readonly penalty?: bigint };
        return input.penalty === penalty;
      }).length;

      expect(paidPassCalls).toBe(18);
    } finally {
      passSpy.mockRestore();
    }
  });

  test("keeps the best paid refinance attempt for non-monotonic shared-cap fits", () => {
    const penalty = MathLib.WAD / 10n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      blueBalances: { [LOAN_TOKEN]: 100n },
      idle: 5n,
      canPullFromMarket: false,
      penalty,
    });
    const multiVaultData = addSecondVault(data, { idle: 5n, penalty });
    type PassInput = {
      readonly maxAssets?: bigint;
      readonly penalty?: bigint;
      readonly [key: string]: unknown;
    };
    type PassResult = {
      readonly reallocations: readonly VaultV2BlueReallocation[];
    };
    const passPrototype = VaultV2BlueReallocationData.prototype as unknown as {
      computeVaultV2BlueReallocationsAtUtilizationInPlace: (
        this: VaultV2BlueReallocationData,
        input: PassInput,
      ) => PassResult;
    };
    const originalPass = originalComputeAtUtilization as unknown as (
      this: VaultV2BlueReallocationData,
      input: PassInput,
    ) => PassResult;
    const ownedPassInstances = new WeakSet<VaultV2BlueReallocationData>();
    const markOwned = (
      instance: VaultV2BlueReallocationData,
    ): VaultV2BlueReallocationData => {
      ownedPassInstances.add(instance);
      const clone = instance.clone.bind(instance);
      vi.spyOn(instance, "clone").mockImplementation(() => markOwned(clone()));
      return instance;
    };
    markOwned(multiVaultData);
    const attempts: {
      readonly assets: bigint;
      readonly legs: readonly VaultV2BlueReallocation[];
      readonly remainingShortfall: bigint;
    }[] = [];
    let paidPassCalls = 0;
    const passSpy = vi
      .spyOn(
        passPrototype,
        "computeVaultV2BlueReallocationsAtUtilizationInPlace",
      )
      .mockImplementation(function (
        this: VaultV2BlueReallocationData,
        input: PassInput,
      ) {
        const reduceBudget =
          ownedPassInstances.has(this) &&
          input.penalty === penalty &&
          ++paidPassCalls === 3;
        const adjustedInput = reduceBudget
          ? { ...input, maxAssets: 0n }
          : input;
        const pass = originalPass.call(this, adjustedInput);
        const assets = pass.reallocations.reduce(
          (total, { assets: legAssets }) => total + legAssets,
          0n,
        );
        const penaltyAssets = getBlueBundlesV1PenaltyAssets(pass.reallocations);
        if (ownedPassInstances.has(this) && input.penalty === penalty)
          attempts.push({
            assets,
            legs: pass.reallocations,
            remainingShortfall:
              8n + penaltyAssets > assets ? 8n + penaltyAssets - assets : 0n,
          });
        return pass;
      });

    try {
      const result = multiVaultData.computeVaultV2BlueReallocations(
        targetParams.id,
        {
          maxPenalty: penalty,
          operation: { type: "refinance", amount: 18n },
        },
      );

      expect(attempts).toHaveLength(3);
      expect(attempts[2]?.assets).toBeLessThan(attempts[1]!.assets);
      expect(attempts[1]?.remainingShortfall).toBe(0n);
      expect(attempts[2]?.remainingShortfall).toBeGreaterThan(0n);
      expect(result.reallocations).toEqual(attempts[1]?.legs);
      expect(
        result.reallocations.reduce(
          (total, { assets: legAssets }) => total + legAssets,
          0n,
        ) - getBlueBundlesV1PenaltyAssets(result.reallocations),
      ).toBe(8n);
    } finally {
      passSpy.mockRestore();
    }
  });

  test("requires refinance liquidity to cover its allocator penalties", () => {
    const penalty = MathLib.WAD / 10n;
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      blueBalances: wellFundedBlueBalances,
      idle: 10n,
      canPullFromMarket: false,
      penalty,
    });

    let refinanceError: InsufficientSharedLiquidityError | undefined;
    try {
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: penalty,
        operation: { type: "refinance", amount: 20n },
      });
    } catch (error) {
      if (error instanceof InsufficientSharedLiquidityError)
        refinanceError = error;
      else throw error;
    }
    expect(refinanceError).toBeDefined();
    expect(refinanceError?.params.shortfall).toBeGreaterThan(
      refinanceError?.params.available ?? 0n,
    );

    const borrow = data.computeVaultV2BlueReallocations(targetParams.id, {
      maxPenalty: penalty,
      operation: { type: "borrow", amount: 20n },
    });
    expect(
      borrow.reallocations.reduce((total, { assets }) => total + assets, 0n),
    ).toBe(10n);
  });

  test("skips 100%-penalty vaults for refinance", () => {
    const { data } = makeFixture({
      sourceSupply: 0n,
      targetSupply: 100n,
      targetBorrow: 90n,
      idle: 100n,
      canPullFromMarket: false,
      penalty: MathLib.WAD,
    });

    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id, {
        maxPenalty: MathLib.WAD,
        operation: { type: "refinance", amount: 20n },
      }),
    ).toThrow(InsufficientSharedLiquidityError);
  });

  test("validates the refinance referral fee percentage with Blue fee errors", () => {
    const { data } = makeFixture();

    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id, {
        operation: {
          type: "refinance",
          amount: 1n,
          referralFeePct: -1n,
        },
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      data.computeVaultV2BlueReallocations(targetParams.id, {
        operation: {
          type: "refinance",
          amount: 1n,
          referralFeePct: MathLib.WAD,
        },
      }),
    ).toThrow(ReferralFeePctExceededError);
  });
});

describe("VaultV2BlueReallocationData liquidity metrics", () => {
  test("behavior: available-liquidity planning defaults to the snapshot timestamp", () => {
    const timestamp = TIMESTAMP + Time.s.from.y(1n);
    const { data: fixtureData } = makeFixture({
      sourceSupply: 1_000n,
      sourceBorrow: 850n,
      sourceRateAtTarget: MathLib.WAD / Time.s.from.y(1n),
      targetSupply: 100n,
      targetBorrow: 0n,
    });
    const data = new VaultV2BlueReallocationData({
      ...fixtureData,
      timestamp,
    });

    const defaultLiquidity = data.getAvailableLiquidityToUtilization(
      targetParams.id,
    );
    const snapshotLiquidity = data.getAvailableLiquidityToUtilization(
      targetParams.id,
      undefined,
      { timestamp },
    );
    const lastUpdateLiquidity = data.getAvailableLiquidityToUtilization(
      targetParams.id,
      undefined,
      { timestamp: TIMESTAMP },
    );

    expect(defaultLiquidity).toBe(snapshotLiquidity);
    expect(defaultLiquidity).not.toBe(lastUpdateLiquidity);
  });

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

describe("VaultV2BlueReallocationData with a Midnight adapter", () => {
  const withMidnight = (data: VaultV2BlueReallocationData) =>
    new VaultV2BlueReallocationData({
      chainId: data.chainId,
      markets: data.markets,
      vaults: {
        [VAULT]: withMidnightAdapter(data.getVault(VAULT) as AccrualVaultV2, {
          credit: 500n,
        }),
      },
      allocations: data.allocations,
      publicAllocatorConfigs: data.publicAllocatorConfigs,
      activeAdapters: data.activeAdapters,
      marketPublicAllocatorConfigs: data.marketPublicAllocatorConfigs,
    });

  test("behavior: clone shares the Midnight adapter snapshot", () => {
    const input = withMidnight(makeFixture().data);
    const midnight = input
      .getVault(VAULT)
      .accrualAdapters.find(({ address }) => address === MIDNIGHT_ADAPTER);

    const cloned = input.clone().getVault(VAULT);

    expect(midnight?.type).toBe("VaultV2MidnightAdapter");
    expect(
      cloned.accrualAdapters.find(
        ({ address }) => address === MIDNIGHT_ADAPTER,
      ),
    ).toBe(midnight);
  });

  test("behavior: Blue reallocations on a Blue + Midnight vault equal the Blue-only plan", () => {
    const { data } = makeFixture();

    const blueOnly = data.computeVaultV2BlueReallocations(targetParams.id);
    const mixed = withMidnight(data).computeVaultV2BlueReallocations(
      targetParams.id,
    );

    expect(blueOnly.reallocations).not.toHaveLength(0);
    expect(mixed.reallocations).toEqual(blueOnly.reallocations);
    expect(
      mixed.reallocations.flatMap(({ from, to }) =>
        from.type === "market" ? [from.adapter, to.adapter] : [to.adapter],
      ),
    ).not.toContain(MIDNIGHT_ADAPTER);
  });
});
