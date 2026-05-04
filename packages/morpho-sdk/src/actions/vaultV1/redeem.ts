import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Metadata,
  NonPositiveSharesAmountError,
  type Transaction,
  type VaultV1RedeemAction,
} from "../../types/index.js";

/** Parameters for {@link vaultV1Redeem}. */
export interface VaultV1RedeemParams {
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
 * Prepares a redeem transaction for a VaultV1 (MetaMorpho) contract.
 *
 * Direct vault call — no bundler needed. Redeem has no inflation-attack surface.
 *
 * @param params.vault.address - The VaultV1 (MetaMorpho) address.
 * @param params.args.shares - Amount of vault shares to redeem.
 * @param params.args.recipient - Address that receives the redeemed assets.
 * @param params.args.onBehalf - Address whose shares are burned.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<VaultV1RedeemAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveSharesAmountError} when `shares <= 0n`.
 * @example
 * ```ts
 * import { vaultV1Redeem } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV1Redeem({
 *   vault: { address: vaultAddress },
 *   args: { shares: 1_000_000n, recipient, onBehalf },
 * });
 * // tx satisfies Readonly<Transaction<VaultV1RedeemAction>>
 * ```
 */
export const vaultV1Redeem = ({
  vault: { address: vaultAddress },
  args: { shares, recipient, onBehalf },
  metadata,
}: VaultV1RedeemParams): Readonly<Transaction<VaultV1RedeemAction>> => {
  if (shares <= 0n) {
    throw new NonPositiveSharesAmountError(vaultAddress);
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
