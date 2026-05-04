import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Metadata,
  NonPositiveAssetAmountError,
  type Transaction,
  type VaultV2WithdrawAction,
} from "../../types/index.js";

/** Parameters for {@link vaultV2Withdraw}. */
export interface VaultV2WithdrawParams {
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
 * Prepares a withdraw transaction for a VaultV2 contract.
 *
 * Direct vault call — not routed through the bundler. Withdraw has no inflation-attack surface,
 * so skipping the bundler avoids an unnecessary approval and keeps the UX clean.
 *
 * @param params.vault.address - The VaultV2 address.
 * @param params.args.amount - Amount of underlying assets to withdraw.
 * @param params.args.recipient - Address that receives the withdrawn assets.
 * @param params.args.onBehalf - Address whose shares are burned.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<VaultV2WithdrawAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveAssetAmountError} when `amount <= 0n`.
 * @example
 * ```ts
 * import { vaultV2Withdraw } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV2Withdraw({
 *   vault: { address: vaultAddress },
 *   args: { amount: 500_000n, recipient, onBehalf },
 * });
 * // tx satisfies Readonly<Transaction<VaultV2WithdrawAction>>
 * ```
 */
export const vaultV2Withdraw = ({
  vault: { address: vaultAddress },
  args: { amount, recipient, onBehalf },
  metadata,
}: VaultV2WithdrawParams): Readonly<Transaction<VaultV2WithdrawAction>> => {
  if (amount <= 0n) {
    throw new NonPositiveAssetAmountError(vaultAddress);
  }

  let tx = {
    to: vaultAddress,
    data: encodeFunctionData({
      abi: vaultV2Abi,
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
      type: "vaultV2Withdraw",
      args: { vault: vaultAddress, amount, recipient },
    },
  });
};
