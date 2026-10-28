import {
  type AccrualPosition,
  getChainAddresses,
  type MarketId,
  type MarketParams,
  MarketUtils,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import {
  type Market as MidnightMarket,
  type MarketInput as MidnightMarketInput,
  MarketUtils as MidnightMarketUtils,
} from "@morpho-org/midnight-sdk";
import { isDefined } from "@morpho-org/morpho-ts";
import {
  type Address,
  isAddress,
  isAddressEqual,
  maxUint128,
  maxUint256,
  zeroAddress,
} from "viem";
import {
  AccrualPositionUserMismatchError,
  AddressMismatchError,
  BorrowExceedsSafeLtvError,
  ChainIdMismatchError,
  ChainWNativeMissingError,
  ExcessiveSlippageToleranceError,
  InconsistentReallocationPenaltyError,
  InputExceedsMaxError,
  InvalidReallocationAddressError,
  InvalidReallocationSourceTypeError,
  InvalidVaultV2BlueReallocationShapeError,
  MarketIdMismatchError,
  MissingClientPropertyError,
  MissingMarketPriceError,
  NativeAmountOnNonWNativeAssetError,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationWithdrawalOnTargetMarketError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  type VaultV2BlueReallocation,
  WithdrawExceedsCollateralError,
  WithdrawExceedsSupplyError,
  WithdrawMakesPositionUnhealthyError,
  WithdrawSharesExceedSupplyError,
} from "../types/index.js";
import {
  DEFAULT_LLTV_BUFFER,
  MAX_REALLOCATION_PENALTY,
  MAX_SLIPPAGE_TOLERANCE,
} from "./constant.js";
import { validateMidnightAddress } from "./validateMidnightAccount.js";

/** @internal */
const compareMarketIds = (idA: MarketId, idB: MarketId) => {
  const normalizedIdA = idA.toLowerCase();
  const normalizedIdB = idB.toLowerCase();

  if (normalizedIdA > normalizedIdB) return 1;
  if (normalizedIdA < normalizedIdB) return -1;
  return 0;
};

/**
 * Rejects a `bigint` field that falls outside the unsigned 256-bit ABI range so a direct caller
 * gets the SDK's typed error instead of viem's `IntegerOutOfRangeError` at encode time. `maxUint256`
 * stays valid — it is the accepted `maxLtv` / full-repay `repayShares` sentinel.
 *
 * @param field - Field name surfaced in the thrown error.
 * @param value - Candidate value; must be in `[0, maxUint256]`.
 * @returns Nothing when `value` is within range.
 * @throws {NegativeInputError} when `value` is negative.
 * @throws {InputExceedsMaxError} when `value` exceeds `maxUint256`.
 * @internal
 */
export const validateUint256Field = (field: string, value: bigint): void => {
  if (value < 0n) throw new NegativeInputError(field, value);
  if (value > maxUint256) {
    throw new InputExceedsMaxError({ field, value, max: maxUint256 });
  }
};

/**
 * Rejects market params whose cached `id` does not hash from their five tuple fields, so a
 * hand-built or mutated object cannot make the SDK describe one market while calldata targets another.
 *
 * @param marketParams - Market params whose `id` must equal the id derived from the tuple.
 * @returns Nothing when `marketParams.id` matches the derived id.
 * @throws {MarketIdMismatchError} when `marketParams.id` differs from the derived id.
 * @internal
 */
export const validateMarketParamsId = (marketParams: MarketParams): void => {
  const derivedId = MarketUtils.getMarketId(marketParams);
  if (marketParams.id !== derivedId) {
    throw new MarketIdMismatchError(marketParams.id, derivedId);
  }
};

/**
 * Rejects a deadline that no periphery can honour: the contracts read `0` as "unset" and the ABI
 * slot is a `uint256`. Callers that also need the deadline to be in the future layer their own
 * `ExpiredDeadlineError` on top — this check stays clock-free so transaction builders can use it.
 *
 * @param deadline - Candidate deadline, in seconds.
 * @returns Nothing when `deadline` is a positive `uint256`.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {InputExceedsMaxError} when `deadline` exceeds `maxUint256`.
 * @internal
 */
export const validateDeadline = (deadline: bigint): void => {
  if (deadline <= 0n) throw new NonPositiveInputError("deadline", deadline);
  validateUint256Field("deadline", deadline);
};

/**
 * Validates an optional referral fee and returns the pair every referral-fee-bearing periphery
 * encodes. Shared by the direct BlueBundlesV1 writes and the VaultExitBundlesV1 force withdrawal,
 * whose contracts apply the same `[0, WAD)` bound and both transfer the fee unconditionally.
 *
 * @param params - Referral fee inputs.
 * @param params.referralFeePct - Optional WAD-scaled fee share. Defaults to `0n`.
 * @param params.referralFeeRecipient - Optional fee recipient. Defaults to the zero address, which
 *   is only valid alongside a zero `referralFeePct`.
 * @returns The normalized `{ referralFeePct, referralFeeRecipient }` pair.
 * @throws {NegativeInputError} when `referralFeePct` is negative.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD (the contracts reject
 *   it with `PctExceeded`); it extends `InputExceedsMaxError`, preserving that pattern-match.
 * @throws {ReferralFeeRecipientMissingError} when a positive `referralFeePct` has no recipient.
 * @internal
 */
export const validateReferralFee = (params: {
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
}): {
  readonly referralFeePct: bigint;
  readonly referralFeeRecipient: Address;
} => {
  const referralFeePct = params.referralFeePct ?? 0n;
  if (referralFeePct < 0n) {
    throw new NegativeInputError("referralFeePct", referralFeePct);
  }
  if (referralFeePct >= MathLib.WAD) {
    throw new ReferralFeePctExceededError(referralFeePct);
  }
  if (
    referralFeePct > 0n &&
    (params.referralFeeRecipient == null ||
      isAddressEqual(params.referralFeeRecipient, zeroAddress))
  ) {
    throw new ReferralFeeRecipientMissingError();
  }
  return {
    referralFeePct,
    referralFeeRecipient: params.referralFeeRecipient ?? zeroAddress,
  };
};

/**
 * Validates that a raw or hydrated Midnight market belongs to the expected chain.
 *
 * @param market - Midnight market params or hydrated market state.
 * @param chainId - Expected EIP-155 chain id.
 * @returns Nothing when the market belongs to `chainId`.
 * @throws {ChainIdMismatchError} when the market belongs to another chain.
 * @example
 * ```ts
 * import { validateMidnightMarketChainId } from "@morpho-org/morpho-sdk";
 *
 * validateMidnightMarketChainId(marketParams, 8453);
 * ```
 */
export const validateMidnightMarketChainId = (
  market: MidnightMarketInput,
  chainId: number,
): void => {
  const marketParams = "params" in market ? market.params : market;
  validateChainId(Number(marketParams.chainId), chainId);
};

/**
 * Asserts that the client has a connected account AND that it matches
 * the provided user address.
 *
 * Used at `sign()` time by the shared `signAndVerifyTypedData` helper (which
 * backs the permit, Permit2, and Blue authorization signature flows) and by `encodeVaultSharesPermit`, to enforce builder =
 * signer: the signing flow is
 * the only path where an account/address mismatch is a real security concern
 * (rather than just an integrator footgun).
 *
 * Transaction builders no longer call this helper — callers are
 * responsible for keeping `userAddress` aligned with the signing account
 * at the builder layer.
 *
 * @param clientAccountAddress - The client's account address; if undefined,
 *   `MissingClientPropertyError` is thrown.
 * @param userAddress - The user address provided by the caller.
 * @returns Nothing; narrows `clientAccountAddress` to a defined `Address` when
 *   it is present and equal to `userAddress`.
 * @throws {MissingClientPropertyError} when the client has no connected account.
 * @throws {AddressMismatchError} when the client account differs from
 *   `userAddress`.
 * @example
 * ```ts
 * import { createWalletClient, http } from "viem";
 * import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
 * import { mainnet } from "viem/chains";
 * import { validateUserAddress } from "@morpho-org/morpho-sdk";
 *
 * const account = privateKeyToAccount(generatePrivateKey());
 * const walletClient = createWalletClient({
 *   account,
 *   chain: mainnet,
 *   transport: http(),
 * });
 *
 * // Inside a `sign()` flow, before producing a typed-data signature:
 * validateUserAddress(walletClient.account?.address, account.address);
 * // Passes when the connected account equals the expected signer;
 * // throws if the wallet has no account or signs for a different address.
 * ```
 */
export function validateUserAddress(
  clientAccountAddress: Address | undefined,
  userAddress: Address,
): asserts clientAccountAddress is Address {
  if (clientAccountAddress === undefined) {
    throw new MissingClientPropertyError("account");
  }
  if (!isAddressEqual(clientAccountAddress, userAddress)) {
    throw new AddressMismatchError(clientAccountAddress, userAddress);
  }
}

/**
 * Validates that the accrual position belongs to the expected market and user.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The accrual position to validate.
 * @param params.expectedMarketId - The market ID the position must belong to.
 * @param params.expectedUser - The user address the position must belong to.
 * @returns Nothing when `positionData` belongs to the expected market and user.
 * @throws {MarketIdMismatchError} when the position's market ID differs from `expectedMarketId`.
 * @throws {AccrualPositionUserMismatchError} when the position's user address differs from
 *   `expectedUser`.
 * @example
 * ```ts
 * import type { AccrualPosition } from "@morpho-org/morpho-sdk/blue/entities";
 * import type { MarketId } from "@morpho-org/morpho-sdk/blue/types";
 * import { validateAccrualPosition } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 *
 * export function assertPositionOwner(
 *   positionData: AccrualPosition,
 *   expectedMarketId: MarketId,
 *   expectedUser: Address,
 * ): void {
 *   validateAccrualPosition({
 *     positionData,
 *     expectedMarketId,
 *     expectedUser,
 *   });
 * }
 * ```
 */
export const validateAccrualPosition = (params: {
  positionData: AccrualPosition;
  expectedMarketId: MarketId;
  expectedUser: Address;
}): void => {
  const { positionData, expectedMarketId, expectedUser } = params;
  if (positionData.marketId !== expectedMarketId) {
    throw new MarketIdMismatchError(positionData.marketId, expectedMarketId);
  }
  if (!isAddressEqual(positionData.user, expectedUser)) {
    throw new AccrualPositionUserMismatchError(positionData.user, expectedUser);
  }
};

/**
 * Computes the total debt supported by post-operation Midnight collateral at LLTV minus
 * `DEFAULT_LLTV_BUFFER`.
 * Mirrors Midnight's `isHealthy` formula in `Midnight.sol`, summing
 * `collateral.mulDivDown(price, ORACLE_PRICE_SCALE).mulDivDown(lltv, WAD)` across indexes with the
 * default buffer subtracted from each LLTV.
 *
 * @param params - Market, collateral amounts, and oracle prices.
 * @param params.market - Hydrated Midnight market containing each collateral's LLTV.
 * @param params.collateral - Post-operation collateral balances by market index.
 * @param params.collateralPrices - Oracle prices by index, scaled by `ORACLE_PRICE_SCALE`.
 * @returns Maximum safe debt in Midnight units.
 * @throws {UnknownCollateralIndexError} when a held collateral index is not configured.
 * @throws {MissingMarketPriceError} when a held collateral index has no supplied price.
 * @example
 * ```ts
 * import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
 * import {
 *   getMidnightMaxSafeDebt,
 *   morphoViemExtension,
 * } from "@morpho-org/morpho-sdk";
 * import { createPublicClient, http, type Hex } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() })
 *   .extend(morphoViemExtension());
 * const midnight = client.morpho.midnight(base.id);
 *
 * const getMarketMaxSafeDebt = async (marketId: Hex) => {
 *   const market = await midnight.getMarketData(marketId);
 *   const maxSafeDebt = getMidnightMaxSafeDebt({
 *     market,
 *     collateral: [1_000_000n],
 *     collateralPrices: [ORACLE_PRICE_SCALE],
 *   });
 *   // maxSafeDebt: debt units supported at LLTV minus DEFAULT_LLTV_BUFFER
 *   return maxSafeDebt;
 * };
 * ```
 */
export const getMidnightMaxSafeDebt = (params: {
  readonly market: MidnightMarket;
  readonly collateral: readonly bigint[];
  readonly collateralPrices: readonly bigint[];
}): bigint => {
  let maxSafeDebt = 0n;
  for (let index = 0; index < params.collateral.length; index += 1) {
    const amount = params.collateral[index] ?? 0n;
    if (amount === 0n) continue;

    const collateral = MidnightMarketUtils.getCollateralByIndex(
      params.market.params,
      BigInt(index),
    );
    const price = params.collateralPrices[index];
    if (price === undefined) {
      throw new MissingMarketPriceError(params.market.id);
    }

    const collateralValue = MathLib.mulDivDown(
      amount,
      price,
      ORACLE_PRICE_SCALE,
    );
    const effectiveLltv =
      collateral.lltv > DEFAULT_LLTV_BUFFER
        ? collateral.lltv - DEFAULT_LLTV_BUFFER
        : 0n;
    maxSafeDebt += MathLib.mulDivDown(
      collateralValue,
      effectiveLltv,
      MathLib.WAD,
    );
  }

  return maxSafeDebt;
};

/**
 * Validates that the resulting position stays within the safe LTV threshold
 * (LLTV minus buffer) after supplying additional collateral and borrowing.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position with market data.
 * @param params.additionalCollateral - Amount of collateral being added.
 * @param params.borrowAmount - Amount being borrowed.
 * @param params.marketId - The market identifier (for error messages).
 * @param params.lltv - The market's liquidation LTV.
 * @returns Nothing when the debt after borrowing, including the rounding allowance, is within the
 *   safe limit after adding collateral.
 * @throws {MissingMarketPriceError} when `positionData.market.price` is unset or zero.
 * @throws {BorrowExceedsSafeLtvError} when `positionData.borrowAssets + borrowAmount + 1n` exceeds
 *   the safe limit after adding collateral at LLTV minus `DEFAULT_LLTV_BUFFER`.
 * @example
 * ```ts
 * import type { AccrualPosition } from "@morpho-org/morpho-sdk/blue/entities";
 * import type { MarketId } from "@morpho-org/morpho-sdk/blue/types";
 * import { validatePositionHealth } from "@morpho-org/morpho-sdk";
 *
 * export function assertSafeBorrow(
 *   positionData: AccrualPosition,
 *   additionalCollateral: bigint,
 *   borrowAmount: bigint,
 *   marketId: MarketId,
 *   lltv: bigint,
 * ): void {
 *   validatePositionHealth({
 *     positionData,
 *     additionalCollateral,
 *     borrowAmount,
 *     marketId,
 *     lltv,
 *   });
 * }
 * ```
 */
export const validatePositionHealth = (params: {
  positionData: AccrualPosition;
  additionalCollateral: bigint;
  borrowAmount: bigint;
  marketId: MarketId;
  lltv: bigint;
}): void => {
  const { positionData, additionalCollateral, borrowAmount, marketId, lltv } =
    params;
  const { price } = positionData.market;

  if (!price) {
    throw new MissingMarketPriceError(marketId);
  }

  const totalCollateralAfter = positionData.collateral + additionalCollateral;
  const collateralValueAfter = MathLib.mulDivDown(
    totalCollateralAfter,
    price,
    ORACLE_PRICE_SCALE,
  );

  const effectiveLltv =
    lltv > DEFAULT_LLTV_BUFFER ? lltv - DEFAULT_LLTV_BUFFER : 0n;

  const maxSafeBorrowAfter = MathLib.wMulDown(
    collateralValueAfter,
    effectiveLltv,
  );

  const totalBorrowAfter = positionData.borrowAssets + borrowAmount + 1n; // +1 to account for share-to-asset rounding (happens when the borrow amount doesn't divide evenly into shares)

  if (totalBorrowAfter > maxSafeBorrowAfter) {
    const maxSafeAdditionalBorrow = MathLib.zeroFloorSub(
      maxSafeBorrowAfter,
      positionData.borrowAssets,
    );
    throw new BorrowExceedsSafeLtvError(borrowAmount, maxSafeAdditionalBorrow);
  }
};

/**
 * Validates that the viem client chain ID matches the expected chain ID.
 *
 * @param clientChainId - Chain ID reported by the viem client (may be undefined).
 * @param expectedChainId - Chain ID expected by the entity or action.
 * @returns Nothing when `clientChainId` matches `expectedChainId`.
 * @throws {ChainIdMismatchError} when `clientChainId` is undefined or differs from
 *   `expectedChainId`.
 * @example
 * ```ts
 * import { validateChainId } from "@morpho-org/morpho-sdk";
 *
 * validateChainId(8453, 8453);
 * ```
 */
export const validateChainId = (
  clientChainId: number | undefined,
  expectedChainId: number,
): void => {
  if (clientChainId !== expectedChainId) {
    throw new ChainIdMismatchError(clientChainId, expectedChainId);
  }
};

/**
 * Validates that the given asset is the chain's wrapped native token.
 * Used by any action that may receive `nativeAmount` — the SDK wraps native
 * into wNative, so the target asset must be wNative for the action to succeed.
 *
 * @param chainId - The chain to look up wNative on.
 * @param asset - The asset address to check (collateral, loan, vault asset…).
 * @returns Nothing when `asset` is the chain's configured wrapped native token.
 * @throws {UnsupportedChainIdError} when `chainId` has no address registry.
 * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
 * @throws {NativeAmountOnNonWNativeAssetError} when the asset is not wNative.
 * @example
 * ```ts
 * import { getChainAddress } from "@morpho-org/morpho-sdk/addresses";
 * import { validateNativeAsset } from "@morpho-org/morpho-sdk";
 *
 * const wNative = getChainAddress(8453, "wNative");
 * validateNativeAsset(8453, wNative);
 * ```
 */
export const validateNativeAsset = (chainId: number, asset: Address): void => {
  const { wNative } = getChainAddresses(chainId);
  if (!isDefined(wNative)) {
    throw new ChainWNativeMissingError(chainId);
  }
  if (!isAddressEqual(asset, wNative)) {
    throw new NativeAmountOnNonWNativeAssetError(asset, wNative);
  }
};

/**
 * Validates native ETH funding against the wNative tokens pulled by a MidnightBundlesV2 action.
 *
 * @param params.chainId - Chain used to resolve wNative.
 * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
 *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of the
 *   maximum wNative amount this call can pull, but not more. Any wrapped native not pulled stays in
 *   the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still required
 *   for the full pulled amount.
 * @param params.pulls - Token pulls performed by the bundle action.
 * @returns The transaction `value` and the `wrappedNative` contract argument.
 * @throws {NegativeInputError} when `nativeAmount` is negative.
 * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
 * @throws {MidnightCalldataEncodingError} when a pulled `token` is not a 20-byte hex address.
 * @throws {NativeAmountOnNonWNativeAssetError} when pulls are non-empty and none use wNative.
 * @throws {InputExceedsMaxError} when `nativeAmount` exceeds the maximum wNative pull, including
 *   when the call pulls none.
 * @example
 * ```ts
 * import { getChainAddress } from "@morpho-org/morpho-ts";
 * import { validateMidnightNativeAmount } from "@morpho-org/morpho-sdk";
 *
 * const wNative = getChainAddress(8453, "wNative");
 * const funding = validateMidnightNativeAmount({
 *   chainId: 8453,
 *   nativeAmount: 1_000n,
 *   pulls: [{ token: wNative, assets: 2_000n }],
 * });
 * funding.value; // 1_000n
 * funding.wrappedNative; // wNative
 * ```
 */
export const validateMidnightNativeAmount = (params: {
  readonly chainId: number;
  readonly nativeAmount?: bigint;
  readonly pulls: readonly {
    readonly token: Address;
    readonly assets: bigint;
  }[];
}): { value: bigint; wrappedNative: Address } => {
  const { nativeAmount, chainId, pulls } = params;
  if (nativeAmount === undefined || nativeAmount === 0n) {
    return { value: 0n, wrappedNative: zeroAddress };
  }
  if (nativeAmount < 0n) {
    throw new NegativeInputError("nativeAmount", nativeAmount);
  }

  const { wNative } = getChainAddresses(chainId);
  if (!isDefined(wNative)) {
    throw new ChainWNativeMissingError(chainId);
  }
  // Reject a malformed address before viem compares it with wNative.
  for (const pull of pulls) validateMidnightAddress("token", pull.token);

  const wNativePulled = pulls.reduce(
    (total, pull) =>
      isAddressEqual(pull.token, wNative) ? total + pull.assets : total,
    0n,
  );
  const firstPull = pulls[0];
  if (firstPull && !pulls.some((pull) => isAddressEqual(pull.token, wNative))) {
    throw new NativeAmountOnNonWNativeAssetError(firstPull.token, wNative);
  }
  if (nativeAmount > wNativePulled) {
    throw new InputExceedsMaxError({
      field: "nativeAmount",
      value: nativeAmount,
      max: wNativePulled,
    });
  }

  return { value: nativeAmount, wrappedNative: wNative };
};

/** @internal Validates native funding against a vault's wrapped-native asset. */
export const validateNativeVaultAsset = (
  chainId: number,
  vaultAsset: Address,
): void => {
  const { wNative } = getChainAddresses(chainId);
  if (!isDefined(wNative)) {
    throw new ChainWNativeMissingError(chainId);
  }
  if (!isAddressEqual(vaultAsset, wNative)) {
    throw new NativeAmountOnNonWNativeVaultError(vaultAsset, wNative);
  }
};

/**
 * Validates that the resulting position stays within the safe LTV threshold
 * (LLTV minus buffer) after withdrawing collateral.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position with market data.
 * @param params.withdrawAmount - Amount of collateral being withdrawn.
 * @param params.lltv - The market's liquidation LTV.
 * @param params.marketId - The market identifier (for error messages).
 * @returns `void` when the post-withdraw position stays within the safe LTV threshold.
 * @throws {MarketIdMismatchError} when `positionData.marketId` differs from `marketId`.
 * @throws {WithdrawExceedsCollateralError} when `withdrawAmount` exceeds the position's collateral.
 * @throws {MissingMarketPriceError} when the position carries debt but the market has no oracle price.
 * @throws {WithdrawMakesPositionUnhealthyError} when the remaining collateral cannot cover the debt
 *   at LLTV minus `DEFAULT_LLTV_BUFFER`.
 * @example
 * ```ts
 * import type { AccrualPosition, MarketId } from "@morpho-org/blue-sdk";
 * import { validatePositionHealthAfterWithdraw } from "@morpho-org/morpho-sdk";
 *
 * export function assertSafeWithdraw(
 *   positionData: AccrualPosition,
 *   withdrawAmount: bigint,
 *   lltv: bigint,
 *   marketId: MarketId,
 * ): void {
 *   validatePositionHealthAfterWithdraw({
 *     positionData,
 *     withdrawAmount,
 *     lltv,
 *     marketId,
 *   });
 * }
 * ```
 */
export const validatePositionHealthAfterWithdraw = (params: {
  positionData: AccrualPosition;
  withdrawAmount: bigint;
  lltv: bigint;
  marketId: MarketId;
}): void => {
  const { positionData, withdrawAmount, lltv, marketId } = params;

  if (positionData.marketId !== marketId) {
    throw new MarketIdMismatchError(positionData.marketId, marketId);
  }
  if (withdrawAmount > positionData.collateral) {
    throw new WithdrawExceedsCollateralError({
      withdrawAmount,
      available: positionData.collateral,
      market: marketId,
    });
  }

  // No debt means position is always healthy — oracle price not needed.
  if (positionData.borrowAssets === 0n) {
    return;
  }

  const { price } = positionData.market;

  if (!price) {
    throw new MissingMarketPriceError(positionData.marketId);
  }

  const collateralAfter = positionData.collateral - withdrawAmount;
  const collateralValueAfter = MathLib.mulDivDown(
    collateralAfter,
    price,
    ORACLE_PRICE_SCALE,
  );

  const effectiveLltv =
    lltv > DEFAULT_LLTV_BUFFER ? lltv - DEFAULT_LLTV_BUFFER : 0n;
  const maxSafeBorrowAfter = MathLib.wMulDown(
    collateralValueAfter,
    effectiveLltv,
  );

  if (positionData.borrowAssets > maxSafeBorrowAfter) {
    throw new WithdrawMakesPositionUnhealthyError({
      withdrawAmount,
      borrowAssets: positionData.borrowAssets,
      maxSafeBorrow: maxSafeBorrowAfter,
    });
  }
};

/**
 * Validates that the repay amount assets does not exceed the outstanding debt.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position.
 * @param params.repayAssets - The amount of assets to repay.
 * @param params.marketId - The market identifier (for error messages).
 * @returns Nothing when `repayAssets` does not exceed the outstanding debt.
 * @throws {RepayExceedsDebtError} when `repayAssets` exceeds the position's borrow assets.
 * @example
 * ```ts
 * import type { AccrualPosition } from "@morpho-org/morpho-sdk/blue/entities";
 * import type { MarketId } from "@morpho-org/morpho-sdk/blue/types";
 * import { validateRepayAmount } from "@morpho-org/morpho-sdk";
 *
 * export function assertRepayWithinDebt(
 *   positionData: AccrualPosition,
 *   repayAssets: bigint,
 *   marketId: MarketId,
 * ): void {
 *   validateRepayAmount({ positionData, repayAssets, marketId });
 * }
 * ```
 */
export const validateRepayAmount = (params: {
  positionData: AccrualPosition;
  repayAssets: bigint;
  marketId: MarketId;
}): void => {
  const { positionData, repayAssets, marketId } = params;
  if (repayAssets > positionData.borrowAssets) {
    throw new RepayExceedsDebtError({
      repayAmount: repayAssets,
      debt: positionData.borrowAssets,
      market: marketId,
    });
  }
};

/**
 * Validates that the repay shares do not exceed the outstanding borrow shares.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position.
 * @param params.repayShares - The amount of shares to repay.
 * @param params.marketId - The market identifier (for error messages).
 * @returns `void` when `repayShares` does not exceed the position's borrow shares.
 * @throws {RepaySharesExceedDebtError} when `repayShares` exceeds the position's borrow shares.
 * @example
 * ```ts
 * import type { AccrualPosition, MarketId } from "@morpho-org/blue-sdk";
 * import { validateRepayShares } from "@morpho-org/morpho-sdk";
 *
 * export function assertRepayable(
 *   positionData: AccrualPosition,
 *   repayShares: bigint,
 *   marketId: MarketId,
 * ): void {
 *   validateRepayShares({ positionData, repayShares, marketId });
 * }
 * ```
 */
export const validateRepayShares = (params: {
  positionData: AccrualPosition;
  repayShares: bigint;
  marketId: MarketId;
}): void => {
  const { positionData, repayShares, marketId } = params;
  if (repayShares > positionData.borrowShares) {
    throw new RepaySharesExceedDebtError({
      repayShares,
      borrowShares: positionData.borrowShares,
      market: marketId,
    });
  }
};

/** @internal */
export const validateVaultV2BlueReallocations = (
  reallocations: Iterable<VaultV2BlueReallocation>,
  targetMarketId: MarketId,
): void => {
  const penaltyByVault = new Map<string, bigint>();

  for (const reallocation of reallocations) {
    // Reject non-object entries and Vault V1-shaped entries (which carry
    // `withdrawals`/`fee`) with a typed, instructive error instead of a raw
    // TypeError or a misleading `to.adapter` address error.
    if (
      typeof reallocation !== "object" ||
      reallocation === null ||
      "withdrawals" in reallocation ||
      "fee" in reallocation
    ) {
      throw new InvalidVaultV2BlueReallocationShapeError();
    }
    if (
      typeof reallocation.vault !== "string" ||
      !isAddress(reallocation.vault)
    ) {
      throw new InvalidReallocationAddressError("vault");
    }
    if (
      reallocation.to == null ||
      typeof reallocation.to.adapter !== "string" ||
      !isAddress(reallocation.to.adapter)
    ) {
      throw new InvalidReallocationAddressError("to.adapter");
    }

    const source = reallocation.from;
    if (source == null) {
      throw new InvalidReallocationSourceTypeError(undefined);
    }
    const sourceType: string | undefined = source.type;
    if (sourceType !== "market" && sourceType !== "idle") {
      throw new InvalidReallocationSourceTypeError(sourceType);
    }
    let sourceMarketId: MarketId | undefined;
    if (source.type === "market") {
      if (typeof source.adapter !== "string" || !isAddress(source.adapter)) {
        throw new InvalidReallocationAddressError("from.adapter");
      }
      if (
        source.marketParams == null ||
        !isAddress(source.marketParams.loanToken) ||
        !isAddress(source.marketParams.collateralToken) ||
        !isAddress(source.marketParams.oracle) ||
        !isAddress(source.marketParams.irm) ||
        typeof source.marketParams.lltv !== "bigint"
      ) {
        throw new InvalidReallocationSourceTypeError("market", "marketParams");
      }
      sourceMarketId = MarketUtils.getMarketId(source.marketParams);
    }
    if (reallocation.penalty < 0n) {
      throw new NegativeInputError(
        "reallocation.penalty",
        reallocation.penalty,
      );
    }
    if (reallocation.penalty > MAX_REALLOCATION_PENALTY) {
      throw new InputExceedsMaxError({
        field: "reallocation.penalty",
        value: reallocation.penalty,
        max: MAX_REALLOCATION_PENALTY,
      });
    }
    if (reallocation.assets <= 0n) {
      throw new NonPositiveInputError(
        "reallocation.assets",
        reallocation.assets,
      );
    }
    if (reallocation.assets > maxUint128) {
      throw new InputExceedsMaxError({
        field: "reallocation.assets",
        value: reallocation.assets,
        max: maxUint128,
      });
    }

    const penaltyKey = reallocation.vault.toLowerCase();
    const expectedPenalty = penaltyByVault.get(penaltyKey);
    if (
      expectedPenalty !== undefined &&
      expectedPenalty !== reallocation.penalty
    ) {
      throw new InconsistentReallocationPenaltyError({
        vault: reallocation.vault,
        expected: expectedPenalty,
        actual: reallocation.penalty,
      });
    }
    penaltyByVault.set(penaltyKey, reallocation.penalty);

    if (
      sourceMarketId !== undefined &&
      compareMarketIds(sourceMarketId, targetMarketId) === 0
    ) {
      throw new ReallocationWithdrawalOnTargetMarketError(
        reallocation.vault,
        sourceMarketId,
      );
    }
  }
};

/**
 * Validates that a slippage tolerance is within an acceptable range.
 *
 * Throws {@link NegativeInputError} if negative.
 * Throws {@link ExcessiveSlippageToleranceError} if greater than {@link MAX_SLIPPAGE_TOLERANCE}.
 *
 * @param slippageTolerance - The slippage tolerance in WAD.
 * @returns Nothing when the slippage tolerance is valid.
 * @throws {NegativeInputError} when `slippageTolerance < 0n`.
 * @throws {ExcessiveSlippageToleranceError} when the tolerance exceeds the SDK maximum.
 * @example
 * ```ts
 * import { validateSlippageTolerance } from "@morpho-org/morpho-sdk";
 *
 * const result: void = validateSlippageTolerance(5_000000000000000n);
 * ```
 */
export const validateSlippageTolerance = (slippageTolerance: bigint): void => {
  if (slippageTolerance < 0n) {
    throw new NegativeInputError("slippageTolerance", slippageTolerance);
  }
  if (slippageTolerance > MAX_SLIPPAGE_TOLERANCE) {
    throw new ExcessiveSlippageToleranceError(slippageTolerance);
  }
};

/**
 * Validates that the withdraw assets do not exceed the user's supplied assets in the market.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position.
 * @param params.withdrawAssets - The amount of assets to withdraw.
 * @param params.marketId - The market identifier (for error messages).
 * @returns Nothing when `withdrawAssets` does not exceed the position's supplied assets.
 * @throws {WithdrawExceedsSupplyError} when `withdrawAssets > positionData.supplyAssets`.
 * @example
 * ```ts
 * import type { AccrualPosition } from "@morpho-org/morpho-sdk/blue/entities";
 * import type { MarketId } from "@morpho-org/morpho-sdk/blue/types";
 * import { validateWithdrawAmount } from "@morpho-org/morpho-sdk";
 *
 * export function assertWithdrawWithinSupply(
 *   positionData: AccrualPosition,
 *   withdrawAssets: bigint,
 *   marketId: MarketId,
 * ): void {
 *   validateWithdrawAmount({ positionData, withdrawAssets, marketId });
 * }
 * ```
 */
export const validateWithdrawAmount = (params: {
  positionData: AccrualPosition;
  withdrawAssets: bigint;
  marketId: MarketId;
}): void => {
  const { positionData, withdrawAssets, marketId } = params;
  if (withdrawAssets > positionData.supplyAssets) {
    throw new WithdrawExceedsSupplyError({
      withdrawAmount: withdrawAssets,
      available: positionData.supplyAssets,
      market: marketId,
    });
  }
};

/**
 * Validates that the withdraw shares do not exceed the user's owned supply shares in the market.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position.
 * @param params.withdrawShares - The amount of shares to withdraw.
 * @param params.marketId - The market identifier (for error messages).
 * @returns Nothing when `withdrawShares` does not exceed the position's supply shares.
 * @throws {WithdrawSharesExceedSupplyError} when `withdrawShares > positionData.supplyShares`.
 * @example
 * ```ts
 * import type { AccrualPosition } from "@morpho-org/morpho-sdk/blue/entities";
 * import type { MarketId } from "@morpho-org/morpho-sdk/blue/types";
 * import { validateWithdrawShares } from "@morpho-org/morpho-sdk";
 *
 * export function assertWithdrawSharesWithinSupply(
 *   positionData: AccrualPosition,
 *   withdrawShares: bigint,
 *   marketId: MarketId,
 * ): void {
 *   validateWithdrawShares({ positionData, withdrawShares, marketId });
 * }
 * ```
 */
export const validateWithdrawShares = (params: {
  positionData: AccrualPosition;
  withdrawShares: bigint;
  marketId: MarketId;
}): void => {
  const { positionData, withdrawShares, marketId } = params;
  if (withdrawShares > positionData.supplyShares) {
    throw new WithdrawSharesExceedSupplyError({
      withdrawShares,
      supplyShares: positionData.supplyShares,
      market: marketId,
    });
  }
};
