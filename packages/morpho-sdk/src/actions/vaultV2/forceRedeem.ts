import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, type Hex } from "viem";
import { encodeForceDeallocateCall } from "../../helpers/encodeDeallocation.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Deallocation,
  EmptyDeallocationsError,
  type Metadata,
  NonPositiveSharesAmountError,
  type Transaction,
  type VaultV2ForceRedeemAction,
} from "../../types/index.js";

/** Parameters for {@link vaultV2ForceRedeem}. */
export interface VaultV2ForceRedeemParams {
  vault: {
    address: Address;
  };
  args: {
    deallocations: readonly Deallocation[];
    redeem: {
      shares: bigint;
      recipient: Address;
    };
    onBehalf: Address;
  };
  metadata?: Metadata;
}

/**
 * Prepares a force-redeem transaction for a VaultV2 contract via the vault's native `multicall`.
 *
 * Encodes one or more `forceDeallocate` calls followed by a single `redeem`, executed atomically
 * through VaultV2's `multicall`. Share-based counterpart to {@link vaultV2ForceWithdraw} — use
 * when the user wants to redeem an exact share amount rather than withdraw exact assets.
 *
 * The total assets passed to `forceDeallocate` calls must be greater than or equal to the
 * asset-equivalent of the redeemed shares. The caller should apply a buffer on the deallocated
 * amounts to absorb share-price drift between submission and execution.
 *
 * A penalty is taken from `onBehalf` for each deallocation to discourage allocation
 * manipulation. The penalty is applied as a share burn where assets are returned to the vault,
 * so the share price stays stable (except for rounding).
 *
 * @param params.vault.address - The VaultV2 address.
 * @param params.args.deallocations - The deallocations to perform before redeeming. Must be
 *   non-empty.
 * @param params.args.redeem.shares - Amount of vault shares to redeem after the deallocations
 *   complete.
 * @param params.args.redeem.recipient - Address that receives the redeemed assets.
 * @param params.args.onBehalf - Address whose shares are burned and from which the deallocation
 *   penalty is taken.
 * @param params.metadata - Optional analytics metadata attached to the multicall transaction.
 * @returns A deep-frozen `Transaction<VaultV2ForceRedeemAction>` with `to`, `value`, `data`, and
 *   the typed `action` discriminator the simulation layer consumes.
 * @throws {EmptyDeallocationsError} when `deallocations` is empty.
 * @throws {NonPositiveSharesAmountError} when `redeem.shares <= 0n`.
 * @throws {NonPositiveAssetAmountError} when any `deallocations[i].amount <= 0n` (raised by
 *   `encodeForceDeallocateCall`).
 * @example
 * ```ts
 * import { vaultV2ForceRedeem } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV2ForceRedeem({
 *   vault: { address: vaultAddress },
 *   args: {
 *     deallocations: [{ adapter, marketParams, amount: 1_010_000n }],
 *     redeem: { shares: 1_000_000n, recipient },
 *     onBehalf,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<VaultV2ForceRedeemAction>>
 * ```
 */
export const vaultV2ForceRedeem = ({
  vault: { address: vaultAddress },
  args: { deallocations, redeem, onBehalf },
  metadata,
}: VaultV2ForceRedeemParams): Readonly<
  Transaction<VaultV2ForceRedeemAction>
> => {
  if (deallocations.length === 0) {
    throw new EmptyDeallocationsError(vaultAddress);
  }

  if (redeem.shares <= 0n) {
    throw new NonPositiveSharesAmountError(vaultAddress);
  }

  const calls: Hex[] = [];

  for (const deallocation of deallocations) {
    calls.push(encodeForceDeallocateCall(deallocation, onBehalf));
  }

  calls.push(
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "redeem",
      args: [redeem.shares, redeem.recipient, onBehalf],
    }),
  );

  let tx = {
    to: vaultAddress,
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "multicall",
      args: [calls],
    }),
    value: 0n,
  };

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "vaultV2ForceRedeem",
      args: {
        vault: vaultAddress,
        deallocations: deallocations.map((d) => ({ ...d })),
        redeem: {
          shares: redeem.shares,
          recipient: redeem.recipient,
        },
        onBehalf,
      },
    },
  });
};
