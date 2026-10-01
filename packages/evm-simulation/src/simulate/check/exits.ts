import { AccrualVaultV2, MathLib } from "@morpho-org/blue-sdk";
import type { DecodedOperation } from "../../decode/operation.js";
import {
  AssetChangeMismatchError,
  StateChangeMismatchError,
} from "../../errors.js";
import type { SimulationStateChange } from "../../result.js";
import type { ParsedState } from "../state/types.js";
import {
  type CheckContext,
  type CheckedOperation,
  eq,
  fail,
  findVault,
  opContext,
  receiverCredit,
} from "./helpers.js";
import { vaultInternals } from "./vault.js";

/**
 * Verify vault exit / migration / in-kind operations.
 *
 * - `vaultV1MigrateToV2`: source shares burned, assets out == `previewRedeem`
 *   on the source's accrued entity, target shares minted ==
 *   `previewDeposit(assetsOut)` ±1, owner asset balance unchanged.
 * - `vaultV2ForceWithdraw` / `vaultV2ForceRedeem`: ordered adapter
 *   deallocations — each decoded `(adapter, marketId, amount)` must drop the
 *   adapter allocation exactly; penalty shares burned from the owner on top
 *   of the exit shares; receiver credit == `exitAssets` (forceWithdraw) or
 *   `previewRedeem(shares)` (forceRedeem).
 * - `vaultV1/2InKindRedeem`: owner receives Blue supply shares per decoded
 *   leg — owner's supplyShares += leg shares, vault's market position −= the
 *   same; idle-covered portion pays underlying.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: checks read clearest with positional arguments
export function checkExitOperation(
  ctx: CheckContext,
  operation: Extract<
    DecodedOperation,
    {
      readonly type:
        | "vaultV1MigrateToV2"
        | "vaultV2ForceWithdraw"
        | "vaultV2ForceRedeem"
        | "vaultV1InKindRedeem"
        | "vaultV2InKindRedeem";
    }
  >,
  accruedBefore: ParsedState,
  after: ParsedState,
  actionDiff: SimulationStateChange,
): CheckedOperation {
  switch (operation.type) {
    case "vaultV1MigrateToV2": {
      const source = findVault(
        accruedBefore,
        operation.sourceVault,
        ctx,
        operation,
      );
      const target = findVault(
        accruedBefore,
        operation.targetVault,
        ctx,
        operation,
      );
      const sourceAfter = findVault(
        after,
        operation.sourceVault,
        ctx,
        operation,
      );
      const targetAfter = findVault(
        after,
        operation.targetVault,
        ctx,
        operation,
      );
      const sourceInternals = vaultInternals(
        accruedBefore,
        operation.sourceVault,
        ctx,
        operation,
      );
      const targetInternals = vaultInternals(
        accruedBefore,
        operation.targetVault,
        ctx,
        operation,
      );

      const assetsOut =
        operation.amount.type === "assets"
          ? operation.amount.assets
          : (() => {
              if (sourceInternals.version !== "v1")
                return fail(
                  ctx,
                  operation,
                  "Migrate source vault is not a V1 vault",
                );
              const supply =
                source.totalShares +
                10n ** (sourceInternals.decimalsOffset ?? 0n);
              return supply === 0n
                ? 0n
                : (operation.amount.shares * (source.totalAssets + 1n)) /
                    supply;
            })();
      const burned = source.userShares - sourceAfter.userShares;
      if (burned <= 0n)
        fail(ctx, operation, `Migration burned "${burned}" source shares`);
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
          operation,
          `Migration minted "${minted}" target shares, expected "${expectedMinted}" (±1)`,
        );
      // The migrated assets never touch the wallet.
      const walletNet = actionDiff.balances
        .filter(
          (c) => eq(c.account, operation.owner) && eq(c.token, operation.asset),
        )
        .reduce((total, c) => total + c.assets, 0n);
      if (walletNet !== 0n)
        throw new AssetChangeMismatchError(
          `Migration moved "${walletNet}" wallet assets — migrated assets must route vault-to-vault`,
          { context: opContext(ctx, operation) },
        );
      return {
        operation,
        outcome: { targetSharesMinted: minted },
      } as CheckedOperation;
    }

    case "vaultV2ForceWithdraw":
    case "vaultV2ForceRedeem": {
      const before = findVault(accruedBefore, operation.vault, ctx, operation);
      const next = findVault(after, operation.vault, ctx, operation);
      const internals = vaultInternals(
        accruedBefore,
        operation.vault,
        ctx,
        operation,
      );
      const isForceWithdraw = operation.type === "vaultV2ForceWithdraw";

      const contractDerivedDeallocations = !("deallocations" in operation);
      const deallocations = contractDerivedDeallocations
        ? []
        : operation.deallocations;
      let penaltyAssets = 0n;
      let unmodeledDecrease = 0n;
      const beforeInternals = internals.allocations;
      const consumedAllocations = new Set<(typeof beforeInternals)[number]>();
      const matchesLeg = (
        allocation: (typeof beforeInternals)[number],
        leg: (typeof deallocations)[number],
      ) =>
        leg.marketId != null
          ? allocation.marketId === leg.marketId
          : allocation.adapter != null && eq(allocation.adapter, leg.adapter);
      const vaultEntity = internals.entity;
      const accrualAdapters =
        vaultEntity instanceof AccrualVaultV2
          ? vaultEntity.accrualAdapters
          : [];
      const beforeAllocations = before.allocations.map((allocation, i) => ({
        ...allocation,
        internals: beforeInternals[i],
      }));
      for (const leg of deallocations) {
        const prior = beforeAllocations.find(
          (a) => a.internals != null && matchesLeg(a.internals, leg),
        );
        // Accrual-adapter positions are not read per market: a leg on a
        // known accrual adapter is verified at adapter level — it must be a
        // declared adapter — and its penalty accrues from the vault's
        // pinned forceDeallocatePenalties.
        if (prior == null) {
          const adapter = accrualAdapters.find((a) =>
            eq(a.address, leg.adapter),
          );
          if (adapter == null)
            fail(
              ctx,
              operation,
              `Adapter "${leg.adapter}" allocation missing for deallocation`,
            );
          penaltyAssets += MathLib.wMulUp(
            leg.assets,
            vaultEntity instanceof AccrualVaultV2
              ? (vaultEntity.forceDeallocatePenalties[leg.adapter] ?? 0n)
              : 0n,
          );
          continue;
        }
        const observed =
          next.allocations.find(
            (_a, i) =>
              after.internals.vaults.get(operation.vault)?.allocations[i] !=
                null &&
              matchesLeg(
                after.internals.vaults.get(operation.vault)!.allocations[i]!,
                leg,
              ),
          ) ??
          fail(
            ctx,
            operation,
            `Adapter "${leg.adapter}" allocation missing for deallocation`,
          );
        consumedAllocations.add(prior.internals!);
        if (prior.assets - observed.assets !== leg.assets)
          fail(
            ctx,
            operation,
            `Adapter "${leg.adapter}" allocation moved "${prior.assets - observed.assets}", expected "${leg.assets}"`,
          );
        penaltyAssets += MathLib.wMulUp(
          leg.assets,
          prior.internals!.penaltyWad ?? 0n,
        );
      }
      const nextInternals = after.internals.vaults.get(operation.vault);
      for (const [i, allocation] of next.allocations.entries()) {
        const allocInternals = nextInternals?.allocations[i];
        const prior =
          beforeAllocations.find(
            (a) =>
              a.marketId != null &&
              a.marketId === allocation.marketId &&
              a.internals?.adapter != null &&
              allocInternals?.adapter != null &&
              eq(a.internals.adapter, allocInternals.adapter),
          ) ??
          beforeAllocations.find(
            (a) =>
              a.marketId != null &&
              a.marketId === allocation.marketId &&
              a.internals != null &&
              !consumedAllocations.has(a.internals),
          ) ??
          beforeAllocations.find(
            (a) =>
              a.internals?.adapter != null &&
              allocInternals?.adapter != null &&
              eq(a.internals.adapter, allocInternals.adapter),
          );
        if (
          prior?.internals != null &&
          consumedAllocations.has(prior.internals)
        )
          continue;
        if (prior == null || prior.assets === allocation.assets) continue;
        // Deallocation proceeds can raise an unmodeled allocation (e.g. the
        // liquidity adapter receives the deallocated assets); only a drop
        // indicates shares leaving the vault.
        if (allocation.assets > prior.assets) continue;
        if (contractDerivedDeallocations) {
          penaltyAssets += MathLib.wMulUp(
            prior.assets - allocation.assets,
            prior.internals?.penaltyWad ?? 0n,
          );
          continue;
        }
        if (isForceWithdraw === false) {
          unmodeledDecrease += prior.assets - allocation.assets;
          continue;
        }
        fail(
          ctx,
          operation,
          `Unmodeled allocation change "${prior.assets - allocation.assets}"`,
        );
      }

      const exitAssets = isForceWithdraw
        ? operation.exitAssets
        : receiverCredit(actionDiff, operation.receiver, operation.asset);
      const credit = receiverCredit(
        actionDiff,
        operation.receiver,
        operation.asset,
      );
      const expectedCredit = isForceWithdraw ? operation.exitAssets : credit;
      if (credit !== expectedCredit)
        fail(
          ctx,
          operation,
          `Receiver credit "${credit}", expected "${expectedCredit}"`,
        );
      if (unmodeledDecrease > credit)
        fail(
          ctx,
          operation,
          `Unmodeled adapter decreases "${unmodeledDecrease}" exceed the receiver credit "${credit}"`,
        );

      // Owner share burn = exit shares + penalty shares (V2 toShares "Up").
      const v2ToSharesUp = (assets: bigint): bigint => {
        if (internals.version !== "v2")
          return fail(
            ctx,
            operation,
            "Force-exit source vault is not a V2 vault",
          );
        const supply = before.totalShares + (internals.virtualShares ?? 0n);
        const ta = before.totalAssets;
        if (ta + 1n === 0n || supply === 0n) return assets;
        return (assets * supply + ta) / (ta + 1n);
      };
      const exitShares = isForceWithdraw
        ? v2ToSharesUp(exitAssets)
        : operation.shares;
      const penaltyShares = v2ToSharesUp(penaltyAssets);
      const burned = before.userShares - next.userShares;
      if (burned !== exitShares + penaltyShares)
        fail(
          ctx,
          operation,
          `Owner share burn "${burned}", expected exit "${exitShares}" + penalty "${penaltyShares}"`,
        );
      if (next.idleAssets < 0n)
        fail(
          ctx,
          operation,
          `Vault idle assets went negative: "${next.idleAssets}"`,
        );
      if (before.idleAssets - next.idleAssets > exitAssets + penaltyAssets)
        fail(
          ctx,
          operation,
          `Idle assets dropped "${before.idleAssets - next.idleAssets}", above the exit "${exitAssets}" plus penalty "${penaltyAssets}"`,
        );

      return {
        operation,
        outcome: isForceWithdraw
          ? {
              sharesBurned: burned,
              assetsReceived: credit,
              penaltyAssets,
            }
          : {
              assetsReceived: credit,
              penaltyShares,
              penaltyAssets,
            },
      } as CheckedOperation;
    }

    case "vaultV1InKindRedeem":
    case "vaultV2InKindRedeem": {
      const before = findVault(accruedBefore, operation.vault, ctx, operation);
      const next = findVault(after, operation.vault, ctx, operation);
      const internals = vaultInternals(
        accruedBefore,
        operation.vault,
        ctx,
        operation,
      );
      const credit = receiverCredit(
        actionDiff,
        operation.onBehalf,
        operation.asset,
      );
      // The idle-covered portion pays underlying; only deallocated legs pay
      // Blue position shares. Idle for an in-kind exit is the vault's own
      // ERC-20 balance (`assetBalance`), not the liquidity-adapter pool.
      const vaultEntity = internals.entity;
      const idleForExit =
        vaultEntity instanceof AccrualVaultV2
          ? vaultEntity.assetBalance
          : before.idleAssets;
      const expectedIdleCredit = MathLib.min(idleForExit, operation.assets);
      if (credit !== expectedIdleCredit)
        fail(
          ctx,
          operation,
          `In-kind redemption credited "${credit}" wallet assets, expected the idle-covered "${expectedIdleCredit}"`,
        );
      const burned = before.userShares - next.userShares;
      if (burned <= 0n)
        fail(ctx, operation, `In-kind redemption burned "${burned}" shares`);
      // Per decoded leg: when deallocation was needed, each leg's owner
      // supply shares increase; a fully idle-covered exit moves nothing.
      for (const leg of operation.markets) {
        const ownerBefore =
          accruedBefore.positions.find(
            (p) => p.marketId === leg.marketId && eq(p.user, operation.owner),
          ) ??
          fail(
            ctx,
            operation,
            `In-kind leg market "${leg.marketId}" position missing`,
          );
        const ownerAfter =
          after.positions.find(
            (p) => p.marketId === leg.marketId && eq(p.user, operation.owner),
          ) ??
          fail(
            ctx,
            operation,
            `In-kind leg market "${leg.marketId}" position missing`,
          );
        if (ownerAfter.supplyShares < ownerBefore.supplyShares)
          fail(
            ctx,
            operation,
            `In-kind leg "${leg.marketId}" supply shares decreased`,
          );
        if (
          credit < operation.assets &&
          ownerAfter.supplyShares === ownerBefore.supplyShares
        )
          fail(
            ctx,
            operation,
            `In-kind leg "${leg.marketId}" credited no supply shares`,
          );
      }
      return {
        operation,
        outcome: {
          sharesBurned: burned,
          idleAssetsReceived: credit,
          supplyAssetsByMarket: operation.markets.map((leg) => {
            const ownerBefore = accruedBefore.positions.find(
              (p) =>
                p.marketId === leg.marketId && eq(p.user, operation.onBehalf),
            );
            const ownerAfter = after.positions.find(
              (p) =>
                p.marketId === leg.marketId && eq(p.user, operation.onBehalf),
            );
            return {
              marketId: leg.marketId,
              assets:
                (ownerAfter?.supplyAssets ?? 0n) -
                (ownerBefore?.supplyAssets ?? 0n),
            };
          }),
          penaltyAssets: 0n,
          residualShareAllowance: 0n,
        },
      } as CheckedOperation;
    }

    default: {
      const _exhaustive: never = operation;
      throw new StateChangeMismatchError(
        `checkExitOperation received ${JSON.stringify(_exhaustive)}`,
        { context: opContext(ctx, operation as DecodedOperation) },
      );
    }
  }
}
