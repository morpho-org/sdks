import { MathLib } from "@morpho-org/blue-sdk";
import type { AccrualPosition, Market } from "@morpho-org/midnight-sdk";
import { Time } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Hex,
  isAddress,
  isAddressEqual,
  maxUint256,
  zeroAddress,
} from "viem";
import { parseMidnightCancelOffers } from "../../actions/midnight/cancelOffers.js";
import {
  type ParsedMidnightSupplyCollateralBatchPreparation,
  type ParsedMidnightWithdrawCollateralBatchPreparation,
  parseMidnightSupplyCollateralBatchPreparation,
  parseMidnightWithdrawCollateralBatchPreparation,
} from "../../actions/midnight/parseCollateralBatch.js";
import {
  type ParsedMidnightRedeem,
  parseMidnightRedeem,
} from "../../actions/midnight/redeem.js";
import { parseMidnightRepayWithdrawCollateral } from "../../actions/midnight/repayWithdrawCollateral.js";
import { parseMidnightSupplyCollateralPreparation } from "../../actions/midnight/supplyCollateral.js";
import { parseMidnightSupplyCollateralTakeBorrow } from "../../actions/midnight/supplyCollateralTakeBorrow.js";
import { parseMidnightTakeBorrow } from "../../actions/midnight/takeBorrow.js";
import { parseMidnightTakeLend } from "../../actions/midnight/takeLend.js";
import { parseMidnightTakeRepayWithdrawCollateral } from "../../actions/midnight/takeRepayWithdrawCollateral.js";
import { parseMidnightTakeWithdraw } from "../../actions/midnight/takeWithdraw.js";
import {
  type ParsedMidnightWithdrawCollateral,
  parseMidnightWithdrawCollateral,
} from "../../actions/midnight/withdrawCollateral.js";
import { MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS } from "../../helpers/constant.js";
import { validateChainId } from "../../helpers/index.js";
import { resolveTransactionMetadata } from "../../helpers/metadata.js";
import {
  parseMidnightAccount,
  parseMidnightAddress,
  parseMidnightCollateral,
  parseMidnightMarket,
  parseMidnightPositiveAmount,
  validateMidnightPositionBinding as validatePositionBinding,
} from "../../helpers/parseMidnight.js";

import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  AccrualPositionUserMismatchError,
  InsufficientMidnightWithdrawableLiquidityError,
  MidnightInvalidAccountAddressError,
  MidnightRedeemExceedsCreditError,
  MidnightTakeDeadlineTooFarError,
  MissingAccrualPositionError,
  NoMidnightCreditToRedeemError,
} from "../../types/index.js";
import { validateMidnightDeadline } from "./deadline.js";
import type {
  RedeemParams,
  RepayWithdrawCollateralParams,
  SupplyCollateralBatchParams,
  SupplyCollateralParams,
  SupplyCollateralTakeBorrowParams,
  TakeBorrowParams,
  TakeLendParams,
  TakeRepayWithdrawCollateralParams,
  TakeWithdrawParams,
  WithdrawCollateralBatchParams,
  WithdrawCollateralParams,
} from "./types.js";

/** Checks entity snapshot bindings without depending on the entity layer. @internal */
export { validateMidnightPositionBinding as validatePositionBinding } from "../../helpers/parseMidnight.js";

type Context = { readonly client: MorphoClientType; readonly chainId: number };
type ParsedTakeLendParams = { readonly now?: bigint } & ReturnType<
  typeof parseMidnightTakeLend
> &
  Pick<TakeLendParams, "accountAddress" | "marketData">;
type ParsedTakeBorrowParams = { readonly now?: bigint } & ReturnType<
  typeof parseMidnightTakeBorrow
> &
  Pick<
    TakeBorrowParams,
    "accountAddress" | "marketData" | "positionData" | "collateralPrices"
  >;
type ParsedTakeWithdrawParams = { readonly now?: bigint } & ReturnType<
  typeof parseMidnightTakeWithdraw
> &
  Pick<TakeWithdrawParams, "accountAddress" | "marketData">;
type ParsedSupplyCollateralTakeBorrowParams = {
  readonly now?: bigint;
} & ReturnType<typeof parseMidnightSupplyCollateralTakeBorrow> &
  Pick<
    SupplyCollateralTakeBorrowParams,
    "accountAddress" | "marketData" | "positionData" | "collateralPrices"
  >;
type ParsedTakeRepayWithdrawCollateralParams = {
  readonly now?: bigint;
} & ReturnType<typeof parseMidnightTakeRepayWithdrawCollateral> &
  Pick<
    TakeRepayWithdrawCollateralParams,
    "accountAddress" | "marketData" | "positionData" | "collateralPrices"
  >;
type ParsedRepayWithdrawCollateralParams = {
  readonly now?: bigint;
} & ReturnType<typeof parseMidnightRepayWithdrawCollateral> &
  Pick<
    RepayWithdrawCollateralParams,
    "accountAddress" | "marketData" | "positionData" | "collateralPrices"
  >;
type ParsedCancelOffersParams = ReturnType<typeof parseMidnightCancelOffers>;

const validateTakeDeadlineWindow = (
  deadline: bigint,
  now = Time.timestamp(),
): void => {
  // Freshness is checked at this invocation, not certified by the static action contract.
  validateMidnightDeadline(deadline, now);
  const maxDeadline = now + MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS;
  if (deadline > maxDeadline) {
    throw new MidnightTakeDeadlineTooFarError({ deadline, maxDeadline });
  }
};

/** Owns complete entity lend params; reuses the standalone static constructor. @internal */
export const parseTakeLendParams = (
  params: TakeLendParams,
  { client, chainId }: Context,
): ParsedTakeLendParams => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  validateTakeDeadlineWindow(params.deadline, params.now);
  const action = parseMidnightTakeLend({
    chainId,
    market: params.marketData.params,
    target: params.target,
    takeableOffers: params.takeableOffers,
    deadline: params.deadline,
    maxContinuousFee: params.maxContinuousFee,
    nativeAmount: params.nativeAmount,
    referralFeePct: params.referralFeePct,
    referralFeeRecipient: params.referralFeeRecipient,
    metadata,
  });
  return Object.freeze({
    ...action,
    now: params.now,
    accountAddress,
    marketData: params.marketData,
  });
};

/** Owns complete entity borrow params, including receiver defaults. @internal */
export const parseTakeBorrowParams = (
  params: TakeBorrowParams,
  { client, chainId }: Context,
): ParsedTakeBorrowParams => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  validateTakeDeadlineWindow(params.deadline, params.now);
  const action = parseMidnightTakeBorrow({
    chainId,
    market: params.marketData.params,
    target: params.target,
    takeableOffers: params.takeableOffers,
    deadline: params.deadline,
    receiver: params.receiver ?? accountAddress,
    referralFeePct: params.referralFeePct,
    referralFeeRecipient: params.referralFeeRecipient,
    metadata,
  });
  return Object.freeze({
    ...action,
    now: params.now,
    accountAddress,
    marketData: params.marketData,
    positionData: params.positionData,
    collateralPrices: params.collateralPrices,
  });
};

/** Owns complete entity credit-exit params. @internal */
export const parseTakeWithdrawParams = (
  params: TakeWithdrawParams,
  { client, chainId }: Context,
): ParsedTakeWithdrawParams => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  validateTakeDeadlineWindow(params.deadline, params.now);
  const action = parseMidnightTakeWithdraw({
    chainId,
    market: params.marketData.params,
    target: params.target,
    takeableOffers: params.takeableOffers,
    deadline: params.deadline,
    receiver: params.receiver ?? accountAddress,
    referralFeePct: params.referralFeePct,
    referralFeeRecipient: params.referralFeeRecipient,
    metadata,
  });
  return Object.freeze({
    ...action,
    now: params.now,
    accountAddress,
    marketData: params.marketData,
  });
};

/** Owns complete entity collateral-funded borrow params. @internal */
export const parseSupplyCollateralTakeBorrowParams = (
  params: SupplyCollateralTakeBorrowParams,
  { client, chainId }: Context,
): ParsedSupplyCollateralTakeBorrowParams => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  validateTakeDeadlineWindow(params.deadline, params.now);
  const action = parseMidnightSupplyCollateralTakeBorrow({
    chainId,
    market: params.marketData.params,
    target: params.target,
    takeableOffers: params.takeableOffers,
    deadline: params.deadline,
    receiver: params.receiver ?? accountAddress,
    collateralSupplies: params.collateralSupplies,
    nativeAmount: params.nativeAmount,
    referralFeePct: params.referralFeePct,
    referralFeeRecipient: params.referralFeeRecipient,
    metadata,
  });
  return Object.freeze({
    ...action,
    now: params.now,
    accountAddress,
    marketData: params.marketData,
    positionData: params.positionData,
    collateralPrices: params.collateralPrices,
  });
};

/** Owns complete entity taker repayment params and withdrawal defaults. @internal */
export const parseTakeRepayWithdrawCollateralParams = (
  params: TakeRepayWithdrawCollateralParams,
  { client, chainId }: Context,
): ParsedTakeRepayWithdrawCollateralParams => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  validateTakeDeadlineWindow(params.deadline, params.now);
  const action = parseMidnightTakeRepayWithdrawCollateral({
    chainId,
    market: params.marketData.params,
    target: params.target,
    takeableOffers: params.takeableOffers,
    deadline: params.deadline,
    maxContinuousFee: params.maxContinuousFee,
    repayEnabled: params.repayEnabled,
    nativeAmount: params.nativeAmount,
    collateralWithdrawals: params.collateralWithdrawals ?? [],
    collateralReceiver: params.collateralReceiver ?? accountAddress,
    referralFeePct: params.referralFeePct,
    referralFeeRecipient: params.referralFeeRecipient,
    metadata,
  });
  return Object.freeze({
    ...action,
    now: params.now,
    accountAddress,
    marketData: params.marketData,
    positionData: params.positionData,
    collateralPrices: params.collateralPrices,
  });
};

/** Owns complete entity direct repayment params without re-entering a public builder. @internal */
export const parseRepayWithdrawCollateralParams = (
  params: RepayWithdrawCollateralParams,
  { client, chainId }: Context,
): ParsedRepayWithdrawCollateralParams => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  // Preserve account, local deadline, then standalone static guard precedence.
  validateMidnightDeadline(params.deadline, params.now);
  const action = parseMidnightRepayWithdrawCollateral({
    chainId,
    market: params.marketData.params,
    repay: params.repay,
    deadline: params.deadline,
    nativeAmount: params.nativeAmount,
    collateralWithdrawals: params.collateralWithdrawals ?? [],
    collateralReceiver: params.collateralReceiver ?? accountAddress,
    metadata,
  });
  return Object.freeze({
    ...action,
    now: params.now,
    accountAddress,
    marketData: params.marketData,
    positionData: params.positionData,
    collateralPrices: params.collateralPrices,
  });
};

/** Owns supply amount, reserve and collateral; preserves the lazy zero-owner error. @internal */
export const parseSupplyCollateralParams = (
  params: SupplyCollateralParams,
  { client, chainId }: Context,
): ReturnType<typeof parseMidnightSupplyCollateralPreparation> => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  return parseMidnightSupplyCollateralPreparation({
    chainId,
    market: params.marketData,
    accountAddress: params.accountAddress,
    collateralAssets: params.collateralAssets,
    reservedCollateralAssets: params.reservedCollateralAssets,
    collateralIndex: params.collateralIndex,
    metadata,
  });
};

/** Owns complete entity supply batch inputs and lazy construction failures. @internal */
export const parseSupplyCollateralBatchParams = (
  params: SupplyCollateralBatchParams,
  { client, chainId }: Context,
): ParsedMidnightSupplyCollateralBatchPreparation => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  return parseMidnightSupplyCollateralBatchPreparation({
    chainId,
    market: params.marketData,
    accountAddress: params.accountAddress,
    collateralSupplies: params.collateralSupplies,
    metadata,
  });
};

/** Owns withdrawal batch binding, index-before-amount resolution and complete action inputs. @internal */
export const parseWithdrawCollateralBatchParams = (
  params: WithdrawCollateralBatchParams,
  { client, chainId }: Context,
): ParsedMidnightWithdrawCollateralBatchPreparation => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  return parseMidnightWithdrawCollateralBatchPreparation({
    ...params,
    chainId,
    metadata,
  });
};

/** Owns max-amount resolution, owner, market, collateral and receiver constraints. @internal */
export const parseWithdrawCollateralParams = (
  params: WithdrawCollateralParams,
  { client, chainId }: Context,
): ParsedMidnightWithdrawCollateral & {
  readonly accountAddress: Address;
  readonly marketData: Market;
  readonly positionData: AccrualPosition;
  readonly collateralPrices: WithdrawCollateralParams["collateralPrices"];
  readonly available: bigint;
} => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  const onBehalf = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  const market = parseMidnightMarket(params.marketData, chainId);
  // Position binding precedes collateral lookup at this boundary.
  validatePositionBinding(params);
  const collateral = parseMidnightCollateral(
    market,
    params.collateralIndex ?? 0n,
  );
  const available =
    params.positionData.collateral[Number(collateral.index)] ?? 0n;
  const action = parseMidnightWithdrawCollateral({
    chainId,
    market: market.struct,
    assets: params.assets === maxUint256 ? available : params.assets,
    onBehalf,
    receiver: params.receiver ?? onBehalf,
    collateralIndex: collateral.index,
    metadata,
  });
  return Object.freeze({
    ...action,
    now: params.now,
    available,
    accountAddress: onBehalf,
    marketData: params.marketData,
    positionData: params.positionData,
    collateralPrices: params.collateralPrices,
  });
};

/** Owns redemption defaults and snapshot-dependent amount constraints in their existing order. @internal */
export const parseRedeemParams = (
  params: RedeemParams,
  { client, chainId }: Context,
): ParsedMidnightRedeem => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  const address = parseMidnightAddress("accountAddress", params.accountAddress);
  if (!params.positionData) {
    throw new MissingAccrualPositionError();
  }
  if (params.positionData.user != null) {
    validateMidnightAddress("positionData.user", params.positionData.user);
  }
  if (
    params.positionData.user == null ||
    !isAddressEqual(params.positionData.user, address)
  ) {
    throw new AccrualPositionUserMismatchError(
      params.positionData.user ?? "unbound",
      address,
    );
  }
  const marketData = params.positionData.market;
  // Reject market/deployment errors before snapshot accrual and amount checks.
  const market = parseMidnightMarket(marketData, chainId);
  const accrued = params.positionData.accrueInterest(
    MathLib.max(
      params.now ?? Time.timestamp(),
      params.positionData.lastAccrual,
    ),
  );
  const units = params.units ?? accrued.faceValue;
  if (params.units === undefined && units <= 0n) {
    throw new NoMidnightCreditToRedeemError(marketData.id);
  }
  // Bound the resolved amount before checking credit and liquidity.
  parseMidnightPositiveAmount("units", units);
  if (accrued.credit < units) {
    throw new MidnightRedeemExceedsCreditError({
      market: marketData.id,
      units,
      credit: accrued.credit,
    });
  }
  if (marketData.withdrawable < units) {
    throw new InsufficientMidnightWithdrawableLiquidityError({
      market: marketData.id,
      units,
      withdrawable: marketData.withdrawable,
    });
  }
  // The owning action constructor mints the complete contract only after snapshot checks.
  return parseMidnightRedeem({
    chainId,
    market: market.struct,
    units,
    onBehalf: address,
    receiver: params.receiver ?? address,
    metadata,
  });
};

/** Owns the complete cancellation intent, including its distinct account error. @internal */
export const parseCancelOffersParams = (
  params: {
    readonly accountAddress: Address;
    readonly groups: readonly Hex[];
    readonly now?: bigint;
  },
  { client, chainId }: Context,
): ParsedCancelOffersParams => {
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );
  validateChainId(client.viemClient.chain?.id, chainId);
  const { accountAddress } = params;
  if (
    !isAddress(accountAddress) ||
    isAddressEqual(accountAddress, zeroAddress)
  ) {
    throw new MidnightInvalidAccountAddressError(accountAddress);
  }
  return parseMidnightCancelOffers({
    chainId,
    groups: params.groups,
    onBehalf: accountAddress,
    metadata,
  });
};
