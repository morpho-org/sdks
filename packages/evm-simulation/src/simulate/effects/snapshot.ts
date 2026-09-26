import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, ethAddress, isAddressEqual } from "viem";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type {
  Applicable,
  MarketState,
  PermissionState,
  PositionState,
  RiskMetric,
  VerificationDiff,
  VerificationSnapshot,
  WalletBalance,
} from "../../domain/evidence.js";
import type { DecodedProbeRead } from "../../domain/stages.js";
import { MissingVerificationEvidenceError } from "../../errors.js";

const eq = (a: Address, b: Address) => isAddressEqual(a, b);

/** Narrow a decoded read to the variant named by `type`. */
const isExtracted = <T extends DecodedProbeRead["type"]>(
  read: DecodedProbeRead,
  type: T,
): read is Extract<DecodedProbeRead, { readonly type: T }> =>
  read.type === type;

const missing = (context: SimulationErrorContext, subject: string): never => {
  throw new MissingVerificationEvidenceError(
    `Snapshot subject "${subject}" has no probe observation. Planned reads must cover every snapshot field.`,
    context,
  );
};

/**
 * Overlay decoded in-block probe reads onto the pinned `before` template.
 *
 * Static fields (caps, fees, bindings, recipients) come from the template;
 * every dynamic field must be covered by a read — a template subject without
 * a matching observation means the plan under-covered the snapshot.
 *
 * @param template - The pinned `before` snapshot supplying static fields.
 * @param reads - Decoded probe reads from one phase.
 * @returns A deep-frozen snapshot structurally comparable to `template`.
 * @throws {MissingVerificationEvidenceError} When a template subject has no
 *   matching read.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: reads-and-context signature mirrors the overlay contract
export function buildSnapshot(
  template: VerificationSnapshot,
  reads: readonly DecodedProbeRead[],
  context?: SimulationErrorContext,
): VerificationSnapshot {
  const ctx: SimulationErrorContext = context ?? { stage: "verification" };
  const find = <T extends DecodedProbeRead["type"]>(
    type: T,
    matches: (read: Extract<DecodedProbeRead, { readonly type: T }>) => boolean,
  ): Extract<DecodedProbeRead, { readonly type: T }> | undefined =>
    reads.find(
      (read): read is Extract<DecodedProbeRead, { readonly type: T }> =>
        isExtracted(read, type) && matches(read),
    );

  const wallet: WalletBalance[] = template.wallet.map((balance) => {
    const isNative = eq(balance.token, ethAddress);
    const read = isNative
      ? find("nativeBalance", (r) => eq(r.account, balance.account))
      : find(
          "erc20Balance",
          (r) => eq(r.token, balance.token) && eq(r.account, balance.account),
        );
    if (read == null) {
      return missing(ctx, `wallet ${balance.account}:${balance.token}`);
    }
    return { ...balance, assets: read.value };
  });

  const permissions: PermissionState[] = template.permissions.map(
    (permission) => {
      switch (permission.type) {
        case "erc20Allowance": {
          const read = find(
            "erc20Allowance",
            (r) =>
              eq(r.token, permission.token) &&
              eq(r.owner, permission.owner) &&
              eq(r.spender, permission.spender),
          );
          if (read == null)
            return missing(
              ctx,
              `allowance ${permission.owner}:${permission.token}:${permission.spender}`,
            );
          return { ...permission, amount: read.value };
        }
        case "erc2612Nonce": {
          const read = find(
            "erc2612Nonce",
            (r) =>
              eq(r.token, permission.verifyingContract) &&
              eq(r.owner, permission.owner),
          );
          if (read == null)
            return missing(
              ctx,
              `erc2612 nonce ${permission.verifyingContract}:${permission.owner}`,
            );
          return { ...permission, nonce: read.value };
        }
        case "permit2Nonce": {
          const read = find(
            "permit2NonceBitmap",
            (r) =>
              eq(r.permit2, permission.permit2) &&
              eq(r.owner, permission.owner) &&
              r.wordPosition === permission.wordPosition,
          );
          if (read == null)
            return missing(
              ctx,
              `permit2 bitmap ${permission.permit2}:${permission.owner}:${permission.wordPosition}`,
            );
          return {
            ...permission,
            bitmap: read.value,
            consumed: (read.value & (1n << (permission.nonce % 256n))) !== 0n,
          };
        }
        case "blueAuthorization": {
          const read = find(
            "blueIsAuthorized",
            (r) =>
              eq(r.morpho, permission.morpho) &&
              eq(r.authorizer, permission.authorizer) &&
              eq(r.authorized, permission.authorized),
          );
          if (read == null)
            return missing(
              ctx,
              `isAuthorized ${permission.authorizer}:${permission.authorized}`,
            );
          return { ...permission, isAuthorized: read.value };
        }
        case "blueAuthorizationNonce": {
          const read = find(
            "blueNonce",
            (r) =>
              eq(r.morpho, permission.verifyingContract) &&
              eq(r.owner, permission.owner),
          );
          if (read == null)
            return missing(
              ctx,
              `blue nonce ${permission.verifyingContract}:${permission.owner}`,
            );
          return { ...permission, nonce: read.value };
        }
      }
    },
  );

  const markets: MarketState[] = template.markets.map((market) => {
    const marketRead = find(
      "blueMarket",
      (r) => r.marketId === market.market.marketId,
    );
    if (marketRead == null)
      return missing(ctx, `market ${market.market.marketId}`);
    const oracleRead = find("oraclePrice", (r) =>
      eq(r.oracle, market.market.params.oracle),
    );
    const irmRead = find("irmBorrowRateView", (r) =>
      eq(r.irm, market.market.params.irm),
    );
    const rateAtTargetRead = find("irmRateAtTarget", (r) =>
      eq(r.irm, market.market.params.irm),
    );
    if (
      market.rateAtTargetPerSecondWad.type === "applicable" &&
      rateAtTargetRead == null
    ) {
      return missing(ctx, `rateAtTarget ${market.market.marketId}`);
    }
    const totalSupplyAssets = marketRead.value.totalSupplyAssets;
    const totalBorrowAssets = marketRead.value.totalBorrowAssets;
    const liquidityAssets =
      totalSupplyAssets > totalBorrowAssets
        ? totalSupplyAssets - totalBorrowAssets
        : 0n;
    return {
      ...market,
      totalSupplyAssets,
      totalSupplyShares: marketRead.value.totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares: marketRead.value.totalBorrowShares,
      lastUpdate: marketRead.value.lastUpdate,
      feeWad: marketRead.value.fee,
      liquidityAssets,
      oraclePrice:
        oracleRead == null || market.oraclePrice.type !== "applicable"
          ? market.oraclePrice
          : {
              type: "applicable",
              value: {
                value: oracleRead.value,
                scale: market.oraclePrice.value.scale,
              },
            },
      borrowRatePerSecondWad:
        irmRead == null || market.borrowRatePerSecondWad.type !== "applicable"
          ? market.borrowRatePerSecondWad
          : { type: "applicable", value: irmRead.value },
      rateAtTargetPerSecondWad:
        rateAtTargetRead == null ||
        market.rateAtTargetPerSecondWad.type !== "applicable"
          ? market.rateAtTargetPerSecondWad
          : { type: "applicable", value: rateAtTargetRead.value },
    } satisfies MarketState;
  });

  const marketStateOf = (marketId: PositionState["marketId"]) =>
    markets.find((market) => market.market.marketId === marketId);

  const positions: PositionState[] = template.positions.map((position) => {
    const read = find(
      "bluePosition",
      (r) => r.marketId === position.marketId && eq(r.owner, position.owner),
    );
    if (read == null)
      return missing(ctx, `position ${position.marketId}:${position.owner}`);
    const market = marketStateOf(position.marketId);
    if (market == null) return missing(ctx, `market ${position.marketId}`);
    return {
      ...position,
      supplyShares: read.value.supplyShares,
      borrowShares: read.value.borrowShares,
      collateralAssets: read.value.collateral,
      // Share-derived asset values are recomputed against the overlaid market
      // the same way `Position.supplyAssets`/`borrowAssets` resolve them.
      supplyAssets: MarketUtils.toSupplyAssets(read.value.supplyShares, market),
      borrowAssets: MarketUtils.toBorrowAssets(read.value.borrowShares, market),
    };
  });

  const vaults = template.vaults.map((vault) => {
    const totalAssetsRead = find("vaultTotalAssets", (r) =>
      eq(r.vault, vault.vault),
    );
    const totalSupplyRead = find("vaultTotalSupply", (r) =>
      eq(r.vault, vault.vault),
    );
    const ownerSharesRead = find(
      "vaultBalanceOf",
      (r) => eq(r.vault, vault.vault) && eq(r.account, vault.owner),
    );
    if (
      totalAssetsRead == null ||
      totalSupplyRead == null ||
      ownerSharesRead == null
    ) {
      return missing(ctx, `vault ${vault.vault}`);
    }
    const allocations = vault.allocations.map((allocation) => {
      if (allocation.marketId == null) return allocation;
      const allocRead = find(
        "adapterAllocation",
        (r) =>
          eq(r.vault, vault.vault) && r.allocationId === allocation.marketId,
      );
      return allocRead == null
        ? allocation
        : { ...allocation, assets: allocRead.value };
    });
    const idleRead =
      vault.type === "vaultV2"
        ? find("vaultIdleAssets", (r) => eq(r.vault, vault.vault))
        : undefined;
    return {
      ...vault,
      totalAssets: totalAssetsRead.value,
      totalShares: totalSupplyRead.value,
      ownerShares: ownerSharesRead.value,
      idleAssets: idleRead?.value ?? vault.idleAssets,
      allocations,
      sharePriceE27:
        totalSupplyRead.value === 0n
          ? 0n
          : MathLib.mulDivUp(
              totalAssetsRead.value,
              10n ** 27n,
              totalSupplyRead.value,
            ),
    };
  });

  return deepFreeze({ wallet, permissions, positions, vaults, markets });
}

/** Same-mechanism value comparison between two permission states. */
const permissionChanged = (
  prior: PermissionState,
  after: PermissionState,
): boolean => {
  switch (prior.type) {
    case "erc20Allowance":
      return after.type === "erc20Allowance" && after.amount !== prior.amount;
    case "blueAuthorization":
      return (
        after.type === "blueAuthorization" &&
        after.isAuthorized !== prior.isAuthorized
      );
    case "erc2612Nonce":
      return after.type === "erc2612Nonce" && after.nonce !== prior.nonce;
    case "blueAuthorizationNonce":
      return (
        after.type === "blueAuthorizationNonce" && after.nonce !== prior.nonce
      );
    case "permit2Nonce":
      return (
        after.type === "permit2Nonce" &&
        (after.bitmap !== prior.bitmap || after.consumed !== prior.consumed)
      );
  }
};

const finiteChange = (
  before: RiskMetric,
  after: RiskMetric,
): VerificationDiff["positions"][number]["ltvWad"] =>
  before.type === "finite" && after.type === "finite"
    ? { type: "finite", diffWad: after.valueWad - before.valueWad }
    : { type: "transition", before, after };

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const applicableChange = <T extends bigint>(
  before: Applicable<T>,
  after: Applicable<T>,
  sub: (a: T, b: T) => bigint,
): VerificationDiff["markets"][number]["borrowApyWad"] =>
  before.type === "applicable" && after.type === "applicable"
    ? { type: "finite", diffWad: sub(after.value, before.value) }
    : { type: "transition", before, after };

/**
 * Signed per-subject difference between two snapshots sharing one template.
 * Only changed subjects appear; equal snapshots produce empty diffs.
 * @internal
 */
export function diffSnapshots(
  before: VerificationSnapshot,
  after: VerificationSnapshot,
): VerificationDiff {
  const wallet = after.wallet
    .map((balance) => {
      const prior = before.wallet.find(
        (w) => eq(w.account, balance.account) && eq(w.token, balance.token),
      );
      const diff = balance.assets - (prior?.assets ?? 0n);
      return diff === 0n ? null : { ...balance, assets: diff };
    })
    .filter((entry): entry is WalletBalance => entry != null);

  const permissions = after.permissions
    .map((permission): VerificationDiff["permissions"][number] | null => {
      const prior = before.permissions.find((p) => {
        if (p.type !== permission.type) return false;
        switch (p.type) {
          case "erc20Allowance":
            return (
              permission.type === "erc20Allowance" &&
              eq(p.token, permission.token) &&
              eq(p.owner, permission.owner) &&
              eq(p.spender, permission.spender)
            );
          case "blueAuthorization":
            return (
              permission.type === "blueAuthorization" &&
              eq(p.morpho, permission.morpho) &&
              eq(p.authorizer, permission.authorizer) &&
              eq(p.authorized, permission.authorized)
            );
          case "erc2612Nonce":
            return (
              permission.type === "erc2612Nonce" &&
              eq(p.verifyingContract, permission.verifyingContract) &&
              eq(p.owner, permission.owner)
            );
          case "blueAuthorizationNonce":
            return (
              permission.type === "blueAuthorizationNonce" &&
              eq(p.verifyingContract, permission.verifyingContract) &&
              eq(p.owner, permission.owner)
            );
          case "permit2Nonce":
            return (
              permission.type === "permit2Nonce" &&
              eq(p.permit2, permission.permit2) &&
              eq(p.owner, permission.owner) &&
              p.wordPosition === permission.wordPosition
            );
        }
      });
      if (prior == null || prior.type !== permission.type) return null;
      if (!permissionChanged(prior, permission)) return null;
      switch (prior.type) {
        case "erc20Allowance":
          return permission.type === "erc20Allowance"
            ? { before: prior, after: permission }
            : null;
        case "blueAuthorization":
          return permission.type === "blueAuthorization"
            ? { before: prior, after: permission }
            : null;
        case "erc2612Nonce":
          return permission.type === "erc2612Nonce"
            ? { before: prior, after: permission }
            : null;
        case "blueAuthorizationNonce":
          return permission.type === "blueAuthorizationNonce"
            ? { before: prior, after: permission }
            : null;
        case "permit2Nonce":
          return permission.type === "permit2Nonce"
            ? { before: prior, after: permission }
            : null;
      }
    })
    .filter(
      (entry): entry is VerificationDiff["permissions"][number] =>
        entry != null,
    );

  const positions = after.positions
    .map((position) => {
      const prior = before.positions.find(
        (p) => p.marketId === position.marketId && eq(p.owner, position.owner),
      );
      if (prior == null) return null;
      const diffs = {
        supplyAssets: position.supplyAssets - prior.supplyAssets,
        supplyShares: position.supplyShares - prior.supplyShares,
        borrowAssets: position.borrowAssets - prior.borrowAssets,
        borrowShares: position.borrowShares - prior.borrowShares,
        collateralAssets: position.collateralAssets - prior.collateralAssets,
      };
      const riskChanged =
        prior.ltvWad.type !== position.ltvWad.type ||
        (prior.ltvWad.type === "finite" &&
          position.ltvWad.type === "finite" &&
          prior.ltvWad.valueWad !== position.ltvWad.valueWad) ||
        prior.healthFactorWad.type !== position.healthFactorWad.type;
      if (Object.values(diffs).every((d) => d === 0n) && !riskChanged)
        return null;
      return {
        marketId: position.marketId,
        owner: position.owner,
        ...diffs,
        ltvWad: finiteChange(prior.ltvWad, position.ltvWad),
        healthFactorWad: finiteChange(
          prior.healthFactorWad,
          position.healthFactorWad,
        ),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const vaults = after.vaults
    .map((vault) => {
      const prior = before.vaults.find((v) => eq(v.vault, vault.vault));
      if (prior == null) return null;
      const diffs = {
        totalAssets: vault.totalAssets - prior.totalAssets,
        totalShares: vault.totalShares - prior.totalShares,
        ownerShares: vault.ownerShares - prior.ownerShares,
        idleAssets: vault.idleAssets - prior.idleAssets,
      };
      const allocations = vault.allocations
        .map((allocation) => {
          const priorAllocation = prior.allocations.find(
            (a) =>
              eq(a.adapter, allocation.adapter) &&
              a.marketId === allocation.marketId,
          );
          if (priorAllocation == null) return null;
          const assetsDiff = allocation.assets - priorAllocation.assets;
          const sharesDiff = allocation.shares - priorAllocation.shares;
          return assetsDiff === 0n && sharesDiff === 0n
            ? null
            : {
                adapter: allocation.adapter,
                ...(allocation.marketId == null
                  ? {}
                  : { marketId: allocation.marketId }),
                assets: assetsDiff,
                shares: sharesDiff,
              };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null);
      if (
        Object.values(diffs).every((d) => d === 0n) &&
        allocations.length === 0
      )
        return null;
      return {
        vault: vault.vault,
        ...diffs,
        allocations,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const markets = after.markets
    .map((market) => {
      const prior = before.markets.find(
        (m) => m.market.marketId === market.market.marketId,
      );
      if (prior == null) return null;
      const diffs = {
        totalSupplyAssets: market.totalSupplyAssets - prior.totalSupplyAssets,
        totalSupplyShares: market.totalSupplyShares - prior.totalSupplyShares,
        totalBorrowAssets: market.totalBorrowAssets - prior.totalBorrowAssets,
        totalBorrowShares: market.totalBorrowShares - prior.totalBorrowShares,
        liquidityAssets: market.liquidityAssets - prior.liquidityAssets,
      };
      if (Object.values(diffs).every((d) => d === 0n)) return null;
      return {
        marketId: market.market.marketId,
        ...diffs,
        utilizationWad: finiteChange(
          prior.utilizationWad,
          market.utilizationWad,
        ),
        borrowApyWad: applicableChange(
          prior.borrowApyWad,
          market.borrowApyWad,
          (a, b) => a - b,
        ),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  return deepFreeze({ wallet, permissions, positions, vaults, markets });
}
