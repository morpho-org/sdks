import type { MarketParams } from "@morpho-org/blue-sdk";
import { type Address, encodeFunctionData } from "viem";
import { blueBundlesV1Abi } from "../../abis.js";
import type {
  BlueSupplyAction,
  BundlesTokenRequirementSignature,
  Metadata,
  Transaction,
} from "../../types/index.js";
import { NonPositiveInputError } from "../../types/index.js";
import {
  type BlueBundlesV1CommonParams,
  finalizeBlueBundlesV1Transaction,
  getBlueBundlesV1TokenPermit,
  normalizeBlueBundlesV1CommonParams,
  validateBlueBundlesV1NativeFunding,
} from "./common.js";

/** Parameters for {@link blueSupply}. */
export interface BlueSupplyParams {
  /** Chain and scoped Morpho Blue market. */
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 supply arguments. */
  args: {
    /** User funding and receiving the supply position. */
    userAddress: Address;
    /** Gross loan-token assets funded before any referral fee. */
    assets: bigint;
    /** Full native funding amount; must equal `assets` and requires a wNative loan token. */
    nativeAmount?: bigint;
    /** Final call deadline in Unix seconds. */
    deadline: bigint;
    /** Optional WAD-scaled referral fee, strictly below 100%. */
    referralFeePct?: bigint;
    /** Recipient required when `referralFeePct` is positive. */
    referralFeeRecipient?: Address;
    /** Optional ERC-2612 or Permit2 SignatureTransfer requirement result. */
    requirementSignature?: BundlesTokenRequirementSignature;
  };
  /** Optional transaction metadata suffix. */
  metadata?: Metadata;
}

/**
 * Encodes a direct BlueBundlesV1 loan-asset supply transaction.
 *
 * `assets` is the gross funded amount; BlueBundlesV1 deducts the referral fee before supplying.
 * This route has no Bundler3 share-price bound or `slippageTolerance` input.
 *
 * @param params - Supply encoding parameters.
 * @param params.market.chainId - Chain containing the BlueBundlesV1 deployment.
 * @param params.market.marketParams - Scoped Morpho Blue market parameters.
 * @param params.args.userAddress - User funding and receiving the position.
 * @param params.args.assets - Gross loan-token funding amount.
 * @param params.args.nativeAmount - Exclusive native funding; must equal `assets`.
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled fee below 100%.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.requirementSignature - Optional ERC-2612 or Permit2 SignatureTransfer result.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueSupplyAction>>` whose `to` address is
 *   BlueBundlesV1 and whose `action` records the normalized supply inputs.
 * @throws {NonPositiveInputError} when `assets` or `deadline` is not positive.
 * @throws {NegativeInputError} when `nativeAmount` or `referralFeePct` is negative.
 * @throws {InputExceedsMaxError} when `referralFeePct` is at least WAD.
 * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
 * @throws {NativeFundingAmountMismatchError} when native funding does not equal `assets`.
 * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
 * @throws {UnexpectedRequirementSignatureError} when native funding also supplies a token signature.
 * @throws {DepositOwnerMismatchError} when the signed owner differs from `userAddress`.
 * @throws {DepositAssetMismatchError} when the signed asset differs from the loan token.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `assets`.
 * @throws {DepositSpenderMismatchError} when the signed spender is not BlueBundlesV1.
 * @throws {BundlesRequirementSignatureMismatchError} when the signature kind or encoding is invalid.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { blueSupply } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const marketParams = markets[mainnet.id].usdc_wbtc;
 * const tx = blueSupply({
 *   market: { chainId: mainnet.id, marketParams },
 *   args: {
 *     userAddress: zeroAddress,
 *     assets: 1_000_000n,
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueSupplyAction>>
 * ```
 */
export const blueSupply = (
  params: BlueSupplyParams,
): Readonly<Transaction<BlueSupplyAction>> => {
  const { chainId, marketParams } = params.market;
  const { assets, userAddress, requirementSignature } = params.args;
  if (assets <= 0n) {
    throw new NonPositiveInputError("assets", assets);
  }

  const common: BlueBundlesV1CommonParams = {
    chainId,
    userAddress,
    deadline: params.args.deadline,
    referralFeePct: params.args.referralFeePct,
    referralFeeRecipient: params.args.referralFeeRecipient,
    metadata: params.metadata,
  };
  const { referralFeePct, referralFeeRecipient } =
    normalizeBlueBundlesV1CommonParams(common);
  const value = validateBlueBundlesV1NativeFunding({
    chainId,
    token: marketParams.loanToken,
    fundedAmount: assets,
    nativeAmount: params.args.nativeAmount,
    requirementSignature,
  });
  const tokenPermit = getBlueBundlesV1TokenPermit({
    chainId,
    userAddress,
    token: marketParams.loanToken,
    amount: assets,
    requirementSignature,
  });

  return finalizeBlueBundlesV1Transaction({
    common,
    value,
    data: encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1Supply",
      args: [
        marketParams,
        assets,
        tokenPermit,
        referralFeePct,
        referralFeeRecipient,
        params.args.deadline,
      ],
    }),
    action: {
      type: "blueSupply",
      args: {
        market: marketParams.id,
        assets,
        onBehalf: userAddress,
        nativeAmount: value > 0n ? value : undefined,
        referralFeePct,
        referralFeeRecipient,
        deadline: params.args.deadline,
      },
    },
  });
};
