import type {
  AccrualVault,
  AccrualVaultV2,
  InputMarketParams,
  MarketId,
} from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type { SimulationState } from "../../result.js";

/**
 * Finite-or-flagged WAD metric used inside checks and limit outcomes.
 * `debtFree`/`unbounded` are defined absences, not missing evidence.
 * @internal
 */
export type RiskMetric =
  | { readonly type: "finite"; readonly valueWad: bigint }
  | { readonly type: "debtFree" }
  | {
      readonly type: "unbounded";
      readonly reason: "zeroCollateral" | "zeroLiquidity";
    };

/** Defined absence (`notApplicable` + reason) vs a present value. @internal */
export type Applicable<T> =
  | { readonly type: "applicable"; readonly value: T }
  | {
      readonly type: "notApplicable";
      readonly reason: "noOracle" | "noIrm" | "noPreLiquidation";
    };

/** Market extras checks/accrual need that the public `MarketState` does not carry. @internal */
export interface MarketInternals {
  readonly marketId: MarketId;
  readonly params: Readonly<InputMarketParams>;
  readonly oracleScale?: bigint;
  readonly borrowRatePerSecondWad?: bigint;
  readonly rateAtTargetPerSecondWad?: bigint;
  readonly preLiquidation?: {
    readonly address: Address;
    readonly preLltvWad: bigint;
  };
}

/** Vault extras: static config plus entity handles reused for accrual and share-cap math. @internal */
export interface VaultInternals {
  readonly version: "v1" | "v2";
  readonly feeRecipient?: Address;
  readonly performanceFeeWad?: bigint;
  readonly managementFeeWad?: bigint;
  readonly managementFeeRecipient?: Address;
  readonly decimalsOffset?: bigint;
  readonly lostAssets?: bigint;
  readonly lastTotalAssets?: bigint;
  readonly maxRatePerSecondWad?: bigint;
  readonly lastUpdate?: bigint;
  readonly recordedTotalAssets?: bigint;
  readonly virtualShares?: bigint;
  readonly liquidityAdapter?: Address;
  readonly sharePriceE27: bigint;
  /** Per-allocation extras beyond the public `{adapter, marketId, assets}` projection. */
  readonly allocations: readonly {
    readonly adapter?: Address;
    readonly marketId?: MarketId;
    readonly shares?: bigint;
    readonly absoluteCapAssets?: bigint;
    readonly relativeCapWad?: bigint;
    readonly penaltyWad?: bigint;
  }[];
  /** Fetched entity handle retained for accrual and exact share-cap math (never part of the snapshot). */
  readonly entity?: AccrualVault | AccrualVaultV2;
}

/** Position-level risk metrics kept out of the public projection (debt-free vs unbounded matter to limits). @internal */
export interface PositionInternals {
  readonly ltvWad: RiskMetric;
  readonly healthFactorWad: RiskMetric;
}

/** Lookup key for a position: `${marketId}:${owner}`. @internal */
export const positionKey = (marketId: MarketId, owner: Address): string =>
  `${marketId}:${owner}`;

/** State the checks consume: the public `SimulationState` plus per-subject internals. @internal */
export interface ParsedState extends SimulationState {
  readonly internals: {
    readonly markets: ReadonlyMap<MarketId, MarketInternals>;
    readonly vaults: ReadonlyMap<Address, VaultInternals>;
    readonly positions: ReadonlyMap<string, PositionInternals>;
  };
}
