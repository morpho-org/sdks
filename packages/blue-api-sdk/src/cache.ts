import type { DottedKeys } from "@morpho-org/morpho-ts";
import type {
  Market,
  MarketPosition,
  MarketStateReward,
  MarketWarning,
  Vault,
  VaultAllocation,
  VaultPendingCap,
  VaultWarning,
} from "./types";

type ReadFieldFunction = <T, K extends keyof T = keyof T>(
  fieldName: K,
  from: T,
) => T[K];

type MergeObjectsFunction = <T extends { __typename?: string }>(
  existing: T,
  incoming: T,
) => T;

export const readMaybeBigInt = (value: string | number | undefined | null) => {
  if (value == null) return value;

  return BigInt(value);
};

export const mergeArrayByField = <
  T extends { __typename?: string },
  Path extends DottedKeys<T> = DottedKeys<T>,
>(
  ...paths: Path[]
) => {
  const splittedPaths = paths.map((path) => path.split("."));

  return (
    existing: T[] | null | undefined,
    incoming: T[],
    {
      readField,
      mergeObjects,
    }: {
      readField: ReadFieldFunction;
      mergeObjects: MergeObjectsFunction;
    },
  ) => {
    const _get = (
      // biome-ignore lint/suspicious/noExplicitAny: recursion breaks type
      data: any,
      path: string[],
    ): PropertyKey | null | undefined => {
      if (path.length === 0) return data;

      const [key, ...rest] = path;

      return _get(readField(key!, data), rest);
    };

    const getId = (
      // biome-ignore lint/suspicious/noExplicitAny: recursion breaks type
      data: any,
      i = splittedPaths.length - 1,
    ): PropertyKey | null | undefined => {
      if (i < 0) return;

      return _get(data, splittedPaths[i]!) ?? getId(data, i - 1);
    };

    const merged = existing ? existing.slice(0) : [];

    const indexes = new Map<PropertyKey, number>();
    existing?.forEach((entity, index) => {
      const id = getId(entity);
      if (id == null) return;

      indexes.set(id, index);
    });

    incoming.forEach((entity) => {
      const id = getId(entity);

      if (id != null) {
        const index = indexes.get(id);

        if (index != null) {
          merged[index] = mergeObjects(merged[index]!, entity);

          return;
        }
      }

      merged.push(entity);
    });

    return merged;
  };
};

export const typePolicies = {
  Transaction: {
    fields: {
      chain: {
        merge: true,
      },
      user: {
        merge: true,
      },
      timestamp: {
        read: readMaybeBigInt,
      },
      blockNumber: {
        read: readMaybeBigInt,
      },
    },
  },
  MorphoBlue: {
    fields: {
      chain: {
        merge: true,
      },
      state: {
        merge: true,
      },
      historicalState: {
        merge: true,
      },
    },
  },
  MorphoBlueState: {
    fields: {
      timestamp: {
        read: readMaybeBigInt,
      },
    },
  },
  ChainSynchronizationState: {
    fields: {
      blockNumber: {
        read: readMaybeBigInt,
      },
      chain: {
        merge: true,
      },
    },
  },
  Oracle: {
    fields: {
      chain: {
        merge: true,
      },
    },
  },
  OracleFeed: {
    fields: {
      chain: {
        merge: true,
      },
      data: {
        merge: true,
      },
      markets: {
        merge: mergeArrayByField<Market>("id"),
      },
    },
  },
  User: {
    fields: {
      chain: {
        merge: true,
      },
      state: {
        merge: true,
      },
      historicalState: {
        merge: true,
      },
      marketPositions: {
        merge: mergeArrayByField<MarketPosition>("id", "market.id"),
      },
    },
  },
  Asset: {
    fields: {
      totalSupply: {
        read: readMaybeBigInt,
      },
    },
  },
  Market: {
    fields: {
      collateralAsset: {
        merge: true,
      },
      loanAsset: {
        merge: true,
      },
      lltv: {
        read: readMaybeBigInt,
      },
      collateralPrice: {
        read: readMaybeBigInt,
      },
      reallocatableLiquidityAssets: {
        read: readMaybeBigInt,
      },
      creationTimestamp: {
        read: readMaybeBigInt,
      },
      state: {
        merge: true,
      },
      historicalState: {
        merge: true,
      },
      dailyApys: {
        merge: true,
      },
      weeklyApys: {
        merge: true,
      },
      monthlyApys: {
        merge: true,
      },
      quarterlyApys: {
        merge: true,
      },
      yearlyApys: {
        merge: true,
      },
      supplyingVaults: {
        merge: mergeArrayByField<Vault>("id"),
      },
      warnings: {
        merge: mergeArrayByField<MarketWarning>("type"),
      },
    },
  },
  MarketState: {
    fields: {
      price: {
        read: readMaybeBigInt,
      },
      borrowAssets: {
        read: readMaybeBigInt,
      },
      supplyAssets: {
        read: readMaybeBigInt,
      },
      liquidityAssets: {
        read: readMaybeBigInt,
      },
      collateralAssets: {
        read: readMaybeBigInt,
      },
      borrowShares: {
        read: readMaybeBigInt,
      },
      supplyShares: {
        read: readMaybeBigInt,
      },
      timestamp: {
        read: readMaybeBigInt,
      },
      rateAtTarget: {
        read: readMaybeBigInt,
      },
      rewards: {
        merge: mergeArrayByField<MarketStateReward>("asset.id"),
      },
    },
  },
  MarketStateReward: {
    fields: {
      yearlySupplyTokens: {
        read: readMaybeBigInt,
      },
      yearlyBorrowTokens: {
        read: readMaybeBigInt,
      },
      amountPerSuppliedToken: {
        read: readMaybeBigInt,
      },
      amountPerBorrowedToken: {
        read: readMaybeBigInt,
      },
    },
  },
  MarketOracleFeed: {
    fields: {
      scaleFactor: {
        read: readMaybeBigInt,
      },
      baseVaultConversionSample: {
        read: readMaybeBigInt,
      },
      quoteVaultConversionSample: {
        read: readMaybeBigInt,
      },
    },
  },
  MarketBadDebt: {
    fields: {
      underlying: {
        read: readMaybeBigInt,
      },
    },
  },
  MarketPosition: {
    fields: {
      borrowAssets: {
        read: readMaybeBigInt,
      },
      borrowShares: {
        read: readMaybeBigInt,
      },
      supplyAssets: {
        read: readMaybeBigInt,
      },
      supplyShares: {
        read: readMaybeBigInt,
      },
      collateral: {
        read: readMaybeBigInt,
      },
      user: {
        merge: true,
      },
      market: {
        merge: true,
      },
      state: {
        merge: true,
      },
      historicalState: {
        merge: true,
      },
    },
  },
  MarketPositionState: {
    fields: {
      timestamp: {
        read: readMaybeBigInt,
      },
      pnl: {
        read: readMaybeBigInt,
      },
      supplyAssets: {
        read: readMaybeBigInt,
      },
      supplyShares: {
        read: readMaybeBigInt,
      },
      borrowAssets: {
        read: readMaybeBigInt,
      },
      borrowShares: {
        read: readMaybeBigInt,
      },
      collateral: {
        read: readMaybeBigInt,
      },
      collateralPrice: {
        read: readMaybeBigInt,
      },
      position: {
        merge: true,
      },
    },
  },
  Vault: {
    fields: {
      creationTimestamp: {
        read: readMaybeBigInt,
      },
      chain: {
        merge: true,
      },
      metadata: {
        merge: true,
      },
      state: {
        merge: true,
      },
      historicalState: {
        merge: true,
      },
      publicAllocatorConfig: {
        merge: true,
      },
      pendingCaps: {
        merge: mergeArrayByField<VaultPendingCap>("market.id"),
      },
      warnings: {
        merge: mergeArrayByField<VaultWarning>("type"),
      },
    },
  },
  VaultState: {
    fields: {
      timestamp: {
        read: readMaybeBigInt,
      },
      totalAssets: {
        read: readMaybeBigInt,
      },
      lastTotalAssets: {
        read: readMaybeBigInt,
      },
      totalSupply: {
        read: readMaybeBigInt,
      },
      timelock: {
        read: readMaybeBigInt,
      },
      pendingTimelock: {
        read: readMaybeBigInt,
      },
      pendingTimelockValidAt: {
        read: readMaybeBigInt,
      },
      pendingGuardianValidAt: {
        read: readMaybeBigInt,
      },
      sharePrice: {
        read: readMaybeBigInt,
      },
    },
  },
  VaultPosition: {
    fields: {
      assets: {
        read: readMaybeBigInt,
      },
      shares: {
        read: readMaybeBigInt,
      },
      user: {
        merge: true,
      },
      vault: {
        merge: true,
      },
      state: {
        merge: true,
      },
      historicalState: {
        merge: true,
      },
    },
  },
  VaultPositionState: {
    fields: {
      timestamp: {
        read: readMaybeBigInt,
      },
      pnl: {
        read: readMaybeBigInt,
      },
      supplyAssets: {
        read: readMaybeBigInt,
      },
      supplyShares: {
        read: readMaybeBigInt,
      },
      position: {
        merge: true,
      },
    },
  },
  VaultLiquidity: {
    fields: {
      underlying: {
        read: readMaybeBigInt,
      },
    },
  },
  VaultAllocation: {
    fields: {
      supplyAssets: {
        read: readMaybeBigInt,
      },
      supplyShares: {
        read: readMaybeBigInt,
      },
      supplyCap: {
        read: readMaybeBigInt,
      },
      market: {
        merge: true,
      },
    },
  },
  VaultReallocate: {
    fields: {
      shares: {
        read: readMaybeBigInt,
      },
      assets: {
        read: readMaybeBigInt,
      },
      timestamp: {
        read: readMaybeBigInt,
      },
      blockNumber: {
        read: readMaybeBigInt,
      },
      market: {
        merge: true,
      },
      vault: {
        merge: true,
      },
    },
  },
  VaultHistory: {
    fields: {
      allocation: {
        merge: mergeArrayByField<VaultAllocation>("market.id"),
      },
    },
  },
  VaultAllocator: {
    fields: {
      timestamp: {
        read: readMaybeBigInt,
      },
      blockNumber: {
        read: readMaybeBigInt,
      },
    },
  },
  VaultPendingCap: {
    fields: {
      supplyCap: {
        read: readMaybeBigInt,
      },
      validAt: {
        read: readMaybeBigInt,
      },
    },
  },
  PublicAllocatorConfig: {
    fields: {
      fee: {
        read: readMaybeBigInt,
      },
      accruedFee: {
        read: readMaybeBigInt,
      },
    },
  },
  PublicAllocatorSharedLiquidity: {
    fields: {
      assets: {
        read: readMaybeBigInt,
      },
    },
  },
  MarketTransferTransactionData: {
    fields: {
      assets: {
        read: readMaybeBigInt,
      },
      shares: {
        read: readMaybeBigInt,
      },
      market: {
        merge: true,
      },
    },
  },
  MarketCollateralTransferTransactionData: {
    fields: {
      assets: {
        read: readMaybeBigInt,
      },
      market: {
        merge: true,
      },
    },
  },
  MarketLiquidationTransactionData: {
    fields: {
      badDebtAssets: {
        read: readMaybeBigInt,
      },
      badDebtShares: {
        read: readMaybeBigInt,
      },
      repaidAssets: {
        read: readMaybeBigInt,
      },
      repaidShares: {
        read: readMaybeBigInt,
      },
      seizedAssets: {
        read: readMaybeBigInt,
      },
      market: {
        merge: true,
      },
    },
  },
  VaultTransactionData: {
    fields: {
      assets: {
        read: readMaybeBigInt,
      },
      shares: {
        read: readMaybeBigInt,
      },
      vault: {
        merge: true,
      },
    },
  },
  BigIntDataPoint: {
    fields: {
      y: {
        read: readMaybeBigInt,
      },
    },
  },
  CollateralAtRiskDataPoint: {
    fields: {
      collateralAssets: {
        read: readMaybeBigInt,
      },
    },
  },
};
