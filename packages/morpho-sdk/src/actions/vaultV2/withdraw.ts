import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultBundlesV1Abi } from "../../abis.js";
import { validateUint256Field } from "../../helpers/validate.js";
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
} from "../bundles/common.js";

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
 * @param params.vault.chainId - Chain containing the vault and its registered VaultBundlesV1 contract.
 * @param params.vault.address - Vault V2 whose shares are burned for the withdrawal.
 * @param params.args.amount - Positive gross withdrawal in underlying asset base units, before fees.
 * @param params.args.userAddress - Share owner and transaction sender; receives the net withdrawn assets.
 * @param params.args.recipient - Unsupported; net assets are always paid to the transaction sender.
 * @param params.args.onBehalf - Unsupported; VaultBundlesV1 always burns the transaction sender's shares.
 * @param params.args.requirementSignature - Optional ERC-2612 vault-share permit for `userAddress`
 *   and the registered VaultBundlesV1 spender. Omit when the exact share allowance is already set.
 * @param params.args.referralFeePct - Optional WAD-scaled fee in [0, 1e18), defaulting to zero.
 *   The fee is rounded down and deducted from the gross withdrawn assets.
 * @param params.args.referralFeeRecipient - Optional fee recipient; a nonzero address is required
 *   when `referralFeePct > 0n`.
 * @param params.args.deadline - Required positive uint256 Unix timestamp in seconds after which
 *   execution reverts. This pure builder does not check the current time.
 * @param params.metadata - Optional analytics metadata appended to the transaction calldata.
 * @param params.metadata.origin - Hex origin identifier of at most four bytes, with an optional `0x` prefix.
 * @param params.metadata.timestamp - Optional flag to append the current timestamp; defaults to false.
 * @returns A deep-frozen `Transaction<VaultV2WithdrawAction>` targeting VaultBundlesV1, with
 *   `to`, `value: 0n`, `data`, and gross/fee/net withdrawal action metadata.
 * @throws {NonPositiveInputError} when `amount` or `deadline` is not positive.
 * @throws {InputExceedsMaxError} when `amount` or `deadline` exceeds uint256.
 * @throws {NegativeInputError} when `referralFeePct` is negative.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no nonzero recipient.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
 * @throws {BundlesPermitMismatchError} when the optional share permit is incompatible.
 * @throws {viem.BaseError} when transaction encoding fails.
 * @example
 * ```ts
 * import { vaultV2Withdraw } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * export function buildUsdcWithdrawal(userAddress: Address, deadline: bigint) {
 *   const vault = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
 *   // Set the exact vault-share allowance before submitting; the entity API derives that cap.
 *   const tx = vaultV2Withdraw({
 *     vault: { chainId: mainnet.id, address: vault },
 *     args: { amount: 1_000_000n, userAddress, deadline },
 *   });
 *   // tx satisfies Readonly<Transaction<VaultV2WithdrawAction>>
 *   return tx;
 * }
 * ```
 */
export const vaultV2Withdraw = (
  params: VaultV2WithdrawParams,
): Readonly<Transaction<VaultV2WithdrawAction>> => {
  if (params.args.amount <= 0n) {
    throw new NonPositiveInputError("amount", params.args.amount);
  }
  // Validate the ABI bound before encoding to preserve the SDK's typed errors.
  validateUint256Field("amount", params.args.amount);
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
