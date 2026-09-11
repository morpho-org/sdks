import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultBundlesV1Abi } from "../../abis.js";
import { validateUint256Field } from "../../helpers/validate.js";
import {
  type Metadata,
  NonPositiveInputError,
  type Transaction,
  type VaultV1WithdrawAction,
  type VaultWithdrawalAuthorization,
} from "../../types/index.js";
import {
  type BundleSharesPermit,
  finalizeVaultBundlesV1Transaction,
  getBundlesReferralFeeAssets,
  normalizeBundlesCommonParams,
} from "../bundles/common.js";
import {
  emptySharesPermit,
  toSharesPermitStruct,
  validateSharesPermit,
} from "../bundles/sharesPermit.js";

/** Parameters for {@link vaultV1Withdraw}. */
export interface VaultV1WithdrawParams {
  readonly vault: { readonly chainId: number; readonly address: Address };
  readonly args: {
    readonly amount: bigint;
    readonly userAddress: Address;
    readonly recipient?: never;
    readonly onBehalf?: never;
    readonly authorization: VaultWithdrawalAuthorization;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline: bigint;
  };
  readonly metadata?: Metadata;
}

/**
 * Encodes an exact-assets Vault V1 withdrawal through VaultBundlesV1.
 *
 * @param params.vault.chainId - Chain containing the vault and its registered VaultBundlesV1 contract.
 * @param params.vault.address - Vault V1 whose shares are burned for the withdrawal.
 * @param params.args.amount - Positive gross withdrawal in underlying asset base units, before fees.
 * @param params.args.userAddress - Share owner and transaction sender; receives the net withdrawn assets.
 * @param params.args.recipient - Unsupported; net assets are always paid to the transaction sender.
 * @param params.args.onBehalf - Unsupported; VaultBundlesV1 always burns the transaction sender's shares.
 * @param params.args.authorization.type - Explicit `allowance` or `permit` authorization.
 * @param params.args.authorization.signature - Required for `permit`: signed ERC-2612 vault-share requirement.
 * @param params.args.authorization.shareAllowance - Required for `permit`: exact positive share allowance
 *   in share base units, independently derived from the withdrawal. Both signed amount fields must match.
 *   Use `allowance` when that exact allowance is already set onchain. This pure builder does not read it.
 * @param params.args.referralFeePct - Optional WAD-scaled fee in [0, 1e18), defaulting to zero.
 *   The fee is rounded down and deducted from the gross withdrawn assets.
 * @param params.args.referralFeeRecipient - Optional fee recipient; a nonzero address is required
 *   when `referralFeePct > 0n`.
 * @param params.args.deadline - Required positive uint256 Unix timestamp in seconds after which
 *   execution reverts. This pure builder does not check the current time.
 * @param params.metadata - Optional analytics metadata appended to the transaction calldata.
 * @param params.metadata.origin - Hex origin identifier of at most four bytes, with an optional `0x` prefix.
 * @param params.metadata.timestamp - Optional flag to append the current timestamp; defaults to false.
 * @returns A deep-frozen `Transaction<VaultV1WithdrawAction>` targeting VaultBundlesV1, with
 *   `to`, `value: 0n`, `data`, and gross/fee/net withdrawal action metadata.
 * @throws {NonPositiveInputError} when `amount`, `deadline`, or the permit share allowance is not positive.
 * @throws {InputExceedsMaxError} when `amount`, `deadline`, or the permit share allowance exceeds uint256.
 * @throws {NegativeInputError} when `referralFeePct` is negative.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no nonzero recipient.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
 * @throws {BundlesPermitMismatchError} when the share permit differs from the vault, owner, spender, exact allowance, or deadline, or has invalid signature metadata or encoding.
 * @throws {viem.BaseError} when transaction encoding fails.
 * @example
 * ```ts
 * import { vaultV1Withdraw } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * export function buildUsdcWithdrawal(userAddress: Address, deadline: bigint) {
 *   const vault = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
 *   // Set the exact vault-share allowance before submitting; the entity API derives that cap.
 *   const tx = vaultV1Withdraw({
 *     vault: { chainId: mainnet.id, address: vault },
 *     args: { amount: 1_000_000n, userAddress, deadline, authorization: { type: "allowance" } },
 *   });
 *   // tx satisfies Readonly<Transaction<VaultV1WithdrawAction>>
 *   return tx;
 * }
 * ```
 */
export const vaultV1Withdraw = (
  params: VaultV1WithdrawParams,
): Readonly<Transaction<VaultV1WithdrawAction>> => {
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
  const { authorization } = params.args;
  let sharesPermit: BundleSharesPermit;
  switch (authorization.type) {
    case "allowance":
      sharesPermit = emptySharesPermit(common.deadline);
      break;
    case "permit":
      sharesPermit = toSharesPermitStruct(
        validateSharesPermit(authorization.signature, {
          vault: params.vault.address,
          owner: params.args.userAddress,
          spender,
          shareAllowance: authorization.shareAllowance,
          deadline: common.deadline,
        }),
      );
      break;
  }
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
      type: "vaultV1Withdraw",
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
