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
 * Direct vault call — no bundler needed. Redeem has no inflation attack surface.
 *
 * @param {Object} params - The redeem parameters.
 * @param {Object} params.vault - The vault identifiers.
 * @param {Address} params.vault.address - The vault address.
 * @param {Object} params.args - The redeem arguments.
 * @param {bigint} params.args.shares - Amount of shares to redeem.
 * @param {Address} params.args.recipient - Receives the redeemed assets.
 * @param {Address} params.args.onBehalf - Address whose shares are burned.
 * @param {Metadata} [params.metadata] - Optional analytics metadata.
 * @returns {Readonly<Transaction<VaultV1RedeemAction>>} The prepared redeem transaction.
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
