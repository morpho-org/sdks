import {
  MarketUtils as BlueMarketUtils,
  MathLib,
  UnsupportedMarketIrmError,
} from "@morpho-org/blue-sdk";
import { fetchMarket as fetchBlueMarket } from "@morpho-org/blue-sdk-viem";
import {
  MarketParams,
  MarketUtils,
  Payload,
  PriceRatifierV1,
  RateRatifierV1,
} from "@morpho-org/midnight-sdk";
import { _try, deepFreeze } from "@morpho-org/morpho-ts";
import type { Address, Client, Hex } from "viem";
import { parseMidnightCancelAndMake } from "../../actions/midnight/cancelAndMake.js";
import {
  type ChainCheck,
  createChainCheck,
} from "../../actions/requirements/chainCheck.js";
import { validateMidnightDeadline } from "../../entities/midnight/deadline.js";
import {
  validateMidnightMakerOfferCallbacks,
  validateMidnightMakerOfferStates,
} from "../../entities/midnight/publication.js";
import type {
  GetOffersDataParams,
  MakeLendParams,
  MakeOffersParams,
  OffersData,
  SupplyBlueMakeLendParams,
  SupplyCollateralMakeBorrowParams,
} from "../../entities/midnight/types.js";
import {
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
} from "../../helpers/callback.js";
import {
  encodeMidnightMarketId,
  wrapMidnightEncoding,
} from "../../helpers/encodeMidnightCalldata.js";
import { validateChainId } from "../../helpers/index.js";
import { resolveTransactionMetadata } from "../../helpers/metadata.js";
import { parseNonnegative } from "../../helpers/parse.js";
import {
  parseMidnightAccount,
  parseMidnightNativeFunding,
  parseMidnightPositiveAmount,
} from "../../helpers/parseMidnight.js";
import {
  parseMidnightMakerBinding,
  parseMidnightMakerFundingBinding,
  parseMidnightMakerIntent,
  parseMidnightMakerTree,
  validateMidnightMakerCancellations,
} from "../../helpers/parseMidnightMaker.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { validateMidnightCollateralSupplies } from "../../helpers/validateMidnightCollateralSupplies.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateMidnightBytes32 } from "../../helpers/validateMidnightPublication.js";
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import { validatePositiveInput } from "../../helpers/validatePositiveInput.js";
import {
  EmptyBlueParkingMarketError,
  EmptyMidnightCollateralSuppliesError,
  ExpiredDeadlineError,
  InvalidBigIntInputError,
  MarketIdMismatchError,
  type Metadata,
  ZeroBlueParkingSharesError,
} from "../../types/index.js";
import type { MidnightCancelAndMakeParams } from "../../types/midnightCancelAndMake.js";
import { getPlanObject, validatePlanField } from "../validation.js";
import { validateCollateralIndexTypes } from "./market.js";
import { fetchMidnightMakerOfferStatesBeforeDeadline } from "./publicationState.js";

/** Plain viem client and chain used to prepare maker offers for a TransactionPlan. @internal */
export type MakerOffersContext = {
  readonly client: Client;
  readonly chainId: number;
};

/**
 * Plain viem client context for whole maker constructors: the caller's analytics metadata,
 * optionally the invocation's chain check, run once before the first publication-state read, and
 * optionally an error to throw once the pinned checks pass.
 * @internal
 */
export type MakerParamsContext = MakerOffersContext & {
  readonly metadata?: Metadata;
  readonly chainCheck?: ChainCheck;
  /** Thrown after the pinned offer-state and deadline checks, before the funding check, the mempool API call, ratification and encoding. */
  readonly rejectAfterPinnedChecks?: ExpiredDeadlineError;
};

const offersParams = Symbol();
const preparedMake = Symbol();

/**
 * Validates the complete raw publication request before state reads, with the same checks in the
 * same order as the entity maker flows, from a plain viem client.
 * @param params - Maker account, offer tree and optional mempool validation settings.
 * @param context - Plain viem client and the chain the offers are published on.
 * @returns The frozen request that {@link getOffersDataInternal} reads state for.
 * @throws {ChainIdMismatchError} when the client declares another chain than `context.chainId`.
 * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
 * @throws {MidnightCalldataEncodingError} when `accountAddress` is malformed.
 * @throws {MidnightOfferMakerMismatchError} when an offer names another maker.
 * @throws {MidnightOfferRatifierMismatchError} when an offer names another ratifier than the tree's.
 * @internal
 */
export const parseGetOffersDataParams = (
  params: GetOffersDataParams,
  { client, chainId }: MakerOffersContext,
) => {
  validateChainId(client.chain?.id, chainId);
  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  const tree = parseMidnightMakerTree({
    offers: params.offers,
    accountAddress,
  });
  const { ratifier, ratifierType } = parseMidnightMakerBinding({
    tree,
    chainId,
    accountAddress,
  });
  return Object.freeze({
    tree,
    accountAddress,
    ratifier,
    ratifierType,
    validation: params.validation,
    [offersParams]: true as const,
  });
};

/**
 * Reads publication state only from the complete constructed request, using a plain viem client.
 * Pass the caller's `chainCheck` to share one `eth_chainId` read per invocation. With a
 * `bundleDeadline`, the block is pinned first and the deadline is checked against its timestamp
 * before any contract read, and again against the validated state's timestamp after the offer checks.
 * `validateFunding` receives the pinned block number and timestamp and runs after the pinned
 * offer-state checks and before the optional mempool API call.
 * A `rejectAfterPinnedChecks` error is thrown after the pinned offer-state and deadline checks,
 * so no funding check, API call, ratification or encoding runs.
 * @param params - Request built by {@link parseGetOffersDataParams}.
 * @param context - Plain viem client, chain, market-creation clock, optional chain check, bundle deadline, funding check and post-pinned-check error.
 * @returns Offer groups, tree, ratifier and encoded payload ready for publication.
 * @throws {ChainIdMismatchError} when the client's RPC reports another chain.
 * @throws {ExpiredDeadlineError} when `bundleDeadline` is at or before the pinned block timestamp while every offer is live,
 *   or `rejectAfterPinnedChecks` is set and the pinned checks pass.
 * @throws {viem.BaseError} when a publication-state read fails.
 * @internal
 */
export const getOffersDataInternal = async (
  params: ReturnType<typeof parseGetOffersDataParams>,
  {
    client,
    chainId,
    marketCreationTime = "expiry",
    chainCheck = createChainCheck(client, chainId),
    bundleDeadline,
    validateFunding,
    rejectAfterPinnedChecks,
  }: MakerOffersContext & {
    readonly marketCreationTime?: "expiry" | "now";
    readonly chainCheck?: ChainCheck;
    readonly bundleDeadline?: bigint;
    readonly validateFunding?: (
      blockNumber: bigint,
      timestamp: bigint,
    ) => Promise<void>;
    readonly rejectAfterPinnedChecks?: ExpiredDeadlineError;
  },
): Promise<OffersData> => {
  const { tree, accountAddress, ratifier, ratifierType } = params;
  const { states, now, blockNumber } =
    await fetchMidnightMakerOfferStatesBeforeDeadline(
      { client, chainId, tree, bundleDeadline },
      chainCheck,
    );
  validateMidnightMakerOfferStates({ tree, states, now, marketCreationTime });
  if (bundleDeadline !== undefined && bundleDeadline <= now) {
    throw new ExpiredDeadlineError(bundleDeadline, now);
  }
  if (rejectAfterPinnedChecks !== undefined) {
    throw rejectAfterPinnedChecks;
  }
  // Funding state is checked before the optional mempool API call.
  await validateFunding?.(blockNumber, now);
  const groups: Hex[] = [];
  const seenGroups = new Set<string>();
  for (const offer of tree.offers) {
    const key = offer.group.toLowerCase();
    if (!seenGroups.has(key)) {
      seenGroups.add(key);
      groups.push(offer.group);
    }
  }
  if (params.validation !== false) {
    await tree.mempoolValidate({ ...params.validation, chainId });
  }
  const items =
    tree.type === "priceV1"
      ? PriceRatifierV1.ratify({ tree })
      : RateRatifierV1.ratify({ tree });
  return {
    accountAddress,
    groups,
    tree,
    ratifierType,
    ratifier,
    payload: await Payload.encode(items),
  };
};

type ParsedMakeParams = {
  readonly action: ReturnType<typeof parseMidnightCancelAndMake>;
  readonly data: OffersData;
  readonly loanToken?: Address;
  readonly approvalAmount: bigint;
};
type Funding = { readonly loanToken: Address; readonly approvalAmount: bigint };

/**
 * Copies caller cancellations after rejecting a non-array value or a non-object entry, holes
 * included, with a typed error; an untyped JavaScript `null` is treated as omitted.
 * @internal
 */
function copyMakerCancellations(
  cancellations: MakeOffersParams["cancellations"],
) {
  validatePlanField(cancellations ?? [], {
    path: "$.cancellations",
    type: "array",
  });
  // Array.from visits holes too, so a sparse entry reaches the object check.
  return Array.from(cancellations ?? [], (cancellation, index) => {
    getPlanObject(cancellation, `$.cancellations[${index}]`);
    return { group: cancellation.group, maxConsumed: cancellation.maxConsumed };
  });
}

/**
 * Constructs a complete maker publication from raw params with the entity maker flows' checks and
 * order, except that malformed cancellations are rejected before any state read, and a bundle
 * deadline already reached at the pinned block is rejected before the mempool API call, even when
 * every offer is live; the entity flow has no such check.
 * @internal
 */
function parseMakeParams(
  input: {
    readonly params: MakeLendParams;
    readonly operation: "makeLend" | "makeRepay";
  },
  context: MakerParamsContext,
): Promise<ParsedMakeParams & Funding>;
function parseMakeParams(
  input: {
    readonly params: MakeOffersParams;
    readonly operation: "makeBorrow" | "makeWithdraw";
  },
  context: MakerParamsContext,
): Promise<ParsedMakeParams>;
async function parseMakeParams(
  {
    params,
    operation,
  }:
    | {
        readonly params: MakeLendParams;
        readonly operation: "makeLend" | "makeRepay";
      }
    | {
        readonly params: MakeOffersParams;
        readonly operation: "makeBorrow" | "makeWithdraw";
      },
  context: MakerParamsContext,
): Promise<ParsedMakeParams> {
  const { client, chainId, chainCheck, rejectAfterPinnedChecks } = context;
  validateChainId(client.chain?.id, chainId);
  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  // Preserve account and local expiry precedence before constructing the tree.
  validateMidnightDeadline(params.deadline, params.now);
  const lend = operation === "makeLend" || operation === "makeRepay";
  const intent = parseMidnightMakerIntent({
    offers: params.offers,
    accountAddress,
    side: lend ? "lend" : "borrow",
    reduceOnly: operation === "makeRepay" || operation === "makeWithdraw",
  });
  const metadata = resolveTransactionMetadata(context.metadata, params.now);

  let loanToken: Address | undefined;
  let approvalAmount = 0n;
  if (operation === "makeLend" || operation === "makeRepay") {
    loanToken = params.loanToken;
    // Address and amounts precede opening-side and callback checks for lenders.
    validateMidnightAddress("loanToken", loanToken);
    if (typeof params.loanAssets !== "bigint") {
      throw new InvalidBigIntInputError("loanAssets", params.loanAssets);
    }
    // Validation only; funding positivity precedes the reserved amount and opening side.
    validatePositiveInput("loanAssets", params.loanAssets);
    const reservedLoanAssets = params.reservedLoanAssets ?? 0n;
    if (typeof reservedLoanAssets !== "bigint") {
      throw new InvalidBigIntInputError(
        "reservedLoanAssets",
        reservedLoanAssets,
      );
    }
    approvalAmount =
      params.loanAssets +
      parseNonnegative("reservedLoanAssets", reservedLoanAssets);
  }
  if (!intent.reduceOnly) {
    validateOfferSides(intent.tree.offers, lend);
  }
  validateMidnightMakerOfferCallbacks(intent.tree.offers);
  const cancellations = copyMakerCancellations(params.cancellations);
  validateMidnightMakerCancellations({ cancellations, tree: intent.tree });
  const offersContext = { client, chainId };
  const data = await getOffersDataInternal(
    parseGetOffersDataParams({ ...params, offers: intent.tree }, offersContext),
    {
      ...offersContext,
      chainCheck,
      bundleDeadline: params.deadline,
      rejectAfterPinnedChecks,
    },
  );
  if (loanToken != null) {
    // Funding relationships deliberately follow pinned publication state and API validation.
    parseMidnightMakerFundingBinding({ tree: data.tree, loanToken });
  }
  const action = parseMidnightCancelAndMake({
    chainId,
    cancellations,
    deadline: params.deadline,
    metadata,
    publication: {
      ratifier: data.ratifier,
      root: data.tree.root,
      groups: data.groups,
      payload: data.payload,
    },
  });
  return Object.freeze({ action, data, loanToken, approvalAmount });
}

/**
 * Constructs the complete lend publication and its loan-token allowance amount from raw params for
 * a TransactionPlan, with the entity `makeLend` checks in the same order, except that malformed
 * cancellations are rejected before any state read.
 * @param params - Maker account, lend-side offer tree, loan token and assets, cancellations and deadline.
 * @param context - Plain viem client, chain, analytics metadata and optional chain check.
 * @returns The parsed bundle action, its publication data, the loan token and the approval amount.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports, another chain.
 * @throws {ExpiredDeadlineError} when `deadline` is at or before `now` or the pinned block timestamp.
 * @throws {InvalidBigIntInputError} when `loanAssets` or `reservedLoanAssets` is not a bigint.
 * @throws {NonPositiveInputError} when `loanAssets` is not positive.
 * @throws {MidnightOfferSideMismatchError} when an offer is not lend-side.
 * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
 * @throws {DuplicateMidnightGroupCancellationError} when a group is cancelled more than once.
 * @throws {MidnightReplacementGroupCancelledError} when a cancelled group is in the new tree.
 * @throws {MidnightOfferMarketLoanTokenMismatchError} when an offer market lends another token.
 * @throws {viem.BaseError} when a publication-state read fails.
 * @internal
 */
export const parseMakeLendParams = (
  params: MakeLendParams,
  context: MakerParamsContext,
) =>
  parseMakeParams({ params, operation: "makeLend" }, context).then((parsed) =>
    Object.freeze({ ...parsed, [preparedMake]: "makeLend" as const }),
  );

/**
 * Constructs the complete reduce-only repayment publication and its loan-token allowance amount
 * from raw params for a TransactionPlan, with the entity `makeRepay` checks in the same order,
 * except that malformed cancellations are rejected before any state read.
 * @param params - Maker account, reduce-only lend-side offer tree, loan token and assets, cancellations and deadline.
 * @param context - Plain viem client, chain, analytics metadata and optional chain check.
 * @returns The parsed bundle action, its publication data, the loan token and the approval amount.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports, another chain.
 * @throws {ExpiredDeadlineError} when `deadline` is at or before `now` or the pinned block timestamp.
 * @throws {NonPositiveInputError} when `loanAssets` is not positive.
 * @throws {MidnightOfferNotReduceOnlyError} when an offer is not reduce-only.
 * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
 * @throws {DuplicateMidnightGroupCancellationError} when a group is cancelled more than once.
 * @throws {MidnightReplacementGroupCancelledError} when a cancelled group is in the new tree.
 * @throws {MidnightOfferMarketLoanTokenMismatchError} when an offer market lends another token.
 * @throws {viem.BaseError} when a publication-state read fails.
 * @internal
 */
export const parseMakeRepayParams = (
  params: MakeLendParams,
  context: MakerParamsContext,
) =>
  parseMakeParams({ params, operation: "makeRepay" }, context).then((parsed) =>
    Object.freeze({ ...parsed, [preparedMake]: "makeRepay" as const }),
  );

/**
 * Constructs the complete borrow publication from raw params for a TransactionPlan, with the
 * entity `makeBorrow` checks in the same order, except that malformed cancellations are rejected
 * before any state read.
 * @param params - Maker account, borrow-side offer tree, cancellations, deadline and validation.
 * @param context - Plain viem client, chain, analytics metadata and optional chain check.
 * @returns The parsed bundle action and the publication data it encodes.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports, another chain.
 * @throws {ExpiredDeadlineError} when `deadline` is at or before `now` or the pinned block timestamp.
 * @throws {MidnightOfferSideMismatchError} when an offer is not borrow-side.
 * @throws {InvalidTransactionPlanError} when a supplied non-null `cancellations` is not an array or has a non-object entry.
 * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
 * @throws {DuplicateMidnightGroupCancellationError} when a group is cancelled more than once.
 * @throws {MidnightReplacementGroupCancelledError} when a cancelled group is in the new tree.
 * @throws {viem.BaseError} when a publication-state read fails.
 * @internal
 */
export const parseMakeBorrowParams = (
  params: MakeOffersParams,
  context: MakerParamsContext,
) =>
  parseMakeParams({ params, operation: "makeBorrow" }, context).then((parsed) =>
    Object.freeze({ ...parsed, [preparedMake]: "makeBorrow" as const }),
  );

/**
 * Constructs the complete reduce-only credit-exit publication from raw params for a
 * TransactionPlan, with the entity `makeWithdraw` checks in the same order, except that malformed
 * cancellations are rejected before any state read.
 * @param params - Maker account, reduce-only borrow-side offer tree, cancellations and deadline.
 * @param context - Plain viem client, chain, analytics metadata and optional chain check.
 * @returns The parsed bundle action and the publication data it encodes.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports, another chain.
 * @throws {ExpiredDeadlineError} when `deadline` is at or before `now` or the pinned block timestamp.
 * @throws {MidnightOfferNotReduceOnlyError} when an offer is not reduce-only.
 * @throws {InvalidTransactionPlanError} when a supplied non-null `cancellations` is not an array or
 *   has a non-object entry.
 * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
 * @throws {DuplicateMidnightGroupCancellationError} when a group is cancelled more than once.
 * @throws {MidnightReplacementGroupCancelledError} when a cancelled group is in the new tree.
 * @throws {viem.BaseError} when a publication-state read fails.
 * @internal
 */
export const parseMakeWithdrawParams = (
  params: MakeOffersParams,
  context: MakerParamsContext,
) =>
  parseMakeParams({ params, operation: "makeWithdraw" }, context).then(
    (parsed) =>
      Object.freeze({ ...parsed, [preparedMake]: "makeWithdraw" as const }),
  );

const validateCollateralAssetsTypes = (
  supplies: SupplyCollateralMakeBorrowParams["collateral"]["supplies"],
) => {
  for (const [index, { assets }] of supplies.entries()) {
    if (typeof assets !== "bigint") {
      throw new InvalidBigIntInputError(
        `collateral.supplies[${index}].assets`,
        assets,
      );
    }
  }
};

/**
 * Validates a collateral supply request without state and resolves the token each supply pulls,
 * with the same checks in the same order as `validateMidnightCancelAndMakePublication`.
 *
 * @param params - Collateral market and supplies, and the chain the bundle runs on.
 * @returns The token and amount pulled by each supply, in input order.
 * @throws {EmptyMidnightCollateralSuppliesError} when collateral supplies are empty.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {ChainIdMismatchError} when the collateral market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when its Midnight deployment differs.
 * @throws {MidnightCalldataEncodingError} when the collateral market address is malformed.
 * @throws {NonPositiveInputError} when a collateral supply is not positive.
 * @throws {InputExceedsMaxError} when a supply or per-index total exceeds uint128.
 * @throws {UnknownCollateralIndexError} when a supply index is not configured.
 */
const parseMidnightCollateralPulls = ({
  collateral,
  chainId,
}: {
  readonly collateral: NonNullable<
    NonNullable<MidnightCancelAndMakeParams["publication"]>["collateral"]
  >;
  readonly chainId: number;
}): readonly { readonly token: Address; readonly assets: bigint }[] => {
  if (collateral.supplies.length === 0) {
    throw new EmptyMidnightCollateralSuppliesError();
  }
  validateMidnightMarket({ market: collateral.market, chainId });
  // Validation only; checks supply entries and their per-index totals.
  validateMidnightCollateralSupplies({
    market: collateral.market,
    field: "collateral.supplies",
    supplies: collateral.supplies,
  });
  return collateral.supplies.map(({ collateralIndex, assets }) => ({
    token: MarketUtils.getCollateralByIndex(collateral.market, collateralIndex)
      .token,
    assets,
  }));
};

/**
 * Constructs the complete collateral-funded borrow publication from raw params for a
 * TransactionPlan, with the entity `supplyCollateralMakeBorrow` checks, except that the market,
 * collateral and native funding checks run before any state read.
 * @param params - Maker account, borrow-side offer tree, collateral supplies, native amount, cancellations and deadline.
 * @param context - Plain viem client, chain, analytics metadata, optional chain check and post-pinned-check error.
 * @returns The parsed bundle action, its publication data and the frozen collateral it supplies.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports, another chain.
 * @throws {ExpiredDeadlineError} when `deadline` is at or before `now` or the pinned block timestamp,
 *   or `rejectAfterPinnedChecks` is set and the pinned checks pass.
 * @throws {MidnightOfferSideMismatchError} when an offer is not borrow-side.
 * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
 * @throws {DuplicateMidnightGroupCancellationError} when a group is cancelled more than once.
 * @throws {MidnightReplacementGroupCancelledError} when a cancelled group is in the new tree.
 * @throws {MarketIdMismatchError} when an offer targets another market than the collateral market.
 * @throws {EmptyMidnightCollateralSuppliesError} when collateral supplies are empty.
 * @throws {InvalidBigIntInputError} when a supply index or amount is not a bigint.
 * @throws {UnknownCollateralIndexError} when a supply index is not configured.
 * @throws {viem.BaseError} when a publication-state read fails.
 * @internal
 */
export const parseSupplyCollateralMakeBorrowParams = async (
  params: SupplyCollateralMakeBorrowParams,
  context: MakerParamsContext,
) => {
  const { client, chainId, chainCheck, rejectAfterPinnedChecks } = context;
  const metadata = resolveTransactionMetadata(context.metadata, params.now);

  validateChainId(client.chain?.id, chainId);
  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  // Preserve local expiry before market/tree construction.
  validateMidnightDeadline(params.deadline, params.now);
  const market =
    params.collateral.market instanceof MarketParams
      ? params.collateral.market
      : MarketParams.from(params.collateral.market);
  const tree = parseMidnightMakerTree({
    offers: params.offers,
    accountAddress,
  });
  // Borrow-side and callback guards precede reduce-only guards on this funded boundary.
  validateOfferSides(tree.offers, false);
  validateMidnightMakerOfferCallbacks(tree.offers);
  const intent = parseMidnightMakerIntent({
    offers: tree,
    accountAddress,
    side: "borrow",
    reduceOnly: false,
  });
  const cancellations = copyMakerCancellations(params.cancellations);
  validateMidnightMakerCancellations({ cancellations, tree: intent.tree });
  const offersContext = { client, chainId };
  // Offer bindings keep their place before the collateral market comparison.
  const offersRequest = parseGetOffersDataParams(
    { ...params, offers: intent.tree },
    offersContext,
  );
  // Market, collateral and native funding need no state, so they precede every network read.
  const marketId = encodeMidnightMarketId(market);
  for (const offer of intent.tree.offers) {
    const offerMarketId = encodeMidnightMarketId(offer.market);
    if (offerMarketId.toLowerCase() !== marketId.toLowerCase()) {
      throw new MarketIdMismatchError(offerMarketId, marketId);
    }
  }
  validateCollateralIndexTypes(
    "collateral.supplies",
    params.collateral.supplies,
  );
  validateCollateralAssetsTypes(params.collateral.supplies);
  const pulls = parseMidnightCollateralPulls({
    collateral: { market, supplies: params.collateral.supplies },
    chainId,
  });
  // The bundle uses this copy, so changes to the request during the reads cannot reach it.
  const collateral = deepFreeze({
    market: MarketUtils.toStruct(market),
    supplies: params.collateral.supplies.map(({ collateralIndex, assets }) => ({
      collateralIndex,
      assets,
    })),
  });
  const { nativeAmount } = params;
  // Validation only; the bundle action resolves the same pulls and native coverage again.
  parseMidnightNativeFunding({ chainId, nativeAmount, pulls });
  const data = await getOffersDataInternal(offersRequest, {
    ...offersContext,
    marketCreationTime: "now",
    chainCheck,
    bundleDeadline: params.deadline,
    rejectAfterPinnedChecks,
  });
  const action = parseMidnightCancelAndMake({
    chainId,
    nativeAmount,
    cancellations,
    deadline: params.deadline,
    metadata,
    publication: {
      ratifier: data.ratifier,
      root: data.tree.root,
      groups: data.groups,
      payload: data.payload,
      collateral,
    },
  });
  return Object.freeze({
    action,
    data,
    collateral,
    [preparedMake]: "supplyCollateralMakeBorrow" as const,
  });
};

/**
 * Constructs the complete Blue-funded lend publication from raw params for a TransactionPlan. The
 * input, tree, cancellation, deadline and binding checks run before the chain check, the
 * publication-state reads and the Blue market read; payload encoding, which also checks market
 * maturity, runs after them. The Blue market is read at the block the publication-state reads are pinned to,
 * after their checks and before the optional mempool API call.
 * @param params - Maker account, lend-side offer tree, Blue market, assets to park, callback salt, cancellations and deadline.
 * @param context - Plain viem client, chain, analytics metadata, optional chain check and post-pinned-check error.
 * @returns The parsed bundle action, its publication data, the loan token, the approval amount and the frozen Blue supply.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports, another chain.
 * @throws {InvalidMidnightHexInputError} when `callbackSalt` is not 32-byte hex.
 * @throws {InvalidBigIntInputError} when `assetsToPark` or `blueMarket.lltv` is not a bigint.
 * @throws {NonPositiveInputError} when `assetsToPark` is not positive.
 * @throws {MidnightOfferSideMismatchError} when an offer is not lend-side.
 * @throws {ExpiredDeadlineError} when `deadline` is at or before `now` or the pinned block timestamp,
 *   or `rejectAfterPinnedChecks` is set and the pinned offer checks pass, before the Blue market read.
 * @throws {EmptyBlueParkingMarketError} when the Blue market has no supply shares at the pinned block.
 * @throws {ZeroBlueParkingSharesError} when `assetsToPark` buys zero Blue supply shares.
 * @throws {viem.BaseError} when a publication-state or Blue market read fails.
 * @internal
 */
export const parseSupplyBlueMakeLendParams = async (
  params: SupplyBlueMakeLendParams,
  context: MakerParamsContext,
) => {
  const { client, chainId } = context;
  const suppliedNow = params.now;
  const metadata = resolveTransactionMetadata(context.metadata, suppliedNow);

  validateChainId(client.chain?.id, chainId);
  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  // Preserve salt and amount error context before constructing the tree.
  validateMidnightBytes32("callbackSalt", params.callbackSalt);
  if (typeof params.assetsToPark !== "bigint") {
    throw new InvalidBigIntInputError("assetsToPark", params.assetsToPark);
  }
  const assets = parseMidnightPositiveAmount(
    "assetsToPark",
    params.assetsToPark,
  );
  const { loanToken, collateralToken, oracle, irm, lltv } = params.blueMarket;
  if (typeof lltv !== "bigint") {
    throw new InvalidBigIntInputError("blueMarket.lltv", lltv);
  }
  const blueSupply = deepFreeze({
    market: { loanToken, collateralToken, oracle, irm, lltv },
    assets,
    callbackSalt: params.callbackSalt,
  });
  const tree = parseMidnightMakerTree({
    offers: params.offers,
    accountAddress,
  });
  // Side errors precede reduce-only errors on this funded boundary.
  validateOfferSides(tree.offers, true);
  const intent = parseMidnightMakerIntent({
    offers: tree,
    accountAddress,
    side: "lend",
    reduceOnly: false,
  });
  const cancellations = copyMakerCancellations(params.cancellations);
  validateMidnightMakerCancellations({ cancellations, tree: intent.tree });
  validateMidnightDeadline(params.deadline, suppliedNow);
  const { callbackSalt, market: blueMarket, assets: assetsToPark } = blueSupply;
  const callbackData = wrapMidnightEncoding("blueMarket", () =>
    getMidnightBlueBuyCallbackData(blueMarket),
  );
  const blueMarketId = BlueMarketUtils.getMarketId(blueMarket);
  const callback = getMidnightBlueBuyCallbackAddress({
    chainId,
    owner: accountAddress,
    salt: callbackSalt,
  });
  parseMidnightMakerFundingBinding({
    tree: intent.tree,
    loanToken: blueMarket.loanToken,
    callback: { address: callback, data: callbackData },
  });
  // Validation only; the bundle action resolves the same native coverage again.
  parseMidnightNativeFunding({
    chainId,
    nativeAmount: params.nativeAmount,
    pulls: [{ token: blueMarket.loanToken, assets: assetsToPark }],
  });
  const offersRequest = parseGetOffersDataParams(
    { ...params, offers: intent.tree },
    { client, chainId },
  );
  const chainCheck = context.chainCheck ?? createChainCheck(client, chainId);
  await chainCheck();
  const data = await getOffersDataInternal(offersRequest, {
    client,
    chainId,
    chainCheck,
    bundleDeadline: params.deadline,
    rejectAfterPinnedChecks: context.rejectAfterPinnedChecks,
    validateFunding: async (blockNumber, timestamp) => {
      const fetched = await fetchBlueMarket(blueMarketId, client, {
        blockNumber,
      });
      const market =
        _try(
          () =>
            fetched.accrueInterest(MathLib.max(timestamp, fetched.lastUpdate)),
          UnsupportedMarketIrmError,
        ) ?? fetched;
      if (market.totalSupplyShares === 0n) {
        throw new EmptyBlueParkingMarketError({ marketId: blueMarketId });
      }
      if (market.toSupplyShares(assetsToPark, "Down") === 0n) {
        throw new ZeroBlueParkingSharesError({
          marketId: blueMarketId,
          assets: assetsToPark,
        });
      }
    },
  });
  const action = parseMidnightCancelAndMake({
    chainId,
    publication: {
      ratifier: data.ratifier,
      root: data.tree.root,
      groups: data.groups,
      payload: data.payload,
      blueSupply: { market: blueMarket, assets: assetsToPark, callbackSalt },
    },
    nativeAmount: params.nativeAmount,
    cancellations,
    deadline: params.deadline,
    metadata,
  });
  return Object.freeze({
    action,
    data,
    loanToken: blueMarket.loanToken,
    approvalAmount: assetsToPark,
    blueSupply,
    [preparedMake]: "supplyBlueMakeLend" as const,
  });
};
