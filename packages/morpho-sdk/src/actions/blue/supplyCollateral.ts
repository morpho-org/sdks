import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import type {
  BlueSupplyCollateralAction,
  BlueBundlesV1TokenRequirementSignature,
  Metadata,
  Transaction,
} from "../../types/index.js";
import { blueSupplyCollateralBorrow } from "./supplyCollateralBorrow.js";

/** Parameters for {@link blueSupplyCollateral}. */
export interface BlueSupplyCollateralParams {
  /** Chain and scoped Morpho Blue market. */
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 collateral-supply arguments. */
  args: {
    /** User whose collateral position is credited. */
    userAddress: Address;
    /** Gross collateral assets supplied. */
    collateralAssets: bigint;
    /** Full native collateral funding; must equal `collateralAssets`. */
    nativeAmount?: bigint;
    /** Final call deadline in Unix seconds. */
    deadline: bigint;
    /** Optional WAD-scaled referral fee, strictly below 100%. */
    referralFeePct?: bigint;
    /** Recipient required when `referralFeePct` is positive. */
    referralFeeRecipient?: Address;
    /** Optional collateral ERC-2612 or Permit2 SignatureTransfer result. */
    requirementSignature?: BlueBundlesV1TokenRequirementSignature;
  };
  /** Optional transaction metadata suffix. */
  metadata?: Metadata;
}

/**
 * Encodes a pure collateral supply through BlueBundlesV1.
 *
 * Delegates to {@link blueSupplyCollateralBorrow} with a zero borrow leg and an unrestricted LTV
 * cap. Native funding is exclusive with ERC-20 funding and no Bundler3 action is encoded.
 *
 * @param params - Collateral-supply encoding parameters.
 * @param params.market.chainId - Chain containing BlueBundlesV1.
 * @param params.market.marketParams - Scoped Morpho Blue market parameters.
 * @param params.args.userAddress - User whose collateral position is credited.
 * @param params.args.collateralAssets - Gross collateral assets supplied.
 * @param params.args.nativeAmount - Exclusive native collateral funding.
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled referral fee.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.requirementSignature - Optional collateral-token signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueSupplyCollateralAction>>` whose calldata
 *   invokes the combined BlueBundlesV1 entrypoint with a zero borrow leg.
 * @throws {NegativeInputError} when an amount or fee is negative.
 * @throws {NonPositiveInputError} when collateral or deadline is not positive.
 * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
 * @throws {ChainWNativeMissingError} when native funding is requested without a registered wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another collateral token.
 * @throws {UnexpectedRequirementSignatureError} when native funding also supplies a token signature.
 * @throws {DepositOwnerMismatchError} when the signed owner differs from `userAddress`.
 * @throws {DepositAssetMismatchError} when the signed asset differs from the collateral token.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `collateralAssets`.
 * @throws {DepositSpenderMismatchError} when the signed spender is not BlueBundlesV1.
 * @throws {BlueBundlesV1RequirementSignatureMismatchError} when a signature cannot be encoded safely.
 * @throws {InputExceedsMaxError} when the referral fee is at least WAD.
 * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { blueSupplyCollateral } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const tx = blueSupplyCollateral({
 *   market: { chainId: mainnet.id, marketParams: markets[mainnet.id].usdc_wbtc },
 *   args: {
 *     userAddress: zeroAddress,
 *     collateralAssets: 1_000_000_000_000_000_000n,
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueSupplyCollateralAction>>
 * ```
 */
export const blueSupplyCollateral = (
  params: BlueSupplyCollateralParams,
): Readonly<Transaction<BlueSupplyCollateralAction>> => {
  const transaction = blueSupplyCollateralBorrow({
    ...params,
    args: {
      ...params.args,
      borrowAssets: 0n,
      maxLtv: maxUint256,
    },
  });

  return deepFreeze({
    ...transaction,
    action: { ...transaction.action, type: "blueSupplyCollateral" },
  });
};
