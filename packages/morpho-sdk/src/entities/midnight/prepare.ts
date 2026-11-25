import {
  MarketUtils as BlueMarketUtils,
  MathLib,
  UnsupportedMarketIrmError,
} from "@morpho-org/blue-sdk";
import { fetchMarket as fetchBlueMarket } from "@morpho-org/blue-sdk-viem";
import {
  MarketParams,
  Payload,
  PriceRatifierV1,
  RateRatifierV1,
} from "@morpho-org/midnight-sdk";
import { _try, deepFreeze, Time } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";
import { parseMidnightCancelAndMake } from "../../actions/midnight/cancelAndMake.js";
import {
  type ChainCheck,
  createChainCheck,
} from "../../actions/requirements/chainCheck.js";
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
  parseMidnightPositiveAmount,
} from "../../helpers/parseMidnight.js";
import {
  parseMidnightMakerBinding,
  parseMidnightMakerFundingBinding,
  parseMidnightMakerIntent,
  parseMidnightMakerTree,
} from "../../helpers/parseMidnightMaker.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { validateMidnightBytes32 } from "../../helpers/validateMidnightPublication.js";
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import { validatePositiveInput } from "../../helpers/validatePositiveInput.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  EmptyBlueParkingMarketError,
  MarketIdMismatchError,
  ZeroBlueParkingSharesError,
} from "../../types/index.js";
import { validateMidnightDeadline } from "./deadline.js";
import {
  fetchMidnightMakerOfferStatesWithChainCheck,
  validateMidnightMakerOfferCallbacks,
  validateMidnightMakerOfferStates,
} from "./publication.js";
import type {
  GetOffersDataParams,
  MakeLendParams,
  MakeOffersParams,
  OffersData,
  SupplyBlueMakeLendParams,
  SupplyCollateralMakeBorrowParams,
} from "./types.js";

type Context = { readonly client: MorphoClientType; readonly chainId: number };
const offersParams = Symbol();
const preparedMake = Symbol();
interface PreparedMakeParams<Operation extends string> {
  readonly action: ReturnType<typeof parseMidnightCancelAndMake>;
  readonly data: OffersData;
  readonly [preparedMake]: Operation;
}
type Funding = { readonly loanToken: Address; readonly approvalAmount: bigint };

/** Validates the complete raw publication request before state reads. @internal */
export const parseGetOffersDataParams = (
  params: GetOffersDataParams,
  { client, chainId }: Context,
) => {
  validateChainId(client.viemClient.chain?.id, chainId);
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

/** Reads publication state only from the complete constructed request. @internal */
export const getOffersDataInternal = async (
  params: ReturnType<typeof parseGetOffersDataParams>,
  {
    client,
    chainId,
    marketCreationTime = "expiry",
    chainCheck = createChainCheck(client.viemClient, chainId),
  }: Context & {
    readonly marketCreationTime?: "expiry" | "now";
    readonly chainCheck?: ChainCheck;
  },
): Promise<OffersData> => {
  const { tree, accountAddress, ratifier, ratifierType } = params;
  const { states, now } = await fetchMidnightMakerOfferStatesWithChainCheck(
    {
      client: client.viemClient,
      chainId,
      tree,
    },
    chainCheck,
  );
  // RPC facts are checked here, never encoded as a permanent static witness.
  validateMidnightMakerOfferStates({ tree, states, now, marketCreationTime });
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

function parseMakeParams(
  input: {
    readonly params: MakeLendParams;
    readonly operation: "makeLend" | "makeRepay";
  },
  context: Context,
): Promise<ParsedMakeParams & Funding>;
function parseMakeParams(
  input: {
    readonly params: MakeOffersParams;
    readonly operation: "makeBorrow" | "makeWithdraw";
  },
  context: Context,
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
  context: Context,
): Promise<ParsedMakeParams> {
  const { client, chainId } = context;
  validateChainId(client.viemClient.chain?.id, chainId);
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
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );

  let loanToken: Address | undefined;
  let approvalAmount = 0n;
  if (operation === "makeLend" || operation === "makeRepay") {
    loanToken = params.loanToken;
    // Address and amounts precede opening-side and callback checks for lenders.
    validateMidnightAddress("loanToken", loanToken);
    // Validation only; funding positivity precedes the reserved amount and opening side.
    validatePositiveInput("loanAssets", params.loanAssets);
    approvalAmount =
      params.loanAssets +
      parseNonnegative("reservedLoanAssets", params.reservedLoanAssets ?? 0n);
  }
  if (!intent.reduceOnly) {
    validateOfferSides(intent.tree.offers, lend);
  }
  validateMidnightMakerOfferCallbacks(intent.tree.offers);
  const data = await getOffersDataInternal(
    parseGetOffersDataParams({ ...params, offers: intent.tree }, context),
    context,
  );
  if (loanToken != null) {
    // Funding relationships deliberately follow pinned publication state and API validation.
    parseMidnightMakerFundingBinding({ tree: data.tree, loanToken });
  }
  const action = parseMidnightCancelAndMake({
    chainId,
    cancellations: params.cancellations ?? [],
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

/** Constructs the complete lend publication and requirement inputs from raw params. @internal */
export const parseMakeLendParams = async (
  params: MakeLendParams,
  context: Context,
): Promise<PreparedMakeParams<"makeLend"> & Funding> => {
  const parsed = await parseMakeParams(
    { params, operation: "makeLend" },
    context,
  );
  return Object.freeze({
    ...parsed,
    [preparedMake]: "makeLend" as const,
  });
};
/** Constructs the complete reduce-only repayment publication from raw params. @internal */
export const parseMakeRepayParams = async (
  params: MakeLendParams,
  context: Context,
): Promise<PreparedMakeParams<"makeRepay"> & Funding> => {
  const parsed = await parseMakeParams(
    { params, operation: "makeRepay" },
    context,
  );
  return Object.freeze({
    ...parsed,
    [preparedMake]: "makeRepay" as const,
  });
};
/** Constructs the complete borrow publication from raw params. @internal */
export const parseMakeBorrowParams = (
  params: MakeOffersParams,
  context: Context,
): Promise<PreparedMakeParams<"makeBorrow">> =>
  parseMakeParams({ params, operation: "makeBorrow" }, context).then((parsed) =>
    Object.freeze({ ...parsed, [preparedMake]: "makeBorrow" as const }),
  );
/** Constructs the complete reduce-only credit-exit publication from raw params. @internal */
export const parseMakeWithdrawParams = (
  params: MakeOffersParams,
  context: Context,
): Promise<PreparedMakeParams<"makeWithdraw">> =>
  parseMakeParams({ params, operation: "makeWithdraw" }, context).then(
    (parsed) =>
      Object.freeze({ ...parsed, [preparedMake]: "makeWithdraw" as const }),
  );

/** Constructs a complete Blue-funded publication while preserving its RPC/error order. @internal */
export const parseSupplyBlueMakeLendParams = async (
  params: SupplyBlueMakeLendParams,
  context: Context,
): Promise<PreparedMakeParams<"supplyBlueMakeLend"> & Funding> => {
  const { client, chainId } = context;
  const suppliedNow = params.now;
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    suppliedNow,
  );

  const accountAddress = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  // Preserve salt and amount error context before constructing the tree or reading state.
  validateMidnightBytes32("callbackSalt", params.callbackSalt);
  const assets = parseMidnightPositiveAmount(
    "assetsToPark",
    params.assetsToPark,
  );
  const { loanToken, collateralToken, oracle, irm, lltv } = params.blueMarket;
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
  const chainCheck = createChainCheck(client.viemClient, chainId);
  await chainCheck();
  // Freshness belongs to this invocation, after its chain check.
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
  const [data, fetched] = await Promise.all([
    getOffersDataInternal(
      parseGetOffersDataParams({ ...params, offers: intent.tree }, context),
      { ...context, chainCheck },
    ),
    fetchBlueMarket(blueMarketId, client.viemClient, {
      deployless: client.options.supportDeployless,
    }),
  ]);
  const market =
    _try(
      () =>
        fetched.accrueInterest(
          MathLib.max(suppliedNow ?? Time.timestamp(), fetched.lastUpdate),
        ),
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
  // Preserve late callback/loan-token relationship errors after the parking-state checks.
  parseMidnightMakerFundingBinding({
    tree: data.tree,
    loanToken: blueMarket.loanToken,
    callback: { address: callback, data: callbackData },
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
    cancellations: params.cancellations ?? [],
    deadline: params.deadline,
    metadata,
  });
  return Object.freeze({
    action,
    data,
    loanToken: blueMarket.loanToken,
    approvalAmount: assetsToPark,
    [preparedMake]: "supplyBlueMakeLend" as const,
  });
};

/** Constructs the complete collateral-funded borrow publication from its raw request. @internal */
export const parseSupplyCollateralMakeBorrowParams = async (
  params: SupplyCollateralMakeBorrowParams,
  context: Context,
): Promise<PreparedMakeParams<"supplyCollateralMakeBorrow">> => {
  const { client, chainId } = context;
  const metadata = resolveTransactionMetadata(
    client.options.metadata,
    params.now,
  );

  validateChainId(client.viemClient.chain?.id, chainId);
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
  const data = await getOffersDataInternal(
    parseGetOffersDataParams({ ...params, offers: intent.tree }, context),
    { ...context, marketCreationTime: "now" },
  );
  const marketId = encodeMidnightMarketId(market);
  for (const offer of data.tree.offers) {
    const offerMarketId = encodeMidnightMarketId(offer.market);
    if (offerMarketId.toLowerCase() !== marketId.toLowerCase()) {
      throw new MarketIdMismatchError(offerMarketId, marketId);
    }
  }
  const action = parseMidnightCancelAndMake({
    chainId,
    nativeAmount: params.nativeAmount,
    cancellations: params.cancellations ?? [],
    deadline: params.deadline,
    metadata,
    publication: {
      ratifier: data.ratifier,
      root: data.tree.root,
      groups: data.groups,
      payload: data.payload,
      collateral: { market, supplies: params.collateral.supplies },
    },
  });
  return Object.freeze({
    action,
    data,
    [preparedMake]: "supplyCollateralMakeBorrow" as const,
  });
};
