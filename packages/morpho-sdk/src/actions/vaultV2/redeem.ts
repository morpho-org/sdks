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
 * Prepares a redeem transaction for the VaultV2 contract.
 *
 * This function constructs the transaction data required to redeem a specified amount of shares from the vault.
 *
 * IMPORTANT FOR DEVELOPERS:
 * This flow is not routed through the bundler because the risks are negligible since these operations cannot be affected by attacks. This avoids unnecessary approvals and keeps the UX clean.
 *
 * @param {Object} params - The vault related parameters.
 * @param {Object} params.vault - The vault related parameters.
 * @param {Address} params.vault.address - The vault address.
 * @param {Object} params.args - The redeem related parameters.
 * @param {bigint} params.args.shares - The amount of shares to redeem.
 * @param {Address} params.args.recipient - The recipient address.
 * @param {Address} params.args.onBehalf - The address on behalf of which the redeem is made.
 * @param {Metadata} [params.metadata] - Optional the metadata.
 * @returns {Readonly<Transaction<VaultV2RedeemAction>>} The prepared redeem transaction.
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
