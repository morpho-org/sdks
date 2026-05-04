import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Metadata,
  NonPositiveSharesAmountError,
  type Transaction,
  type VaultV2RedeemAction,
} from "../../types/index.js";

/** Parameters for {@link vaultV2Redeem}. */
export interface VaultV2RedeemParams {
  vault: {
    address: Address;
  };
  args: {
    shares: bigint;
    recipient: Address;
    onBehalf: Address;
  };
  metadata?: Metadata;
}

/**
 * Prepares a redeem transaction for a VaultV2 contract.
 *
 * Direct vault call — not routed through the bundler. Redeem has no inflation-attack surface,
 * so skipping the bundler avoids an unnecessary approval and keeps the UX clean.
 *
 * @param params.vault.address - The VaultV2 address.
 * @param params.args.shares - Amount of vault shares to redeem.
 * @param params.args.recipient - Address that receives the redeemed assets.
 * @param params.args.onBehalf - Address whose shares are burned.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<VaultV2RedeemAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveSharesAmountError} when `shares <= 0n`.
 * @example
 * ```ts
 * import { vaultV2Redeem } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV2Redeem({
 *   vault: { address: vaultAddress },
 *   args: { shares: 1_000_000n, recipient, onBehalf },
 * });
 * // tx satisfies Readonly<Transaction<VaultV2RedeemAction>>
 * ```
 */
export const vaultV2Redeem = ({
  vault: { address: vaultAddress },
  args: { shares, recipient, onBehalf },
  metadata,
}: VaultV2RedeemParams): Readonly<Transaction<VaultV2RedeemAction>> => {
  if (shares <= 0n) {
    throw new NonPositiveSharesAmountError(vaultAddress);
  }

  let tx = {
    to: vaultAddress,
    data: encodeFunctionData({
      abi: vaultV2Abi,
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
      type: "vaultV2Redeem",
      args: { vault: vaultAddress, shares, recipient },
    },
  });
};
