import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultBundlesV1Abi } from "../../abis.js";
import { parseUint256 } from "../../helpers/parse.js";
import {
  type Erc2612RequirementSignature,
  type Metadata,
  NonPositiveInputError,
  type Transaction,
  type VaultV1RedeemAction,
} from "../../types/index.js";
import {
  finalizeVaultBundlesV1Transaction,
  getParsedBundlesSharesPermit,
  normalizeBundlesCommonParams as parseBundlesCommon,
} from "../bundles/common.js";

/** Parameters for {@link vaultV1Redeem}. */
export interface VaultV1RedeemParams {
  readonly vault: {
    /** Chain containing the vault and its registered VaultBundlesV1 contract. */
    readonly chainId: number;
    /** Vault V1 whose shares are burned for the redemption. */
    readonly address: Address;
  };
  readonly args: {
    /** Vault shares to redeem, in share base units. */
    readonly shares: bigint;
    /** Share owner and transaction sender; receives the net redeemed assets. */
    readonly userAddress: Address;
    /** Unsupported; net assets are always paid to the transaction sender. */
    readonly recipient?: never;
    /** Unsupported; VaultBundlesV1 always burns the transaction sender's shares. */
    readonly onBehalf?: never;
    /** Optional ERC-2612 vault-share permit for the redeemed shares. */
    readonly requirementSignature?: Erc2612RequirementSignature;
    /** Optional WAD-scaled fee in [0, 1e18), defaulting to zero. */
    readonly referralFeePct?: bigint;
    /** Optional fee recipient; a nonzero address is required when `referralFeePct > 0n`. */
    readonly referralFeeRecipient?: Address;
    /** Positive uint256 Unix timestamp in seconds after which execution reverts. */
    readonly deadline: bigint;
  };
  /** Optional analytics metadata appended to the transaction calldata. */
  readonly metadata?: Metadata;
}

declare const parsedVaultV1Redeem: unique symbol;
/** Validated redeem inputs, independent of signatures. @internal */
export type VaultV1RedeemInput = {
  readonly vault: Readonly<VaultV1RedeemParams["vault"]>;
  readonly args: Omit<
    VaultV1RedeemParams["args"],
    "requirementSignature" | "shares" | "deadline"
  > & {
    readonly shares: bigint;
    readonly deadline: ReturnType<typeof parseBundlesCommon>["deadline"];
  };
  readonly common: ReturnType<typeof parseBundlesCommon>;
  readonly metadata?: Metadata;
  readonly requirementSignature?: VaultV1RedeemParams["args"]["requirementSignature"];
  readonly [parsedVaultV1Redeem]: true;
};

/**
 * Encodes an exact-shares Vault V1 redemption through VaultBundlesV1.
 *
 * @param params.vault.chainId - Chain containing the vault and its registered VaultBundlesV1 contract.
 * @param params.vault.address - Vault V1 whose shares are burned for the redemption.
 * @param params.args.shares - Positive vault shares to redeem, in share base units.
 * @param params.args.userAddress - Share owner and transaction sender; receives the net redeemed assets.
 * @param params.args.recipient - Unsupported; net assets are always paid to the transaction sender.
 * @param params.args.onBehalf - Unsupported; VaultBundlesV1 always burns the transaction sender's shares.
 * @param params.args.requirementSignature - Optional ERC-2612 vault-share permit for `userAddress`
 *   and the registered VaultBundlesV1 spender. Omit when the share allowance is already set.
 * @param params.args.referralFeePct - Optional WAD-scaled fee in [0, 1e18), defaulting to zero.
 *   The fee is rounded down and deducted from the gross redeemed assets.
 * @param params.args.referralFeeRecipient - Optional fee recipient; a nonzero address is required
 *   when `referralFeePct > 0n`.
 * @param params.args.deadline - Required positive uint256 Unix timestamp in seconds after which
 *   execution reverts. This pure builder does not check the current time.
 * @param params.metadata - Optional analytics metadata appended to the transaction calldata.
 * @param params.metadata.origin - Hex origin identifier of at most four bytes, with an optional `0x` prefix.
 * @param params.metadata.timestamp - Optional flag to append the current timestamp; defaults to false.
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
): Readonly<Transaction<VaultV1RedeemAction>> =>
  buildVaultV1Redeem(parseVaultV1Redeem(params));

/** Parses the amount and common fields in standalone order. @internal */
export const parseVaultV1Redeem = (
  params: VaultV1RedeemParams,
): VaultV1RedeemInput => {
  if (params.args.shares <= 0n) {
    throw new NonPositiveInputError("shares", params.args.shares);
  }
  const shares = parseUint256("shares", params.args.shares);
  const common = parseBundlesCommon(params.args);

  return {
    vault: { chainId: params.vault.chainId, address: params.vault.address },
    args: { shares, userAddress: params.args.userAddress, ...common },
    common,
    metadata: params.metadata,
    requirementSignature: params.args.requirementSignature,
  } as VaultV1RedeemInput;
};

/** Encodes parsed inputs and validates a fresh share signature. @internal */
export const buildVaultV1Redeem = (
  parsed: VaultV1RedeemInput,
  signatures: Pick<
    VaultV1RedeemParams["args"],
    "requirementSignature"
  > = parsed,
): Readonly<Transaction<VaultV1RedeemAction>> => {
  const { common } = parsed;
  const params = {
    ...parsed,
    args: {
      ...parsed.args,
      requirementSignature: signatures.requirementSignature,
    },
  };
  const spender = getChainAddress(
    params.vault.chainId,
    "bundles.vaultBundlesV1",
  );
  const sharesPermit = getParsedBundlesSharesPermit({
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
