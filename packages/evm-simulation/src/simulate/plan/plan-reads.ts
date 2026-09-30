import { UnsupportedChainIdError } from "@morpho-org/blue-sdk";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { _try } from "@morpho-org/morpho-ts";
import { ethAddress, isAddressEqual, zeroAddress } from "viem";
import type {
  PermissionState,
  VerificationSnapshot,
} from "../../domain/evidence.js";
import type { DecodedBundle, ProbeRead } from "../../domain/stages.js";
import { UnsupportedChainError } from "../../errors.js";
import { probeId } from "./probes.js";

const PERMISSION_READ_TYPES = new Set<ProbeRead["type"]>([
  "erc20Allowance",
  "blueIsAuthorized",
  "erc2612Nonce",
  "blueNonce",
  "permit2NonceBitmap",
]);

const pushUnique = (reads: ProbeRead[], read: ProbeRead): void => {
  const id = probeId(read);
  if (!reads.some((existing) => probeId(existing) === id)) reads.push(read);
};

/**
 * Plan every state read the boundary must observe for verification, derived
 * purely from the decoded bundle's subjects and the pinned `before` snapshot.
 *
 * `full` reads every dynamic field the snapshot carries — wallet balances,
 * permission storage, positions, markets (plus oracle price and IRM borrow
 * rate for markets with a non-zero oracle/IRM), and vault fields — so before,
 * intermediate and after snapshots stay comparable. `permissions` is the
 * read-back subset emitted after preparation calls and between user
 * transactions: only permission-state reads, which preparation is allowed to
 * change.
 *
 * @param bundle - The decoded bundle; supplies the chain and wallet owner.
 * @param before - The pinned pre-state snapshot enumerating every subject.
 * @returns Deduped probe reads in stable order.
 * @throws {UnsupportedChainError} when the bundle's chain is absent from the registry.
 * @internal
 */
const permissionProbe = (permission: PermissionState): ProbeRead => {
  switch (permission.type) {
    case "erc20Allowance":
      return {
        type: "erc20Allowance",
        token: permission.token,
        owner: permission.owner,
        spender: permission.spender,
      };
    case "blueAuthorization":
      return {
        type: "blueIsAuthorized",
        morpho: permission.morpho,
        authorizer: permission.authorizer,
        authorized: permission.authorized,
      };
    case "erc2612Nonce":
      return {
        type: "erc2612Nonce",
        token: permission.verifyingContract,
        owner: permission.owner,
      };
    case "blueAuthorizationNonce":
      return {
        type: "blueNonce",
        morpho: permission.verifyingContract,
        owner: permission.owner,
      };
    case "permit2Nonce":
      return {
        type: "permit2NonceBitmap",
        permit2: permission.permit2,
        owner: permission.owner,
        wordPosition: permission.wordPosition,
      };
  }
};

/**
 * Plan the full probe-read set for a bundle: `full` covers every market,
 * position, vault, wallet balance, and permission subject read before and
 * after the user transactions; `permissions` is the subset that must be
 * re-read after preview preparations to prove each prepared grant landed.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: pipeline-stage signature reads clearest with positional arguments
export function planProbeReads(
  bundle: DecodedBundle,
  before: VerificationSnapshot,
  preparations: readonly {
    readonly expected: readonly PermissionState[];
  }[] = [],
): {
  readonly full: readonly ProbeRead[];
  readonly permissions: readonly ProbeRead[];
} {
  const chainId = bundle.request.chainId;
  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) throw new UnsupportedChainError(chainId);
  const morpho = addresses.blue;

  const full: ProbeRead[] = [];

  for (const balance of before.wallet) {
    pushUnique(
      full,
      isAddressEqual(balance.token, ethAddress)
        ? { type: "nativeBalance", account: balance.account }
        : {
            type: "erc20Balance",
            token: balance.token,
            account: balance.account,
          },
    );
  }

  for (const permission of before.permissions) {
    pushUnique(full, permissionProbe(permission));
  }

  // Prepared probes must also read back permission states that preparations
  // create from nothing — a new grant has no pinned `before` entry.
  for (const preparation of preparations) {
    for (const permission of preparation.expected) {
      pushUnique(full, permissionProbe(permission));
    }
  }

  for (const position of before.positions) {
    pushUnique(full, {
      type: "bluePosition",
      morpho,
      marketId: position.marketId,
      owner: position.owner,
    });
  }

  for (const market of before.markets) {
    pushUnique(full, {
      type: "blueMarket",
      morpho,
      marketId: market.market.marketId,
    });
    const { oracle, irm } = market.market.params;
    if (!isAddressEqual(oracle, zeroAddress)) {
      pushUnique(full, { type: "oraclePrice", oracle });
    }
    if (!isAddressEqual(irm, zeroAddress)) {
      pushUnique(full, {
        type: "irmRateAtTarget",
        irm,
        marketId: market.market.marketId,
      });
      pushUnique(full, {
        type: "irmBorrowRateView",
        irm,
        market: market.market.params,
        marketState: {
          totalSupplyAssets: market.totalSupplyAssets,
          totalSupplyShares: market.totalSupplyShares,
          totalBorrowAssets: market.totalBorrowAssets,
          totalBorrowShares: market.totalBorrowShares,
          lastUpdate: market.lastUpdate,
          fee: market.feeWad,
        },
      });
    }
  }

  for (const vault of before.vaults) {
    pushUnique(full, { type: "vaultTotalAssets", vault: vault.vault });
    pushUnique(full, { type: "vaultTotalSupply", vault: vault.vault });
    pushUnique(full, {
      type: "vaultBalanceOf",
      vault: vault.vault,
      account: vault.owner,
    });
    if (vault.type === "vaultV2") {
      if (!isAddressEqual(vault.liquidityAdapter, zeroAddress)) {
        pushUnique(full, {
          type: "vaultIdleAssets",
          vault: vault.vault,
          asset: vault.asset,
          liquidityAdapter: vault.liquidityAdapter,
        });
      }
      for (const allocation of vault.allocations) {
        if (allocation.marketId != null) {
          pushUnique(full, {
            type: "adapterAllocation",
            vault: vault.vault,
            allocationId: allocation.marketId,
          });
        }
      }
    }
  }

  const permissions = full.filter((read) =>
    PERMISSION_READ_TYPES.has(read.type),
  );

  return { full, permissions };
}
