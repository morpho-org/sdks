import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultBundlesV1Abi } from "../../abis.js";
import { validateUint256Field } from "../../helpers/validate.js";
import {
  type Erc2612RequirementSignature,
  type Metadata,
  NonPositiveInputError,
  type Transaction,
  type VaultV1RedeemAction,
} from "../../types/index.js";
import {
  finalizeVaultBundlesV1Transaction,
  getBundlesSharesPermit,
  normalizeBundlesCommonParams,
} from "../bundles/common.js";

/** Parameters for {@link vaultV1Redeem}. */
export interface VaultV1RedeemParams {
  readonly vault: { readonly chainId: number; readonly address: Address };
  readonly args: {
    readonly shares: bigint;
    readonly userAddress: Address;
    readonly recipient?: never;
    readonly onBehalf?: never;
    readonly requirementSignature?: Erc2612RequirementSignature;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline: bigint;
  };
  readonly metadata?: Metadata;
}

/**
 * Encodes an exact-shares Vault V1 redemption through VaultBundlesV1.
 *
 * @param params - Vault, shares, share permit, fee, and deadline values.
 * @returns A deep-frozen VaultBundlesV1 redemption transaction.
 * @throws {NonPositiveInputError} when `shares` or `deadline` is not positive.
 * @throws {InputExceedsMaxError} when `shares` or `deadline` exceeds uint256.
 * @throws {NegativeInputError} when `referralFeePct` is negative.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no non-zero recipient.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
 * @throws {BundlesPermitMismatchError} when the optional share permit is incompatible.
 * @example
 * ```ts
 * import { vaultV1Redeem } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 *
 * const tx = vaultV1Redeem({
 *   vault: { chainId: 1, address: zeroAddress },
 *   args: { shares: 1_000_000n, userAddress: zeroAddress, deadline: 1_900_000_000n },
 * });
 * // tx.action.type === "vaultV1Redeem"
 * ```
 */
export const vaultV1Redeem = (
  params: VaultV1RedeemParams,
): Readonly<Transaction<VaultV1RedeemAction>> => {
  if (params.args.shares <= 0n) {
    throw new NonPositiveInputError("shares", params.args.shares);
  }
  // Reject ABI overflow with SDK errors before calldata encoding.
  validateUint256Field("shares", params.args.shares);
  const common = normalizeBundlesCommonParams(params.args);
  const spender = getChainAddress(
    params.vault.chainId,
    "bundles.vaultBundlesV1",
  );
  const sharesPermit = getBundlesSharesPermit({
    vault: params.vault.address,
    deadline: common.deadline,
    owner: params.args.userAddress,
    spender,
    amount: params.args.shares,
    requirementSignature: params.args.requirementSignature,
  });
  return finalizeVaultBundlesV1Transaction({
    chainId: params.vault.chainId,
    value: 0n,
    data: encodeFunctionData({
      abi: vaultBundlesV1Abi,
      functionName: "vaultBundlesV1Withdraw",
      args: [
        params.vault.address,
        0n,
        params.args.shares,
        sharesPermit,
        common.referralFeePct,
        common.referralFeeRecipient,
        common.deadline,
      ],
    }),
    action: {
      type: "vaultV1Redeem",
      args: {
        vault: params.vault.address,
        shares: params.args.shares,
        referralFeePct: common.referralFeePct,
        referralFeeRecipient: common.referralFeeRecipient,
        deadline: common.deadline,
      },
    },
    metadata: params.metadata,
  });
};
