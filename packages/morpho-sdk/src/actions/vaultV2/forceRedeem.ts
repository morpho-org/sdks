import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, type Hex, encodeFunctionData } from "viem";
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
 * Prepares a force redeem transaction for the VaultV2 contract, using VaultV2's native `multicall`.
 *
 * This function encodes one or more `forceDeallocate` calls followed by a single `redeem`,
 * executed atomically via VaultV2's `multicall`. This allows a user to free liquidity from
 * adapters other than the liquidity adapter and redeem all their shares in one transaction.

 *
 * This is the share-based counterpart to `vaultV2ForceWithdraw`, useful when the user wants
 * to redeem a maximum amount of shares rather than specifying an exact asset amount.
 *
 * The total assets passed to `forceDeallocate` calls must be greater than or equal to the
 * asset-equivalent of the redeemed shares. The caller should apply a buffer on the deallocated
 * amounts to account for share-price drift between submission and execution.
 *
 * A penalty is taken from `onBehalf` for each deallocation to discourage allocation manipulations.
 * The penalty is applied as a share burn where assets are returned to the vault, so the share price
 * remains stable (except for rounding).
 *
 * @param {Object} params - The vault related parameters.
 * @param {Object} params.vault - The vault related parameters.
 * @param {Address} params.vault.address - The vault contract address.
 * @param {Object} params.args - The force redeem related parameters.
 * @param {readonly Deallocation[]} params.args.deallocations - The list of deallocations to perform.
 * @param {Object} params.args.redeem - The redeem parameters applied after deallocations.
 * @param {bigint} params.args.redeem.shares - The amount of shares to redeem.
 * @param {Address} params.args.redeem.recipient - The recipient of the redeemed assets.
 * @param {Address} params.args.onBehalf - The address from which the penalty is taken (share owner).
 * @param {Metadata} [params.metadata] - Optional analytics metadata to append.
 * @returns {Readonly<Transaction<VaultV2ForceRedeemAction>>} The prepared multicall transaction.
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
