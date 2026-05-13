import {
  ChainId,
  Holding,
  Market,
  type MarketId,
  MarketParams,
  MathLib,
  Position,
  Vault,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import { maxUint256, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  MissingPublicAllocatorConfigError,
  type PublicReallocation,
  UnknownReallocationHoldingError,
  UnknownReallocationMarketError,
  UnknownReallocationPositionError,
  UnknownReallocationVaultError,
  UnknownReallocationVaultMarketConfigError,
} from "../types/index.js";
import { ReallocationData } from "./reallocationData.js";

const TIMESTAMP = 1_700_000_000n;
const VAULT: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER_VAULT: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
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

const alternateSourceParams = new MarketParams({
  loanToken: LOAN_TOKEN,
  collateralToken: "0xae78736Cd615f374D3085123A210448E74Fc6393",
  oracle: "0x0000000000000000000000000000000000000004",
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

// biome-ignore lint/complexity/useMaxParams: compact fixture helper for market/user position rows.
const makePosition = (
  marketId: MarketId,
  supplyShares: bigint,
  user: Address = VAULT,
) =>
  new Position({
    user,
    marketId,
    supplyShares,
    borrowShares: 0n,
    collateral: 0n,
  });

const makeVaultMarketConfig = ({
  vault = VAULT,
  marketId,
  cap,
  maxIn,
  maxOut,
  enabled = true,
  pendingCap = { value: cap, validAt: TIMESTAMP - 1n },
  withPublicAllocatorConfig = true,
}: {
  readonly vault?: Address;
  readonly marketId: MarketId;
  readonly cap: bigint;
  readonly maxIn: bigint;
  readonly maxOut: bigint;
  readonly enabled?: boolean;
  readonly pendingCap?: { readonly value: bigint; readonly validAt: bigint };
  readonly withPublicAllocatorConfig?: boolean;
}) =>
  new VaultMarketConfig({
    vault,
    marketId,
    cap,
    pendingCap,
    removableAt: 0n,
    enabled,
    publicAllocatorConfig: withPublicAllocatorConfig
      ? new VaultMarketPublicAllocatorConfig({
          vault,
          marketId,
          maxIn,
          maxOut,
        })
      : undefined,
  });

const makeVault = ({
  address = VAULT,
  publicAllocatorConfig,
  withoutPublicAllocatorConfig = false,
  withdrawQueue = [sourceParams.id, targetParams.id],
}: {
  readonly address?: Address;
  readonly publicAllocatorConfig?: Vault["publicAllocatorConfig"];
  readonly withoutPublicAllocatorConfig?: boolean;
  readonly withdrawQueue?: readonly MarketId[];
} = {}) => {
  const resolvedPublicAllocatorConfig = withoutPublicAllocatorConfig
    ? undefined
    : (publicAllocatorConfig ?? {
        admin: zeroAddress,
        fee: 13n,
        accruedFee: 0n,
      });

  return new Vault({
    address,
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
    withdrawQueue: [...withdrawQueue],
    totalSupply: 0n,
    totalAssets: 0n,
    lastTotalAssets: 0n,
    publicAllocatorConfig: resolvedPublicAllocatorConfig,
  });
};

const makeHolding = () =>
  new Holding({
    user: VAULT,
    token: LOAN_TOKEN,
    erc20Allowances: {
      morpho: maxUint256,
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

type MutableReallocationInput = {
  readonly chainId: number;
  markets: Record<MarketId, Market | undefined>;
  vaults: Record<Address, Vault | undefined>;
  positions: Record<Address, Record<MarketId, Position | undefined>>;
  holdings: Record<Address, Record<Address, Holding | undefined>>;
  vaultMarketConfigs: Record<
    Address,
    Record<MarketId, VaultMarketConfig | undefined>
  >;
};

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
}): MutableReallocationInput => ({
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

type ReallocationDataInternals = {
  applyPublicReallocation(
    vault: Address,
    supplyMarketId: MarketId,
    withdrawal: PublicReallocation,
    timestamp: bigint,
  ): ReallocationData;
};

const applyPublicReallocation = (
  data: ReallocationData,
  withdrawal: PublicReallocation,
) =>
  (data as unknown as ReallocationDataInternals).applyPublicReallocation(
    withdrawal.vault,
    targetParams.id,
    withdrawal,
    TIMESTAMP,
  );

describe("ReallocationData unit coverage", () => {
  test("clones inputs and exposes getters without sharing mutable entity instances", () => {
    const emptyData = new ReallocationData({ chainId: ChainId.EthMainnet });
    expect(emptyData.markets).toEqual({});
    expect(emptyData.vaults).toEqual({});
    expect(emptyData.positions).toEqual({});
    expect(emptyData.holdings).toEqual({});
    expect(emptyData.vaultMarketConfigs).toEqual({});

    const input = makeInput({
      targetSupply: 1000n * MathLib.WAD,
      targetBorrow: 500n * MathLib.WAD,
      sourceSupply: 1000n * MathLib.WAD,
      sourceBorrow: 500n * MathLib.WAD,
    });
    const data = new ReallocationData({
      ...input,
      markets: { ...input.markets, ["0x00" as MarketId]: undefined },
      vaults: { ...input.vaults, [zeroAddress]: undefined },
      positions: {
        ...input.positions,
        [zeroAddress]: { ["0x00" as MarketId]: undefined },
      },
      holdings: {
        ...input.holdings,
        [zeroAddress]: { [zeroAddress]: undefined },
      },
      vaultMarketConfigs: {
        ...input.vaultMarketConfigs,
        [zeroAddress]: { ["0x00" as MarketId]: undefined },
      },
    });
    const clone = data.clone();

    expect(data.chainId).toBe(ChainId.EthMainnet);
    expect(data.getMarket(targetParams.id)).not.toBe(
      input.markets![targetParams.id],
    );
    expect(data.getVault(VAULT)).not.toBe(input.vaults![VAULT]);
    expect(data.getPosition(VAULT, sourceParams.id)).not.toBe(
      input.positions![VAULT]![sourceParams.id],
    );
    expect(data.getHolding(VAULT, LOAN_TOKEN)).not.toBe(
      input.holdings![VAULT]![LOAN_TOKEN],
    );
    expect(data.getVaultMarketConfig(VAULT, sourceParams.id)).not.toBe(
      input.vaultMarketConfigs![VAULT]![sourceParams.id],
    );
    expect(clone.getMarket(targetParams.id)).not.toBe(
      data.getMarket(targetParams.id),
    );
    expect(data.getPosition(VAULT, sourceParams.id).supplyShares).toBe(
      1000n * MathLib.WAD,
    );

    const missingMarket = `0x${"11".repeat(32)}` as MarketId;
    const missingAddress =
      "0x000000000000000000000000000000000000dEaD" as Address;
    expect(() => data.getMarket(missingMarket)).toThrow(
      UnknownReallocationMarketError,
    );
    expect(() => data.getVault(missingAddress)).toThrow(
      UnknownReallocationVaultError,
    );
    expect(() => data.getPosition(missingAddress, missingMarket)).toThrow(
      UnknownReallocationPositionError,
    );
    expect(() => data.getHolding(missingAddress, missingAddress)).toThrow(
      UnknownReallocationHoldingError,
    );
    expect(() =>
      data.getVaultMarketConfig(missingAddress, missingMarket),
    ).toThrow(UnknownReallocationVaultMarketConfigError);
  });

  test("handles allocator options, filtering, pending caps, and repeated withdrawals", () => {
    const input = makeInput({
      targetSupply: 1000n * MathLib.WAD,
      targetBorrow: 500n * MathLib.WAD,
      sourceSupply: 1000n * MathLib.WAD,
      sourceBorrow: 500n * MathLib.WAD,
    });
    input.vaultMarketConfigs![VAULT]![targetParams.id] = makeVaultMarketConfig({
      marketId: targetParams.id,
      cap: 10_000n * MathLib.WAD,
      pendingCap: { value: 10n * MathLib.WAD, validAt: TIMESTAMP },
      maxIn: 10_000n * MathLib.WAD,
      maxOut: 0n,
    });
    input.vaultMarketConfigs![VAULT]![sourceParams.id] = makeVaultMarketConfig({
      marketId: sourceParams.id,
      cap: 10_000n * MathLib.WAD,
      maxIn: 0n,
      maxOut: 10n * MathLib.WAD,
    });
    const data = new ReallocationData(input);

    expect(
      data.getMarketPublicReallocations(targetParams.id, { enabled: false }),
    ).toEqual({ withdrawals: [], data });
    expect(
      data.getMarketPublicReallocations(targetParams.id, undefined, {
        timestamp: TIMESTAMP,
        reallocatableVaults: [],
      }).withdrawals,
    ).toEqual([]);
    expect(
      data.getMarketPublicReallocations(targetParams.id, {
        reallocatableVaults: [zeroAddress],
      }).withdrawals,
    ).toEqual([]);

    const { withdrawals, data: reallocatedData } =
      data.getMarketPublicReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
        defaultMaxWithdrawalUtilization: MathLib.WAD,
      });

    expect(withdrawals).toEqual([
      {
        vault: VAULT,
        id: sourceParams.id,
        assets: 10n * MathLib.WAD,
      },
    ]);
    expect(
      reallocatedData.getMarketPublicReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
        defaultMaxWithdrawalUtilization: MathLib.WAD,
      }).withdrawals,
    ).toEqual([]);
    expect(data.getMarket(targetParams.id).totalSupplyAssets).toBe(
      1000n * MathLib.WAD,
    );
    expect(reallocatedData.getMarket(targetParams.id).totalSupplyAssets).toBe(
      1010n * MathLib.WAD,
    );
    expect(
      reallocatedData.getVault(VAULT).publicAllocatorConfig?.accruedFee,
    ).toBe(13n);
  });

  test("skips unusable source markets and missing public allocator limits", () => {
    const missingMarket = `0x${"22".repeat(32)}` as MarketId;
    const input = makeInput({
      targetSupply: 1000n * MathLib.WAD,
      targetBorrow: 500n * MathLib.WAD,
      sourceSupply: 1000n * MathLib.WAD,
      sourceBorrow: 500n * MathLib.WAD,
    });
    input.markets![alternateSourceParams.id] = makeMarket(
      alternateSourceParams,
      {
        supply: 1000n * MathLib.WAD,
        borrow: 100n * MathLib.WAD,
      },
    );
    input.positions![VAULT]![alternateSourceParams.id] = makePosition(
      alternateSourceParams.id,
      1000n * MathLib.WAD,
    );
    input.vaults![VAULT] = makeVault({
      withdrawQueue: [
        missingMarket,
        sourceParams.id,
        alternateSourceParams.id,
        targetParams.id,
      ],
    });
    input.vaultMarketConfigs![VAULT]![targetParams.id] = makeVaultMarketConfig({
      marketId: targetParams.id,
      cap: 10_000n * MathLib.WAD,
      pendingCap: { value: 30n * MathLib.WAD, validAt: TIMESTAMP },
      maxIn: 30n * MathLib.WAD,
      maxOut: 0n,
    });
    input.vaultMarketConfigs![VAULT]![sourceParams.id] = makeVaultMarketConfig({
      marketId: sourceParams.id,
      cap: 10_000n * MathLib.WAD,
      maxIn: 0n,
      maxOut: 10n * MathLib.WAD,
    });
    input.vaultMarketConfigs![VAULT]![alternateSourceParams.id] =
      makeVaultMarketConfig({
        marketId: alternateSourceParams.id,
        cap: 10_000n * MathLib.WAD,
        maxIn: 0n,
        maxOut: 20n * MathLib.WAD,
      });
    input.vaults![OTHER_VAULT] = makeVault({
      address: OTHER_VAULT,
      withdrawQueue: [sourceParams.id, targetParams.id],
    });
    input.positions![OTHER_VAULT] = {
      [targetParams.id]: makePosition(targetParams.id, 0n, OTHER_VAULT),
      [sourceParams.id]: makePosition(
        sourceParams.id,
        1000n * MathLib.WAD,
        OTHER_VAULT,
      ),
    };
    input.vaultMarketConfigs![OTHER_VAULT] = {
      [targetParams.id]: makeVaultMarketConfig({
        vault: OTHER_VAULT,
        marketId: targetParams.id,
        cap: 10_000n * MathLib.WAD,
        pendingCap: { value: 15n * MathLib.WAD, validAt: TIMESTAMP },
        maxIn: 15n * MathLib.WAD,
        maxOut: 0n,
      }),
      [sourceParams.id]: makeVaultMarketConfig({
        vault: OTHER_VAULT,
        marketId: sourceParams.id,
        cap: 10_000n * MathLib.WAD,
        maxIn: 0n,
        maxOut: 15n * MathLib.WAD,
      }),
    };

    expect(
      new ReallocationData(input).getMarketPublicReallocations(
        targetParams.id,
        {
          timestamp: TIMESTAMP,
          defaultMaxWithdrawalUtilization: MathLib.WAD,
        },
      ).withdrawals,
    ).toEqual([
      {
        vault: VAULT,
        id: alternateSourceParams.id,
        assets: 20n * MathLib.WAD,
      },
      {
        vault: OTHER_VAULT,
        id: sourceParams.id,
        assets: 15n * MathLib.WAD,
      },
      {
        vault: VAULT,
        id: sourceParams.id,
        assets: 10n * MathLib.WAD,
      },
    ]);

    expect(
      new ReallocationData({
        ...input,
        vaultMarketConfigs: {
          [VAULT]: {
            ...input.vaultMarketConfigs![VAULT]!,
            [targetParams.id]: makeVaultMarketConfig({
              marketId: targetParams.id,
              cap: 10_000n * MathLib.WAD,
              maxIn: 30n * MathLib.WAD,
              maxOut: 0n,
              withPublicAllocatorConfig: false,
            }),
          },
        },
      }).getMarketPublicReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
      }).withdrawals,
    ).toEqual([]);

    expect(
      new ReallocationData({
        ...input,
        vaultMarketConfigs: {
          [VAULT]: {
            ...input.vaultMarketConfigs![VAULT]!,
            [sourceParams.id]: makeVaultMarketConfig({
              marketId: sourceParams.id,
              cap: 10_000n * MathLib.WAD,
              maxIn: 0n,
              maxOut: 10n * MathLib.WAD,
              withPublicAllocatorConfig: false,
            }),
          },
        },
      }).getMarketPublicReallocations(targetParams.id, {
        timestamp: TIMESTAMP,
        defaultMaxWithdrawalUtilization: MathLib.WAD,
      }).withdrawals,
    ).toEqual([
      {
        vault: VAULT,
        id: alternateSourceParams.id,
        assets: 20n * MathLib.WAD,
      },
    ]);
  });

  test("throws typed errors for impossible direct apply states", () => {
    const baseInput = makeInput({
      targetSupply: 1000n * MathLib.WAD,
      targetBorrow: 500n * MathLib.WAD,
      sourceSupply: 1000n * MathLib.WAD,
      sourceBorrow: 500n * MathLib.WAD,
    });
    const withdrawal = {
      vault: VAULT,
      id: sourceParams.id,
      assets: MathLib.WAD,
    } satisfies PublicReallocation;

    expect(() =>
      applyPublicReallocation(
        new ReallocationData({
          ...baseInput,
          vaults: {
            [VAULT]: makeVault({ withoutPublicAllocatorConfig: true }),
          },
        }),
        withdrawal,
      ),
    ).toThrow(MissingPublicAllocatorConfigError);

    expect(() =>
      applyPublicReallocation(
        new ReallocationData({
          ...baseInput,
          vaultMarketConfigs: {
            [VAULT]: {
              ...baseInput.vaultMarketConfigs![VAULT]!,
              [sourceParams.id]: makeVaultMarketConfig({
                marketId: sourceParams.id,
                cap: 10_000n * MathLib.WAD,
                maxIn: 0n,
                maxOut: 10_000n * MathLib.WAD,
                withPublicAllocatorConfig: false,
              }),
            },
          },
        }),
        withdrawal,
      ),
    ).toThrow(UnknownReallocationVaultMarketConfigError);

    expect(() =>
      applyPublicReallocation(
        new ReallocationData({
          ...baseInput,
          vaultMarketConfigs: {
            [VAULT]: {
              ...baseInput.vaultMarketConfigs![VAULT]!,
              [targetParams.id]: makeVaultMarketConfig({
                marketId: targetParams.id,
                cap: 10_000n * MathLib.WAD,
                maxIn: 10_000n * MathLib.WAD,
                maxOut: 0n,
                withPublicAllocatorConfig: false,
              }),
            },
          },
        }),
        withdrawal,
      ),
    ).toThrow(UnknownReallocationVaultMarketConfigError);
  });
});
