import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, type Hex, encodeFunctionData } from "viem";
import { encodeForceDeallocateCall } from "../../helpers/encodeDeallocation.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Deallocation,
  EmptyDeallocationsError,
  type Metadata,
  NonPositiveAssetAmountError,
  type Transaction,
  type VaultV2ForceWithdrawAction,
} from "../../types/index.js";

export interface VaultV2ForceWithdrawParams {
  vault: {
    address: Address;
  };
  args: {
    deallocations: readonly Deallocation[];
    withdraw: {
      amount: bigint;
      recipient: Address;
    };
    onBehalf: Address;
  };
  metadata?: Metadata;
}

/**
 * Prepares a force withdraw transaction for the VaultV2 contract, using VaultV2's native `multicall`.
 *
 * This function encodes one or more `forceDeallocate` calls followed by a single `withdraw`,
 * executed atomically via VaultV2's `multicall`. This allows a user to free liquidity from
 * adapters other than the liquidity adapter and withdraw the resulting assets in one transaction.
 *
 * A penalty is taken from `onBehalf` for each deallocation to discourage allocation manipulations.
 * The penalty is applied as a share burn where assets are returned to the vault, so the share price
 * remains stable (except for rounding).
 *
 * @param {Object} params - The vault related parameters.
 * @param {Object} params.vault - The vault related parameters.
 * @param {Address} params.vault.address - The vault contract address.
 * @param {Object} params.args - The force withdraw related parameters.
 * @param {readonly Deallocation[]} params.args.deallocations - The list of deallocations to perform.
 * @param {Object} params.args.withdraw - The withdraw parameters applied after deallocations.
 * @param {bigint} params.args.withdraw.amount - The amount of assets to withdraw.
 * @param {Address} params.args.withdraw.recipient - The recipient of the withdrawn assets.
 * @param {Address} params.args.onBehalf - The address from which the penalty is taken (share owner).
 * @param {Metadata} [params.metadata] - Optional analytics metadata to append.
 * @returns {Readonly<Transaction<VaultV2ForceWithdrawAction>>} The prepared multicall transaction.
 */
export const vaultV2ForceWithdraw = ({
  vault: { address: vaultAddress },
  args: { deallocations, withdraw, onBehalf },
  metadata,
}: VaultV2ForceWithdrawParams): Readonly<
  Transaction<VaultV2ForceWithdrawAction>
> => {
  if (deallocations.length === 0) {
    throw new EmptyDeallocationsError(vaultAddress);
  }

  if (withdraw.amount <= 0n) {
    throw new NonPositiveAssetAmountError(vaultAddress);
  }

  const calls: Hex[] = [];

  for (const deallocation of deallocations) {
    calls.push(encodeForceDeallocateCall(deallocation, onBehalf));
  }

  calls.push(
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "withdraw",
      args: [withdraw.amount, withdraw.recipient, onBehalf],
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
      type: "vaultV2ForceWithdraw",
      args: {
        vault: vaultAddress,
        deallocations: deallocations.map((d) => ({ ...d })),
        withdraw: {
          amount: withdraw.amount,
          recipient: withdraw.recipient,
        },
        onBehalf,
      },
    },
  });
};
