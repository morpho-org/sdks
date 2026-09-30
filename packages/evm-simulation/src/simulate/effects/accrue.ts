import {
  _try,
  AccrualPosition,
  AccrualVaultV2,
  type Market,
  MathLib,
} from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type {
  MarketState,
  PositionState,
  RiskMetric,
  VaultState,
  VerificationSnapshot,
} from "../../domain/evidence.js";
import type { PinnedInputs } from "../../domain/stages.js";
import { toMarketEntity } from "./market-entity.js";

const MAX_LLTV_WAD = MathLib.WAD;

const toMetric = (
  value: bigint | undefined,
  unbounded: RiskMetric,
): RiskMetric =>
  value == null
    ? unbounded
    : value > MAX_LLTV_WAD * 10n ** 10n
      ? unbounded
      : { type: "finite", valueWad: value };

/**
 * Model the state `accrueInterest` would produce at `toTimestamp` for every
 * accrued subject: market totals, position asset amounts, and vault totals.
 * Static fields and subjects without accrual semantics pass through.
 *
 * Market and position accrual reconstructs blue-sdk entities from snapshot
 * state; vault accrual reuses the fetched entity handles under
 * `inputs.internals.vaultData` (vault classes need live adapter allocations —
 * constructing them from the flat snapshot would lose the nested positions).
 *
 * @param before - The snapshot to project.
 * @param toTimestamp - The simulated block timestamp.
 * @param inputs - Pinned inputs carrying fetched entity internals; optional —
 *   vaults without a matching handle keep their recorded state.
 * @returns A deep-frozen accrued snapshot.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
export function accrueSnapshot(
  before: VerificationSnapshot,
  toTimestamp: bigint,
  inputs?: PinnedInputs,
): VerificationSnapshot {
  const markets = new Map(
    before.markets.map((state) => {
      const market = toMarketEntity(state);
      const accrued = market.accrueInterest(toTimestamp);
      return [
        state.market.marketId,
        { state, accrued } satisfies {
          state: MarketState;
          accrued: Market;
        },
      ] as const;
    }),
  );

  const marketStates: MarketState[] = before.markets.map((state) => {
    const entry = markets.get(state.market.marketId);
    if (entry == null) return state;
    const accrued = entry.accrued;
    const utilization = _try(() => accrued.utilization) ?? 0n;
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
        accrued.totalSupplyAssets === 0n
          ? ({ type: "unbounded", reason: "zeroLiquidity" } as const)
          : { type: "finite", valueWad: utilization },
      borrowApyWad:
        borrowApy == null || state.borrowApyWad.type !== "applicable"
          ? state.borrowApyWad
          : { type: "applicable", value: borrowApy },
    };
  });

  const positions: PositionState[] = before.positions.map((position) => {
    const entry = markets.get(position.marketId);
    if (entry == null) return position;
    const accruedPosition = new AccrualPosition(
      {
        user: position.owner,
        supplyShares: position.supplyShares,
        borrowShares: position.borrowShares,
        collateral: position.collateralAssets,
      },
      entry.accrued,
    );
    return {
      ...position,
      supplyAssets: accruedPosition.supplyAssets,
      borrowAssets: accruedPosition.borrowAssets,
      ltvWad: toMetric(_try(() => accruedPosition.ltv) ?? undefined, {
        type: "debtFree",
      }),
      healthFactorWad: toMetric(
        _try(() => accruedPosition.healthFactor) ?? undefined,
        { type: "unbounded", reason: "zeroCollateral" },
      ),
    };
  });

  const vaults: VaultState[] = before.vaults.map((state) => {
    const handle = inputs?.internals.vaultData.get(state.vault);
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
      sharePriceE27:
        accrued.totalSupply === 0n
          ? 0n
          : MathLib.mulDivUp(totalAssets, 10n ** 27n, accrued.totalSupply),
    };
  });

  return deepFreeze({
    wallet: before.wallet,
    permissions: before.permissions,
    positions,
    vaults,
    markets: marketStates,
  });
}
