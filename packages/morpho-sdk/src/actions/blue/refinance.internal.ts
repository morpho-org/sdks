import type { BlueMarket } from "../../helpers/parse.js";
import { parseBlueMarket, parseUint256 } from "../../helpers/parse.js";
import type { BlueRefinanceAction, Transaction } from "../../types/index.js";
import type { BlueAllocations, BlueOperationInput } from "./common.js";
import {
  getBlueBundlesV1SignedAuthorization,
  parseBlueAllocations,
  parseBlueBundlesV1Common,
} from "./common.js";
import { encodeBlueRefinance } from "./encode.js";
import type { BlueRefinanceParams } from "./refinance.js";
import { validateBlueRefinanceMarkets } from "./refinanceValidation.js";

declare const blueRefinanceBrand: unique symbol;
/** Validated migration inputs. @internal */
export interface BlueRefinanceInput
  extends Omit<BlueOperationInput, "marketParams"> {
  readonly sourceMarketParams: BlueMarket;
  readonly destinationMarketParams: BlueMarket;
  readonly maxLtv: bigint;
  readonly publicAllocations: BlueAllocations["publicAllocations"];
  readonly reallocationPenaltyAssets: bigint;
  readonly [blueRefinanceBrand]: true;
}

/** Parses the source/destination relationship independently of snapshots. @internal */
export const parseBlueRefinanceMarkets = (markets: {
  readonly sourceMarketParams: ReturnType<typeof parseBlueMarket>;
  readonly destinationMarketParams: ReturnType<typeof parseBlueMarket>;
}) => {
  const { sourceMarketParams, destinationMarketParams } = markets;
  validateBlueRefinanceMarkets(sourceMarketParams, destinationMarketParams);
  return markets;
};

/** Constructs complete raw migration params with compatible owned markets. @internal */
export const parseBlueRefinance = (params: BlueRefinanceParams) => {
  const markets = {
    sourceMarketParams: parseBlueMarket(params.market.sourceMarketParams),
    destinationMarketParams: parseBlueMarket(
      params.market.destinationMarketParams,
    ),
  };
  const parsedMarkets = parseBlueRefinanceMarkets(markets);
  const maxLtv = parseUint256("maxLtv", params.args.maxLtv);
  const common = {
    chainId: params.market.chainId,
    userAddress: params.args.userAddress,
    deadline: params.args.deadline,
    referralFeePct: params.args.referralFeePct,
    referralFeeRecipient: params.args.referralFeeRecipient,
    metadata: params.metadata,
  };
  const normalized = parseBlueBundlesV1Common(common);
  const signedAuthorization = getBlueBundlesV1SignedAuthorization({
    ...common,
    authorizationSignature: params.args.authorizationSignature,
  });
  const allocations = parseBlueAllocations(
    [...(params.args.reallocations ?? [])],
    {
      marketParams: markets.destinationMarketParams,
      maxPenalty: params.args.maxPenalty,
    },
  );
  const fields: Omit<BlueRefinanceInput, symbol> = {
    ...parsedMarkets,
    ...normalized,
    chainId: common.chainId,
    userAddress: common.userAddress,
    metadata: common.metadata,
    maxLtv,
    publicAllocations: allocations.publicAllocations,
    reallocationPenaltyAssets: allocations.penaltyAssets,
  };
  const input = fields as BlueRefinanceInput;
  return { ...input, signedAuthorization };
};

/** Encodes parsed inputs and independently validates supplied signatures. @internal */
export const buildBlueRefinance = (
  parsed: BlueRefinanceInput,
  signatures: Pick<BlueRefinanceParams["args"], "authorizationSignature"> = {},
): Readonly<Transaction<BlueRefinanceAction>> => {
  return encodeBlueRefinance({
    ...parsed,
    signedAuthorization: getBlueBundlesV1SignedAuthorization({
      chainId: parsed.chainId,
      userAddress: parsed.userAddress,
      authorizationSignature: signatures.authorizationSignature,
    }),
  });
};
