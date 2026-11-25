import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultExitBundlesV1Abi } from "../../abis.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  parseDeadline,
  parseReferralFee,
  parseUint256,
} from "../../helpers/parse.js";
import {
  type Metadata,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type Transaction,
  type VaultV2ForceWithdrawAction,
} from "../../types/index.js";
import { getParsedBundlesSharesPermit } from "../bundles/common.js";

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

declare const vaultV2ForceWithdrawInput: unique symbol;
/** Checked force-withdraw fields, independent of snapshot and clock checks. @internal */
export type VaultV2ForceWithdrawInput = {
  readonly vault: Readonly<VaultV2ForceWithdrawParams["vault"]>;
  readonly args: Omit<
    VaultV2ForceWithdrawParams["args"],
    | "requirementSignature"
    | "exitAssets"
    | "minSharePriceE27"
    | "deadline"
    | "referralFeePct"
    | "referralFeeRecipient"
  > & {
    readonly exitAssets: bigint;
    readonly minSharePriceE27: bigint;
    readonly deadline: bigint;
  };
  readonly referral: {
    readonly referralFeePct: bigint;
    readonly referralFeeRecipient: Address;
  };
  readonly metadata?: Metadata;
  readonly requirementSignature?: VaultV2ForceWithdrawParams["args"]["requirementSignature"];
  readonly [vaultV2ForceWithdrawInput]: true;
};

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
 * @param params.args.requirementSignature - Optional unlimited Vault V2 shares permit.
 * @param params.metadata - Optional analytics metadata.
 * @returns A deep-frozen `Readonly<Transaction<VaultV2ForceWithdrawAction>>` with `to`, `value`,
 *   `data`, and the typed action discriminator.
 * @throws {NonPositiveInputError} when `exitAssets` or `deadline` is not positive.
 * @throws {NegativeInputError} when `referralFeePct` or `minSharePriceE27` is negative.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD (the contract
 *   rejects it with `PctExceeded`); it extends {@link InputExceedsMaxError}.
 * @throws {InputExceedsMaxError} when `exitAssets`, `deadline`, or `minSharePriceE27` exceeds `uint256`.
 * @throws {ReferralFeeRecipientMissingError} when a positive `referralFeePct` has no recipient.
 * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
 * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
 * @throws {BundlesPermitMismatchError} when the requirement has the wrong permit kind,
 *   asset, owner, spender, or signature encoding.
 * @example
 * ```ts
 * import { vaultV2ForceWithdraw } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * export function buildForceWithdraw(
 *   vault: Address,
 *   adapter: Address,
 *   minSharePriceE27: bigint,
 *   userAddress: Address,
 *   deadline: bigint,
 * ) {
 *   const tx = vaultV2ForceWithdraw({
 *     vault: { chainId: mainnet.id, address: vault },
 *     args: { adapter, exitAssets: 1_000_000n, minSharePriceE27, userAddress, deadline },
 *   });
 *   // tx satisfies Readonly<Transaction<VaultV2ForceWithdrawAction>>
 *   return tx;
 * }
 * ```
 */
export const vaultV2ForceWithdraw = (
  params: VaultV2ForceWithdrawParams,
): Readonly<Transaction<VaultV2ForceWithdrawAction>> =>
  buildVaultV2ForceWithdraw(parseVaultV2ForceWithdraw(params));

/** Runs standalone force-withdraw stages in their established order. @internal */
export const parseVaultV2ForceWithdraw = (
  params: VaultV2ForceWithdrawParams,
): VaultV2ForceWithdrawInput => {
  if (params.args.exitAssets <= 0n) {
    throw new NonPositiveInputError("exitAssets", params.args.exitAssets);
  }
  const exitAssets = parseUint256("exitAssets", params.args.exitAssets);
  const deadline = parseDeadline(params.args.deadline);
  const minSharePriceE27 = parseUint256(
    "minSharePriceE27",
    params.args.minSharePriceE27,
  );
  const referral = parseReferralFee(params.args);

  return {
    vault: { chainId: params.vault.chainId, address: params.vault.address },
    args: {
      adapter: params.args.adapter,
      userAddress: params.args.userAddress,
      exitAssets,
      deadline,
      minSharePriceE27,
    },
    referral,
    metadata: params.metadata,
    requirementSignature: params.args.requirementSignature,
  } as VaultV2ForceWithdrawInput;
};

/** Encodes parsed fields and binds a fresh share permit. @internal */
export const buildVaultV2ForceWithdraw = (
  parsed: VaultV2ForceWithdrawInput,
  signatures: Pick<
    VaultV2ForceWithdrawParams["args"],
    "requirementSignature"
  > = parsed,
): Readonly<Transaction<VaultV2ForceWithdrawAction>> => {
  const {
    vault,
    metadata,
    referral: { referralFeePct, referralFeeRecipient },
  } = parsed;
  const args = {
    ...parsed.args,
    requirementSignature: signatures.requirementSignature,
  };
  const to = getChainAddress(vault.chainId, "bundles.vaultExitBundlesV1");
  const sharesPermit = getParsedBundlesSharesPermit({
    vault: vault.address,
    deadline: args.deadline,
    owner: args.userAddress,
    spender: to,
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
  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

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
