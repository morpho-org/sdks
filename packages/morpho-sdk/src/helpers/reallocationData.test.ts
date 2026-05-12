import {
  ChainId,
  Holding,
  Market,
  type MarketId,
  MarketParams,
  MarketUtils,
  MathLib,
  Position,
  Vault,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import {
  type InputSimulationState,
  SimulationState,
} from "@morpho-org/simulation-sdk";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import type {
  InputReallocationData,
  ReallocationComputeOptions,
  VaultReallocation,
} from "../types/index.js";
import { computeReallocations } from "./computeReallocations.js";
import {
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
} from "./constant.js";
import { ReallocationData } from "./reallocationData.js";

const TIMESTAMP = 1_700_000_000n;
const VAULT: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const LOAN_TOKEN: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const targetParams = new MarketParams({
  loanToken: LOAN_TOKEN,
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  oracle: "0x0000000000000000000000000000000000000001",
  irm: "0x0000000000000000000000000000000000000002",
  lltv: 860000000000000000n,
});

const sourceParams = new MarketParams({
  loanToken: LOAN_TOKEN,
  collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  oracle: "0x0000000000000000000000000000000000000003",
  irm: "0x0000000000000000000000000000000000000002",
  lltv: 860000000000000000n,
});

const makeMarket = (
  params: MarketParams,
  {
    supply,
    borrow,
  }: {
    readonly supply: bigint;
    readonly borrow: bigint;
  },
) =>
  new Market({
    params,
    totalSupplyAssets: supply,
    totalBorrowAssets: borrow,
    totalSupplyShares: supply,
    totalBorrowShares: borrow,
    lastUpdate: TIMESTAMP,
    fee: 0n,
    price: 10n ** 36n,
  });

const makePosition = (marketId: MarketId, supplyShares: bigint) =>
  new Position({
    user: VAULT,
    marketId,
    supplyShares,
    borrowShares: 0n,
    collateral: 0n,
  });

const makeVaultMarketConfig = ({
  marketId,
  cap,
  maxIn,
  maxOut,
}: {
  readonly marketId: MarketId;
  readonly cap: bigint;
  readonly maxIn: bigint;
  readonly maxOut: bigint;
}) =>
  new VaultMarketConfig({
    vault: VAULT,
    marketId,
    cap,
    pendingCap: { value: cap, validAt: TIMESTAMP - 1n },
    removableAt: 0n,
    enabled: true,
    publicAllocatorConfig: new VaultMarketPublicAllocatorConfig({
      vault: VAULT,
      marketId,
      maxIn,
      maxOut,
    }),
  });

const makeVault = () =>
  new Vault({
    address: VAULT,
    name: "Vault",
    symbol: "vTEST",
    decimalsOffset: 0n,
    asset: LOAN_TOKEN,
    curator: zeroAddress,
    owner: zeroAddress,
    guardian: zeroAddress,
    fee: 0n,
    feeRecipient: zeroAddress,
    skimRecipient: zeroAddress,
    pendingTimelock: { value: 0n, validAt: 0n },
    pendingGuardian: { value: zeroAddress, validAt: 0n },
    pendingOwner: zeroAddress,
    timelock: 0n,
    supplyQueue: [targetParams.id],
    withdrawQueue: [sourceParams.id, targetParams.id],
    totalSupply: 0n,
    totalAssets: 0n,
    lastTotalAssets: 0n,
    publicAllocatorConfig: {
      admin: zeroAddress,
      fee: 13n,
      accruedFee: 0n,
    },
  });

const makeHolding = () =>
  new Holding({
    user: VAULT,
    token: LOAN_TOKEN,
    erc20Allowances: {
      morpho: 0n,
      permit2: 0n,
      "bundler3.generalAdapter1": 0n,
    },
    permit2BundlerAllowance: {
      amount: 0n,
      expiration: 0n,
      nonce: 0n,
    },
    balance: 0n,
  });

const makeInput = ({
  targetSupply,
  targetBorrow,
  sourceSupply,
  sourceBorrow,
}: {
  readonly targetSupply: bigint;
  readonly targetBorrow: bigint;
  readonly sourceSupply: bigint;
  readonly sourceBorrow: bigint;
}): InputReallocationData => ({
  chainId: ChainId.EthMainnet,
  markets: {
    [targetParams.id]: makeMarket(targetParams, {
      supply: targetSupply,
      borrow: targetBorrow,
    }),
    [sourceParams.id]: makeMarket(sourceParams, {
      supply: sourceSupply,
      borrow: sourceBorrow,
    }),
  },
  vaults: {
    [VAULT]: makeVault(),
  },
  positions: {
    [VAULT]: {
      [targetParams.id]: makePosition(targetParams.id, 0n),
      [sourceParams.id]: makePosition(sourceParams.id, sourceSupply),
    },
  },
  holdings: {
    [VAULT]: {
      [LOAN_TOKEN]: makeHolding(),
    },
  },
  vaultMarketConfigs: {
    [VAULT]: {
      [targetParams.id]: makeVaultMarketConfig({
        marketId: targetParams.id,
        cap: 10_000n * MathLib.WAD,
        maxIn: 10_000n * MathLib.WAD,
        maxOut: 0n,
      }),
      [sourceParams.id]: makeVaultMarketConfig({
        marketId: sourceParams.id,
        cap: 10_000n * MathLib.WAD,
        maxIn: 0n,
        maxOut: 10_000n * MathLib.WAD,
      }),
    },
  },
});

const makeLegacyState = (input: InputReallocationData) =>
  new SimulationState({
    chainId: input.chainId,
    block: { number: 1n, timestamp: TIMESTAMP },
    markets: input.markets as InputSimulationState["markets"],
    vaults: input.vaults as InputSimulationState["vaults"],
    positions: input.positions as InputSimulationState["positions"],
    holdings: input.holdings as InputSimulationState["holdings"],
    vaultMarketConfigs:
      input.vaultMarketConfigs as InputSimulationState["vaultMarketConfigs"],
  });

const toLegacyOptions = (options?: ReallocationComputeOptions) =>
  options == null
    ? undefined
    : {
        ...options,
        reallocatableVaults:
          options.reallocatableVaults == null
            ? undefined
            : [...options.reallocatableVaults],
      };

const computeLegacyReallocations = ({
  reallocationData: data,
  marketId,
  borrowAmount,
  options,
}: {
  readonly reallocationData: SimulationState;
  readonly marketId: MarketId;
  readonly borrowAmount: bigint;
  readonly options?: ReallocationComputeOptions;
}): readonly VaultReallocation[] => {
  if (options?.enabled === false) return [];

  const timestamp =
    options?.timestamp == null
      ? data.block.timestamp
      : BigInt(options.timestamp);
  const market = data.getMarket(marketId).accrueInterest(timestamp);
  const newTotalBorrowAssets = market.totalBorrowAssets + borrowAmount;
  const newTotalSupplyAssets = market.totalSupplyAssets;
  const supplyTargetUtilization =
    options?.supplyTargetUtilization?.[market.params.id] ??
    options?.defaultSupplyTargetUtilization ??
    DEFAULT_SUPPLY_TARGET_UTILIZATION;

  if (
    MarketUtils.getUtilization({
      totalSupplyAssets: newTotalSupplyAssets,
      totalBorrowAssets: newTotalBorrowAssets,
    }) <= supplyTargetUtilization
  )
    return [];

  let requiredAssets =
    supplyTargetUtilization === 0n
      ? MathLib.MAX_UINT_160
      : MathLib.wDivDown(newTotalBorrowAssets, supplyTargetUtilization) -
        newTotalSupplyAssets;

  const { withdrawals, data: friendlyReallocationData } =
    data.getMarketPublicReallocations(market.id, toLegacyOptions(options));
  const friendlyReallocationMarket = friendlyReallocationData.getMarket(
    market.id,
  );

  if (
    friendlyReallocationMarket.totalBorrowAssets + borrowAmount >
    friendlyReallocationMarket.totalSupplyAssets
  ) {
    requiredAssets = newTotalBorrowAssets - newTotalSupplyAssets;
    withdrawals.push(
      ...friendlyReallocationData.getMarketPublicReallocations(market.id, {
        ...toLegacyOptions(options),
        defaultMaxWithdrawalUtilization: MathLib.WAD,
        maxWithdrawalUtilization: {},
      }).withdrawals,
    );
  }

  const reallocations = new Map<
    Address,
    { readonly id: MarketId; assets: bigint }[]
  >();

  for (const { vault, ...withdrawal } of withdrawals) {
    const vaultReallocations = reallocations.get(vault) ?? [];
    reallocations.set(vault, vaultReallocations);

    const existing = vaultReallocations.find(
      (item) => item.id === withdrawal.id,
    );
    const reallocatedAssets = MathLib.min(withdrawal.assets, requiredAssets);

    if (reallocatedAssets <= 0n) continue;

    if (existing != null) existing.assets += reallocatedAssets;
    else vaultReallocations.push({ ...withdrawal, assets: reallocatedAssets });

    requiredAssets -= reallocatedAssets;
    if (requiredAssets === 0n) break;
  }

  return [...reallocations.entries()]
    .filter(([, vaultWithdrawals]) => vaultWithdrawals.length > 0)
    .map(([vault, vaultWithdrawals]) => ({
      vault,
      fee: data.getVault(vault).publicAllocatorConfig!.fee,
      withdrawals: vaultWithdrawals
        .sort(({ id: idA }, { id: idB }) =>
          idA > idB ? 1 : idA < idB ? -1 : 0,
        )
        .map(({ id, assets }) => ({
          marketParams: data.getMarket(id).params,
          amount: assets,
        })),
    }));
};

const serializeReallocations = (reallocations: readonly VaultReallocation[]) =>
  reallocations.map(({ vault, fee, withdrawals }) => ({
    vault,
    fee,
    withdrawals: withdrawals.map(({ marketParams, amount }) => ({
      marketId: marketParams.id,
      amount,
    })),
  }));

describe("ReallocationData parity", () => {
  test("matches SimulationState for friendly public allocator reallocations", () => {
    const input = makeInput({
      targetSupply: 1000n * MathLib.WAD,
      targetBorrow: 500n * MathLib.WAD,
      sourceSupply: 1000n * MathLib.WAD,
      sourceBorrow: 500n * MathLib.WAD,
    });
    const options = {
      enabled: true,
      timestamp: TIMESTAMP,
      defaultMaxWithdrawalUtilization: DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
    } satisfies ReallocationComputeOptions;

    const actual = computeReallocations({
      reallocationData: new ReallocationData(input),
      marketId: targetParams.id,
      borrowAmount: 500n * MathLib.WAD,
      options,
    });
    const expected = computeLegacyReallocations({
      reallocationData: makeLegacyState(input),
      marketId: targetParams.id,
      borrowAmount: 500n * MathLib.WAD,
      options,
    });

    expect(serializeReallocations(actual)).toEqual(
      serializeReallocations(expected),
    );
  });

  test("matches SimulationState for aggressive public allocator fallback", () => {
    const input = makeInput({
      targetSupply: 850n * MathLib.WAD,
      targetBorrow: 500n * MathLib.WAD,
      sourceSupply: 1000n * MathLib.WAD,
      sourceBorrow: 828n * MathLib.WAD,
    });
    const options = {
      enabled: true,
      timestamp: TIMESTAMP,
      defaultMaxWithdrawalUtilization: DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
    } satisfies ReallocationComputeOptions;

    const actual = computeReallocations({
      reallocationData: new ReallocationData(input),
      marketId: targetParams.id,
      borrowAmount: 500n * MathLib.WAD,
      options,
    });
    const expected = computeLegacyReallocations({
      reallocationData: makeLegacyState(input),
      marketId: targetParams.id,
      borrowAmount: 500n * MathLib.WAD,
      options,
    });

    expect(serializeReallocations(actual)).toEqual(
      serializeReallocations(expected),
    );
    expect(actual[0]!.withdrawals[0]!.amount).toBe(150n * MathLib.WAD);
  });
});
