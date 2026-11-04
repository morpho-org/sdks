import {
  type MarketInput,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import { encodeMidnightCalldata } from "../../helpers/encodeMidnightCalldata.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  validateDeadline,
  validateMidnightNativeAmount,
  validateReferralFee,
  validateUint256Field,
} from "../../helpers/validate.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import {
  validateMidnightReferralFeeCap,
  validateMidnightTakeableOfferBounds,
  validateMidnightUint128Field,
} from "../../helpers/validateMidnightBounds.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import { validateTakeableOffers } from "../../helpers/validateTakeableOffers.js";
import {
  type Metadata,
  type MidnightBuyTarget,
  type MidnightCollateralTransfer,
  type MidnightTakeRepayWithdrawCollateralAction,
  NonPositiveInputError,
  type Transaction,
  UnboundedMidnightTakeInputError,
} from "../../types/index.js";
import type {
  MidnightReferralFeeParams,
  MidnightTakeableOffer,
} from "./types.js";

/** Parameters for encoding a Midnight debt repayment through offers, then collateral withdrawals. */
export interface MidnightTakeRepayWithdrawCollateralParams
  extends MidnightReferralFeeParams {
  readonly chainId: number;
  readonly market: MarketInput;
  /** Loan assets paid with a unit floor, or debt units repaid with a loan-asset cap. */
  readonly target: MidnightBuyTarget;
  /**
   * Optional native ETH sent as `value`; the bundle wraps it into the chain's wNative and transfers
   * it to `msg.sender` before pulling. It may cover part or all of the maximum wNative amount this
   * call can pull, but not more. Any wrapped native not pulled stays in the sender's wallet as
   * wNative. The wNative approval to `MidnightBundlesV2` is still required for the full pulled amount.
   */
  readonly nativeAmount?: bigint;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  /** Repays the rest of the target directly to Midnight when offers do not fill it. */
  readonly repayEnabled: boolean;
  /** Collateral withdrawn after repaying; `maxUint256` assets withdraws the whole balance. */
  readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
  /** Must be non-zero when withdrawals are provided; unused otherwise. */
  readonly collateralReceiver: Address;
  /** Largest market continuous fee accepted when taking offers. Pass `maxUint256` explicitly for no cap. */
  readonly maxContinuousFee: bigint;
  /** Bounded bundle execution deadline timestamp. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes a `MidnightBundlesV2` reduce-only buy that repays `msg.sender`'s debt by taking
 * borrow-side offers, optionally repays the remainder directly, then withdraws collateral.
 *
 * `reduceOnly` is always set, so the buy never opens a lender position. Prefer
 * `client.morpho.midnight(chainId).takeRepayWithdrawCollateral(...)` in app flows so the
 * loan-token approval and the `MidnightBundlesV2` authorization are resolved first.
 *
 * This builder reads no position or prices, so it applies no `DEFAULT_LLTV_BUFFER` health check:
 * keeping the position inside the buffer is the caller's responsibility. The entity method checks
 * it from `positionData` and `collateralPrices`; onchain, Midnight still rejects a position above
 * LLTV.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.target - `{ type: "assets", assets, minUnits }` or `{ type: "units", units, maxBuyerAssets }`; `units: maxUint256` targets the sender's whole debt, capped by `maxBuyerAssets` (must be finite; `units: maxUint256` already selects the whole debt).
 * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
 *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of the
 *   maximum wNative amount this call can pull, but not more. Any wrapped native not pulled stays in
 *   the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still required
 *   for the full pulled amount.
 * @param params.takeableOffers - ABI-ready borrow-side offers returned by the Midnight API; must not be empty.
 * @param params.repayEnabled - Whether the unfilled remainder is repaid directly to Midnight.
 * @param params.collateralWithdrawals - Collateral index and assets per withdrawal; may be empty.
 * @param params.collateralReceiver - Recipient of withdrawn collateral; must be non-zero and not
 *   a Midnight protocol or market token contract when `collateralWithdrawals` is non-empty, and
 *   is unused otherwise.
 * @param params.maxContinuousFee - Largest market continuous fee accepted, in the unit of the market's
 *   onchain `continuousFee` (`Market.continuousFee`): a WAD-scaled per-second rate, so `317097919n`
 *   is about 1% per year. The take reverts if the market fee is higher. Pass `maxUint256` for no cap.
 * @param params.deadline - Bounded bundle execution deadline timestamp. Not checked against the clock; validate freshness before building.
 * @param params.referralFeePct - Optional WAD-scaled referral fee paid out of the pulled assets.
 * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightTakeRepayWithdrawCollateralAction>` targeting `MidnightBundlesV2`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when any offer is not borrow-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when any offer belongs to another market.
 * @throws {MidnightTakeableOfferZeroSellerReceiverError} when any offer routes seller proceeds to the zero address.
 * @throws {UnknownCollateralIndexError} when a withdrawal targets a collateral index not configured on the market.
 * @throws {NonPositiveInputError} when the target amount, `minUnits`, `maxBuyerAssets`, a
 *   withdrawal amount or `deadline` is not positive.
 * @throws {NegativeInputError} when a takeable offer cap, `maxContinuousFee`, `referralFeePct`
 *   or `nativeAmount` is negative.
 * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
 * @throws {NativeAmountOnNonWNativeAssetError} when `market.loanToken` is not wNative.
 * @throws {InputExceedsMaxError} when a finite target or collateral withdrawal amount, or an
 *   offer cap, exceeds `uint128`; when `target.maxBuyerAssets` exceeds `uint128` (an SDK cap: the
 *   bundle accepts `uint256`, but a higher ceiling gives no slippage protection); when
 *   `maxContinuousFee` or `deadline` exceeds `uint256`; or when `nativeAmount` exceeds the maximum
 *   wNative amount this call can pull.
 * @throws {UnboundedMidnightTakeInputError} when `deadline` is `maxUint256`.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
 * @throws {MidnightReferralFeePctExceededError} when `referralFeePct` exceeds 10% (`WAD / 10n`).
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
 * @throws {MidnightZeroReceiverError} when collateral is withdrawn to the zero address.
 * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32`, an out-of-range integer or a malformed address.
 * @throws {MidnightContractReceiverError} when `collateralReceiver` is a Midnight protocol
 *   contract or a market token contract, or when `referralFeeRecipient` is either with a positive
 *   referral fee.
 * @example
 * ```ts
 * import { Time } from "@morpho-org/morpho-ts";
 * import { maxUint256 } from "viem";
 * import { midnightTakeRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeRepayWithdrawCollateral({
 *   chainId: 8453,
 *   market: marketData.params,
 *   target: { type: "units", units: 1_000_000n, maxBuyerAssets: 990_000n },
 *   takeableOffers: quote.data.takeableOffers,
 *   repayEnabled: true,
 *   collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
 *   collateralReceiver: borrower,
 *   maxContinuousFee: maxUint256,
 *   deadline: Time.timestamp() + 600n,
 * });
 * ```
 */
export const midnightTakeRepayWithdrawCollateral = (
  params: MidnightTakeRepayWithdrawCollateralParams,
): Readonly<Transaction<MidnightTakeRepayWithdrawCollateralAction>> => {
  if (params.target.type === "assets" && params.target.assets <= 0n) {
    throw new NonPositiveInputError("target.assets", params.target.assets);
  }
  // Reject markets from another chain deployment before checking offers against them.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  for (const [
    index,
    { collateralIndex, assets },
  ] of params.collateralWithdrawals.entries()) {
    if (assets <= 0n) {
      throw new NonPositiveInputError(
        `collateralWithdrawals[${index}].assets`,
        assets,
      );
    }
    if (assets !== maxUint256) {
      validateMidnightUint128Field(
        `collateralWithdrawals[${index}].assets`,
        assets,
      );
    }
    // Throws UnknownCollateralIndexError when the index is not configured on the market.
    MarketUtils.getCollateralByIndex(params.market, collateralIndex);
  }
  validateMidnightAddress("collateralReceiver", params.collateralReceiver);
  if (params.collateralWithdrawals.length > 0) {
    // Rejects receivers that would strand the withdrawn collateral in a contract.
    validateMidnightReceiver({
      chainId: params.chainId,
      market: params.market,
      field: "collateralReceiver",
      receiver: params.collateralReceiver,
    });
  }
  const marketId = validateTakeableOffers({
    market: params.market,
    takeableOffers: params.takeableOffers,
    expectedBuy: false,
  });
  validateMidnightTakeableOfferBounds(params.takeableOffers);

  const { target } = params;
  if (target.type === "assets") {
    if (target.minUnits <= 0n) {
      throw new NonPositiveInputError("target.minUnits", target.minUnits);
    }
    validateMidnightUint128Field("target.assets", target.assets);
    validateMidnightUint128Field("target.minUnits", target.minUnits);
  } else {
    if (target.units <= 0n) {
      throw new NonPositiveInputError("target.units", target.units);
    }
    if (target.maxBuyerAssets <= 0n) {
      throw new NonPositiveInputError(
        "target.maxBuyerAssets",
        target.maxBuyerAssets,
      );
    }
    if (target.units !== maxUint256) {
      validateMidnightUint128Field("target.units", target.units);
    }
    validateMidnightUint128Field(
      "target.maxBuyerAssets",
      target.maxBuyerAssets,
    );
  }
  validateUint256Field("maxContinuousFee", params.maxContinuousFee);
  if (params.deadline === maxUint256) {
    throw new UnboundedMidnightTakeInputError("deadline");
  }
  validateDeadline(params.deadline);
  if (params.referralFeeRecipient !== undefined)
    validateMidnightAddress(
      "referralFeeRecipient",
      params.referralFeeRecipient,
    );
  const { referralFeePct, referralFeeRecipient } = validateReferralFee(params);
  validateMidnightReferralFeeCap(referralFeePct);
  if (referralFeePct > 0n) {
    // Rejects fee recipients that would strand the fee in a contract.
    validateMidnightReceiver({
      chainId: params.chainId,
      market: params.market,
      field: "referralFeeRecipient",
      receiver: referralFeeRecipient,
    });
  }
  const market = MarketUtils.toStruct(params.market);
  const nativeFunding = validateMidnightNativeAmount({
    chainId: params.chainId,
    nativeAmount: params.nativeAmount,
    pulls: [
      {
        token: market.loanToken,
        assets:
          target.type === "assets" ? target.assets : target.maxBuyerAssets,
      },
    ],
  });
  const args = [
    true, // reduceOnly
    params.repayEnabled, // repayEnabled
    params.takeableOffers, // offerFills
    params.collateralWithdrawals.map(({ collateralIndex, assets }) => ({
      collateralIndex,
      assets,
    })), // collateralWithdrawals
    params.collateralReceiver, // collateralReceiver
    referralFeePct, // referralFeePct
    referralFeeRecipient, // referralFeeRecipient
    params.maxContinuousFee, // maxContinuousFee
    params.deadline, // deadline
    nativeFunding.wrappedNative, // wrappedNative
  ] as const;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: nativeFunding.value,
    data:
      target.type === "assets"
        ? encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
            args: [market, target.assets, target.minUnits, ...args],
          })
        : encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
            args: [market, target.units, target.maxBuyerAssets, ...args],
          }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightTakeRepayWithdrawCollateral",
      args: {
        market: marketId,
        target: { ...params.target },
        repayEnabled: params.repayEnabled,
        collateralWithdrawals: params.collateralWithdrawals.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        collateralReceiver: params.collateralReceiver,
        takeableOffers: params.takeableOffers.length,
        maxContinuousFee: params.maxContinuousFee,
        deadline: params.deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    },
  });
};
