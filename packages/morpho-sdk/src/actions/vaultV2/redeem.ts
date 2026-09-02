import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultBundlesV1Abi } from "../../abis.js";
import {
  type Erc2612RequirementSignature,
  type Metadata,
  NonPositiveInputError,
  type Transaction,
  type VaultV2RedeemAction,
} from "../../types/index.js";
import {
  finalizeVaultBundlesV1Transaction,
  getBundlesSharesPermit,
  normalizeBundlesCommonParams,
} from "../bundles/index.js";

/** Parameters for {@link vaultV2Redeem}. */
export interface VaultV2RedeemParams {
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
 * Encodes an exact-shares Vault V2 redemption through VaultBundlesV1.
 *
 * @param params - Vault, shares, share permit, fee, and deadline values.
 * @returns A deep-frozen VaultBundlesV1 redemption transaction.
 * @throws {NonPositiveInputError} when `shares` or `deadline` is not positive.
 * @throws {BundlesPermitMismatchError} when the optional share permit is incompatible.
 * @example
 * ```ts
 * import { vaultV2Redeem } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 *
 * const tx = vaultV2Redeem({
 *   vault: { chainId: 1, address: zeroAddress },
 *   args: { shares: 1_000_000n, userAddress: zeroAddress, deadline: 1_900_000_000n },
 * });
 * // tx.action.type === "vaultV2Redeem"
 * ```
 */
export const vaultV2Redeem = (
  params: VaultV2RedeemParams,
): Readonly<Transaction<VaultV2RedeemAction>> => {
  if (params.args.shares <= 0n) {
    throw new NonPositiveInputError("shares", params.args.shares);
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
      type: "vaultV2Redeem",
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
