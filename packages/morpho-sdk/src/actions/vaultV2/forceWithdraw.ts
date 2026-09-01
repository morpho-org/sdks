import { MathLib } from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, zeroAddress } from "viem";
import { vaultExitBundlesV1Abi } from "../../abis.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  InputExceedsMaxError,
  type Metadata,
  MissingReferralFeeRecipientError,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type Transaction,
  type VaultV2ForceWithdrawAction,
} from "../../types/index.js";
import { getVaultExitBundlesV1PermitStruct } from "../signatures/getVaultExitBundlesV1PermitStruct.js";

/** Parameters for {@link vaultV2ForceWithdraw}. */
export interface VaultV2ForceWithdrawParams {
  readonly vault: { readonly chainId: number; readonly address: Address };
  readonly args: {
    readonly adapter: Address;
    readonly exitAssets: bigint;
    readonly minSharePriceE27: bigint;
    readonly userAddress: Address;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly requirementSignature?: PermitRequirementSignature;
  };
  readonly metadata?: Metadata;
}

/**
 * Prepares a Vault V2 force withdrawal through VaultExitBundlesV1.
 *
 * The contract first withdraws everything the vault can pay without a penalty — its idle assets
 * plus the liquidity available through its liquidity adapter — then force-deallocates the remainder
 * by looping over the adapter's markets.
 *
 * `exitAssets` is **penalty-inclusive**: it is what the contract debits from the user's position,
 * while the assets actually delivered are
 * `assetsToWithdraw + floor((exitAssets - assetsToWithdraw) * WAD / (WAD + penalty))` minus the
 * referral fee. Use `previewVaultV2ForceWithdraw` to quote the split.
 *
 * Without a signature this embeds the empty-permit sentinel and requires a sufficient vault-share
 * approval to VaultExitBundlesV1.
 *
 * @param params - Force withdrawal parameters.
 * @param params.vault.chainId - Chain containing the target Vault V2 and VaultExitBundlesV1.
 * @param params.vault.address - Target Vault V2 address.
 * @param params.args.adapter - Vault's sole MorphoMarketV1AdapterV2.
 * @param params.args.exitAssets - Penalty-inclusive, asset-denominated amount to exit.
 * @param params.args.minSharePriceE27 - RAY-scaled lower bound on the realized exit share price
 *   (withdrawn assets per share burned). `0n` disables the on-chain bound; prefer the value the
 *   entity computes.
 * @param params.args.userAddress - Expected transaction sender, recorded in action metadata only.
 *   VaultExitBundlesV1 burns `msg.sender`'s vault shares and pays out to `msg.sender`, so the
 *   submitting account must equal this address.
 * @param params.args.deadline - Permit and bundle deadline.
 * @param params.args.referralFeePct - Optional WAD-scaled share of the withdrawn assets routed to
 *   `referralFeeRecipient`. Defaults to `0n`. Deducted *after* the `minSharePriceE27` check, so it
 *   is outside that bound's protection.
 * @param params.args.referralFeeRecipient - Optional referral fee recipient. Defaults to the zero
 *   address, which is only valid alongside a zero `referralFeePct`.
 * @param params.args.requirementSignature - Optional bounded Vault V2 shares permit.
 * @param params.metadata - Optional analytics metadata.
 * @returns A deep-frozen `Readonly<Transaction<VaultV2ForceWithdrawAction>>` with `to`, `value`,
 *   `data`, and the typed action discriminator.
 * @throws {NonPositiveInputError} when `exitAssets` or `deadline` is not positive.
 * @throws {NegativeInputError} when `referralFeePct` or `minSharePriceE27` is negative.
 * @throws {InputExceedsMaxError} when `referralFeePct` is not below WAD (the contract rejects it
 *   with `PctExceeded`), or when `minSharePriceE27` exceeds `uint256`.
 * @throws {MissingReferralFeeRecipientError} when a positive `referralFeePct` has no recipient.
 * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
 * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
 * @throws {VaultExitBundlesV1PermitMismatchError} when the requirement has the wrong permit kind, asset, or signature encoding.
 * @example
 * ```ts
 * import { vaultV2ForceWithdraw } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV2ForceWithdraw({
 *   vault: { chainId: 1, address: vault },
 *   args: { adapter, exitAssets: 1_000_000n, minSharePriceE27, userAddress, deadline },
 * });
 * // tx satisfies Readonly<Transaction<VaultV2ForceWithdrawAction>>
 * ```
 */
export const vaultV2ForceWithdraw = ({
  vault,
  args,
  metadata,
}: VaultV2ForceWithdrawParams): Readonly<
  Transaction<VaultV2ForceWithdrawAction>
> => {
  if (args.exitAssets <= 0n)
    throw new NonPositiveInputError("exitAssets", args.exitAssets);
  if (args.deadline <= 0n)
    throw new NonPositiveInputError("deadline", args.deadline);
  // `0n` stays valid — it is the intentional "no on-chain bound" opt-out — but a value the uint256
  // slot cannot hold must fail with a dedicated error instead of viem's `IntegerOutOfRangeError`.
  // The entity never emits these (it forbids a non-positive override); this guards direct callers.
  if (args.minSharePriceE27 < 0n)
    throw new NegativeInputError("minSharePriceE27", args.minSharePriceE27);
  if (args.minSharePriceE27 > MathLib.MAX_UINT_256)
    throw new InputExceedsMaxError({
      field: "minSharePriceE27",
      value: args.minSharePriceE27,
      max: MathLib.MAX_UINT_256,
    });

  const referralFeePct = args.referralFeePct ?? 0n;
  const referralFeeRecipient = args.referralFeeRecipient ?? zeroAddress;
  if (referralFeePct < 0n)
    throw new NegativeInputError("referralFeePct", referralFeePct);
  if (referralFeePct >= MathLib.WAD)
    throw new InputExceedsMaxError({
      field: "referralFeePct",
      value: referralFeePct,
      max: MathLib.WAD - 1n,
    });
  if (referralFeePct > 0n && referralFeeRecipient === zeroAddress)
    throw new MissingReferralFeeRecipientError(referralFeePct);

  const to = getChainAddress(vault.chainId, "bundles.vaultExitBundlesV1");
  const sharesPermit = getVaultExitBundlesV1PermitStruct({
    vault: vault.address,
    deadline: args.deadline,
    requirementSignature: args.requirementSignature,
  });
  let tx = {
    to,
    value: 0n,
    data: encodeFunctionData({
      abi: vaultExitBundlesV1Abi,
      functionName: "vaultExitBundlesV1ForceWithdrawVaultV2",
      args: [
        vault.address,
        args.adapter,
        args.exitAssets,
        args.minSharePriceE27,
        sharesPermit,
        referralFeePct,
        referralFeeRecipient,
        args.deadline,
      ],
    }),
  };
  if (metadata) tx = addTransactionMetadata(tx, metadata);

  return deepFreeze({
    ...tx,
    action: {
      type: "vaultV2ForceWithdraw",
      args: {
        vault: vault.address,
        adapter: args.adapter,
        exitAssets: args.exitAssets,
        minSharePriceE27: args.minSharePriceE27,
        referralFeePct,
        referralFeeRecipient,
        onBehalf: args.userAddress,
        deadline: args.deadline,
      },
    },
  });
};
