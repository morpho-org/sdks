import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultBundlesV1Abi } from "../../abis.js";
import {
  type Erc2612RequirementSignature,
  type Metadata,
  NonPositiveInputError,
  type Transaction,
  type VaultV2WithdrawAction,
} from "../../types/index.js";
import {
  finalizeVaultBundlesV1Transaction,
  getBundlesReferralFeeAssets,
  getBundlesSharesPermit,
  normalizeBundlesCommonParams,
} from "../bundles/index.js";

/** Parameters for {@link vaultV2Withdraw}. */
export interface VaultV2WithdrawParams {
  readonly vault: { readonly chainId: number; readonly address: Address };
  readonly args: {
    readonly amount: bigint;
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
 * Encodes an exact-assets Vault V2 withdrawal through VaultBundlesV1.
 *
 * @param params - Vault, gross asset amount, share permit, fee, and deadline values.
 * @returns A deep-frozen VaultBundlesV1 withdrawal transaction.
 * @throws {NonPositiveInputError} when `amount` or `deadline` is not positive.
 * @throws {BundlesPermitMismatchError} when the optional share permit is incompatible.
 * @example
 * ```ts
 * import { vaultV2Withdraw } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 *
 * const tx = vaultV2Withdraw({
 *   vault: { chainId: 1, address: zeroAddress },
 *   args: { amount: 1_000_000n, userAddress: zeroAddress, deadline: 1_900_000_000n },
 * });
 * // tx.action.type === "vaultV2Withdraw"
 * ```
 */
export const vaultV2Withdraw = (
  params: VaultV2WithdrawParams,
): Readonly<Transaction<VaultV2WithdrawAction>> => {
  if (params.args.amount <= 0n) {
    throw new NonPositiveInputError("amount", params.args.amount);
  }
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
    requirementSignature: params.args.requirementSignature,
  });
  const referralFeeAssets = getBundlesReferralFeeAssets(
    params.args.amount,
    common.referralFeePct,
  );
  return finalizeVaultBundlesV1Transaction({
    chainId: params.vault.chainId,
    value: 0n,
    data: encodeFunctionData({
      abi: vaultBundlesV1Abi,
      functionName: "vaultBundlesV1Withdraw",
      args: [
        params.vault.address,
        params.args.amount,
        0n,
        sharesPermit,
        common.referralFeePct,
        common.referralFeeRecipient,
        common.deadline,
      ],
    }),
    action: {
      type: "vaultV2Withdraw",
      args: {
        vault: params.vault.address,
        amount: params.args.amount,
        referralFeePct: common.referralFeePct,
        referralFeeRecipient: common.referralFeeRecipient,
        referralFeeAssets,
        netAssets: params.args.amount - referralFeeAssets,
        deadline: common.deadline,
      },
    },
    metadata: params.metadata,
  });
};
