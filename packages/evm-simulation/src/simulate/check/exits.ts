import { AccrualVaultV2, type MarketId, MathLib } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import { AssetChangeMismatchError } from "../../errors.js";
import type {
  VaultInKindRedeemLimit,
  VaultV1MigrateToV2Limit,
  VaultV2ForceRedeemLimit,
  VaultV2ForceWithdrawLimit,
} from "../../limits.js";
import type { SimulationStateChange } from "../../result.js";
import type { ParsedState } from "../state/types.js";
import {
  type CheckContext,
  eq,
  fail,
  findVault,
  limitViolation,
  opContext,
  receiverCredit,
} from "./helpers.js";
import { vaultInternals } from "./vault.js";

type ExitLimit =
  | VaultV1MigrateToV2Limit
  | VaultV2ForceWithdrawLimit
  | VaultV2ForceRedeemLimit
  | VaultInKindRedeemLimit;

/**
 * Verify vault exit / migration / in-kind operation limits.
 *
 * - `vaultV1MigrateToV2`: source user shares burn, target mints
 *   `toShares(assetsOut)` ±1, the owner's wallet asset balance does not move.
 *   `expectedAssets`/`expectedShares` pin the source position's asset delta /
 *   the source shares burned.
 * - `vaultV2ForceWithdraw` / `vaultV2ForceRedeem`: observed adapter
 *   deallocations (allocation deltas on the pinned adapter, or the vault's
 *   full delta table when no adapter is pinned) drive the penalty from the
 *   vault's `penaltyWad` table; `expectedDeallocations`/`expectedAdapter` pin
 *   the observed legs verbatim.
 * - `vaultV1/2InKindRedeem`: `onBehalf`'s supply shares increase per observed
 *   leg market; `expectedMarketIds` pins the observed market set ordered by
 *   the vault's allocation list. The idle-covered portion pays underlying.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: checks read clearest with positional arguments
export function checkExitOperation(
  ctx: CheckContext,
  limit: ExitLimit,
  accruedBefore: ParsedState,
  after: ParsedState,
  actionDiff: SimulationStateChange,
): void {
  switch (limit.type) {
    case "vaultV1MigrateToV2": {
      const source = findVault(accruedBefore, limit.sourceVault, ctx, limit);
      const target = findVault(accruedBefore, limit.targetVault, ctx, limit);
      const sourceAfter = findVault(after, limit.sourceVault, ctx, limit);
      const targetAfter = findVault(after, limit.targetVault, ctx, limit);
      const sourceInternals = vaultInternals(
        accruedBefore,
        limit.sourceVault,
        ctx,
        limit,
      );
      const targetInternals = vaultInternals(
        accruedBefore,
        limit.targetVault,
        ctx,
        limit,
      );

      const burned = source.userShares - sourceAfter.userShares;
      if (burned <= 0n)
        fail(ctx, limit, `Migration burned "${burned}" source shares`);
      // previewRedeem on the source.
      const sourceSupply =
        source.totalShares + 10n ** (sourceInternals.decimalsOffset ?? 0n);
      const assetsOut =
        sourceSupply === 0n
          ? 0n
          : (burned * (source.totalAssets + 1n)) / sourceSupply;
      const minted = targetAfter.userShares - target.userShares;
      const expectedMinted =
        targetInternals.version === "v2"
          ? (() => {
              const supply =
                target.totalShares + (targetInternals.virtualShares ?? 0n);
              const ta = target.totalAssets;
              return ta + 1n === 0n || supply === 0n
                ? assetsOut
                : (assetsOut * supply) / (ta + 1n);
            })()
          : assetsOut;
      if (minted !== expectedMinted && minted !== expectedMinted + 1n)
        fail(
          ctx,
          limit,
          `Migration minted "${minted}" target shares, expected "${expectedMinted}" (±1)`,
        );
      // Migrated assets never touch the wallet.
      const walletNet = actionDiff.balances
        .filter((c) => eq(c.account, ctx.owner) && eq(c.token, source.asset))
        .reduce((total, c) => total + c.assets, 0n);
      if (walletNet !== 0n)
        throw new AssetChangeMismatchError(
          `Migration moved "${walletNet}" wallet assets — migrated assets must route vault-to-vault`,
          { context: opContext(ctx, limit) },
        );

      if (
        limit.expectedAssets !== undefined &&
        limit.expectedAssets !== assetsOut
      )
        limitViolation(
          ctx,
          limit,
          "expectedAssets",
          `${limit.expectedAssets}`,
          `${assetsOut}`,
          "The bundle does not match the declared constraint.",
        );
      if (limit.expectedShares !== undefined && limit.expectedShares !== burned)
        limitViolation(
          ctx,
          limit,
          "expectedShares",
          `${limit.expectedShares}`,
          `${burned}`,
          "The bundle does not match the declared constraint.",
        );
      if (
        limit.expectedReceiver !== undefined &&
        receiverCredit(
          actionDiff,
          limit.expectedReceiver,
          limit.targetVault,
        ) !== minted
      )
        limitViolation(
          ctx,
          limit,
          "expectedReceiver",
          limit.expectedReceiver,
          `${limit.expectedReceiver}`,
          "Target shares were not credited to the declared receiver.",
        );
      if (
        limit.minTargetSharesMinted !== undefined &&
        minted < limit.minTargetSharesMinted
      )
        limitViolation(
          ctx,
          limit,
          "minTargetSharesMinted",
          `${limit.minTargetSharesMinted}`,
          `${minted}`,
          "Decrease the bound or adjust the operation.",
        );
      return;
    }

    case "vaultV2ForceWithdraw":
    case "vaultV2ForceRedeem": {
      const before = findVault(accruedBefore, limit.vault, ctx, limit);
      const next = findVault(after, limit.vault, ctx, limit);
      const internals = vaultInternals(accruedBefore, limit.vault, ctx, limit);
      const nextInternals = after.internals.vaults.get(limit.vault);

      // Observed deallocations: negative allocation deltas, optionally
      // restricted to the pinned adapter.
      const observedLegs: {
        adapter?: Address;
        marketId?: MarketId;
        assets: bigint;
      }[] = next.allocations
        .map((allocation, i) => {
          const allocInternals = nextInternals?.allocations[i];
          const prior = before.allocations.find(
            (a, j) =>
              a.marketId === allocation.marketId &&
              internals.allocations[j]?.adapter === allocInternals?.adapter,
          );
          return {
            internals: allocInternals,
            delta: prior == null ? 0n : prior.assets - allocation.assets,
          };
        })
        .filter((l) => l.delta > 0n)
        .map((l) => ({
          adapter: l.internals?.adapter,
          marketId: l.internals?.marketId,
          assets: l.delta,
        }))
        .filter((l) =>
          limit.type === "vaultV2ForceWithdraw" && limit.expectedAdapter != null
            ? l.adapter != null && eq(l.adapter, limit.expectedAdapter)
            : true,
        );

      const penaltyAssets = observedLegs.reduce(
        (total, leg) =>
          total +
          MathLib.wMulUp(
            leg.assets,
            internals.allocations.find(
              (a) =>
                (a.marketId != null && a.marketId === leg.marketId) ||
                (a.adapter != null &&
                  leg.adapter != null &&
                  eq(a.adapter, leg.adapter)),
            )?.penaltyWad ?? 0n,
          ),
        0n,
      );

      const credit = receiverCredit(
        actionDiff,
        limit.type === "vaultV2ForceRedeem"
          ? (limit.expectedRecipient ?? ctx.owner)
          : ctx.owner,
        before.asset,
      );
      const exitAssets = credit;
      if (next.idleAssets < 0n)
        fail(
          ctx,
          limit,
          `Vault idle assets went negative: "${next.idleAssets}"`,
        );
      if (before.idleAssets - next.idleAssets > exitAssets + penaltyAssets)
        fail(
          ctx,
          limit,
          `Idle assets dropped "${before.idleAssets - next.idleAssets}", above the exit "${exitAssets}" plus penalty "${penaltyAssets}"`,
        );

      const burned = before.userShares - next.userShares;
      if (limit.type === "vaultV2ForceWithdraw") {
        if (
          limit.expectedExitAssets !== undefined &&
          limit.expectedExitAssets !== exitAssets
        )
          limitViolation(
            ctx,
            limit,
            "expectedExitAssets",
            `${limit.expectedExitAssets}`,
            `${exitAssets}`,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.maxSharesBurned !== undefined &&
          burned > limit.maxSharesBurned
        )
          limitViolation(
            ctx,
            limit,
            "maxSharesBurned",
            `${limit.maxSharesBurned}`,
            `${burned}`,
            "Increase the bound or reduce the operation.",
          );
        if (
          limit.minAssetsReceived !== undefined &&
          credit < limit.minAssetsReceived
        )
          limitViolation(
            ctx,
            limit,
            "minAssetsReceived",
            `${limit.minAssetsReceived}`,
            `${credit}`,
            "Decrease the bound or adjust the operation.",
          );
        if (
          limit.maxPenaltyAssets !== undefined &&
          penaltyAssets > limit.maxPenaltyAssets
        )
          limitViolation(
            ctx,
            limit,
            "maxPenaltyAssets",
            `${limit.maxPenaltyAssets}`,
            `${penaltyAssets}`,
            "Increase the bound or reduce the operation.",
          );
        return;
      }

      if (limit.expectedShares !== undefined && limit.expectedShares !== burned)
        limitViolation(
          ctx,
          limit,
          "expectedShares",
          `${limit.expectedShares}`,
          `${burned}`,
          "The bundle does not match the declared constraint.",
        );
      if (limit.expectedDeallocations !== undefined) {
        const expected = limit.expectedDeallocations;
        const same =
          expected.length === observedLegs.length &&
          expected.every(
            (leg, i) =>
              eq(leg.adapter, observedLegs[i]!.adapter ?? leg.adapter) &&
              (leg.marketId ?? "0x").toLowerCase() ===
                (observedLegs[i]!.marketId ?? "0x").toLowerCase() &&
              leg.assets === observedLegs[i]!.assets,
          );
        if (!same)
          limitViolation(
            ctx,
            limit,
            "expectedDeallocations",
            JSON.stringify(expected, (_k, v) =>
              typeof v === "bigint" ? v.toString() : v,
            ),
            JSON.stringify(observedLegs, (_k, v) =>
              typeof v === "bigint" ? v.toString() : v,
            ),
            "The bundle does not match the declared constraint.",
          );
      }
      if (
        limit.minAssetsReceived !== undefined &&
        credit < limit.minAssetsReceived
      )
        limitViolation(
          ctx,
          limit,
          "minAssetsReceived",
          `${limit.minAssetsReceived}`,
          `${credit}`,
          "Decrease the bound or adjust the operation.",
        );
      if (
        limit.maxPenaltyAssets !== undefined &&
        penaltyAssets > limit.maxPenaltyAssets
      )
        limitViolation(
          ctx,
          limit,
          "maxPenaltyAssets",
          `${limit.maxPenaltyAssets}`,
          `${penaltyAssets}`,
          "Increase the bound or reduce the operation.",
        );
      return;
    }

    case "vaultV1InKindRedeem":
    case "vaultV2InKindRedeem": {
      const before = findVault(accruedBefore, limit.vault, ctx, limit);
      const next = findVault(after, limit.vault, ctx, limit);
      const internals = vaultInternals(accruedBefore, limit.vault, ctx, limit);
      const onBehalf = ctx.owner;
      const credit = receiverCredit(actionDiff, onBehalf, before.asset);

      const burned = before.userShares - next.userShares;
      if (burned <= 0n)
        fail(ctx, limit, `In-kind redemption burned "${burned}" shares`);

      // Observed leg markets: markets where the acting account's supply
      // shares increased while the vault's allocation dropped. V2 internals
      // carry no marketId, so fall back to the entity's adapter markets.
      const allocatedMarketIds = new Set(
        internals.allocations
          .map((a) => a.marketId)
          .filter((m): m is MarketId => m != null),
      );
      const entity = internals.entity;
      if (entity != null && "accrualAdapters" in entity)
        for (const adapter of entity.accrualAdapters) {
          const a = adapter as {
            readonly marketIds?: readonly MarketId[];
            readonly marketParamsList?: readonly { id: MarketId }[];
          };
          for (const marketId of a.marketIds ?? [])
            allocatedMarketIds.add(marketId);
          for (const params of a.marketParamsList ?? [])
            allocatedMarketIds.add(params.id);
        }
      const observedMarketIds = after.positions
        .filter(
          (p) =>
            allocatedMarketIds.has(p.marketId) &&
            eq(p.user, onBehalf) &&
            (accruedBefore.positions.find(
              (b) => b.marketId === p.marketId && eq(b.user, onBehalf),
            )?.supplyShares ?? 0n) < p.supplyShares,
        )
        .map((p) => p.marketId);
      const supplyAssetsByMarket = observedMarketIds.map((marketId) => {
        const b = accruedBefore.positions.find(
          (p) => p.marketId === marketId && eq(p.user, onBehalf),
        );
        const a = after.positions.find(
          (p) => p.marketId === marketId && eq(p.user, onBehalf),
        );
        return {
          marketId,
          assets: (a?.supplyAssets ?? 0n) - (b?.supplyAssets ?? 0n),
        };
      });

      if (limit.expectedAssets !== undefined) {
        const vaultEntity = internals.entity;
        const idleForExit =
          vaultEntity instanceof AccrualVaultV2
            ? vaultEntity.assetBalance
            : before.idleAssets;
        const expectedIdleCredit = MathLib.min(
          idleForExit,
          limit.expectedAssets,
        );
        if (credit !== expectedIdleCredit)
          limitViolation(
            ctx,
            limit,
            "expectedAssets",
            `${limit.expectedAssets}`,
            `${credit}`,
            "The bundle does not match the declared constraint.",
          );
      }
      if (limit.expectedMarketIds !== undefined) {
        const same =
          limit.expectedMarketIds.length === observedMarketIds.length &&
          limit.expectedMarketIds.every(
            (marketId, i) =>
              marketId.toLowerCase() === observedMarketIds[i]!.toLowerCase(),
          );
        if (!same)
          limitViolation(
            ctx,
            limit,
            "expectedMarketIds",
            `[${limit.expectedMarketIds.join(", ")}]`,
            `[${observedMarketIds.join(", ")}]`,
            "The bundle does not match the declared constraint.",
          );
      }
      if (limit.maxSharesBurned !== undefined && burned > limit.maxSharesBurned)
        limitViolation(
          ctx,
          limit,
          "maxSharesBurned",
          `${limit.maxSharesBurned}`,
          `${burned}`,
          "Increase the bound or reduce the operation.",
        );
      if (
        limit.minIdleAssetsReceived !== undefined &&
        credit < limit.minIdleAssetsReceived
      )
        limitViolation(
          ctx,
          limit,
          "minIdleAssetsReceived",
          `${limit.minIdleAssetsReceived}`,
          `${credit}`,
          "Decrease the bound or adjust the operation.",
        );
      for (const minimum of limit.minSupplyAssetsByMarket ?? []) {
        const leg = supplyAssetsByMarket.find(
          (entry) =>
            entry.marketId.toLowerCase() === minimum.marketId.toLowerCase(),
        );
        if (leg == null || leg.assets < minimum.minAssets)
          limitViolation(
            ctx,
            limit,
            "minSupplyAssetsByMarket",
            `${minimum.minAssets}`,
            `${leg?.assets}`,
            `Market "${minimum.marketId}" did not supply the declared minimum.`,
          );
      }
      return;
    }

    default: {
      const _exhaustive: never = limit;
      throw new AssetChangeMismatchError(
        `checkExitOperation received ${JSON.stringify(_exhaustive)}`,
        { context: opContext(ctx, limit as never) },
      );
    }
  }
}
