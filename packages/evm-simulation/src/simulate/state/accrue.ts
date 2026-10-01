import type { MarketId } from "@morpho-org/blue-sdk";
import {
  _try,
  AccrualPosition,
  AccrualVaultV2,
  Market,
  MathLib,
} from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type { ParsedState, PositionInternals } from "./types.js";
import { positionKey } from "./types.js";

const MAX_LLTV_WAD = MathLib.WAD;

const toMetric = (
  value: bigint | undefined,
  fallback: PositionInternals["ltvWad"],
): PositionInternals["ltvWad"] =>
  value == null || value > MAX_LLTV_WAD * 10n ** 10n
    ? fallback
    : { type: "finite", valueWad: value };

/**
 * Model the state `accrueInterest` would produce at `toTimestamp` for every
 * accrued subject: market totals, position asset amounts, and vault totals.
 * Static fields and subjects without accrual semantics pass through.
 *
 * Market and position accrual reconstructs blue-sdk entities from the parsed
 * state plus internals; vault accrual reuses the fetched entity handles under
 * `internals.vaults[].entity` (vault classes need live adapter allocations —
 * constructing them from the flat state would lose the nested positions).
 * @internal
 */
export function accrue(before: ParsedState, toTimestamp: bigint): ParsedState {
  const markets = new Map<
    MarketId,
    { readonly state: ParsedState["markets"][number]; readonly accrued: Market }
  >();
  for (const state of before.markets) {
    const internals = before.internals.markets.get(state.marketId);
    if (internals == null) continue;
    const market = new Market({
      params: internals.params,
      totalSupplyAssets: state.totalSupplyAssets,
      totalSupplyShares: state.totalSupplyShares,
      totalBorrowAssets: state.totalBorrowAssets,
      totalBorrowShares: state.totalBorrowShares,
      lastUpdate: state.lastUpdate,
      fee: state.feeWad,
      price: state.oraclePrice,
      rateAtTarget: internals.rateAtTargetPerSecondWad,
    });
    markets.set(state.marketId, {
      state,
      accrued: market.accrueInterest(toTimestamp),
    });
  }

  const marketStates: ParsedState["markets"] = before.markets.map((state) => {
    const entry = markets.get(state.marketId);
    if (entry == null) return state;
    const accrued = entry.accrued;
    const utilization = _try(() => accrued.utilization) ?? undefined;
    const borrowApy = _try(() => accrued.endBorrowRate) ?? undefined;
    return {
      ...state,
      totalSupplyAssets: accrued.totalSupplyAssets,
      totalSupplyShares: accrued.totalSupplyShares,
      totalBorrowAssets: accrued.totalBorrowAssets,
      totalBorrowShares: accrued.totalBorrowShares,
      lastUpdate: accrued.lastUpdate,
      liquidityAssets: accrued.liquidity,
      utilizationWad:
        accrued.totalSupplyAssets === 0n ? undefined : utilization,
      borrowApyWad: state.borrowApyWad == null ? undefined : borrowApy,
    };
  });

  const positionInternals = new Map<string, PositionInternals>();
  const positions: ParsedState["positions"] = before.positions.map(
    (position) => {
      const key = positionKey(position.marketId, position.user);
      const entry = markets.get(position.marketId);
      const priorInternals = before.internals.positions.get(key);
      if (entry == null) {
        if (priorInternals != null) positionInternals.set(key, priorInternals);
        return position;
      }
      const accruedPosition = new AccrualPosition(
        {
          user: position.user,
          supplyShares: position.supplyShares,
          borrowShares: position.borrowShares,
          collateral: position.collateral,
        },
        entry.accrued,
      );
      const ltvWad = toMetric(_try(() => accruedPosition.ltv) ?? undefined, {
        type: "debtFree",
      });
      const healthFactorWad = toMetric(
        _try(() => accruedPosition.healthFactor) ?? undefined,
        { type: "unbounded", reason: "zeroCollateral" },
      );
      positionInternals.set(key, { ltvWad, healthFactorWad });
      return {
        ...position,
        supplyAssets: accruedPosition.supplyAssets,
        borrowAssets: accruedPosition.borrowAssets,
        ltvWad: ltvWad.type === "finite" ? ltvWad.valueWad : undefined,
        healthFactorWad:
          healthFactorWad.type === "finite"
            ? healthFactorWad.valueWad
            : undefined,
      };
    },
  );

  const vaults: ParsedState["vaults"] = before.vaults.map((state) => {
    const handle = before.internals.vaults.get(state.vault)?.entity;
    if (handle == null) return state;
    const accrued =
      handle instanceof AccrualVaultV2
        ? handle.accrueInterest(toTimestamp).vault
        : handle.accrueInterest(toTimestamp);
    const totalAssets =
      accrued instanceof AccrualVaultV2
        ? accrued._totalAssets
        : accrued.totalAssets;
    return {
      ...state,
      totalAssets,
      totalShares: accrued.totalSupply,
    };
  });

  const vaultInternals = new Map<
    Address,
    ParsedState["internals"]["vaults"] extends ReadonlyMap<Address, infer V>
      ? V
      : never
  >();
  for (const [address, internals] of before.internals.vaults) {
    const accruedState = vaults.find((v) => v.vault === address);
    const totalSupply = accruedState?.totalShares ?? 0n;
    const totalAssets = accruedState?.totalAssets ?? 0n;
    vaultInternals.set(address, {
      ...internals,
      sharePriceE27:
        totalSupply === 0n
          ? 0n
          : MathLib.mulDivUp(totalAssets, 10n ** 27n, totalSupply),
    });
  }

  return {
    ...before,
    positions,
    vaults,
    markets: marketStates,
    internals: {
      ...before.internals,
      positions: positionInternals,
      vaults: vaultInternals,
    },
  };
}
