import {
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  type MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";

interface VaultV2InKindRedeemMarketPreview {
  readonly marketParams: MarketParams;
  readonly maxExitAssets: bigint;
  readonly exitAssets: bigint;
  readonly remainingExitAssets: bigint;
  readonly netAssets: bigint;
  readonly feeAssets: bigint;
}

/**
 * Previews the single-market in-kind redemption choices needed by a Vault V2 frontend.
 *
 * Vaults with exactly one MorphoMarketV1AdapterV2 can produce choices. Their non-empty markets are
 * returned in descending allocation order with the exact penalty-inclusive input ceiling and
 * resulting Blue position for `requestedExitAssets`.
 *
 * @param vaultData - Pre-fetched Vault V2 accrual snapshot.
 * @param requestedExitAssets - Positive penalty-inclusive amount the user wants to exit.
 * @returns Frontend-ready market choices, or an empty list when no choices are available.
 * @example
 * ```ts
 * import { previewVaultV2InKindRedeem } from "@morpho-org/morpho-sdk";
 *
 * const [market] = previewVaultV2InKindRedeem(vaultData, requestedExitAssets);
 * // market?.exitAssets is ready to pass to vault.inKindRedeem(...)
 * ```
 */
export function previewVaultV2InKindRedeem(
  vaultData: AccrualVaultV2,
  requestedExitAssets: bigint,
): readonly VaultV2InKindRedeemMarketPreview[] {
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
  const allocations = adapter.markets
    .map((market) => ({
      market,
      allocationAssets: market.toSupplyAssets(
        adapter.supplyShares[market.id] ?? 0n,
      ),
    }))
    .filter(({ allocationAssets }) => allocationAssets > 0n)
    .toSorted(({ allocationAssets: a }, { allocationAssets: b }) =>
      a === b ? 0 : a > b ? -1 : 1,
    );

  return allocations.map(({ market, allocationAssets }) => {
    const maxExitAssets =
      MathLib.wMulUp(allocationAssets + 1n, MathLib.WAD + penalty) - 1n;
    const exitAssets = MathLib.min(requestedExitAssets, maxExitAssets);
    const netAssets = MathLib.wDivDown(exitAssets, MathLib.WAD + penalty);

    return {
      marketParams: market.params,
      maxExitAssets,
      exitAssets,
      remainingExitAssets: requestedExitAssets - exitAssets,
      netAssets,
      feeAssets: exitAssets - netAssets,
    };
  });
}
