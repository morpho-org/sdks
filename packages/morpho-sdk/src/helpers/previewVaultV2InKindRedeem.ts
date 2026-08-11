import {
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  type MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";

/** Inputs used to preview Vault V2 in-kind redemption market choices. */
export interface PreviewVaultV2InKindRedeemParams {
  /** Positive penalty-inclusive amount the user wants to exit. */
  readonly requestedExitAssets: bigint;
  /** Timestamp used to accrue every Morpho Blue market before converting adapter shares. */
  readonly timestamp: bigint;
}

/** Frontend-ready preview of a Vault V2 in-kind redemption through one Morpho Blue market. */
export interface VaultV2InKindRedeemMarketPreview {
  /** Morpho Blue market parameters to pass to the in-kind redemption action. */
  readonly marketParams: MarketParams;
  /** Maximum penalty-inclusive exit amount supported by this market and the vault's idle assets. */
  readonly maxExitAssets: bigint;
  /** Penalty-inclusive exit amount assigned to this market choice. */
  readonly exitAssets: bigint;
  /** Requested penalty-inclusive exit amount not covered by this market choice. */
  readonly remainingExitAssets: bigint;
  /** Portion of `exitAssets` withdrawn directly from the vault's idle assets. */
  readonly idleAssets: bigint;
  /** Morpho Blue supply assets received after the force-deallocation penalty. */
  readonly netAssets: bigint;
  /** Assets charged as the force-deallocation penalty. */
  readonly feeAssets: bigint;
}

/**
 * Previews the single-market in-kind redemption choices needed by a Vault V2 frontend.
 *
 * Vaults with exactly one MorphoMarketV1AdapterV2 can produce choices. Their non-empty markets are
 * returned in descending allocation order with the exact penalty-inclusive input ceiling, idle
 * assets withdrawn directly, and resulting Blue position for `requestedExitAssets`.
 *
 * @param vaultData - Pre-fetched Vault V2 accrual snapshot.
 * @param params - Preview parameters.
 * @param params.requestedExitAssets - Positive penalty-inclusive amount the user wants to exit.
 * @param params.timestamp - Timestamp used to accrue Morpho Blue markets before calculating capacity.
 * @returns Frontend-ready market choices, or an empty list when no choices are available.
 * @example
 * ```ts
 * import { previewVaultV2InKindRedeem } from "@morpho-org/morpho-sdk";
 *
 * const [market] = previewVaultV2InKindRedeem(vaultData, {
 *   requestedExitAssets,
 *   timestamp: block.timestamp,
 * });
 * // market?.exitAssets is ready to pass to vault.inKindRedeem(...)
 * ```
 */
export function previewVaultV2InKindRedeem(
  vaultData: AccrualVaultV2,
  params: PreviewVaultV2InKindRedeemParams,
): readonly VaultV2InKindRedeemMarketPreview[] {
  const { requestedExitAssets, timestamp } = params;
  if (requestedExitAssets <= 0n) {
    return [];
  }
  if (vaultData.accrualAdapters.length !== 1) {
    return [];
  }

  const adapter = vaultData.accrualAdapters[0];
  if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
    return [];
  }

  const penalty = vaultData.forceDeallocatePenalties[adapter.address] ?? 0n;
  const availableIdleAssets = vaultData.assetBalance;
  const allocations = adapter.markets
    .map((market) => ({
      market,
      allocationAssets: market
        .accrueInterest(MathLib.max(timestamp, market.lastUpdate))
        .toSupplyAssets(adapter.supplyShares[market.id] ?? 0n),
    }))
    .filter(({ allocationAssets }) => allocationAssets > 0n)
    .toSorted(({ allocationAssets: a }, { allocationAssets: b }) =>
      a === b ? 0 : a > b ? -1 : 1,
    );

  return allocations.flatMap(({ market, allocationAssets }) => {
    const maxExitAssets =
      availableIdleAssets +
      MathLib.wMulUp(allocationAssets + 1n, MathLib.WAD + penalty) -
      1n;
    const exitAssets = MathLib.min(requestedExitAssets, maxExitAssets);
    const idleAssets = MathLib.min(exitAssets, availableIdleAssets);
    const inKindExitAssets = exitAssets - idleAssets;
    const netAssets = MathLib.wDivDown(inKindExitAssets, MathLib.WAD + penalty);

    if (idleAssets === 0n && netAssets === 0n) return [];

    return [
      {
        marketParams: market.params,
        maxExitAssets,
        exitAssets,
        remainingExitAssets: requestedExitAssets - exitAssets,
        idleAssets,
        netAssets,
        feeAssets: MathLib.wMulUp(netAssets, penalty),
      },
    ];
  });
}
