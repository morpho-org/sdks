import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Metadata,
  NonPositiveAssetAmountError,
  type Transaction,
  type VaultV1WithdrawAction,
} from "../../types/index.js";

/** Parameters for {@link vaultV1Withdraw}. */
export interface VaultV1WithdrawParams {
  vault: {
    address: Address;
  };
  args: {
    amount: bigint;
    recipient: Address;
    onBehalf: Address;
  };
  metadata?: Metadata;
}

/**
 * Prepares a withdraw transaction for a VaultV1 (MetaMorpho) contract.
 *
 * Direct vault call — no bundler needed. Withdraw has no inflation-attack surface.
 *
 * @param params.vault.address - The VaultV1 (MetaMorpho) address.
 * @param params.args.amount - Amount of underlying assets to withdraw.
 * @param params.args.recipient - Address that receives the withdrawn assets.
 * @param params.args.onBehalf - Address whose shares are burned.
 * @param params.metadata - Optional analytics metadata attached to the transaction.
 * @returns A deep-frozen `Transaction<VaultV1WithdrawAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveAssetAmountError} when `amount <= 0n`.
 * @example
 * ```ts
 * import { vaultV1Withdraw } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV1Withdraw({
 *   vault: { address: vaultAddress },
 *   args: { amount: 500_000n, recipient, onBehalf },
 * });
 * // tx satisfies Readonly<Transaction<VaultV1WithdrawAction>>
 * ```
 */
export const vaultV1Withdraw = ({
  vault: { address: vaultAddress },
  args: { amount, recipient, onBehalf },
  metadata,
}: VaultV1WithdrawParams): Readonly<Transaction<VaultV1WithdrawAction>> => {
  if (amount <= 0n) {
    throw new NonPositiveAssetAmountError(vaultAddress);
  }

  let tx = {
    to: vaultAddress,
    data: encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "withdraw",
      args: [amount, recipient, onBehalf],
    }),
    value: 0n,
  };

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "vaultV1Withdraw",
      args: { vault: vaultAddress, amount, recipient },
    },
  });
};
