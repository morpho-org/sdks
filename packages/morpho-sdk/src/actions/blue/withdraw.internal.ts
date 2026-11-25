import { parseBlueMarket, parseUint256 } from "../../helpers/parse.js";
import {
  type BlueWithdrawAction,
  InputExceedsMaxError,
  MutuallyExclusiveWithdrawAmountsError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import type { BlueAllocations, BlueOperationInput } from "./common.js";
import {
  getBlueBundlesV1SignedAuthorization,
  parseBlueAllocations,
  parseBlueBundlesV1Common,
} from "./common.js";
import { encodeBlueWithdraw } from "./encode.js";
import type { BlueWithdrawParams } from "./withdraw.js";

declare const blueWithdrawBrand: unique symbol;
/** Validated withdrawal inputs. @internal */
export interface BlueWithdrawInput extends BlueOperationInput {
  readonly withdrawAssets: bigint;
  readonly withdrawShares: bigint;
  readonly publicAllocations: BlueAllocations["publicAllocations"];
  readonly reallocationPenaltyAssets: bigint;
  readonly [blueWithdrawBrand]: true;
}

/** Parses withdrawal mode after the scalar amount stages. @internal */
export const parseBlueWithdrawMode = (
  marketParams: ReturnType<typeof parseBlueMarket>,
  params: {
    readonly withdrawAssets: bigint;
    readonly withdrawShares: bigint;
    readonly field: string;
  },
) => {
  const { withdrawAssets, withdrawShares, field } = params;
  if (withdrawAssets > 0n && withdrawShares > 0n) {
    throw new MutuallyExclusiveWithdrawAmountsError(marketParams.id);
  }
  if (withdrawAssets === 0n && withdrawShares === 0n) {
    throw new NonPositiveInputError(field, 0n);
  }
  const result = { withdrawAssets, withdrawShares };
  return result;
};

/** Parses the penalty bound for assets-mode withdrawals. @internal */
export const parseBlueWithdrawPenalty = (
  allocations: ReturnType<typeof parseBlueAllocations>,
  mode: ReturnType<typeof parseBlueWithdrawMode>,
) => {
  if (
    mode.withdrawAssets > 0n &&
    allocations.penaltyAssets > mode.withdrawAssets
  ) {
    throw new InputExceedsMaxError({
      field: "reallocationPenaltyAssets",
      value: allocations.penaltyAssets,
      max: mode.withdrawAssets,
    });
  }
  return allocations;
};

/** Constructs complete raw withdrawal params, including optional authorization. @internal */
export const parseBlueWithdraw = (params: BlueWithdrawParams) => {
  const marketParams = parseBlueMarket(params.market.marketParams);

  const amounts = {
    withdrawAssets: parseUint256("withdrawAssets", params.args.withdrawAssets),
    withdrawShares: parseUint256("withdrawShares", params.args.withdrawShares),
  };
  const mode = parseBlueWithdrawMode(marketParams, {
    ...amounts,
    field: "withdrawAssets or withdrawShares",
  });
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
  const allocations = parseBlueWithdrawPenalty(
    parseBlueAllocations([...(params.args.reallocations ?? [])], marketParams),
    mode,
  );
  const fields: Omit<BlueWithdrawInput, symbol> = {
    ...normalized,
    chainId: common.chainId,
    userAddress: common.userAddress,
    marketParams,
    metadata: common.metadata,
    ...amounts,
    publicAllocations: allocations.publicAllocations,
    reallocationPenaltyAssets: allocations.penaltyAssets,
  };
  const input = fields as BlueWithdrawInput;
  return { ...input, signedAuthorization };
};

/** Encodes parsed inputs and independently validates supplied signatures. @internal */
export const buildBlueWithdraw = (
  parsed: BlueWithdrawInput,
  signatures: Pick<BlueWithdrawParams["args"], "authorizationSignature"> = {},
): Readonly<Transaction<BlueWithdrawAction>> => {
  return encodeBlueWithdraw({
    ...parsed,
    signedAuthorization: getBlueBundlesV1SignedAuthorization({
      chainId: parsed.chainId,
      userAddress: parsed.userAddress,
      authorizationSignature: signatures.authorizationSignature,
    }),
  });
};
