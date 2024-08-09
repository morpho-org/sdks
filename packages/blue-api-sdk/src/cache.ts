import { MarketStateReward, VaultAllocation } from "./types";

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

export const typePolicies = {
  Transaction: {
    fields: {
      timestamp: {
        read: readMaybeBigInt,
      },
      blockNumber: {
        read: readMaybeBigInt,
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
        // Fixes issue with cache causing infinite query loop when querying market history through multiple queries
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
    },
  },
  MarketState: {
    fields: {
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
      rewards: {
        // Merges two arrays of MarketStateReward objects, where the merge is based on the asset id
        // Asset id must be queried for this to work.
        // https://www.apollographql.com/docs/react/caching/cache-field-behavior/#merging-arrays-of-non-normalized-objects
        merge: (
          existing: MarketStateReward[] | null | undefined,
          incoming: MarketStateReward[],
          {
            readField,
            mergeObjects,
          }: {
            readField: ReadFieldFunction;
            mergeObjects: MergeObjectsFunction;
          },
        ) => {
          const merged = existing ? existing.slice(0) : [];

          const assetIdToIndex = new Map<string, number>();
          existing?.forEach((marketStateReward, index) => {
            const asset = readField("asset", marketStateReward);
            const assetId = readField("id", asset);
            if (!assetId)
              throw Error(
                'Expected "asset.id" field to be defined. Check that the "asset" field is present in the query',
              );

            assetIdToIndex.set(assetId, index);
          });

          incoming.forEach((marketStateReward) => {
            const asset = readField("asset", marketStateReward);
            const assetId = readField("id", asset);
            const index = assetIdToIndex.get(assetId);

            if (assetId && index != null)
              merged[index] = mergeObjects(merged[index]!, marketStateReward);
            else merged.push(marketStateReward);
          });

          return merged;
        },
      },
    },
  },
  MarketStateReward: {
    fields: {
      yearlyBorrowTokens: {
        read: readMaybeBigInt,
      },
      yearlySupplyTokens: {
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
    },
  },
  Vault: {
    fields: {
      creationTimestamp: {
        read: readMaybeBigInt,
      },
      metadata: {
        merge: true,
      },
      historicalState: {
        // Fixes issue with cache causing infinite query loop when querying vault history through multiple queries
        merge: true,
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
    },
  },
  VaultHistory: {
    fields: {
      allocation: {
        // Merges two arrays of VaultAllocation objects, where the merge is based on the market id
        // Vault id must be queried for this to work.
        // https://www.apollographql.com/docs/react/caching/cache-field-behavior/#merging-arrays-of-non-normalized-objects
        merge: (
          existing: VaultAllocation[] | null | undefined,
          incoming: VaultAllocation[],
          {
            readField,
            mergeObjects,
          }: {
            readField: ReadFieldFunction;
            mergeObjects: MergeObjectsFunction;
          },
        ) => {
          const merged = existing ? existing.slice(0) : [];

          const vaultIdToIndex = new Map<string, number>();
          existing?.forEach((allocation, index) => {
            const market = readField("market", allocation);
            const marketId = readField("id", market);
            if (!marketId)
              throw Error(
                'Expected "market.id" field to be defined. Check that the "market" field is present in the query',
              );

            vaultIdToIndex.set(marketId, index);
          });

          incoming.forEach((allocation) => {
            const market = readField("market", allocation);
            const marketId = readField("id", market);
            const index = vaultIdToIndex.get(marketId);

            if (marketId && index != null)
              merged[index] = mergeObjects(merged[index]!, allocation);
            else merged.push(allocation);
          });

          return merged;
        },
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
    },
  },
  MarketCollateralTransferTransactionData: {
    fields: {
      assets: {
        read: readMaybeBigInt,
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
