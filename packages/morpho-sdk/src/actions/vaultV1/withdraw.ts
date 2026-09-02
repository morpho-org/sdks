import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Metadata,
  NonPositiveInputError,
  type Transaction,
  type VaultV1WithdrawAction,
} from "../../types/index.js";

/** Parameters for {@link vaultV1Withdraw}. */
export interface VaultV1WithdrawParams {
  readonly vault: {
    readonly address: Address;
  };
  readonly args: {
    readonly amount: bigint;
  } & (
    | {
        /** Account that receives assets, owns the burned shares, and submits the successor route. */
        readonly userAddress: Address;
        readonly recipient?: never;
        readonly onBehalf?: never;
      }
    | {
        /** @deprecated Use `userAddress`; `recipient` is removed in morpho-sdk v6. */
        readonly recipient: Address;
        /** @deprecated Use `userAddress`; `onBehalf` is removed in morpho-sdk v6. */
        readonly onBehalf: Address;
        readonly userAddress?: never;
      }
  );
  readonly metadata?: Metadata;
}

/**
 * Prepares a withdraw transaction for a VaultV1 (MetaMorpho) contract.
 *
 * Direct vault call — no bundler needed. Withdraw has no inflation-attack surface.
 *
 * @param params.vault.address - The VaultV1 (MetaMorpho) address.
 * @param params.args.amount - Amount of underlying assets to withdraw.
 * @param params.args.userAddress - Account that receives the withdrawn assets and owns the burned
 *   shares. This bundles-compatible successor replaces `recipient` and `onBehalf` before v6.
 * @param params.args.recipient - Deprecated address that receives the withdrawn assets.
 * @param params.args.onBehalf - Deprecated address whose shares are burned.
 * @param params.metadata - Optional analytics metadata attached to the transaction.
 * @returns A deep-frozen `Transaction<VaultV1WithdrawAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveInputError} when `amount <= 0n`.
 * @example
 * ```ts
 * import { vaultV1Withdraw } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV1Withdraw({
 *   vault: { address: vaultAddress },
 *   args: { amount: 500_000n, userAddress },
 * });
 * // tx satisfies Readonly<Transaction<VaultV1WithdrawAction>>
 * ```
 */
export const vaultV1Withdraw = ({
  vault: { address: vaultAddress },
  args,
  metadata,
}: VaultV1WithdrawParams): Readonly<Transaction<VaultV1WithdrawAction>> => {
  const { amount } = args;
  const recipient = args.userAddress ?? args.recipient;
  const onBehalf = args.userAddress ?? args.onBehalf;
  if (amount <= 0n) {
    throw new NonPositiveInputError("amount", amount);
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
