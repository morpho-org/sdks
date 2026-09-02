import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Metadata,
  NonPositiveInputError,
  type Transaction,
  type VaultV1RedeemAction,
} from "../../types/index.js";

/** Parameters for {@link vaultV1Redeem}. */
export interface VaultV1RedeemParams {
  readonly vault: {
    readonly address: Address;
  };
  readonly args: {
    readonly shares: bigint;
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
 * Prepares a redeem transaction for a VaultV1 (MetaMorpho) contract.
 *
 * Direct vault call — no bundler needed. Redeem has no inflation-attack surface.
 *
 * @param params.vault.address - The VaultV1 (MetaMorpho) address.
 * @param params.args.shares - Amount of vault shares to redeem.
 * @param params.args.userAddress - Account that receives the redeemed assets and owns the burned
 *   shares. This bundles-compatible successor replaces `recipient` and `onBehalf` before v6.
 * @param params.args.recipient - Deprecated address that receives the redeemed assets.
 * @param params.args.onBehalf - Deprecated address whose shares are burned.
 * @param params.metadata - Optional analytics metadata attached to the transaction.
 * @returns A deep-frozen `Transaction<VaultV1RedeemAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveInputError} when `shares <= 0n`.
 * @example
 * ```ts
 * import { vaultV1Redeem } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV1Redeem({
 *   vault: { address: vaultAddress },
 *   args: { shares: 1_000_000n, userAddress },
 * });
 * // tx satisfies Readonly<Transaction<VaultV1RedeemAction>>
 * ```
 */
export const vaultV1Redeem = ({
  vault: { address: vaultAddress },
  args,
  metadata,
}: VaultV1RedeemParams): Readonly<Transaction<VaultV1RedeemAction>> => {
  const { shares } = args;
  const recipient = args.userAddress ?? args.recipient;
  const onBehalf = args.userAddress ?? args.onBehalf;
  if (shares <= 0n) {
    throw new NonPositiveInputError("shares", shares);
  }

  let tx = {
    to: vaultAddress,
    data: encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "redeem",
      args: [shares, recipient, onBehalf],
    }),
    value: 0n,
  };

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "vaultV1Redeem",
      args: { vault: vaultAddress, shares, recipient },
    },
  });
};
