import {
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  type Address,
  type MarketId,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { type Hex, isAddressEqual, zeroAddress } from "viem";

/**
 * Outcome of resolving a Vault V2 snapshot against VaultExitBundlesV1's force-withdraw
 * preconditions.
 *
 * Discriminated on `type`. Callers that must fail loudly map each non-`"eligible"` tag to a typed
 * error; callers that only frame a UI treat every non-`"eligible"` tag as "no exit available".
 */
export type VaultV2ForceWithdrawEligibility =
  | {
      readonly type: "eligible";
      /** The vault's sole MorphoMarketV1AdapterV2. */
      readonly adapter: AccrualVaultV2MorphoMarketV1AdapterV2;
      /** Market the vault routes penalty-free liquidity through, or `undefined` when unset. */
      readonly liquidityMarketId: MarketId | undefined;
    }
  | { readonly type: "adapterCount"; readonly adapters: number }
  | { readonly type: "adapterMismatch"; readonly adapter: Address }
  | { readonly type: "unsupportedAdapter"; readonly adapter: Address }
  | {
      readonly type: "unsupportedLiquidityAdapter";
      readonly liquidityAdapter: Address;
      readonly adapter: Address;
    }
  | {
      readonly type: "undecodableLiquidityData";
      readonly liquidityAdapter: Address;
      /** Raw `liquidityData` that failed to decode as `MarketParams`. */
      readonly liquidityData: Hex;
      /** The underlying decode failure, preserved for the caller to wrap as `cause`. */
      readonly cause: unknown;
    };

/**
 * Resolves whether a Vault V2 snapshot can be force-withdrawn through VaultExitBundlesV1.
 *
 * Mirrors the contract's four preconditions: `adaptersLength() == 1`, `isAdapter(adapter)`,
 * `adapter.morpho() == BLUE` (implied by the adapter type, whose factory pins Blue), and a
 * `liquidityAdapter` the contract can cast to `IMorphoMarketV1AdapterV2` and whose `liquidityData`
 * decodes as `MarketParams`. Because the exit already requires a single adapter, the only
 * resolvable liquidity configurations are unset or that same adapter.
 *
 * Pure: reads only the supplied snapshot and never throws.
 *
 * @param vaultData - Pre-fetched Vault V2 accrual snapshot.
 * @param adapterOverride - Optional adapter the caller expects; defaults to the vault's sole adapter.
 * @returns The `"eligible"` variant with the resolved adapter and liquidity market, or the tag
 *   describing which precondition failed.
 * @example
 * ```ts
 * import { resolveVaultV2ForceWithdrawEligibility } from "@morpho-org/morpho-sdk";
 *
 * const eligibility = resolveVaultV2ForceWithdrawEligibility(vaultData);
 * if (eligibility.type === "eligible") {
 *   console.log(eligibility.adapter.address, eligibility.liquidityMarketId);
 * }
 * ```
 */
export function resolveVaultV2ForceWithdrawEligibility(
  vaultData: AccrualVaultV2,
  adapterOverride?: Address,
): VaultV2ForceWithdrawEligibility {
  const [soleAdapter] = vaultData.accrualAdapters;
  if (vaultData.accrualAdapters.length !== 1 || soleAdapter == null) {
    return { type: "adapterCount", adapters: vaultData.accrualAdapters.length };
  }

  const adapter = adapterOverride ?? soleAdapter.address;
  if (!isAddressEqual(adapter, soleAdapter.address)) {
    return { type: "adapterMismatch", adapter };
  }
  if (!(soleAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
    return { type: "unsupportedAdapter", adapter };
  }

  const { liquidityAdapter } = vaultData;
  if (isAddressEqual(liquidityAdapter, zeroAddress)) {
    return {
      type: "eligible",
      adapter: soleAdapter,
      liquidityMarketId: undefined,
    };
  }
  if (!isAddressEqual(liquidityAdapter, soleAdapter.address)) {
    return { type: "unsupportedLiquidityAdapter", liquidityAdapter, adapter };
  }

  let liquidityMarketId: MarketId;
  try {
    liquidityMarketId = MarketParams.fromHex(vaultData.liquidityData).id;
  } catch (cause) {
    // Undecodable `liquidityData` reverts the contract's `abi.decode`. Reported separately from a
    // foreign adapter: the adapter here is the right one, only its stored market params are unusable.
    return {
      type: "undecodableLiquidityData",
      liquidityAdapter,
      liquidityData: vaultData.liquidityData,
      cause,
    };
  }

  return { type: "eligible", adapter: soleAdapter, liquidityMarketId };
}

/** Vault V2 force-withdraw amounts derived from a vault snapshot. */
export interface VaultV2ForceWithdrawPlan {
  /** WAD-scaled force-deallocation penalty the vault charges on this adapter. */
  readonly penalty: bigint;
  /** Penalty-free leg, withdrawn before any force deallocation. */
  readonly assetsToWithdraw: bigint;
  /** Penalised leg, force-deallocated from the adapter's markets. */
  readonly assetsToDeallocate: bigint;
  /** Upper bound of the assets burned as force-deallocation penalty. */
  readonly penaltyAssets: bigint;
  /** Assets the contract withdraws in total, before the referral fee. */
  readonly withdrawnAssets: bigint;
  /** Assets the adapter's markets can release for *this* `exitAssets`, summed across markets. */
  readonly coveredAssets: bigint;
  /**
   * Largest penalty-inclusive `exitAssets` the snapshot supports.
   *
   * Independent of the requested `exitAssets`, so it is safe to use as an input ceiling.
   */
  readonly maxExitAssets: bigint;
  /** Upper bound of the `forceDeallocate` calls the contract's loop performs. */
  readonly penaltyLegs: number;
}

/**
 * Computes every Vault V2 force-withdraw amount from a vault snapshot, without any RPC.
 *
 * Reproduces `vaultExitBundlesV1ForceWithdrawVaultV2` arithmetic:
 *
 * ```solidity
 * withdrawableAssets = idle + min(liquidityAdapterAssets, liquidityMarketLiquidity);
 * assetsToWithdraw   = min(exitAssets, withdrawableAssets);
 * assetsToDeallocate = mulDivDown(exitAssets - assetsToWithdraw, WAD, WAD + penalty);
 * ```
 *
 * `coveredAssets` sums `min(adapterPosition, marketLiquidity)` over the adapter's markets, minus
 * whatever the penalty-free leg already drained from the liquidity market. The sum is deliberately
 * order-independent: the contract's loop visits every market taking `min(available, remaining)`, so
 * total capacity does not depend on the adapter's storage order — which matters because a drained
 * market is removed from that list mid-loop.
 *
 * That order-independence assumes `VaultExitBundlesV1` copies `adapter.marketIds` into memory
 * *before* the loop. If it instead re-read adapter storage each iteration,
 * `MorphoMarketV1AdapterV2.deallocate`'s swap-and-pop removal of a drained market would make the
 * loop skip markets, and this sum would overstate real capacity — letting an exit through that
 * panics on-chain. The claim is load-bearing for the coverage guard and is verified only by the
 * fork suite, not by any in-repo contract source.
 *
 * @param params - Plan inputs.
 * @param params.vaultData - Pre-fetched Vault V2 accrual snapshot.
 * @param params.adapter - The vault's sole MorphoMarketV1AdapterV2, from
 *   {@link resolveVaultV2ForceWithdrawEligibility}.
 * @param params.liquidityMarketId - Market the vault routes penalty-free liquidity through, or
 *   `undefined` when the vault has no liquidity adapter.
 * @param params.exitAssets - Penalty-inclusive amount to exit.
 * @param params.timestamp - Timestamp used to accrue every Morpho Blue market before converting
 *   adapter shares.
 * @returns The resolved plan. `coveredAssets < assetsToDeallocate` means the exit would overrun the
 *   contract's unbounded loop; the caller decides how to report that.
 * @example
 * ```ts
 * import {
 *   computeVaultV2ForceWithdrawPlan,
 *   resolveVaultV2ForceWithdrawEligibility,
 * } from "@morpho-org/morpho-sdk";
 *
 * const eligibility = resolveVaultV2ForceWithdrawEligibility(vaultData);
 * if (eligibility.type === "eligible") {
 *   const plan = computeVaultV2ForceWithdrawPlan({
 *     vaultData,
 *     adapter: eligibility.adapter,
 *     liquidityMarketId: eligibility.liquidityMarketId,
 *     exitAssets: 1_000_000n,
 *     timestamp: 1_800_000_000n,
 *   });
 *   // plan.withdrawnAssets is what the user receives before the referral fee
 * }
 * ```
 */
export function computeVaultV2ForceWithdrawPlan(params: {
  readonly vaultData: AccrualVaultV2;
  readonly adapter: AccrualVaultV2MorphoMarketV1AdapterV2;
  readonly liquidityMarketId: MarketId | undefined;
  readonly exitAssets: bigint;
  readonly timestamp: bigint;
}): VaultV2ForceWithdrawPlan {
  const { vaultData, adapter, liquidityMarketId, exitAssets, timestamp } =
    params;

  const penalty = vaultData.forceDeallocatePenalties[adapter.address] ?? 0n;
  const idleAssets = vaultData.assetBalance;

  // `min(adapterPosition, marketLiquidity)` per market, on interest-accrued market state — the
  // contract reads `expectedMarketBalances`, so the un-accrued `maxWithdraw` helpers on
  // `AccrualVaultV2` would understate capacity.
  const availableByMarket = new Map(
    adapter.markets.map((market) => {
      const accrued = market.accrueInterest(
        MathLib.max(timestamp, market.lastUpdate),
      );

      return [
        market.id,
        MathLib.min(
          accrued.toSupplyAssets(adapter.supplyShares[market.id] ?? 0n),
          accrued.liquidity,
        ),
      ];
    }),
  );

  const liquidityCapacity =
    liquidityMarketId == null
      ? 0n
      : (availableByMarket.get(liquidityMarketId) ?? 0n);
  const withdrawableAssets = idleAssets + liquidityCapacity;
  const assetsToWithdraw = MathLib.min(exitAssets, withdrawableAssets);
  const assetsToDeallocate = MathLib.mulDivDown(
    exitAssets - assetsToWithdraw,
    MathLib.WAD,
    MathLib.WAD + penalty,
  );

  // The penalty-free leg pulls its shortfall through the liquidity adapter, draining that market
  // before the force-deallocation loop reaches it.
  const drainedFromLiquidityMarket = MathLib.zeroFloorSub(
    assetsToWithdraw,
    idleAssets,
  );
  if (liquidityMarketId != null && drainedFromLiquidityMarket > 0n) {
    availableByMarket.set(
      liquidityMarketId,
      MathLib.zeroFloorSub(liquidityCapacity, drainedFromLiquidityMarket),
    );
  }

  let coveredAssets = 0n;
  const nonEmpty: bigint[] = [];
  for (const available of availableByMarket.values()) {
    if (available <= 0n) continue;
    coveredAssets += available;
    nonEmpty.push(available);
  }

  // `maxExitAssets` must not depend on the requested amount. At the ceiling the penalty-free leg
  // always drains the liquidity market completely, so that market contributes nothing to the
  // force-deallocation loop — whereas a small request leaves part of it, which would overstate the
  // ceiling for callers using it to cap an input.
  let saturatedCoveredAssets = 0n;
  for (const [marketId, available] of availableByMarket) {
    if (marketId === liquidityMarketId) continue;
    if (available > 0n) saturatedCoveredAssets += available;
  }

  // Worst-case leg count is the ascending walk: the most markets the loop can touch is the number
  // of smallest positions that together reach `assetsToDeallocate`.
  let penaltyLegs = 0;
  let remaining = assetsToDeallocate;
  for (const available of nonEmpty.toSorted((a, b) =>
    a === b ? 0 : a > b ? 1 : -1,
  )) {
    if (remaining <= 0n) break;
    penaltyLegs += 1;
    remaining -= MathLib.min(available, remaining);
  }

  return {
    penalty,
    assetsToWithdraw,
    assetsToDeallocate,
    // `sum(ceil(assetsᵢ·penalty/WAD)) <= ceil(sum(assetsᵢ)·penalty/WAD) + legs - 1`.
    penaltyAssets:
      penaltyLegs === 0
        ? 0n
        : MathLib.wMulUp(assetsToDeallocate, penalty) + BigInt(penaltyLegs - 1),
    withdrawnAssets: assetsToWithdraw + assetsToDeallocate,
    coveredAssets,
    maxExitAssets:
      withdrawableAssets +
      MathLib.wMulUp(saturatedCoveredAssets + 1n, MathLib.WAD + penalty) -
      1n,
    penaltyLegs,
  };
}

/**
 * Upper-bounds the vault shares a Vault V2 force withdrawal burns.
 *
 * The contract performs `penaltyLegs + 2` separate `VaultV2.withdraw` calls (the penalty-free leg,
 * one per `forceDeallocate`, and the final deallocated leg). Each rounds its share burn up, so the
 * bound adds one share per leg on top of the penalty-inclusive asset total.
 *
 * Both endpoints of the accrual window are considered because interest lowers the burn while
 * management fees raise it, so neither snapshot alone bounds execution.
 *
 * Callers want two different bounds from this helper, and must not conflate them:
 * - **The allowance to authorize** takes `deadlineVaultData` accrued to the exit deadline, so the
 *   approval still covers a burn inflated by fees accrued while the transaction sits pending.
 * - **The denominator of {@link computeMinForceWithdrawSharePrice}** takes `deadlineVaultData` equal
 *   to `vaultData`. A larger denominator only lowers the resulting price floor, so passing the
 *   deadline-accrued bound there would let an unrelated caller-chosen deadline silently weaken the
 *   slippage guard; `slippageTolerance` is what absorbs accrual drift.
 *
 * @param params - Share-bound inputs.
 * @param params.vaultData - Pre-fetched Vault V2 accrual snapshot.
 * @param params.deadlineVaultData - The same vault accrued to the exit deadline, or `vaultData`
 *   itself for a snapshot-tight bound.
 * @param params.plan - Plan from {@link computeVaultV2ForceWithdrawPlan}.
 * @returns An upper bound, in vault shares, of what the exit burns.
 * @example
 * ```ts
 * import { computeVaultV2ForceWithdrawSharesBurnt } from "@morpho-org/morpho-sdk";
 *
 * const { vault: deadlineVaultData } = vaultData.accrueInterest(deadline);
 * const sharesBurnt = computeVaultV2ForceWithdrawSharesBurnt({
 *   vaultData,
 *   deadlineVaultData,
 *   plan,
 * });
 * // sharesBurnt is the allowance to permit or approve
 * ```
 */
export function computeVaultV2ForceWithdrawSharesBurnt(params: {
  readonly vaultData: AccrualVaultV2;
  readonly deadlineVaultData: AccrualVaultV2;
  readonly plan: VaultV2ForceWithdrawPlan;
}): bigint {
  const { vaultData, deadlineVaultData, plan } = params;

  // `penaltyAssets` already carries the per-market ceil accumulation, so this is the full
  // penalty-inclusive amount debited from the user's position.
  const grossDebited = plan.withdrawnAssets + plan.penaltyAssets;

  return (
    MathLib.max(
      vaultData.toShares(grossDebited, "Up"),
      deadlineVaultData.toShares(grossDebited, "Up"),
    ) + BigInt(plan.penaltyLegs + 2)
  );
}
