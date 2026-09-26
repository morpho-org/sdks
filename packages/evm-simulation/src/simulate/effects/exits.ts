import { AccrualVaultV2, MathLib } from "@morpho-org/blue-sdk";
import { type Address, getAddress, isAddressEqual } from "viem";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type {
  VaultState,
  VerificationDiff,
  VerificationSnapshot,
} from "../../domain/evidence.js";
import type { EffectiveSimulationLimits } from "../../domain/limits.js";
import type {
  DecodedOperation,
  OperationIdentity,
} from "../../domain/operations.js";
import type { VerifiedOperation } from "../../domain/result.js";
import type { DecodedBundle, PinnedInputs } from "../../domain/stages.js";
import {
  AssetChangeMismatchError,
  StateChangeMismatchError,
} from "../../errors.js";

const eq = (a: Address, b: Address) => isAddressEqual(a, b);

interface Ctx {
  readonly context: SimulationErrorContext;
  readonly identity: OperationIdentity;
}

const locationOf = (identity: OperationIdentity) => ({
  type: "transaction" as const,
  txIdx: identity.transactionIndex,
  callPath: identity.callPath,
});

const fail = (message: string, { context, identity }: Ctx): never => {
  throw new StateChangeMismatchError(message, {
    ...context,
    location: locationOf(identity),
  });
};

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findVault = (
  snapshot: VerificationSnapshot,
  vault: Address,
  ctx: Ctx,
): VaultState =>
  snapshot.vaults.find((v) => eq(v.vault, vault)) ??
  fail(`Vault ${vault} missing from snapshot`, ctx);

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const receiverCredit = (
  actionDiff: VerificationDiff,
  account: Address,
  token: Address,
): bigint =>
  actionDiff.wallet
    .filter((c) => eq(c.account, account) && eq(c.token, token))
    .reduce((total, c) => total + c.assets, 0n);

/**
 * Verify vault exit / migration / in-kind operations (design §14).
 *
 * - `vaultV1MigrateToV2`: source shares burned, assets out ==
 *   `previewRedeem` on the source's accrued entity, target shares minted ==
 *   `previewDeposit(assetsOut)` ±1, owner asset balance unchanged.
 * - `vaultV2ForceWithdraw` / `vaultV2ForceRedeem`: ordered adapter
 *   deallocations — each decoded `(adapter, marketId, amount)` must drop the
 *   adapter allocation exactly; penalty shares burned from the owner on top
 *   of the exit shares; receiver credit == `exitAssets` (forceWithdraw) or
 *   `previewRedeem(shares)` (forceRedeem). Any allocation change absent from
 *   the decoded list → `StateChangeMismatchError`.
 * - `vaultV1/2InKindRedeem`: owner receives Blue supply shares per decoded
 *   leg — owner's supplyShares += leg shares, vault's market position −= the
 *   same; no asset credit; burned shares == cap-bounded expected.
 *
 * @internal
 */
export function verifyExitOperation(params: {
  readonly bundle: DecodedBundle;
  readonly operation: Extract<
    DecodedOperation,
    {
      readonly type:
        | "vaultV1MigrateToV2"
        | "vaultV2ForceWithdraw"
        | "vaultV2ForceRedeem"
        | "vaultV1InKindRedeem"
        | "vaultV2InKindRedeem";
    }
  >;
  readonly inputs: PinnedInputs;
  readonly before: VerificationSnapshot;
  readonly accruedBefore: VerificationSnapshot;
  readonly after: VerificationSnapshot;
  readonly actionDiff: VerificationDiff;
  readonly limits: EffectiveSimulationLimits;
  readonly context: SimulationErrorContext;
}): VerifiedOperation {
  const { operation, inputs, accruedBefore, after, actionDiff, context } =
    params;
  const ctx: Ctx = {
    context,
    identity: {
      transactionIndex: operation.transactionIndex,
      callPath: operation.callPath,
    },
  };

  switch (operation.type) {
    case "vaultV1MigrateToV2": {
      const source = findVault(accruedBefore, operation.sourceVault, ctx);
      const target = findVault(accruedBefore, operation.targetVault, ctx);
      const sourceAfter = findVault(after, operation.sourceVault, ctx);
      const targetAfter = findVault(after, operation.targetVault, ctx);

      const assetsOut =
        operation.amount.type === "assets"
          ? operation.amount.assets
          : (() => {
              if (source.type !== "vaultV1")
                return fail("Migrate source vault is not a V1 vault", ctx);
              const supply = source.totalShares + 10n ** source.decimalsOffset;
              return supply === 0n
                ? 0n
                : (operation.amount.shares * (source.totalAssets + 1n)) /
                    supply;
            })();
      const burned = source.ownerShares - sourceAfter.ownerShares;
      if (burned <= 0n) fail(`Migration burned "${burned}" source shares`, ctx);
      const minted = targetAfter.ownerShares - target.ownerShares;
      const expectedMinted =
        target.type === "vaultV2"
          ? (() => {
              const supply = target.totalShares + target.virtualShares;
              const ta = target.totalAssets;
              return ta + 1n === 0n || supply === 0n
                ? assetsOut
                : (assetsOut * supply) / (ta + 1n);
            })()
          : assetsOut;
      if (minted !== expectedMinted && minted !== expectedMinted + 1n)
        fail(
          `Migration minted "${minted}" target shares, expected "${expectedMinted}" (±1)`,
          ctx,
        );
      // The migrated assets never touch the wallet.
      const walletNet = actionDiff.wallet
        .filter(
          (c) => eq(c.account, operation.owner) && eq(c.token, operation.asset),
        )
        .reduce((total, c) => total + c.assets, 0n);
      if (walletNet !== 0n)
        throw new AssetChangeMismatchError(
          `Migration moved "${walletNet}" wallet assets — migrated assets must route vault-to-vault`,
          { ...context, location: locationOf(ctx.identity) },
        );
      return {
        operation,
        outcome: { targetSharesMinted: minted },
      } as VerifiedOperation;
    }

    case "vaultV2ForceWithdraw":
    case "vaultV2ForceRedeem": {
      const before = findVault(accruedBefore, operation.vault, ctx);
      const next = findVault(after, operation.vault, ctx);
      const isForceWithdraw = operation.type === "vaultV2ForceWithdraw";

      // Ordered deallocations: each decoded leg drops the adapter allocation
      // exactly; any allocation change absent from the decoded list fails.
      // `vaultV2ForceWithdraw` carries no decoded legs — the contract derives
      // its own deallocations — so per-adapter decreases are contract-derived
      // (each still accrues the pinned penalty) while any increase fails.
      const contractDerivedDeallocations = !("deallocations" in operation);
      const deallocations = contractDerivedDeallocations
        ? []
        : operation.deallocations;
      let penaltyAssets = 0n;
      let unmodeledDecrease = 0n;
      const consumedAllocations = new Set<
        (typeof before.allocations)[number]
      >();
      const matchesLeg = (
        allocation: (typeof before.allocations)[number],
        leg: (typeof deallocations)[number],
      ) =>
        leg.marketId != null
          ? allocation.marketId === leg.marketId
          : eq(allocation.adapter, leg.adapter);
      const vaultEntity = inputs.internals.vaultData.get(
        getAddress(operation.vault),
      );
      const accrualAdapters =
        vaultEntity instanceof AccrualVaultV2
          ? vaultEntity.accrualAdapters
          : [];
      for (const leg of deallocations) {
        const prior = before.allocations.find((a) => matchesLeg(a, leg));
        // Accrual-adapter positions are not pinned/probed per market: a leg
        // on a known accrual adapter is verified at adapter level — it must
        // be a declared adapter — and its penalty accrues from the vault's
        // pinned forceDeallocatePenalties.
        if (prior == null) {
          const adapter = accrualAdapters.find((a) =>
            eq(a.address, leg.adapter),
          );
          if (adapter == null)
            fail(
              `Adapter "${leg.adapter}" allocation missing for deallocation`,
              ctx,
            );
          penaltyAssets += MathLib.wMulUp(
            leg.amount,
            vaultEntity instanceof AccrualVaultV2
              ? (vaultEntity.forceDeallocatePenalties[leg.adapter] ?? 0n)
              : 0n,
          );
          continue;
        }
        const observed =
          next.allocations.find((a) => matchesLeg(a, leg)) ??
          fail(
            `Adapter "${leg.adapter}" allocation missing for deallocation`,
            ctx,
          );
        consumedAllocations.add(prior);
        if (prior.assets - observed.assets !== leg.amount)
          fail(
            `Adapter "${leg.adapter}" allocation moved "${prior.assets - observed.assets}", expected "${leg.amount}"`,
            ctx,
          );
        penaltyAssets += MathLib.wMulUp(leg.amount, prior.penaltyWad);
      }
      for (const allocation of next.allocations) {
        // Identity pairing by adapter+marketId first, then adapter alone.
        const prior =
          before.allocations.find(
            (a) =>
              a.marketId != null &&
              a.marketId === allocation.marketId &&
              eq(a.adapter, allocation.adapter),
          ) ??
          before.allocations.find(
            (a) =>
              a.marketId != null &&
              a.marketId === allocation.marketId &&
              !consumedAllocations.has(a),
          ) ??
          before.allocations.find((a) => eq(a.adapter, allocation.adapter));
        if (prior != null && consumedAllocations.has(prior)) continue;
        if (prior == null || prior.assets === allocation.assets) continue;
        // Deallocation proceeds can raise an unmodeled allocation (e.g. the
        // liquidity adapter receives the deallocated assets); only a drop
        // indicates shares leaving the vault. Contract-derived deallocations
        // (forceWithdraw) accrue penalty per drop; a declared-leg drop
        // (forceRedeem) is the payout source and is bounded against the
        // receiver credit below.
        if (allocation.assets > prior.assets) continue;
        if (contractDerivedDeallocations) {
          penaltyAssets += MathLib.wMulUp(
            prior.assets - allocation.assets,
            prior.penaltyWad,
          );
          continue;
        }
        if (isForceWithdraw === false) {
          unmodeledDecrease += prior.assets - allocation.assets;
          continue;
        }
        fail(
          `Unmodeled adapter "${allocation.adapter}" allocation change "${prior.assets - allocation.assets}"`,
          ctx,
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
        fail(`Receiver credit "${credit}", expected "${expectedCredit}"`, ctx);
      if (unmodeledDecrease > credit)
        fail(
          `Unmodeled adapter decreases "${unmodeledDecrease}" exceed the receiver credit "${credit}"`,
          ctx,
        );

      // Owner share burn = exit shares + penalty shares (V2 toShares "Up").
      const v2ToSharesUp = (assets: bigint): bigint => {
        if (before.type !== "vaultV2")
          return fail("Force-exit source vault is not a V2 vault", ctx);
        const supply = before.totalShares + before.virtualShares;
        const ta = before.totalAssets;
        if (ta + 1n === 0n || supply === 0n) return assets;
        return (assets * supply + ta) / (ta + 1n);
      };
      const exitShares = isForceWithdraw
        ? v2ToSharesUp(exitAssets)
        : operation.shares;
      const penaltyShares = v2ToSharesUp(penaltyAssets);
      const burned = before.ownerShares - next.ownerShares;
      if (burned !== exitShares + penaltyShares)
        fail(
          `Owner share burn "${burned}", expected exit "${exitShares}" + penalty "${penaltyShares}"`,
          ctx,
        );
      if (next.idleAssets < 0n)
        fail(`Vault idle assets went negative: "${next.idleAssets}"`, ctx);
      if (before.idleAssets - next.idleAssets > exitAssets + penaltyAssets)
        fail(
          `Idle assets dropped "${before.idleAssets - next.idleAssets}", above the exit "${exitAssets}" plus penalty "${penaltyAssets}"`,
          ctx,
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
      } as VerifiedOperation;
    }

    case "vaultV1InKindRedeem":
    case "vaultV2InKindRedeem": {
      const before = findVault(accruedBefore, operation.vault, ctx);
      const next = findVault(after, operation.vault, ctx);
      const credit = receiverCredit(
        actionDiff,
        operation.onBehalf,
        operation.asset,
      );
      // The idle-covered portion pays underlying; only deallocated legs pay
      // Blue position shares. Idle for an in-kind exit is the vault's own
      // ERC-20 balance (`assetBalance`), not the liquidity-adapter pool.
      const inKindVault = inputs.internals.vaultData.get(
        getAddress(operation.vault),
      );
      const idleForExit =
        inKindVault instanceof AccrualVaultV2
          ? inKindVault.assetBalance
          : before.idleAssets;
      const expectedIdleCredit = MathLib.min(idleForExit, operation.assets);
      if (credit !== expectedIdleCredit)
        fail(
          `In-kind redemption credited "${credit}" wallet assets, expected the idle-covered "${expectedIdleCredit}"`,
          ctx,
        );
      const burned = before.ownerShares - next.ownerShares;
      if (burned <= 0n)
        fail(`In-kind redemption burned "${burned}" shares`, ctx);
      // Per decoded leg: when deallocation was needed, each leg's owner
      // supply shares increase; a fully idle-covered exit moves nothing.
      for (const leg of operation.markets) {
        const ownerBefore =
          accruedBefore.positions.find(
            (p) => p.marketId === leg.marketId && eq(p.owner, operation.owner),
          ) ??
          fail(`In-kind leg market "${leg.marketId}" position missing`, ctx);
        const ownerAfter =
          after.positions.find(
            (p) => p.marketId === leg.marketId && eq(p.owner, operation.owner),
          ) ??
          fail(`In-kind leg market "${leg.marketId}" position missing`, ctx);
        if (ownerAfter.supplyShares < ownerBefore.supplyShares)
          fail(`In-kind leg "${leg.marketId}" supply shares decreased`, ctx);
        if (
          credit < operation.assets &&
          ownerAfter.supplyShares === ownerBefore.supplyShares
        )
          fail(`In-kind leg "${leg.marketId}" credited no supply shares`, ctx);
      }
      return {
        operation,
        outcome: {
          sharesBurned: burned,
          idleAssetsReceived: credit,
          supplyAssetsByMarket: operation.markets.map((leg) => {
            const ownerBefore = accruedBefore.positions.find(
              (p) =>
                p.marketId === leg.marketId && eq(p.owner, operation.onBehalf),
            );
            const ownerAfter = after.positions.find(
              (p) =>
                p.marketId === leg.marketId && eq(p.owner, operation.onBehalf),
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
      } as VerifiedOperation;
    }

    default: {
      const _exhaustive: never = operation;
      throw new StateChangeMismatchError(
        `verifyExitOperation received ${JSON.stringify(_exhaustive)}`,
        context,
      );
    }
  }
}
